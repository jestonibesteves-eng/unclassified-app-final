import { NextRequest, NextResponse } from "next/server";
import { prisma, rawDb } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";
import { computeAndUpdateStatus } from "@/lib/computeStatus";

const EDITOR_ROLES = ["super_admin", "admin", "editor"];

const CLOA_STATUS_VALUES = [
  "Still CCLOA (SPLIT Target)",
  "Still CCLOA (Not SPLIT Target)",
  "Full — Individual Title (SPLIT)",
  "Partial — Individual Title (SPLIT)",
  "Full — Individual Title (Regular Redoc)",
  "Partial — Individual Title (Regular Redoc)",
];
const ASP_STATUS_VALUES = ["With ASP", "Without ASP"];

export type BatchLHType =
  | "status"
  | "amendarea"
  | "condoned_amount"
  | "municipality"
  | "asp_status"
  | "cloa_status"
  | "remarks";

type ParseError = { line: string; reason: string };

/* ── Parsers ── */

function parseStatusLines(raw: string): {
  valid: { seqno: string; reason: string }[];
  invalid: ParseError[];
} {
  const valid: { seqno: string; reason: string }[] = [];
  const invalid: ParseError[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split("\t");
    if (parts.length < 2) {
      invalid.push({ line: trimmed, reason: "Expected: SEQNO_DARRO → Tab → REASON" });
      continue;
    }
    const seqno = parts[0].trim().toUpperCase();
    const reason = parts[1].trim();
    if (!seqno) { invalid.push({ line: trimmed, reason: "Empty SEQNO_DARRO" }); continue; }
    if (!reason) { invalid.push({ line: trimmed, reason: "REASON is required" }); continue; }
    valid.push({ seqno, reason });
  }
  return { valid, invalid };
}

function parseTabLines(raw: string): {
  valid: { seqno: string; col2: string; col3?: string }[];
  invalid: ParseError[];
} {
  const valid: { seqno: string; col2: string; col3?: string }[] = [];
  const invalid: ParseError[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split("\t");
    if (parts.length < 2) {
      invalid.push({ line: trimmed, reason: "Expected tab-separated values (SEQNO → Tab → Value)" });
      continue;
    }
    const seqno = parts[0].trim().toUpperCase();
    const col2 = parts[1].trim();
    const col3 = parts[2]?.trim();
    if (!seqno) { invalid.push({ line: trimmed, reason: "Empty SEQNO_DARRO" }); continue; }
    if (!col2) { invalid.push({ line: trimmed, reason: "Missing value" }); continue; }
    valid.push({ seqno, col2, col3 });
  }
  return { valid, invalid };
}

function parseNumericLines(raw: string): {
  valid: { seqno: string; value: number }[];
  invalid: ParseError[];
} {
  const valid: { seqno: string; value: number }[] = [];
  const invalid: ParseError[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.includes("\t") ? trimmed.split("\t") : trimmed.split(/\s+/);
    if (parts.length < 2) {
      invalid.push({ line: trimmed, reason: "Expected: SEQNO_DARRO → Tab → Value" });
      continue;
    }
    const seqno = parts[0].trim().toUpperCase();
    const numStr = parts[parts.length - 1].replace(/,/g, "");
    const value = parseFloat(numStr);
    if (!seqno) { invalid.push({ line: trimmed, reason: "Empty SEQNO_DARRO" }); continue; }
    if (isNaN(value)) { invalid.push({ line: trimmed, reason: `"${parts[parts.length - 1]}" is not a valid number` }); continue; }
    valid.push({ seqno, value });
  }
  return { valid, invalid };
}

function parseCondonedLines(raw: string): {
  valid: { seqno: string; value: number }[];
  invalid: ParseError[];
} {
  const { valid: allValid, invalid } = parseNumericLines(raw);
  const valid: { seqno: string; value: number }[] = [];
  for (const r of allValid) {
    if (r.value <= 0) {
      invalid.push({ line: r.seqno, reason: "CONDONED_AMOUNT must be greater than zero" });
    } else {
      valid.push(r);
    }
  }
  return { valid, invalid };
}

