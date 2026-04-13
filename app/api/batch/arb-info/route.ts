import { NextRequest, NextResponse } from "next/server";
import { prisma, rawDb } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";

const EDITOR_ROLES = ["super_admin", "admin", "editor"];

// Fields locked when LH status has reached "For Encoding" or beyond
const LOCKED_STATUSES = [
  "For Encoding", "Partially Encoded", "Fully Encoded",
  "Partially Distributed", "Fully Distributed", "Not Eligible for Encoding",
];

export type ArbInfoType =
  | "date_encoded"
  | "date_distributed"
  | "arb_name"
  | "area_allocated"
  | "allocated_condoned_amount";

const LOCKABLE: ArbInfoType[] = ["area_allocated", "allocated_condoned_amount"];

/* ── Input parser ── */
function parseLines(raw: string, type: ArbInfoType): {
  valid: { seqno: string; arb_id: string; value: string }[];
  invalid: { line: string; reason: string }[];
} {
  const valid: { seqno: string; arb_id: string; value: string }[] = [];
  const invalid: { line: string; reason: string }[] = [];

  for (const rawLine of raw.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const parts = line.split(/\t/).map((p) => p.trim());
    if (parts.length < 3) {
      invalid.push({ line, reason: "Expected 3 columns: SEQNO_DARRO, ARB_ID, VALUE (tab-separated)" });
      continue;
    }

    const seqno = parts[0].toUpperCase();
    const arbId = parts[1].toUpperCase();
    const value = parts.slice(2).join("\t").trim();

    if (!seqno) { invalid.push({ line, reason: "Missing SEQNO_DARRO" }); continue; }
    if (!arbId) { invalid.push({ line, reason: "Missing ARB_ID" }); continue; }
    if (!value) { invalid.push({ line, reason: "Missing value" }); continue; }

    if (type === "area_allocated") {
      const n = parseFloat(value.replace(/,/g, ""));
      if (isNaN(n) || n <= 0) {
        invalid.push({ line, reason: `"${value}" is not a valid positive number` });
        continue;
      }
    }

    if (type === "allocated_condoned_amount") {
      const n = parseFloat(value.replace(/[₱,\s]/g, ""));
      if (isNaN(n) || n <= 0) {
        invalid.push({ line, reason: `"${value}" is not a valid positive number` });
        continue;
      }
    }

    valid.push({ seqno, arb_id: arbId, value });
  }

  return { valid, invalid };
}

/* ── PUT — Preview ── */
export async function PUT(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionUser = token ? await verifySessionToken(token) : null;
  if (!sessionUser || !EDITOR_ROLES.includes(sessionUser.role))
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const body = await req.json() as { type: ArbInfoType; raw: string };
  const { type, raw } = body;
  if (!type || !raw) return NextResponse.json({ error: "Missing type or raw input." }, { status: 400 });

  const { valid, invalid } = parseLines(raw, type);
  const scopedProvince = sessionUser.office_level !== "regional" ? sessionUser.province ?? null : null;

  const seqnos = [...new Set(valid.map((r) => r.seqno))];

  const landholdings = await prisma.landholding.findMany({
    where: { seqno_darro: { in: seqnos } },
    select: { seqno_darro: true, landowner: true, province_edited: true, status: true },
  });
  const lhMap = Object.fromEntries(landholdings.map((r) => [r.seqno_darro, r]));

  const arbKeys = valid.map((r) => r.arb_id);
  const existingArbs = await prisma.arb.findMany({
    where: { arb_id: { in: arbKeys } },
    select: { id: true, seqno_darro: true, arb_id: true, arb_name: true, carpable: true, eligibility: true, area_allocated: true, allocated_condoned_amount: true, date_encoded: true, date_distributed: true },
  });
  const arbMap = Object.fromEntries(existingArbs.map((a) => [`${a.seqno_darro}|${a.arb_id}`, a]));

  const DATE_TYPES: ArbInfoType[] = ["date_encoded", "date_distributed"];
  const notFoundPairs: string[] = [];
  const outOfJurisdiction: string[] = [];
  const rows: Record<string, unknown>[] = [];

  for (const r of valid) {
    const lh = lhMap[r.seqno];
    if (!lh) { notFoundPairs.push(`${r.seqno} / ${r.arb_id}`); continue; }
    if (scopedProvince && lh.province_edited !== scopedProvince) {
      if (!outOfJurisdiction.includes(r.seqno)) outOfJurisdiction.push(r.seqno);
      continue;
    }
    const arb = arbMap[`${r.seqno}|${r.arb_id}`];
    if (!arb) { notFoundPairs.push(`${r.seqno} / ${r.arb_id}`); continue; }

    const locked =
      (LOCKABLE.includes(type) && LOCKED_STATUSES.includes(lh.status ?? "")) ||
      (DATE_TYPES.includes(type) && (arb.eligibility === "Not Eligible" || arb.carpable === "NON-CARPABLE"));

    const currentValue = (() => {
      switch (type) {
        case "date_encoded": return arb.date_encoded ?? null;
        case "date_distributed": return arb.date_distributed ?? null;
        case "arb_name": return arb.arb_name ?? null;
        case "area_allocated": return arb.area_allocated ?? null;
        case "allocated_condoned_amount": return arb.allocated_condoned_amount ?? null;
      }
    })();

    rows.push({
      seqno_darro: r.seqno,
      arb_id: r.arb_id,
      arb_db_id: arb.id,
      landowner: lh.landowner,
      arb_name: arb.arb_name,
      lh_status: lh.status,
      current_value: currentValue,
      new_value: r.value,
      locked,
    });
  }

  return NextResponse.json({ invalid, notFoundPairs, outOfJurisdiction, rows });
}

