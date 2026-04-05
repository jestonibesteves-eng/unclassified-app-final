import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import * as XLSX from "xlsx";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";

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

function parseFile(buffer: Buffer): RawRow[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: "" });
}

function normalizeCarpable(val: unknown): string | null {
  if (!val || String(val).trim() === "") return null;
  const v = String(val).toUpperCase().replace(/\s+/g, "");
  return (v === "CARPABLE" || v === "NON-CARPABLE") ? v : null;
}

function mapRow(raw: RawRow): {
  seqno_darro: string | null;
  arb_name: string | null;
  arb_no: string | null;
  ep_cloa_no: string | null;
  carpable: string | null;
  area_allocated: string | null;
  remarks: string | null;
} {
  // Normalize keys so headers are flexible (SEQNO_DARRO, SeqNo, etc.)
  const norm: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    norm[normalizeHeader(k)] = v;
  }

  const up = (v: string | null) => v?.toUpperCase() ?? null;
  return {
    seqno_darro: up(toStr(norm["SEQNO_DARRO"] ?? norm["SEQNO"] ?? norm["SEQ_NO"])),
    arb_name: up(toStr(norm["ARB_NAME"] ?? norm["NAME"] ?? norm["FULL_NAME"])),
    arb_no: up(toStr(norm["ARB_NO"] ?? norm["ARB_NUMBER"] ?? norm["ARB_ID"])),
    ep_cloa_no: up(toStr(norm["EP_CLOA_NO"] ?? norm["EP/CLOA_NO"] ?? norm["EP_NO"] ?? norm["CLOA_NO"])),
    carpable: normalizeCarpable(norm["CARPABLE"] ?? norm["CARPABLE_NONCARPABLE"] ?? norm["CARPABLE_STATUS"] ?? norm["CARP"]),
    area_allocated: toAreaStr(norm["AREA_ALLOCATED"] ?? norm["AREA"]),
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
    rawRows = parseFile(buffer);
  } catch {
    return NextResponse.json({ error: "Could not parse file. Make sure it is a valid .xlsx or .csv file." }, { status: 400 });
  }

  const valid: ReturnType<typeof mapRow>[] = [];
  const errors: { row: number; reason: string }[] = [];

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
    if (!mapped.carpable) {
      errors.push({ row: i + 2, reason: `Row ${i + 2}: Missing or invalid CARPABLE (must be CARPABLE or NON-CARPABLE)` });
      continue;
    }
    if (mapped.area_allocated === null) {
      errors.push({ row: i + 2, reason: `Row ${i + 2}: Missing AREA_ALLOCATED` });
      continue;
    }
    valid.push(mapped);
  }

  // Check which SEQNOs exist in DB
  const seqnos = [...new Set(valid.map((r) => r.seqno_darro!))];
  const found = await prisma.landholding.findMany({
    where: { seqno_darro: { in: seqnos } },
    select: { seqno_darro: true, landowner: true, province_edited: true, amendarea_validated: true, amendarea: true },
  });
  const foundSet = new Set(found.map((r) => r.seqno_darro));
  const foundMap = Object.fromEntries(found.map((r) => [r.seqno_darro, r]));

  const notFoundSeqnos = seqnos.filter((s) => !foundSet.has(s));

  // Province scoping: skip rows outside the user's jurisdiction
  const scopedProvince =
    sessionUser.office_level !== "regional" ? sessionUser.province ?? null : null;

  const outOfJurisdictionSeqnos: string[] = [];
  const validFinal = valid.filter((r) => {
    if (!foundSet.has(r.seqno_darro!)) return false;
    if (scopedProvince && foundMap[r.seqno_darro!]?.province_edited !== scopedProvince) {
      if (!outOfJurisdictionSeqnos.includes(r.seqno_darro!))
        outOfJurisdictionSeqnos.push(r.seqno_darro!);
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
  const bySEQNO: Record<string, { landowner: string | null; province: string | null; count: number; existingCount: number; arbs: typeof validFinal; amendarea: number | null; amendarea_validated: number | null }> = {};
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
      };
    }
    bySEQNO[s].count++;
    bySEQNO[s].arbs.push(r);
  }

  return NextResponse.json({
    total: rawRows.length,
    valid: validFinal.length,
    errors,
    notFoundSeqnos,
    outOfJurisdictionSeqnos,
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
    rawRows = parseFile(buffer);
  } catch {
    return NextResponse.json({ error: "Could not parse file." }, { status: 400 });
  }

  const valid: ReturnType<typeof mapRow>[] = [];
  for (const row of rawRows) {
    const mapped = mapRow(row);
    if (!mapped.seqno_darro || !mapped.arb_name || !mapped.carpable || mapped.area_allocated === null) continue;
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
    await prisma.$transaction(async (tx) => {
      if (mode === "replace") {
        await tx.arb.deleteMany({ where: { seqno_darro: { in: seqnos } } });
      }
      for (const r of toInsert) {
        await tx.arb.create({
          data: {
            seqno_darro: r.seqno_darro!,
            arb_name: r.arb_name,
            arb_no: r.arb_no,
            ep_cloa_no: r.ep_cloa_no,
            carpable: r.carpable,
            area_allocated: r.area_allocated,
            remarks: r.remarks,
            uploaded_by: "System",
          },
        });
      }
    });
  } catch (err) {
    console.error("[ARB upload] import error:", err);
    return NextResponse.json({ error: "Database error during import. Check server logs." }, { status: 500 });
  }

  return NextResponse.json({ imported: toInsert.length, skipped: valid.length - toInsert.length });
}