function parseEnumLines(
  raw: string,
  allowed: string[],
  fieldName: string
): {
  valid: { seqno: string; value: string }[];
  invalid: ParseError[];
} {
  const valid: { seqno: string; value: string }[] = [];
  const invalid: ParseError[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split("\t");
    if (parts.length < 2) {
      invalid.push({ line: trimmed, reason: `Expected: SEQNO_DARRO → Tab → ${fieldName}` });
      continue;
    }
    const seqno = parts[0].trim().toUpperCase();
    const value = parts[1].trim();
    if (!seqno) { invalid.push({ line: trimmed, reason: "Empty SEQNO_DARRO" }); continue; }
    if (!allowed.includes(value)) {
      invalid.push({ line: trimmed, reason: `"${value}" is not a valid ${fieldName}` });
      continue;
    }
    valid.push({ seqno, value });
  }
  return { valid, invalid };
}

/* ── PUT — Preview ── */
export async function PUT(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionUser = token ? await verifySessionToken(token) : null;
  if (!sessionUser || !EDITOR_ROLES.includes(sessionUser.role))
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const body = await req.json();
  const { type, raw } = body as { type: BatchLHType; raw: string };
  if (!type) return NextResponse.json({ error: "No type specified." }, { status: 400 });
  if (!raw?.trim()) return NextResponse.json({ rows: [], invalid: [], notFoundSeqnos: [], outOfJurisdiction: [] });

  const scopedProvince = sessionUser.office_level !== "regional" ? sessionUser.province ?? null : null;

  /* status */
  if (type === "status") {
    const ALLOWED_STATUSES = ["For Initial Validation", "For Further Validation"];
    const { valid, invalid } = parseStatusLines(raw);
    if (!valid.length) return NextResponse.json({ rows: [], invalid, notFoundSeqnos: [], outOfJurisdiction: [], blockedSeqnos: [] });
    const seqnos = valid.map((r) => r.seqno);
    const found = await prisma.landholding.findMany({
      where: { seqno_darro: { in: seqnos } },
      select: { seqno_darro: true, landowner: true, province_edited: true, clno: true, status: true, data_flags: true },
    });
    const foundMap = Object.fromEntries(found.map((r) => [r.seqno_darro, r]));

    // Fetch ARB counts for in-scope records
    const arbCounts = await prisma.arb.groupBy({
      by: ["seqno_darro"],
      where: { seqno_darro: { in: seqnos } },
      _count: true,
    });
    const arbCountMap = Object.fromEntries(arbCounts.map((r) => [r.seqno_darro, r._count]));

    const notFoundSeqnos = seqnos.filter((s) => !foundMap[s]);
    const outOfJurisdiction = scopedProvince ? found.filter((r) => r.province_edited !== scopedProvince).map((r) => r.seqno_darro) : [];
    const blockedSeqnos: { seqno_darro: string; status: string }[] = [];
    const rows = valid
      .filter((r) => {
        if (!foundMap[r.seqno]) return false;
        if (scopedProvince && foundMap[r.seqno].province_edited !== scopedProvince) return false;
        if (!ALLOWED_STATUSES.includes(foundMap[r.seqno].status ?? "")) {
          blockedSeqnos.push({ seqno_darro: r.seqno, status: foundMap[r.seqno].status ?? "" });
          return false;
        }
        return true;
      })
      .map((r) => ({
        seqno_darro: r.seqno,
        landowner: foundMap[r.seqno].landowner,
        province: foundMap[r.seqno].province_edited,
        clno: foundMap[r.seqno].clno,
        current_status: foundMap[r.seqno].status,
        reason: r.reason,
        has_arbs: (arbCountMap[r.seqno] ?? 0) > 0,
        arb_count: arbCountMap[r.seqno] ?? 0,
      }));
    return NextResponse.json({ rows, invalid, notFoundSeqnos, outOfJurisdiction, blockedSeqnos });
  }

  /* amendarea */
  if (type === "amendarea") {
    const { valid, invalid } = parseNumericLines(raw);
    if (!valid.length) return NextResponse.json({ rows: [], invalid, notFoundSeqnos: [], outOfJurisdiction: [] });
    const seqnos = valid.map((r) => r.seqno);
    const found = await prisma.landholding.findMany({
      where: { seqno_darro: { in: seqnos } },
      select: { seqno_darro: true, landowner: true, province_edited: true, clno: true, amendarea_validated: true, amendarea_validated_confirmed: true },
    });
    const foundMap = Object.fromEntries(found.map((r) => [r.seqno_darro, r]));
    const notFoundSeqnos = seqnos.filter((s) => !foundMap[s]);
    const outOfJurisdiction = scopedProvince ? seqnos.filter((s) => foundMap[s] && foundMap[s].province_edited !== scopedProvince) : [];
    const rows = valid
      .filter((r) => foundMap[r.seqno] && (!scopedProvince || foundMap[r.seqno].province_edited === scopedProvince))
      .map((r) => ({ seqno_darro: r.seqno, landowner: foundMap[r.seqno].landowner, province: foundMap[r.seqno].province_edited, clno: foundMap[r.seqno].clno, old_value: foundMap[r.seqno].amendarea_validated, new_value: r.value, will_reset_confirmation: foundMap[r.seqno].amendarea_validated_confirmed === true }));
    return NextResponse.json({ rows, invalid, notFoundSeqnos, outOfJurisdiction });
  }

  /* condoned_amount */
  if (type === "condoned_amount") {
    const { valid, invalid } = parseCondonedLines(raw);
    if (!valid.length) return NextResponse.json({ rows: [], invalid, notFoundSeqnos: [], outOfJurisdiction: [] });
    const seqnos = valid.map((r) => r.seqno);
    const found = await prisma.landholding.findMany({
      where: { seqno_darro: { in: seqnos } },
      select: { seqno_darro: true, landowner: true, province_edited: true, clno: true, condoned_amount: true, condoned_amount_confirmed: true },
    });
    const foundMap = Object.fromEntries(found.map((r) => [r.seqno_darro, r]));
    const notFoundSeqnos = seqnos.filter((s) => !foundMap[s]);
    const outOfJurisdiction = scopedProvince ? seqnos.filter((s) => foundMap[s] && foundMap[s].province_edited !== scopedProvince) : [];
    const rows = valid
      .filter((r) => foundMap[r.seqno] && (!scopedProvince || foundMap[r.seqno].province_edited === scopedProvince))
      .map((r) => ({ seqno_darro: r.seqno, landowner: foundMap[r.seqno].landowner, province: foundMap[r.seqno].province_edited, clno: foundMap[r.seqno].clno, old_value: foundMap[r.seqno].condoned_amount, new_value: r.value, will_reset_confirmation: foundMap[r.seqno].condoned_amount_confirmed === true }));
    return NextResponse.json({ rows, invalid, notFoundSeqnos, outOfJurisdiction });
  }

  /* municipality */
  if (type === "municipality") {
    const { valid, invalid } = parseTabLines(raw);
    if (!valid.length) return NextResponse.json({ rows: [], invalid, notFoundSeqnos: [], outOfJurisdiction: [] });
    const seqnos = valid.map((r) => r.seqno);
    const found = await prisma.landholding.findMany({
      where: { seqno_darro: { in: seqnos } },
      select: { seqno_darro: true, landowner: true, province_edited: true, clno: true, municipality: true, barangay: true },
    });
    const foundMap = Object.fromEntries(found.map((r) => [r.seqno_darro, r]));
    const notFoundSeqnos = seqnos.filter((s) => !foundMap[s]);
    const outOfJurisdiction = scopedProvince ? seqnos.filter((s) => foundMap[s] && foundMap[s].province_edited !== scopedProvince) : [];
    const rows = valid
      .filter((r) => foundMap[r.seqno] && (!scopedProvince || foundMap[r.seqno].province_edited === scopedProvince))
      .map((r) => ({ seqno_darro: r.seqno, landowner: foundMap[r.seqno].landowner, province: foundMap[r.seqno].province_edited, clno: foundMap[r.seqno].clno, old_municipality: foundMap[r.seqno].municipality, old_barangay: foundMap[r.seqno].barangay, new_municipality: r.col2 || null, new_barangay: r.col3 ?? null }));
    return NextResponse.json({ rows, invalid, notFoundSeqnos, outOfJurisdiction });
  }

  /* asp_status */
  if (type === "asp_status") {
    const { valid, invalid } = parseEnumLines(raw, ASP_STATUS_VALUES, "ASP_STATUS");
    if (!valid.length) return NextResponse.json({ rows: [], invalid, notFoundSeqnos: [], outOfJurisdiction: [] });
    const seqnos = valid.map((r) => r.seqno);
    const found = await prisma.landholding.findMany({
      where: { seqno_darro: { in: seqnos } },
      select: { seqno_darro: true, landowner: true, province_edited: true, clno: true, asp_status: true },
    });
    const foundMap = Object.fromEntries(found.map((r) => [r.seqno_darro, r]));
    const notFoundSeqnos = seqnos.filter((s) => !foundMap[s]);
    const outOfJurisdiction = scopedProvince ? seqnos.filter((s) => foundMap[s] && foundMap[s].province_edited !== scopedProvince) : [];
    const rows = valid
      .filter((r) => foundMap[r.seqno] && (!scopedProvince || foundMap[r.seqno].province_edited === scopedProvince))
      .map((r) => ({ seqno_darro: r.seqno, landowner: foundMap[r.seqno].landowner, province: foundMap[r.seqno].province_edited, clno: foundMap[r.seqno].clno, old_value: foundMap[r.seqno].asp_status, new_value: r.value }));
    return NextResponse.json({ rows, invalid, notFoundSeqnos, outOfJurisdiction });
  }

  /* cloa_status */
  if (type === "cloa_status") {
    const { valid, invalid } = parseEnumLines(raw, CLOA_STATUS_VALUES, "CLOA_STATUS");
    if (!valid.length) return NextResponse.json({ rows: [], invalid, notFoundSeqnos: [], outOfJurisdiction: [] });
    const seqnos = valid.map((r) => r.seqno);
    const found = await prisma.landholding.findMany({
      where: { seqno_darro: { in: seqnos } },
      select: { seqno_darro: true, landowner: true, province_edited: true, clno: true, cloa_status: true },
    });
    const foundMap = Object.fromEntries(found.map((r) => [r.seqno_darro, r]));
    const notFoundSeqnos = seqnos.filter((s) => !foundMap[s]);
    const outOfJurisdiction = scopedProvince ? seqnos.filter((s) => foundMap[s] && foundMap[s].province_edited !== scopedProvince) : [];
    const rows = valid
      .filter((r) => foundMap[r.seqno] && (!scopedProvince || foundMap[r.seqno].province_edited === scopedProvince))
      .map((r) => ({ seqno_darro: r.seqno, landowner: foundMap[r.seqno].landowner, province: foundMap[r.seqno].province_edited, clno: foundMap[r.seqno].clno, old_value: foundMap[r.seqno].cloa_status, new_value: r.value }));
    return NextResponse.json({ rows, invalid, notFoundSeqnos, outOfJurisdiction });
  }

  /* remarks */
  if (type === "remarks") {
    const { valid, invalid } = parseTabLines(raw);
    if (!valid.length) return NextResponse.json({ rows: [], invalid, notFoundSeqnos: [], outOfJurisdiction: [] });
    const seqnos = valid.map((r) => r.seqno);
    const found = await prisma.landholding.findMany({
      where: { seqno_darro: { in: seqnos } },
      select: { seqno_darro: true, landowner: true, province_edited: true, clno: true, remarks: true },
    });
    const foundMap = Object.fromEntries(found.map((r) => [r.seqno_darro, r]));
    const notFoundSeqnos = seqnos.filter((s) => !foundMap[s]);
    const outOfJurisdiction = scopedProvince ? seqnos.filter((s) => foundMap[s] && foundMap[s].province_edited !== scopedProvince) : [];
    const rows = valid
      .filter((r) => foundMap[r.seqno] && (!scopedProvince || foundMap[r.seqno].province_edited === scopedProvince))
      .map((r) => ({ seqno_darro: r.seqno, landowner: foundMap[r.seqno].landowner, province: foundMap[r.seqno].province_edited, clno: foundMap[r.seqno].clno, old_value: foundMap[r.seqno].remarks, new_value: r.col2 || null }));
    return NextResponse.json({ rows, invalid, notFoundSeqnos, outOfJurisdiction });
  }

  return NextResponse.json({ error: "Invalid type." }, { status: 400 });
}