/* ── POST — Commit ── */
export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionUser = token ? await verifySessionToken(token) : null;
  if (!sessionUser || !EDITOR_ROLES.includes(sessionUser.role))
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const body = await req.json() as { type: ArbInfoType; raw: string };
  const { type, raw } = body;
  if (!type || !raw) return NextResponse.json({ error: "Missing type or raw input." }, { status: 400 });

  const { valid } = parseLines(raw, type);
  const scopedProvince = sessionUser.office_level !== "regional" ? sessionUser.province ?? null : null;

  const seqnos = [...new Set(valid.map((r) => r.seqno))];

  const landholdings = await prisma.landholding.findMany({
    where: { seqno_darro: { in: seqnos } },
    select: { seqno_darro: true, landowner: true, province_edited: true, status: true },
  });
  const lhMap = Object.fromEntries(landholdings.map((r) => [r.seqno_darro, r]));

  const arbKeys = valid.map((r) => r.arb_id);
  const existingArbs = await prisma.arb.findMany({
    where: { arb_id: { in: arbKeys } },
    select: { id: true, seqno_darro: true, arb_id: true, arb_name: true, carpable: true, eligibility: true, area_allocated: true, allocated_condoned_amount: true, date_encoded: true, date_distributed: true },
  });
  const arbMap = Object.fromEntries(existingArbs.map((a) => [`${a.seqno_darro}|${a.arb_id}`, a]));

  const DATE_TYPES: ArbInfoType[] = ["date_encoded", "date_distributed"];

  const dbField: Record<ArbInfoType, string> = {
    date_encoded: "date_encoded",
    date_distributed: "date_distributed",
    arb_name: "arb_name",
    area_allocated: "area_allocated",
    allocated_condoned_amount: "allocated_condoned_amount",
  };

  const updatedRecords: { seqno_darro: string; arb_id: string; arb_name: string | null; landowner: string | null }[] = [];
  const skippedRecords: { seqno_darro: string; arb_id: string; reason: string }[] = [];

  const insertAudit = rawDb.prepare(
    `INSERT INTO "AuditLog" (seqno_darro, action, field_changed, old_value, new_value, changed_by, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  );

  try {
    rawDb.transaction(() => {
      for (const r of valid) {
        const lh = lhMap[r.seqno];
        if (!lh) { skippedRecords.push({ seqno_darro: r.seqno, arb_id: r.arb_id, reason: "Landholding not found" }); continue; }
        if (scopedProvince && lh.province_edited !== scopedProvince) {
          skippedRecords.push({ seqno_darro: r.seqno, arb_id: r.arb_id, reason: "Out of jurisdiction" });
          continue;
        }
        const arb = arbMap[`${r.seqno}|${r.arb_id}`];
        if (!arb) { skippedRecords.push({ seqno_darro: r.seqno, arb_id: r.arb_id, reason: "ARB not found" }); continue; }
        if (LOCKABLE.includes(type) && LOCKED_STATUSES.includes(lh.status ?? "")) {
          skippedRecords.push({ seqno_darro: r.seqno, arb_id: r.arb_id, reason: `Locked — LH status is "${lh.status}"` });
          continue;
        }
        if (DATE_TYPES.includes(type) && arb.eligibility === "Not Eligible") {
          skippedRecords.push({ seqno_darro: r.seqno, arb_id: r.arb_id, reason: "ARB is Not Eligible — dates cannot be set" });
          continue;
        }
        if (DATE_TYPES.includes(type) && arb.carpable === "NON-CARPABLE") {
          skippedRecords.push({ seqno_darro: r.seqno, arb_id: r.arb_id, reason: "ARB is NON-CARPABLE — dates cannot be set" });
          continue;
        }

        const field = dbField[type];
        const oldVal = (() => {
          switch (type) {
            case "date_encoded": return arb.date_encoded ?? "";
            case "date_distributed": return arb.date_distributed ?? "";
            case "arb_name": return arb.arb_name ?? "";
            case "area_allocated": return arb.area_allocated ?? "";
            case "allocated_condoned_amount": return arb.allocated_condoned_amount ?? "";
          }
        })();

        rawDb.prepare(`UPDATE "Arb" SET "${field}" = ? WHERE id = ?`).run(r.value, arb.id);
        insertAudit.run(r.seqno, "ARB_UPDATE", field, oldVal, r.value, sessionUser.username, "batch_arb_info");
        updatedRecords.push({ seqno_darro: r.seqno, arb_id: r.arb_id, arb_name: arb.arb_name, landowner: lh.landowner });
      }
    })();

    return NextResponse.json({ updated: updatedRecords.length, updatedRecords, skippedRecords });
  } catch (err) {
    console.error("[batch/arb-info] error:", err);
    return NextResponse.json({ error: "Database error during update." }, { status: 500 });
  }
}
