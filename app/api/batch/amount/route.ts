import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";

const EDITOR_ROLES = ["super_admin", "admin", "editor"];

function requireEditor(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  return token ? verifySessionToken(token) : Promise.resolve(null);
}

type ParsedRow = { seqno: string; amount: number };
type InvalidRow = { line: string; reason: string };

function parseLines(raw: string): { valid: ParsedRow[]; invalid: InvalidRow[] } {
  const valid: ParsedRow[] = [];
  const invalid: InvalidRow[] = [];

  const lines = raw.split(/\n/).map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    // Split on first whitespace — SEQNO may contain hyphens, amount is the last token
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) {
      invalid.push({ line, reason: "Missing amount — expected: SEQNO_DARRO <space> Amount" });
      continue;
    }
    const amount = parseFloat(parts[parts.length - 1].replace(/,/g, ""));
    const seqno = parts.slice(0, parts.length - 1).join(" ");

    if (!seqno) { invalid.push({ line, reason: "Empty SEQNO_DARRO" }); continue; }
    if (isNaN(amount)) { invalid.push({ line, reason: `"${parts[parts.length - 1]}" is not a valid number` }); continue; }
    if (amount < 0) { invalid.push({ line, reason: "Amount cannot be negative" }); continue; }

    valid.push({ seqno, amount });
  }

  return { valid, invalid };
}

// Preview — validate without saving
export async function PUT(req: NextRequest) {
  const sessionUser = await requireEditor(req);
  if (!sessionUser || !EDITOR_ROLES.includes(sessionUser.role))
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const { raw } = await req.json();
  if (!raw?.trim()) return NextResponse.json({ rows: [], invalid: [], notFound: [] });

  const { valid, invalid } = parseLines(raw);
  if (valid.length === 0) return NextResponse.json({ rows: [], invalid, notFound: [] });

  const seqnos = valid.map((r) => r.seqno);
  const found = await prisma.landholding.findMany({
    where: { seqno_darro: { in: seqnos } },
    select: { seqno_darro: true, landowner: true, province_edited: true, clno: true, condoned_amount: true },
  });

  const foundMap = Object.fromEntries(found.map((r) => [r.seqno_darro, r]));
  const notFound = valid.filter((r) => !foundMap[r.seqno]).map((r) => r.seqno);

  // Province scoping
  const scopedProvince =
    sessionUser.office_level !== "regional" ? sessionUser.province ?? null : null;

  const outOfJurisdiction = scopedProvince
    ? valid.filter((r) => foundMap[r.seqno] && foundMap[r.seqno].province_edited !== scopedProvince).map((r) => r.seqno)
    : [];

  const rows = valid
    .filter((r) => foundMap[r.seqno] && (!scopedProvince || foundMap[r.seqno].province_edited === scopedProvince))
    .map((r) => ({
      seqno_darro: r.seqno,
      landowner: foundMap[r.seqno].landowner,
      province_edited: foundMap[r.seqno].province_edited,
      clno: foundMap[r.seqno].clno,
      old_amount: foundMap[r.seqno].condoned_amount,
      new_amount: r.amount,
    }));

  return NextResponse.json({ rows, invalid, notFound, outOfJurisdiction });
}

// Commit — apply updates
export async function POST(req: NextRequest) {
  const sessionUser = await requireEditor(req);
  if (!sessionUser || !EDITOR_ROLES.includes(sessionUser.role))
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const { raw } = await req.json();
  if (!raw?.trim()) return NextResponse.json({ error: "No data provided." }, { status: 400 });

  const { valid, invalid } = parseLines(raw);
  if (valid.length === 0) return NextResponse.json({ error: "No valid rows to process." }, { status: 400 });

  const seqnos = valid.map((r) => r.seqno);
  const found = await prisma.landholding.findMany({
    where: { seqno_darro: { in: seqnos } },
    select: { seqno_darro: true, condoned_amount: true, province_edited: true },
  });

  const foundMap = Object.fromEntries(found.map((r) => [r.seqno_darro, r]));
  const notFound = valid.filter((r) => !foundMap[r.seqno]).map((r) => r.seqno);

  // Province scoping
  const scopedProvince =
    sessionUser.office_level !== "regional" ? sessionUser.province ?? null : null;

  const outOfJurisdiction = scopedProvince
    ? valid.filter((r) => foundMap[r.seqno] && foundMap[r.seqno].province_edited !== scopedProvince).map((r) => r.seqno)
    : [];

  const toUpdate = valid.filter(
    (r) => foundMap[r.seqno] && (!scopedProvince || foundMap[r.seqno].province_edited === scopedProvince)
  );

  await prisma.$transaction(async (tx) => {
    for (const row of toUpdate) {
      await tx.landholding.update({
        where: { seqno_darro: row.seqno },
        data: { condoned_amount: row.amount, updated_at: new Date() },
      });
    }
    await tx.auditLog.createMany({
      data: toUpdate.map((r) => ({
        seqno_darro: r.seqno,
        action: "AMOUNT_UPDATE",
        field_changed: "condoned_amount",
        old_value: String(foundMap[r.seqno].condoned_amount ?? "null"),
        new_value: String(r.amount),
        changed_by: "System",
      })),
    });
  });

  return NextResponse.json({ updated: toUpdate.length, notFound, invalid, outOfJurisdiction });
}
