import { NextRequest, NextResponse } from "next/server";
import { prisma, rawDb } from "@/lib/db";
import ExcelJS from "exceljs";
import { Readable } from "stream";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";
import { computeAndUpdateStatus } from "@/lib/computeStatus";

type RawRow = Record<string, unknown>;

function normalizeHeader(h: string) {
  return h.trim().toUpperCase().replace(/\*/g, "").replace(/[\s_\-]+/g, "_").trim();
}

function toStr(val: unknown): string | null {
  if (val === null || val === undefined || String(val).trim() === "") return null;
  return String(val).trim();
}

// Parses area values that may have a trailing "*" (Collective CLOA marker), e.g. "0.5000*"
function toAreaStr(val: unknown): string | null {
  if (val === null || val === undefined || String(val).trim() === "") return null;
  const raw = String(val).trim().replace(/,/g, "");
  const hasStar = raw.endsWith("*");
  const numeric = hasStar ? raw.slice(0, -1) : raw;
  const n = parseFloat(numeric);
  if (isNaN(n)) return null;
  return hasStar ? `${n}*` : String(n);
}

function getCellText(cell: ExcelJS.Cell): unknown {
  const v = cell.value;
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().split("T")[0];
  if (typeof v === "object") {
    if ("richText" in v) return (v as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join("");
    if ("text" in v) return (v as ExcelJS.CellHyperlinkValue).text;
    if ("result" in v) {
      const res = (v as ExcelJS.CellFormulaValue).result;
      return res instanceof Date ? res.toISOString().split("T")[0] : res ?? "";
    }
    return "";
  }
  return v;
}

async function parseFile(buffer: Buffer, filename: string): Promise<RawRow[]> {
  const workbook = new ExcelJS.Workbook();
  if (filename.toLowerCase().endsWith(".csv")) {
    const stream = new Readable();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stream.push(buffer as any);
    stream.push(null);
    await workbook.csv.read(stream);
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(buffer as any);
  }
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const headers: (string | null)[] = [];
  worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const v = getCellText(cell);
    headers[colNumber] = v != null && String(v).trim() !== "" ? String(v) : null;
  });

  const rows: RawRow[] = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj: RawRow = {};
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const header = headers[colNumber];
      if (header != null) obj[header] = getCellText(cell);
    });
    rows.push(obj);
  });
  return rows;
}

function normalizeCarpable(val: unknown): string | null {
  if (!val || String(val).trim() === "") return null;
  const v = String(val).toUpperCase().replace(/\s+/g, "");
  return (v === "CARPABLE" || v === "NON-CARPABLE") ? v : null;
}

function mapRow(raw: RawRow): {
  seqno_darro: string | null;
  arb_name: string | null;
  arb_id: string | null;
  ep_cloa_no: string | null;
  carpable: string | null;
  area_allocated: string | null;
  allocated_condoned_amount: string | null;
  eligibility: string | null;
  eligibility_reason: string | null;
  date_encoded: string | null;
  date_distributed: string | null;
  remarks: string | null;
} {
  // Normalize keys so headers are flexible (SEQNO_DARRO, SeqNo, etc.)
  const norm: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    norm[normalizeHeader(k)] = v;
  }

  const up = (v: string | null) => v?.toUpperCase() ?? null;
  const rawElig = toStr(norm["ELIGIBILITY"] ?? norm["ELIGIBILITY_FOR_DISTRIBUTION"]);
  const eligibility = rawElig
    ? (rawElig.toUpperCase().includes("NOT") ? "Not Eligible" : "Eligible")
    : null;
  const eligibility_reason = eligibility === "Not Eligible"
    ? toStr(norm["ELIGIBILITY_REASON"] ?? norm["REASON"])
    : null;

  return {
    seqno_darro: up(toStr(norm["SEQNO_DARRO"] ?? norm["SEQNO"] ?? norm["SEQ_NO"])),
    arb_name: up(toStr(norm["ARB_NAME"] ?? norm["NAME"] ?? norm["FULL_NAME"])),
    arb_id: up(toStr(norm["ARB_ID"] ?? norm["ARB_NO"] ?? norm["ARB_NUMBER"])),
    ep_cloa_no: up(toStr(norm["EP_CLOA_NO"] ?? norm["EP/CLOA_NO"] ?? norm["EP_NO"] ?? norm["CLOA_NO"])),
    carpable: normalizeCarpable(norm["CARPABLE"] ?? norm["CARPABLE_NONCARPABLE"] ?? norm["CARPABLE_STATUS"] ?? norm["CARP"]),
    area_allocated: toAreaStr(norm["AREA_ALLOCATED"] ?? norm["AREA"]),
    allocated_condoned_amount: toStr(norm["ALLOCATED_CONDONED_AMOUNT"] ?? norm["ALLOC_CONDONED_AMT"] ?? norm["CONDONED_AMOUNT"]),
    eligibility,
    eligibility_reason,
    date_encoded: toStr(norm["DATE_ENCODED"]),
    date_distributed: toStr(norm["DATE_DISTRIBUTED"]),
    remarks: toStr(norm["REMARKS"] ?? norm["NOTES"]),
  };
}

