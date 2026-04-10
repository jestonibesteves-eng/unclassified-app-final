import { NextRequest, NextResponse } from "next/server";
import { prisma, rawDb } from "@/lib/db";
import * as XLSX from "xlsx";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";

const EDITOR_ROLES = ["super_admin", "admin", "editor"];
const LOCKED_STATUSES = [
  "For Encoding", "Partially Encoded", "Fully Encoded",
  "Partially Distributed", "Fully Distributed", "Not Eligible for Encoding",
];

type RawRow = Record<string, unknown>;

function normalizeHeader(h: string) {
  return h.trim().toUpperCase().replace(/[\s\-]+/g, "_");
}

function toStr(val: unknown): string | null {
  if (val === null || val === undefined || String(val).trim() === "") return null;
  return String(val).trim();
}

function toAreaStr(val: unknown): string | null {
  if (val === null || val === undefined || String(val).trim() === "") return null;
  const raw = String(val).trim().replace(/,/g, "");
  const hasStar = raw.endsWith("*");
  const numeric = hasStar ? raw.slice(0, -1) : raw;
  const n = parseFloat(numeric);
  if (isNaN(n)) return null;
  return hasStar ? `${n}*` : String(n);
}

function parseFile(buffer: Buffer): RawRow[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: "" });
}

type ParseError = { row: number; reason: string };

type MappedRow = {
  seqno_darro: string;
  arb_id: string;
  _rowNum: number;
  arb_name?: string;
  ep_cloa_no?: string;
  area_allocated?: string;   // tentative — lock check done after DB lookup
  carpable?: string;
  eligibility?: string;
  eligibility_reason?: string | null;
  allocated_condoned_amount?: string;
  date_encoded?: string;
  date_distributed?: string;
  remarks?: string;
};

function mapRows(rawRows: RawRow[]): { valid: MappedRow[]; errors: ParseError[] } {
  const valid: MappedRow[] = [];
  const errors: ParseError[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const rowNum = i + 2;
    const norm: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rawRows[i])) {
      norm[normalizeHeader(k)] = v;
    }

    const seqno = toStr(norm["SEQNO_DARRO"] ?? norm["SEQNO"] ?? norm["SEQ_NO"])?.toUpperCase();
    if (!seqno) { errors.push({ row: rowNum, reason: "Missing SEQNO_DARRO" }); continue; }

    const arbId = toStr(norm["ARB_ID"] ?? norm["ARB_NO"] ?? norm["ARB_NUMBER"])?.toUpperCase();
    if (!arbId) { errors.push({ row: rowNum, reason: "Missing ARB_ID" }); continue; }

    const mapped: MappedRow = { seqno_darro: seqno, arb_id: arbId, _rowNum: rowNum };
    let hasField = false;
    let rowInvalid = false;

    // ARB_NAME
    const arbName = toStr(norm["ARB_NAME"] ?? norm["NAME"] ?? norm["FULL_NAME"]);
    if (arbName !== null) { mapped.arb_name = arbName.toUpperCase(); hasField = true; }

    // EP_CLOA_NO
    const epCloa = toStr(norm["EP_CLOA_NO"] ?? norm["EP/CLOA_NO"] ?? norm["EP_NO"] ?? norm["CLOA_NO"]);
    if (epCloa !== null) { mapped.ep_cloa_no = epCloa.toUpperCase(); hasField = true; }

    // AREA_ALLOCATED — lock check done after DB lookup
    const areaRaw = norm["AREA_ALLOCATED"] ?? norm["AREA"];
    if (areaRaw !== "" && areaRaw !== null && areaRaw !== undefined) {
      const areaStr = toAreaStr(areaRaw);
      if (areaStr === null) {
        errors.push({ row: rowNum, reason: `AREA_ALLOCATED "${areaRaw}" is not a valid number` });
        rowInvalid = true;
      } else {
        mapped.area_allocated = areaStr;
        hasField = true;
      }
    }
    if (rowInvalid) continue;

    // CARPABLE
    const carpRaw = toStr(norm["CARPABLE"] ?? norm["CARPABLE_STATUS"] ?? norm["CARP"]);
    if (carpRaw !== null) {
      const v = carpRaw.toUpperCase().replace(/\s+/g, "");
      if (v !== "CARPABLE" && v !== "NON-CARPABLE") {
        errors.push({ row: rowNum, reason: `CARPABLE "${carpRaw}" is invalid. Must be "CARPABLE" or "NON-CARPABLE"` });
        continue;
      }
      mapped.carpable = v;
      hasField = true;
    }

    // ELIGIBILITY
    const eligRaw = toStr(norm["ELIGIBILITY"] ?? norm["ELIGIBILITY_FOR_DISTRIBUTION"]);
    if (eligRaw !== null) {
      const eligibility = eligRaw.toUpperCase().includes("NOT") ? "Not Eligible" : "Eligible";
      mapped.eligibility = eligibility;
      if (eligibility === "Not Eligible") {
        const reason = toStr(norm["ELIGIBILITY_REASON"] ?? norm["REASON"]);
        if (!reason) {
          errors.push({ row: rowNum, reason: "ELIGIBILITY_REASON is required when Eligibility is Not Eligible" });
          continue;
        }
        mapped.eligibility_reason = reason;
      }
      hasField = true;
    }

    // ALLOCATED_CONDONED_AMOUNT
    const condRaw = toStr(norm["ALLOCATED_CONDONED_AMOUNT"] ?? norm["ALLOC_CONDONED_AMT"] ?? norm["CONDONED_AMOUNT"]);
    if (condRaw !== null) { mapped.allocated_condoned_amount = condRaw; hasField = true; }

    // DATE_ENCODED
    const dateEncRaw = toStr(norm["DATE_ENCODED"]);
    if (dateEncRaw !== null) { mapped.date_encoded = dateEncRaw; hasField = true; }

    // DATE_DISTRIBUTED
    const dateDistRaw = toStr(norm["DATE_DISTRIBUTED"]);
    if (dateDistRaw !== null) { mapped.date_distributed = dateDistRaw; hasField = true; }

    // REMARKS
    const remarksRaw = toStr(norm["REMARKS"] ?? norm["NOTES"]);
    if (remarksRaw !== null) { mapped.remarks = remarksRaw; hasField = true; }

    if (!hasField) {
      errors.push({ row: rowNum, reason: "No updatable fields found in this row" });
      continue;
    }

    valid.push(mapped);
  }

  return { valid, errors };
}

