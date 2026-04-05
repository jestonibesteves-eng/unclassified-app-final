import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";

const EDITOR_ROLES = ["super_admin", "admin", "editor"];
type BatchType = "status" | "amount" | "municipality" | "amendarea" | "remarks";

/* ── Parsers ── */

function parseSeqnoList(raw: string): string[] {
  return raw.split(/[\n,]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
}

type TabRow = { seqno: string; col2: string; col3?: string };
type ParseErr = { line: string; reason: string };

function parseTabLines(raw: string): { valid: TabRow[]; invalid: ParseErr[] } {
  const valid: TabRow[] = [];
  const invalid: ParseErr[] = [];
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
    valid.push({ seqno, col2, col3 });
  }
  return { valid, invalid };
}

function parseNumericLines(raw: string): { valid: { seqno: string; value: number }[]; invalid: ParseErr[] } {
  const valid: { seqno: string; value: number }[] = [];
  const invalid: ParseErr[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Support both tab-separated and space-separated
    const parts = trimmed.includes("\t") ? trimmed.split("\t") : trimmed.split(/\s+/);
    if (parts.length < 2) {
      invalid.push({ line: trimmed, reason: "Missing value — expected: SEQNO Tab Value" });
      continue;
    }
    const seqno = parts[0].trim().toUpperCase();
    const numStr = parts[parts.length - 1].replace(/,/g, "");
    const value = parseFloat(numStr);
    if (!seqno) { invalid.push({ line: trimmed, reason: "Empty SEQNO_DARRO" }); continue; }
    if (isNaN(value)) { invalid.push({ line: trimmed, reason: `"${parts[parts.length - 1]}" is not a valid number` }); continue; }
    if (value < 0) { invalid.push({ line: trimmed, reason: "Value cannot be negative" }); continue; }
    valid.push({ seqno, value });
  }
  return { valid, invalid };
}

/* ── Preview (PUT) ── */