// Preview — parse file, validate, return summary without saving
export async function PUT(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionUser = token ? await verifySessionToken(token) : null;
  if (!sessionUser || !["super_admin", "admin", "editor"].includes(sessionUser.role))
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const mode = formData.get("mode") as string | null; // "append" | "replace"

  if (!file) return NextResponse.json({ error: "No file uploaded." }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  let rawRows: RawRow[];
  try {
    rawRows = await parseFile(buffer, file.name);
  } catch {
    return NextResponse.json({ error: "Could not parse file. Make sure it is a valid .xlsx or .csv file." }, { status: 400 });
  }

  const valid: ReturnType<typeof mapRow>[] = [];
  const errors: { row: number; reason: string }[] = [];

  const seenArbIds = new Set<string>();
  for (let i = 0; i < rawRows.length; i++) {
    const mapped = mapRow(rawRows[i]);
    if (!mapped.seqno_darro) {
      errors.push({ row: i + 2, reason: "Missing SEQNO_DARRO" });
      continue;
    }
    if (!mapped.arb_name) {
      errors.push({ row: i + 2, reason: `Row ${i + 2}: Missing ARB_NAME` });
      continue;
    }
    if (!mapped.arb_id) {
      errors.push({ row: i + 2, reason: `Row ${i + 2}: Missing ARB_ID (required)` });
      continue;
    }
    if (seenArbIds.has(mapped.arb_id)) {
      errors.push({ row: i + 2, reason: `Row ${i + 2}: Duplicate ARB_ID "${mapped.arb_id}" in file` });
      continue;
    }
    seenArbIds.add(mapped.arb_id);
    if (!mapped.carpable) {
      errors.push({ row: i + 2, reason: `Row ${i + 2}: Missing or invalid CARPABLE (must be CARPABLE or NON-CARPABLE)` });
      continue;
    }
    if (mapped.area_allocated === null) {
      errors.push({ row: i + 2, reason: `Row ${i + 2}: Missing AREA_ALLOCATED` });
      continue;
    }
    if (!mapped.allocated_condoned_amount) {
      errors.push({ row: i + 2, reason: `Row ${i + 2}: Missing ALLOCATED_CONDONED_AMOUNT` });
      continue;
    }
    if (!mapped.eligibility) {
      errors.push({ row: i + 2, reason: `Row ${i + 2}: Missing or invalid ELIGIBILITY (must be "Eligible" or "Not Eligible")` });
      continue;
    }
    if (mapped.eligibility === "Not Eligible" && !mapped.eligibility_reason) {
      errors.push({ row: i + 2, reason: `Row ${i + 2}: ELIGIBILITY_REASON is required when Eligibility is "Not Eligible"` });
      continue;
    }
    valid.push(mapped);
  }

  // Check for ARB_IDs that already exist in DB (for append mode duplicate detection)
  const allArbIds = valid.map((r) => r.arb_id!).filter(Boolean);
  const existingArbIds = allArbIds.length > 0
    ? await prisma.arb.findMany({ where: { arb_id: { in: allArbIds } }, select: { arb_id: true, seqno_darro: true } })
    : [];
  const existingArbIdMap = new Map(existingArbIds.map((r) => [r.arb_id!, r.seqno_darro]));

  // Filter out rows with ARB_IDs that conflict in DB (only relevant in append mode; replace clears first)
  const arbIdConflicts: { row: number; arb_id: string; existing_seqno: string }[] = [];
  const validAfterIdCheck: typeof valid = [];
  for (let i = 0; i < valid.length; i++) {
    const r = valid[i];
    const existingSeqno = existingArbIdMap.get(r.arb_id!);
    if (existingSeqno && !(mode === "replace" && existingSeqno === r.seqno_darro)) {
      arbIdConflicts.push({ row: i + 2, arb_id: r.arb_id!, existing_seqno: existingSeqno });
    } else {
      validAfterIdCheck.push(r);
    }
  }
  // Check which SEQNOs exist in DB
  const seqnos = [...new Set(validAfterIdCheck.map((r) => r.seqno_darro!))];
  const found = await prisma.landholding.findMany({
    where: { seqno_darro: { in: seqnos } },
    select: { seqno_darro: true, landowner: true, province_edited: true, amendarea_validated: true, amendarea: true, condoned_amount: true, net_of_reval_no_neg: true, status: true },
  });
  const foundSet = new Set(found.map((r) => r.seqno_darro));
  const foundMap = Object.fromEntries(found.map((r) => [r.seqno_darro, r]));

  const notFoundSeqnos = seqnos.filter((s) => !foundSet.has(s));

  // Province scoping: skip rows outside the user's jurisdiction
  const scopedProvince =
    sessionUser.office_level !== "regional" ? sessionUser.province ?? null : null;

  const LOCKED_STATUSES = ["For Encoding", "Partially Encoded", "Fully Encoded", "Partially Distributed", "Fully Distributed", "Not Eligible for Encoding"];
  const outOfJurisdictionSeqnos: string[] = [];
  const lockedSeqnos: string[] = [];
  const validFinal = validAfterIdCheck.filter((r) => {
    if (!foundSet.has(r.seqno_darro!)) return false;
    if (scopedProvince && foundMap[r.seqno_darro!]?.province_edited !== scopedProvince) {
      if (!outOfJurisdictionSeqnos.includes(r.seqno_darro!))
        outOfJurisdictionSeqnos.push(r.seqno_darro!);
      return false;
    }
    if (LOCKED_STATUSES.includes(foundMap[r.seqno_darro!]?.status ?? "")) {
      if (!lockedSeqnos.includes(r.seqno_darro!))
        lockedSeqnos.push(r.seqno_darro!);
      return false;
    }
    return true;
  });

  // Existing ARB counts per SEQNO
  const existingCounts = await prisma.arb.groupBy({
    by: ["seqno_darro"],
    where: { seqno_darro: { in: seqnos } },
    _count: true,
  });
  const existingMap = Object.fromEntries(existingCounts.map((r) => [r.seqno_darro, r._count]));

  // Summary by SEQNO
  const bySEQNO: Record<string, { landowner: string | null; province: string | null; count: number; existingCount: number; arbs: typeof validFinal; amendarea: number | null; amendarea_validated: number | null; condoned_amount: number | null; net_of_reval_no_neg: number | null }> = {};
  for (const r of validFinal) {
    const s = r.seqno_darro!;
    if (!bySEQNO[s]) {
      bySEQNO[s] = {
        landowner: foundMap[s]?.landowner ?? null,
        province: foundMap[s]?.province_edited ?? null,
        count: 0,
        existingCount: existingMap[s] ?? 0,
        arbs: [],
        amendarea: foundMap[s]?.amendarea ?? null,
        amendarea_validated: foundMap[s]?.amendarea_validated ?? null,
        condoned_amount: foundMap[s]?.condoned_amount ?? null,
        net_of_reval_no_neg: foundMap[s]?.net_of_reval_no_neg ?? null,
      };
    }
    bySEQNO[s].count++;
    bySEQNO[s].arbs.push(r);
  }

  return NextResponse.json({
    total: rawRows.length,
    valid: validFinal.length,
    errors,
    arbIdConflicts,
    notFoundSeqnos,
    outOfJurisdictionSeqnos,
    lockedSeqnos,
    bySEQNO,
    mode: mode ?? "append",
  });
}

// Commit import
export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionUser = token ? await verifySessionToken(token) : null;
  if (!sessionUser || !["super_admin", "admin", "editor"].includes(sessionUser.role))
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const mode = (formData.get("mode") as string) ?? "append";

  if (!file) return NextResponse.json({ error: "No file uploaded." }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  let rawRows: RawRow[];
  try {
    rawRows = await parseFile(buffer, file.name);
  } catch {
    return NextResponse.json({ error: "Could not parse file." }, { status: 400 });
  }

  const valid: ReturnType<typeof mapRow>[] = [];
  const seenIds = new Set<string>();
  for (const row of rawRows) {
    const mapped = mapRow(row);
    if (!mapped.seqno_darro || !mapped.arb_name || !mapped.arb_id || !mapped.carpable || mapped.area_allocated === null) continue;
    if (!mapped.allocated_condoned_amount || !mapped.eligibility) continue;
    if (mapped.eligibility === "Not Eligible" && !mapped.eligibility_reason) continue;
    if (seenIds.has(mapped.arb_id)) continue; // skip duplicate ARB_IDs in file
    seenIds.add(mapped.arb_id);
    valid.push(mapped);
  }

  const seqnos = [...new Set(valid.map((r) => r.seqno_darro!))];
  const found = await prisma.landholding.findMany({
    where: { seqno_darro: { in: seqnos } },
    select: { seqno_darro: true, province_edited: true },
  });
  const foundMap = Object.fromEntries(found.map((r) => [r.seqno_darro, r]));

  const scopedProvince =
    sessionUser.office_level !== "regional" ? sessionUser.province ?? null : null;

  const toInsert = valid.filter((r) => {
    if (!foundMap[r.seqno_darro!]) return false;
    if (scopedProvince && foundMap[r.seqno_darro!]?.province_edited !== scopedProvince) return false;
    return true;
  });

  try {
    const affectedSeqnos = [...new Set(toInsert.map((r) => r.seqno_darro!))];
    const deleteStmt = rawDb.prepare(`DELETE FROM "Arb" WHERE seqno_darro = ?`);
    const insertStmt = rawDb.prepare(
      `INSERT INTO "Arb" (seqno_darro, arb_name, arb_id, ep_cloa_no, carpable, area_allocated, allocated_condoned_amount, eligibility, eligibility_reason, date_encoded, date_distributed, remarks, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    );

    const doWrites = rawDb.transaction(() => {
      if (mode === "replace") {
        for (const s of seqnos) deleteStmt.run(s);
      }
      for (const r of toInsert) {
        insertStmt.run(
          r.seqno_darro!, r.arb_name, r.arb_id, r.ep_cloa_no, r.carpable,
          r.area_allocated, r.allocated_condoned_amount, r.eligibility, r.eligibility_reason,
          (r.eligibility === "Not Eligible" || r.carpable === "NON-CARPABLE") ? null : r.date_encoded,
          (r.eligibility === "Not Eligible" || r.carpable === "NON-CARPABLE") ? null : r.date_distributed,
          r.remarks, "System"
        );
      }
    });
    doWrites();

    const insertAudit = rawDb.prepare(
      `INSERT INTO "AuditLog" (seqno_darro, action, field_changed, old_value, new_value, changed_by, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    );
    const countBySeqno: Record<string, number> = {};
    for (const r of toInsert) countBySeqno[r.seqno_darro!] = (countBySeqno[r.seqno_darro!] ?? 0) + 1;
    for (const seqno of affectedSeqnos) {
      insertAudit.run(
        seqno, "ARB_UPLOAD", "arbs",
        mode === "replace" ? "Replaced existing ARBs" : "Appended to existing ARBs",
        `${countBySeqno[seqno] ?? 0} ARB(s) uploaded`,
        sessionUser.username, "arb_upload"
      );
      await computeAndUpdateStatus(seqno);
    }
  } catch (err) {
    console.error("[ARB upload] import error:", err);
    return NextResponse.json({ error: "Database error during import. Check server logs." }, { status: 500 });
  }

  return NextResponse.json({ imported: toInsert.length, skipped: valid.length - toInsert.length });
}