/* ── PUT — Preview ── */
export async function PUT(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionUser = token ? await verifySessionToken(token) : null;
  if (!sessionUser || !EDITOR_ROLES.includes(sessionUser.role))
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file uploaded." }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  let rawRows: RawRow[];
  try {
    rawRows = parseFile(buffer);
  } catch {
    return NextResponse.json({ error: "Could not parse file. Make sure it is a valid .xlsx or .csv file." }, { status: 400 });
  }

  const { valid, errors } = mapRows(rawRows);
  const scopedProvince = sessionUser.office_level !== "regional" ? sessionUser.province ?? null : null;

  const seqnos = [...new Set(valid.map((r) => r.seqno_darro))];
  const arbIds = valid.map((r) => r.arb_id);

  const landholdings = await prisma.landholding.findMany({
    where: { seqno_darro: { in: seqnos } },
    select: { seqno_darro: true, province_edited: true, status: true },
  });
  const lhMap = Object.fromEntries(landholdings.map((r) => [r.seqno_darro, r]));

  const existingArbs = await prisma.arb.findMany({
    where: { arb_id: { in: arbIds } },
    select: {
      id: true, seqno_darro: true, arb_id: true, arb_name: true, ep_cloa_no: true,
      area_allocated: true, carpable: true, eligibility: true, eligibility_reason: true,
      allocated_condoned_amount: true, date_encoded: true, date_distributed: true, remarks: true,
    },
  });
  const arbMap = Object.fromEntries(existingArbs.map((a) => [`${a.seqno_darro}|${a.arb_id}`, a]));

  const notFoundPairs: { seqno_darro: string; arb_id: string }[] = [];
  const outOfJurisdiction: string[] = [];
  const areaLockedRows: { seqno_darro: string; arb_id: string; status: string }[] = [];
  const rows: Record<string, unknown>[] = [];

  for (const r of valid) {
    const lh = lhMap[r.seqno_darro];
    if (!lh) { notFoundPairs.push({ seqno_darro: r.seqno_darro, arb_id: r.arb_id }); continue; }

    if (scopedProvince && lh.province_edited !== scopedProvince) {
      if (!outOfJurisdiction.includes(r.seqno_darro)) outOfJurisdiction.push(r.seqno_darro);
      continue;
    }

    const arb = arbMap[`${r.seqno_darro}|${r.arb_id}`];
    if (!arb) { notFoundPairs.push({ seqno_darro: r.seqno_darro, arb_id: r.arb_id }); continue; }

    const areaLocked = r.area_allocated !== undefined && LOCKED_STATUSES.includes(lh.status ?? "");
    if (areaLocked) {
      areaLockedRows.push({ seqno_darro: r.seqno_darro, arb_id: r.arb_id, status: lh.status ?? "" });
    }

    // Effective eligibility after this update
    const finalEligibility = r.eligibility ?? arb.eligibility;

    rows.push({
      seqno_darro: r.seqno_darro,
      arb_id: r.arb_id,
      arb_db_id: arb.id,
      current_arb_name: arb.arb_name,
      current_area_allocated: arb.area_allocated,
      current_eligibility: arb.eligibility,
      new_arb_name: r.arb_name ?? null,
      new_ep_cloa_no: r.ep_cloa_no ?? null,
      new_area_allocated: areaLocked ? null : (r.area_allocated ?? null),
      area_locked: areaLocked,
      new_carpable: r.carpable ?? null,
      new_eligibility: r.eligibility ?? null,
      new_eligibility_reason: r.eligibility_reason ?? null,
      new_allocated_condoned_amount: r.allocated_condoned_amount ?? null,
      // Dates forced null when final eligibility is Not Eligible
      new_date_encoded: finalEligibility === "Not Eligible" ? null : (r.date_encoded ?? null),
      new_date_distributed: finalEligibility === "Not Eligible" ? null : (r.date_distributed ?? null),
      dates_cleared: finalEligibility === "Not Eligible" && (arb.date_encoded || arb.date_distributed),
      new_remarks: r.remarks ?? null,
    });
  }

  return NextResponse.json({ total: rawRows.length, errors, notFoundPairs, outOfJurisdiction, areaLockedRows, rows });
}