export async function PUT(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionUser = token ? await verifySessionToken(token) : null;
  if (!sessionUser || !EDITOR_ROLES.includes(sessionUser.role))
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const body = await req.json();
  const { type, raw, seqnos: rawSeqnos } = body as { type: BatchType; raw?: string; seqnos?: string[] };
  const scopedProvince = sessionUser.office_level !== "regional" ? sessionUser.province ?? null : null;

  /* status */
  if (type === "status") {
    const seqnos = rawSeqnos ?? parseSeqnoList(raw ?? "");
    if (!seqnos.length) return NextResponse.json({ records: [], notFound: [], outOfJurisdiction: [] });
    const found = await prisma.landholding.findMany({
      where: { seqno_darro: { in: seqnos } },
      select: { seqno_darro: true, landowner: true, province_edited: true, clno: true, status: true, data_flags: true },
    });
    const foundSeqnos = new Set(found.map((r) => r.seqno_darro));
    const notFound = seqnos.filter((s) => !foundSeqnos.has(s));
    const outOfJurisdiction = scopedProvince ? found.filter((r) => r.province_edited !== scopedProvince).map((r) => r.seqno_darro) : [];
    const records = scopedProvince ? found.filter((r) => r.province_edited === scopedProvince) : found;
    return NextResponse.json({ records, notFound, outOfJurisdiction });
  }

  /* amount */
  if (type === "amount") {
    if (!raw?.trim()) return NextResponse.json({ rows: [], invalid: [], notFound: [], outOfJurisdiction: [] });
    const { valid, invalid } = parseNumericLines(raw);
    if (!valid.length) return NextResponse.json({ rows: [], invalid, notFound: [], outOfJurisdiction: [] });
    const seqnos = valid.map((r) => r.seqno);
    const found = await prisma.landholding.findMany({
      where: { seqno_darro: { in: seqnos } },
      select: { seqno_darro: true, landowner: true, province_edited: true, clno: true, condoned_amount: true },
    });
    const foundMap = Object.fromEntries(found.map((r) => [r.seqno_darro, r]));
    const notFound = seqnos.filter((s) => !foundMap[s]);
    const outOfJurisdiction = scopedProvince ? seqnos.filter((s) => foundMap[s] && foundMap[s].province_edited !== scopedProvince) : [];
    const rows = valid
      .filter((r) => foundMap[r.seqno] && (!scopedProvince || foundMap[r.seqno].province_edited === scopedProvince))
      .map((r) => ({ seqno_darro: r.seqno, landowner: foundMap[r.seqno].landowner, province_edited: foundMap[r.seqno].province_edited, clno: foundMap[r.seqno].clno, old_value: foundMap[r.seqno].condoned_amount, new_value: r.value }));
    return NextResponse.json({ rows, invalid, notFound, outOfJurisdiction });
  }

  /* municipality */
  if (type === "municipality") {
    if (!raw?.trim()) return NextResponse.json({ rows: [], invalid: [], notFound: [], outOfJurisdiction: [] });
    const { valid, invalid } = parseTabLines(raw);
    if (!valid.length) return NextResponse.json({ rows: [], invalid, notFound: [], outOfJurisdiction: [] });
    const seqnos = valid.map((r) => r.seqno);
    const found = await prisma.landholding.findMany({
      where: { seqno_darro: { in: seqnos } },
      select: { seqno_darro: true, landowner: true, province_edited: true, clno: true, municipality: true, barangay: true },
    });
    const foundMap = Object.fromEntries(found.map((r) => [r.seqno_darro, r]));
    const notFound = seqnos.filter((s) => !foundMap[s]);
    const outOfJurisdiction = scopedProvince ? seqnos.filter((s) => foundMap[s] && foundMap[s].province_edited !== scopedProvince) : [];
    const rows = valid
      .filter((r) => foundMap[r.seqno] && (!scopedProvince || foundMap[r.seqno].province_edited === scopedProvince))
      .map((r) => ({ seqno_darro: r.seqno, landowner: foundMap[r.seqno].landowner, province_edited: foundMap[r.seqno].province_edited, clno: foundMap[r.seqno].clno, old_municipality: foundMap[r.seqno].municipality, old_barangay: foundMap[r.seqno].barangay, new_municipality: r.col2 || null, new_barangay: r.col3 ?? null }));
    return NextResponse.json({ rows, invalid, notFound, outOfJurisdiction });
  }

  /* amendarea */
  if (type === "amendarea") {
    if (!raw?.trim()) return NextResponse.json({ rows: [], invalid: [], notFound: [], outOfJurisdiction: [] });
    const { valid, invalid } = parseNumericLines(raw);
    if (!valid.length) return NextResponse.json({ rows: [], invalid, notFound: [], outOfJurisdiction: [] });
    const seqnos = valid.map((r) => r.seqno);
    const found = await prisma.landholding.findMany({
      where: { seqno_darro: { in: seqnos } },
      select: { seqno_darro: true, landowner: true, province_edited: true, clno: true, amendarea_validated: true },
    });
    const foundMap = Object.fromEntries(found.map((r) => [r.seqno_darro, r]));
    const notFound = seqnos.filter((s) => !foundMap[s]);
    const outOfJurisdiction = scopedProvince ? seqnos.filter((s) => foundMap[s] && foundMap[s].province_edited !== scopedProvince) : [];
    const rows = valid
      .filter((r) => foundMap[r.seqno] && (!scopedProvince || foundMap[r.seqno].province_edited === scopedProvince))
      .map((r) => ({ seqno_darro: r.seqno, landowner: foundMap[r.seqno].landowner, province_edited: foundMap[r.seqno].province_edited, clno: foundMap[r.seqno].clno, old_value: foundMap[r.seqno].amendarea_validated, new_value: r.value }));
    return NextResponse.json({ rows, invalid, notFound, outOfJurisdiction });
  }

  /* remarks */
  if (type === "remarks") {
    if (!raw?.trim()) return NextResponse.json({ rows: [], invalid: [], notFound: [], outOfJurisdiction: [] });
    const { valid, invalid } = parseTabLines(raw);
    if (!valid.length) return NextResponse.json({ rows: [], invalid, notFound: [], outOfJurisdiction: [] });
    const seqnos = valid.map((r) => r.seqno);
    const found = await prisma.landholding.findMany({
      where: { seqno_darro: { in: seqnos } },
      select: { seqno_darro: true, landowner: true, province_edited: true, clno: true, remarks: true },
    });
    const foundMap = Object.fromEntries(found.map((r) => [r.seqno_darro, r]));
    const notFound = seqnos.filter((s) => !foundMap[s]);
    const outOfJurisdiction = scopedProvince ? seqnos.filter((s) => foundMap[s] && foundMap[s].province_edited !== scopedProvince) : [];
    const rows = valid
      .filter((r) => foundMap[r.seqno] && (!scopedProvince || foundMap[r.seqno].province_edited === scopedProvince))
      .map((r) => ({ seqno_darro: r.seqno, landowner: foundMap[r.seqno].landowner, province_edited: foundMap[r.seqno].province_edited, clno: foundMap[r.seqno].clno, old_value: foundMap[r.seqno].remarks, new_value: r.col2 || null }));
    return NextResponse.json({ rows, invalid, notFound, outOfJurisdiction });
  }

  return NextResponse.json({ error: "Invalid type." }, { status: 400 });
}