/* ── POST — Commit ── */
export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionUser = token ? await verifySessionToken(token) : null;
  if (!sessionUser || !EDITOR_ROLES.includes(sessionUser.role))
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const body = await req.json();
  const { type, raw, andConfirm } = body as { type: BatchLHType; raw: string; andConfirm?: boolean };
  if (!type) return NextResponse.json({ error: "No type specified." }, { status: 400 });
  if (!raw?.trim()) return NextResponse.json({ error: "No data provided." }, { status: 400 });

  const scopedProvince = sessionUser.office_level !== "regional" ? sessionUser.province ?? null : null;

  const insertAudit = rawDb.prepare(
    `INSERT INTO "AuditLog" (seqno_darro, action, field_changed, old_value, new_value, changed_by, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
  );

  /* status */
  if (type === "status") {
    const ALLOWED_STATUSES = ["For Initial Validation", "For Further Validation"];
    const { valid } = parseStatusLines(raw);
    if (!valid.length) return NextResponse.json({ error: "No valid rows." }, { status: 400 });
    const seqnos = valid.map((r) => r.seqno);
    const found = await prisma.landholding.findMany({
      where: { seqno_darro: { in: seqnos } },
      select: { seqno_darro: true, status: true, non_eligibility_reason: true, province_edited: true },
    });
    const foundMap = Object.fromEntries(found.map((r) => [r.seqno_darro, r]));
    const toUpdate = valid.filter(
      (r) => foundMap[r.seqno]
        && (!scopedProvince || foundMap[r.seqno].province_edited === scopedProvince)
        && ALLOWED_STATUSES.includes(foundMap[r.seqno].status ?? "")
    );
    const outOfJurisdiction = scopedProvince ? valid.filter((r) => foundMap[r.seqno] && foundMap[r.seqno].province_edited !== scopedProvince).map((r) => r.seqno) : [];
    const notFound = seqnos.filter((s) => !foundMap[s]);

    const deleteArbs = rawDb.prepare(`DELETE FROM "Arb" WHERE seqno_darro = ?`);
    rawDb.transaction(() => {
      for (const r of toUpdate) {
        const rec = foundMap[r.seqno];
        // Delete any existing ARBs (only possible on For Further Validation records)
        if (rec.status === "For Further Validation") {
          deleteArbs.run(r.seqno);
          insertAudit.run(r.seqno, "ARB_DELETE", "arbs", "Existing ARBs", "Deleted — status set to Not Eligible for Encoding", sessionUser.username);
        }
        rawDb.prepare(`UPDATE "Landholding" SET "status" = ?, "non_eligibility_reason" = ?, "updated_at" = datetime('now') WHERE seqno_darro = ?`)
          .run("Not Eligible for Encoding", r.reason, r.seqno);
        insertAudit.run(r.seqno, "STATUS_UPDATE", "status", rec.status ?? "", "Not Eligible for Encoding", sessionUser.username);
        insertAudit.run(r.seqno, "RECORD_UPDATE", "non_eligibility_reason", rec.non_eligibility_reason ?? "", r.reason, sessionUser.username);
      }
    })();
    return NextResponse.json({ updated: toUpdate.length, notFound, outOfJurisdiction });
  }

  /* amendarea */
  if (type === "amendarea") {
    const { valid } = parseNumericLines(raw);
    if (!valid.length) return NextResponse.json({ error: "No valid rows." }, { status: 400 });
    const seqnos = valid.map((r) => r.seqno);
    const found = await prisma.landholding.findMany({
      where: { seqno_darro: { in: seqnos } },
      select: { seqno_darro: true, amendarea_validated: true, province_edited: true },
    });
    const foundMap = Object.fromEntries(found.map((r) => [r.seqno_darro, r]));
    const toUpdate = valid.filter((r) => foundMap[r.seqno] && (!scopedProvince || foundMap[r.seqno].province_edited === scopedProvince));
    const outOfJurisdiction = scopedProvince ? valid.filter((r) => foundMap[r.seqno] && foundMap[r.seqno].province_edited !== scopedProvince).map((r) => r.seqno) : [];
    const notFound = seqnos.filter((s) => !foundMap[s]);
    rawDb.transaction(() => {
      for (const r of toUpdate) {
        rawDb.prepare(`UPDATE "Landholding" SET "amendarea_validated" = ?, "amendarea_validated_confirmed" = ?, "updated_at" = datetime('now') WHERE seqno_darro = ?`)
          .run(r.value, andConfirm ? 1 : 0, r.seqno);
        insertAudit.run(r.seqno, "RECORD_UPDATE", "amendarea_validated", String(foundMap[r.seqno].amendarea_validated ?? ""), String(r.value), sessionUser.username);
        if (andConfirm) insertAudit.run(r.seqno, "RECORD_UPDATE", "amendarea_validated_confirmed", "false", "true", sessionUser.username);
      }
    })();
    for (const r of toUpdate) await computeAndUpdateStatus(r.seqno);
    return NextResponse.json({ updated: toUpdate.length, notFound, outOfJurisdiction });
  }

  /* condoned_amount */
  if (type === "condoned_amount") {
    const { valid } = parseCondonedLines(raw);
    if (!valid.length) return NextResponse.json({ error: "No valid rows." }, { status: 400 });
    const seqnos = valid.map((r) => r.seqno);
    const found = await prisma.landholding.findMany({
      where: { seqno_darro: { in: seqnos } },
      select: { seqno_darro: true, condoned_amount: true, province_edited: true },
    });
    const foundMap = Object.fromEntries(found.map((r) => [r.seqno_darro, r]));
    const toUpdate = valid.filter((r) => foundMap[r.seqno] && (!scopedProvince || foundMap[r.seqno].province_edited === scopedProvince));
    const outOfJurisdiction = scopedProvince ? valid.filter((r) => foundMap[r.seqno] && foundMap[r.seqno].province_edited !== scopedProvince).map((r) => r.seqno) : [];
    const notFound = seqnos.filter((s) => !foundMap[s]);
    rawDb.transaction(() => {
      for (const r of toUpdate) {
        rawDb.prepare(`UPDATE "Landholding" SET "condoned_amount" = ?, "condoned_amount_confirmed" = ?, "updated_at" = datetime('now') WHERE seqno_darro = ?`)
          .run(r.value, andConfirm ? 1 : 0, r.seqno);
        insertAudit.run(r.seqno, "RECORD_UPDATE", "condoned_amount", String(foundMap[r.seqno].condoned_amount ?? ""), String(r.value), sessionUser.username);
        if (andConfirm) insertAudit.run(r.seqno, "RECORD_UPDATE", "condoned_amount_confirmed", "false", "true", sessionUser.username);
      }
    })();
    for (const r of toUpdate) await computeAndUpdateStatus(r.seqno);
    return NextResponse.json({ updated: toUpdate.length, notFound, outOfJurisdiction });
  }

  /* municipality */
  if (type === "municipality") {
    const { valid } = parseTabLines(raw);
    if (!valid.length) return NextResponse.json({ error: "No valid rows." }, { status: 400 });
    const seqnos = valid.map((r) => r.seqno);
    const found = await prisma.landholding.findMany({
      where: { seqno_darro: { in: seqnos } },
      select: { seqno_darro: true, municipality: true, barangay: true, province_edited: true },
    });
    const foundMap = Object.fromEntries(found.map((r) => [r.seqno_darro, r]));
    const toUpdate = valid.filter((r) => foundMap[r.seqno] && (!scopedProvince || foundMap[r.seqno].province_edited === scopedProvince));
    const outOfJurisdiction = scopedProvince ? valid.filter((r) => foundMap[r.seqno] && foundMap[r.seqno].province_edited !== scopedProvince).map((r) => r.seqno) : [];
    const notFound = seqnos.filter((s) => !foundMap[s]);
    rawDb.transaction(() => {
      for (const r of toUpdate) {
        const rec = foundMap[r.seqno];
        rawDb.prepare(`UPDATE "Landholding" SET "municipality" = ?, "barangay" = ?, "updated_at" = datetime('now') WHERE seqno_darro = ?`)
          .run(r.col2 || null, r.col3 !== undefined ? (r.col3 || null) : rec.barangay, r.seqno);
        insertAudit.run(r.seqno, "RECORD_UPDATE", "municipality", rec.municipality ?? "", r.col2 || "", sessionUser.username);
        if (r.col3 !== undefined) insertAudit.run(r.seqno, "RECORD_UPDATE", "barangay", rec.barangay ?? "", r.col3 || "", sessionUser.username);
      }
    })();
    return NextResponse.json({ updated: toUpdate.length, notFound, outOfJurisdiction });
  }

  /* asp_status */
  if (type === "asp_status") {
    const { valid } = parseEnumLines(raw, ASP_STATUS_VALUES, "ASP_STATUS");
    if (!valid.length) return NextResponse.json({ error: "No valid rows." }, { status: 400 });
    const seqnos = valid.map((r) => r.seqno);
    const found = await prisma.landholding.findMany({
      where: { seqno_darro: { in: seqnos } },
      select: { seqno_darro: true, asp_status: true, province_edited: true },
    });
    const foundMap = Object.fromEntries(found.map((r) => [r.seqno_darro, r]));
    const toUpdate = valid.filter((r) => foundMap[r.seqno] && (!scopedProvince || foundMap[r.seqno].province_edited === scopedProvince));
    const outOfJurisdiction = scopedProvince ? valid.filter((r) => foundMap[r.seqno] && foundMap[r.seqno].province_edited !== scopedProvince).map((r) => r.seqno) : [];
    const notFound = seqnos.filter((s) => !foundMap[s]);
    rawDb.transaction(() => {
      for (const r of toUpdate) {
        rawDb.prepare(`UPDATE "Landholding" SET "asp_status" = ?, "updated_at" = datetime('now') WHERE seqno_darro = ?`).run(r.value, r.seqno);
        insertAudit.run(r.seqno, "RECORD_UPDATE", "asp_status", foundMap[r.seqno].asp_status ?? "", r.value, sessionUser.username);
      }
    })();
    return NextResponse.json({ updated: toUpdate.length, notFound, outOfJurisdiction });
  }

  /* cloa_status */
  if (type === "cloa_status") {
    const { valid } = parseEnumLines(raw, CLOA_STATUS_VALUES, "CLOA_STATUS");
    if (!valid.length) return NextResponse.json({ error: "No valid rows." }, { status: 400 });
    const seqnos = valid.map((r) => r.seqno);
    const found = await prisma.landholding.findMany({
      where: { seqno_darro: { in: seqnos } },
      select: { seqno_darro: true, cloa_status: true, province_edited: true },
    });
    const foundMap = Object.fromEntries(found.map((r) => [r.seqno_darro, r]));
    const toUpdate = valid.filter((r) => foundMap[r.seqno] && (!scopedProvince || foundMap[r.seqno].province_edited === scopedProvince));
    const outOfJurisdiction = scopedProvince ? valid.filter((r) => foundMap[r.seqno] && foundMap[r.seqno].province_edited !== scopedProvince).map((r) => r.seqno) : [];
    const notFound = seqnos.filter((s) => !foundMap[s]);
    rawDb.transaction(() => {
      for (const r of toUpdate) {
        rawDb.prepare(`UPDATE "Landholding" SET "cloa_status" = ?, "updated_at" = datetime('now') WHERE seqno_darro = ?`).run(r.value, r.seqno);
        insertAudit.run(r.seqno, "RECORD_UPDATE", "cloa_status", foundMap[r.seqno].cloa_status ?? "", r.value, sessionUser.username);
      }
    })();
    return NextResponse.json({ updated: toUpdate.length, notFound, outOfJurisdiction });
  }

  /* remarks */
  if (type === "remarks") {
    const { valid } = parseTabLines(raw);
    if (!valid.length) return NextResponse.json({ error: "No valid rows." }, { status: 400 });
    const seqnos = valid.map((r) => r.seqno);
    const found = await prisma.landholding.findMany({
      where: { seqno_darro: { in: seqnos } },
      select: { seqno_darro: true, remarks: true, province_edited: true },
    });
    const foundMap = Object.fromEntries(found.map((r) => [r.seqno_darro, r]));
    const toUpdate = valid.filter((r) => foundMap[r.seqno] && (!scopedProvince || foundMap[r.seqno].province_edited === scopedProvince));
    const outOfJurisdiction = scopedProvince ? valid.filter((r) => foundMap[r.seqno] && foundMap[r.seqno].province_edited !== scopedProvince).map((r) => r.seqno) : [];
    const notFound = seqnos.filter((s) => !foundMap[s]);
    rawDb.transaction(() => {
      for (const r of toUpdate) {
        rawDb.prepare(`UPDATE "Landholding" SET "remarks" = ?, "updated_at" = datetime('now') WHERE seqno_darro = ?`).run(r.col2 || null, r.seqno);
        insertAudit.run(r.seqno, "RECORD_UPDATE", "remarks", foundMap[r.seqno].remarks ?? "", r.col2 || "", sessionUser.username);
      }
    })();
    return NextResponse.json({ updated: toUpdate.length, notFound, outOfJurisdiction });
  }

  return NextResponse.json({ error: "Invalid type." }, { status: 400 });
}

/* ── GET — List Not Eligible for Encoding ── */
export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionUser = token ? await verifySessionToken(token) : null;
  if (!sessionUser || !EDITOR_ROLES.includes(sessionUser.role))
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const scopedProvince = sessionUser.office_level !== "regional" ? sessionUser.province ?? null : null;

  const records = await prisma.landholding.findMany({
    where: {
      status: "Not Eligible for Encoding",
      ...(scopedProvince ? { province_edited: scopedProvince } : {}),
    },
    select: { seqno_darro: true, landowner: true, province_edited: true, clno: true, non_eligibility_reason: true },
    orderBy: { seqno_darro: "asc" },
  });

  return NextResponse.json({ records });
}

/* ── DELETE — Revert Not Eligible for Encoding ── */
export async function DELETE(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionUser = token ? await verifySessionToken(token) : null;
  if (!sessionUser || !EDITOR_ROLES.includes(sessionUser.role))
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const body = await req.json();
  const { seqnos } = body as { seqnos: string[] };
  if (!Array.isArray(seqnos) || seqnos.length === 0)
    return NextResponse.json({ error: "No SEQNOs provided." }, { status: 400 });

  const scopedProvince = sessionUser.office_level !== "regional" ? sessionUser.province ?? null : null;

  const found = await prisma.landholding.findMany({
    where: {
      seqno_darro: { in: seqnos },
      status: "Not Eligible for Encoding",
      ...(scopedProvince ? { province_edited: scopedProvince } : {}),
    },
    select: { seqno_darro: true },
  });

  if (found.length === 0)
    return NextResponse.json({ error: "No eligible records found." }, { status: 400 });

  const insertAudit = rawDb.prepare(
    `INSERT INTO "AuditLog" (seqno_darro, action, field_changed, old_value, new_value, changed_by, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
  );

  const found2 = await prisma.landholding.findMany({
    where: { seqno_darro: { in: found.map((r) => r.seqno_darro) } },
    select: { seqno_darro: true, non_eligibility_reason: true },
  });
  const reasonMap = Object.fromEntries(found2.map((r) => [r.seqno_darro, r.non_eligibility_reason]));

  rawDb.transaction(() => {
    for (const rec of found) {
      rawDb.prepare(`UPDATE "Landholding" SET "status" = NULL, "non_eligibility_reason" = NULL, "updated_at" = datetime('now') WHERE seqno_darro = ?`)
        .run(rec.seqno_darro);
      insertAudit.run(rec.seqno_darro, "STATUS_UPDATE", "status", "Not Eligible for Encoding", "(reverted — auto-recompute)", sessionUser.username);
      insertAudit.run(rec.seqno_darro, "RECORD_UPDATE", "non_eligibility_reason", reasonMap[rec.seqno_darro] ?? "", "", sessionUser.username);
    }
  })();

  for (const rec of found) await computeAndUpdateStatus(rec.seqno_darro);

  return NextResponse.json({ reverted: found.length });
}