/* ── POST — Commit ── */
export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionUser = token ? await verifySessionToken(token) : null;
  if (!sessionUser || !EDITOR_ROLES.includes(sessionUser.role))
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file uploaded." }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  let rawRows: RawRow[];
  try {
    rawRows = parseFile(buffer);
  } catch {
    return NextResponse.json({ error: "Could not parse file." }, { status: 400 });
  }

  const { valid } = mapRows(rawRows);
  const scopedProvince = sessionUser.office_level !== "regional" ? sessionUser.province ?? null : null;

  const seqnos = [...new Set(valid.map((r) => r.seqno_darro))];
  const arbIds = valid.map((r) => r.arb_id);

  const landholdings = await prisma.landholding.findMany({
    where: { seqno_darro: { in: seqnos } },
    select: { seqno_darro: true, province_edited: true, status: true },
  });
  const lhMap = Object.fromEntries(landholdings.map((r) => [r.seqno_darro, r]));

  const existingArbs = await prisma.arb.findMany({
    where: { arb_id: { in: arbIds } },
    select: {
      id: true, seqno_darro: true, arb_id: true, arb_name: true, ep_cloa_no: true,
      area_allocated: true, carpable: true, eligibility: true, eligibility_reason: true,
      allocated_condoned_amount: true, date_encoded: true, date_distributed: true, remarks: true,
    },
  });
  const arbMap = Object.fromEntries(existingArbs.map((a) => [`${a.seqno_darro}|${a.arb_id}`, a]));

  const toUpdate = valid.filter((r) => {
    const lh = lhMap[r.seqno_darro];
    if (!lh) return false;
    if (scopedProvince && lh.province_edited !== scopedProvince) return false;
    if (!arbMap[`${r.seqno_darro}|${r.arb_id}`]) return false;
    return true;
  });

  const notFound = valid
    .filter((r) => !lhMap[r.seqno_darro] || !arbMap[`${r.seqno_darro}|${r.arb_id}`])
    .map((r) => `${r.seqno_darro} / ${r.arb_id}`);
  const outOfJurisdiction = scopedProvince
    ? valid.filter((r) => lhMap[r.seqno_darro] && lhMap[r.seqno_darro].province_edited !== scopedProvince).map((r) => r.seqno_darro)
    : [];

  try {
    const insertAudit = rawDb.prepare(
      `INSERT INTO "AuditLog" (seqno_darro, action, field_changed, old_value, new_value, changed_by, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    );

    rawDb.transaction(() => {
      for (const r of toUpdate) {
        const lh = lhMap[r.seqno_darro];
        const arb = arbMap[`${r.seqno_darro}|${r.arb_id}`];
        const areaLocked = r.area_allocated !== undefined && LOCKED_STATUSES.includes(lh.status ?? "");
        const finalEligibility = r.eligibility ?? arb.eligibility;

        const setClauses: string[] = [];
        const values: unknown[] = [];
        const auditEntries: [string, string, string][] = []; // [field, old, new]

        if (r.arb_name !== undefined) {
          setClauses.push(`"arb_name" = ?`);
          values.push(r.arb_name);
          auditEntries.push(["arb_name", arb.arb_name ?? "", r.arb_name]);
        }
        if (r.ep_cloa_no !== undefined) {
          setClauses.push(`"ep_cloa_no" = ?`);
          values.push(r.ep_cloa_no);
          auditEntries.push(["ep_cloa_no", arb.ep_cloa_no ?? "", r.ep_cloa_no]);
        }
        if (r.area_allocated !== undefined && !areaLocked) {
          setClauses.push(`"area_allocated" = ?`);
          values.push(r.area_allocated);
          auditEntries.push(["area_allocated", arb.area_allocated ?? "", r.area_allocated]);
        }
        if (r.carpable !== undefined) {
          setClauses.push(`"carpable" = ?`);
          values.push(r.carpable);
          auditEntries.push(["carpable", arb.carpable ?? "", r.carpable]);
        }
        if (r.eligibility !== undefined) {
          setClauses.push(`"eligibility" = ?`);
          values.push(r.eligibility);
          auditEntries.push(["eligibility", arb.eligibility ?? "", r.eligibility]);

          const newReason = r.eligibility === "Not Eligible" ? (r.eligibility_reason ?? null) : null;
          setClauses.push(`"eligibility_reason" = ?`);
          values.push(newReason);
          auditEntries.push(["eligibility_reason", arb.eligibility_reason ?? "", newReason ?? ""]);
        }
        if (r.allocated_condoned_amount !== undefined) {
          setClauses.push(`"allocated_condoned_amount" = ?`);
          values.push(r.allocated_condoned_amount);
          auditEntries.push(["allocated_condoned_amount", arb.allocated_condoned_amount ?? "", r.allocated_condoned_amount]);
        }

        // Date fields — forced null when final eligibility is Not Eligible
        if (finalEligibility === "Not Eligible" && r.eligibility !== undefined) {
          // Eligibility is being changed to Not Eligible — force clear dates
          setClauses.push(`"date_encoded" = ?`, `"date_distributed" = ?`);
          values.push(null, null);
          if (arb.date_encoded) auditEntries.push(["date_encoded", arb.date_encoded, ""]);
          if (arb.date_distributed) auditEntries.push(["date_distributed", arb.date_distributed, ""]);
        } else if (finalEligibility !== "Not Eligible") {
          if (r.date_encoded !== undefined) {
            setClauses.push(`"date_encoded" = ?`);
            values.push(r.date_encoded);
            auditEntries.push(["date_encoded", arb.date_encoded ?? "", r.date_encoded]);
          }
          if (r.date_distributed !== undefined) {
            setClauses.push(`"date_distributed" = ?`);
            values.push(r.date_distributed);
            auditEntries.push(["date_distributed", arb.date_distributed ?? "", r.date_distributed]);
          }
        }

        if (r.remarks !== undefined) {
          setClauses.push(`"remarks" = ?`);
          values.push(r.remarks);
          auditEntries.push(["remarks", arb.remarks ?? "", r.remarks]);
        }

        if (setClauses.length === 0) continue;

        rawDb
          .prepare(`UPDATE "Arb" SET ${setClauses.join(", ")} WHERE id = ?`)
          .run(...values, arb.id);

        for (const [field, oldVal, newVal] of auditEntries) {
          insertAudit.run(r.seqno_darro, "ARB_UPDATE", field, oldVal, newVal, sessionUser.username);
        }
      }
    })();

    return NextResponse.json({ updated: toUpdate.length, notFound, outOfJurisdiction });
  } catch (err) {
    console.error("[batch/arb] error:", err);
    return NextResponse.json({ error: "Database error during update. Check server logs." }, { status: 500 });
  }
}