/* ── Commit (POST) ── */

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionUser = token ? await verifySessionToken(token) : null;
  if (!sessionUser || !EDITOR_ROLES.includes(sessionUser.role))
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const body = await req.json();
  const { type, raw, seqnos: rawSeqnos, value, nonEligibilityReason } = body as { type: BatchType; raw?: string; seqnos?: string[]; value?: string; nonEligibilityReason?: string };
  const scopedProvince = sessionUser.office_level !== "regional" ? sessionUser.province ?? null : null;

  /* status */
  if (type === "status") {
    if (!value?.trim()) return NextResponse.json({ error: "Status value is required." }, { status: 400 });
    if (value === "Not Eligible for Encoding" && !nonEligibilityReason?.trim())
      return NextResponse.json({ error: "Reason for Non-Eligibility is required." }, { status: 400 });
    const seqnos = rawSeqnos ?? parseSeqnoList(raw ?? "");
    if (!seqnos.length) return NextResponse.json({ error: "No SEQNOs provided." }, { status: 400 });
    const found = await prisma.landholding.findMany({
      where: { seqno_darro: { in: seqnos } },
      select: { seqno_darro: true, status: true, province_edited: true },
    });
    const toUpdate = scopedProvince ? found.filter((r) => r.province_edited === scopedProvince) : found;
    const outOfJurisdiction = scopedProvince ? found.filter((r) => r.province_edited !== scopedProvince).map((r) => r.seqno_darro) : [];
    const notFound = seqnos.filter((s) => !found.map((r) => r.seqno_darro).includes(s));
    if (!toUpdate.length) return NextResponse.json({ error: "None within your jurisdiction." }, { status: 403 });
    const toUpdateSeqnos = toUpdate.map((r) => r.seqno_darro);
    const updateData: { status: string; updated_at: Date; remarks?: string } = { status: value, updated_at: new Date() };
    if (value === "Not Eligible for Encoding" && nonEligibilityReason?.trim())
      updateData.remarks = nonEligibilityReason.trim();
    await prisma.$transaction(async (tx) => {
      await tx.landholding.updateMany({ where: { seqno_darro: { in: toUpdateSeqnos } }, data: updateData });
      await tx.auditLog.createMany({
        data: toUpdate.map((r) => ({
          seqno_darro: r.seqno_darro, action: "STATUS_UPDATE", field_changed: "status",
          old_value: r.status ?? "For Further Validation",
          new_value: value === "Not Eligible for Encoding" && nonEligibilityReason?.trim()
            ? `${value} — ${nonEligibilityReason.trim()}`
            : value,
          changed_by: sessionUser.username,
        })),
      });
    });
    return NextResponse.json({ updated: toUpdateSeqnos.length, notFound, outOfJurisdiction });
  }

  /* amount */
  if (type === "amount") {
    if (!raw?.trim()) return NextResponse.json({ error: "No data provided." }, { status: 400 });
    const { valid } = parseNumericLines(raw);
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
    await prisma.$transaction(async (tx) => {
      for (const row of toUpdate) {
        await tx.landholding.update({ where: { seqno_darro: row.seqno }, data: { condoned_amount: row.value, updated_at: new Date() } });
      }
      await tx.auditLog.createMany({ data: toUpdate.map((r) => ({ seqno_darro: r.seqno, action: "AMOUNT_UPDATE", field_changed: "condoned_amount", old_value: String(foundMap[r.seqno].condoned_amount ?? "null"), new_value: String(r.value), changed_by: sessionUser.username })) });
    });
    return NextResponse.json({ updated: toUpdate.length, notFound, outOfJurisdiction });
  }

  /* municipality */
  if (type === "municipality") {
    if (!raw?.trim()) return NextResponse.json({ error: "No data provided." }, { status: 400 });
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
    await prisma.$transaction(async (tx) => {
      for (const row of toUpdate) {
        const data: Record<string, unknown> = { municipality: row.col2 || null, updated_at: new Date() };
        if (row.col3 !== undefined) data.barangay = row.col3 || null;
        await tx.landholding.update({ where: { seqno_darro: row.seqno }, data });
      }
      const auditEntries = toUpdate.flatMap((r) => {
        const entries = [{ seqno_darro: r.seqno, action: "RECORD_UPDATE", field_changed: "municipality", old_value: foundMap[r.seqno].municipality ?? "", new_value: r.col2 || "", changed_by: sessionUser.username }];
        if (r.col3 !== undefined) entries.push({ seqno_darro: r.seqno, action: "RECORD_UPDATE", field_changed: "barangay", old_value: foundMap[r.seqno].barangay ?? "", new_value: r.col3 || "", changed_by: sessionUser.username });
        return entries;
      });
      if (auditEntries.length) await tx.auditLog.createMany({ data: auditEntries });
    });
    return NextResponse.json({ updated: toUpdate.length, notFound, outOfJurisdiction });
  }

  /* amendarea */
  if (type === "amendarea") {
    if (!raw?.trim()) return NextResponse.json({ error: "No data provided." }, { status: 400 });
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
    await prisma.$transaction(async (tx) => {
      for (const row of toUpdate) {
        await tx.landholding.update({ where: { seqno_darro: row.seqno }, data: { amendarea_validated: row.value, updated_at: new Date() } });
      }
      await tx.auditLog.createMany({ data: toUpdate.map((r) => ({ seqno_darro: r.seqno, action: "RECORD_UPDATE", field_changed: "amendarea_validated", old_value: String(foundMap[r.seqno].amendarea_validated ?? "null"), new_value: String(r.value), changed_by: sessionUser.username })) });
    });
    return NextResponse.json({ updated: toUpdate.length, notFound, outOfJurisdiction });
  }

  /* remarks */
  if (type === "remarks") {
    if (!raw?.trim()) return NextResponse.json({ error: "No data provided." }, { status: 400 });
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
    await prisma.$transaction(async (tx) => {
      for (const row of toUpdate) {
        await tx.landholding.update({ where: { seqno_darro: row.seqno }, data: { remarks: row.col2 || null, updated_at: new Date() } });
      }
      await tx.auditLog.createMany({ data: toUpdate.map((r) => ({ seqno_darro: r.seqno, action: "RECORD_UPDATE", field_changed: "remarks", old_value: foundMap[r.seqno].remarks ?? "", new_value: r.col2 || "", changed_by: sessionUser.username })) });
    });
    return NextResponse.json({ updated: toUpdate.length, notFound, outOfJurisdiction });
  }

  return NextResponse.json({ error: "Invalid type." }, { status: 400 });
}
