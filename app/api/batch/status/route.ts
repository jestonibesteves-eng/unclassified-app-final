import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";

const EDITOR_ROLES = ["super_admin", "admin", "editor"];

function requireEditor(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  return token ? verifySessionToken(token) : Promise.resolve(null);
}

export async function POST(req: NextRequest) {
  const sessionUser = await requireEditor(req);
  if (!sessionUser || !EDITOR_ROLES.includes(sessionUser.role))
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const body = await req.json();
  const { seqnos, status } = body;

  if (!status || typeof status !== "string" || !status.trim()) {
    return NextResponse.json({ error: "Status cannot be empty." }, { status: 400 });
  }
  if (!Array.isArray(seqnos) || seqnos.length === 0) {
    return NextResponse.json({ error: "No SEQNO_DARRO provided." }, { status: 400 });
  }

  const cleaned = seqnos.map((s: string) => s.trim()).filter(Boolean);

  // Find which exist
  const found = await prisma.landholding.findMany({
    where: { seqno_darro: { in: cleaned } },
    select: { seqno_darro: true, status: true, province_edited: true },
  });

  const foundSeqnos = found.map((r) => r.seqno_darro);
  const notFound = cleaned.filter((s) => !foundSeqnos.includes(s));

  // Province scoping
  const scopedProvince =
    sessionUser.office_level !== "regional" ? sessionUser.province ?? null : null;

  const outOfJurisdiction = scopedProvince
    ? found.filter((r) => r.province_edited !== scopedProvince).map((r) => r.seqno_darro)
    : [];
  const toUpdate = scopedProvince
    ? found.filter((r) => r.province_edited === scopedProvince)
    : found;

  if (toUpdate.length === 0) {
    return NextResponse.json({ error: "None of the provided SEQNOs are within your jurisdiction." }, { status: 403 });
  }

  const toUpdateSeqnos = toUpdate.map((r) => r.seqno_darro);

  // Update and log
  await prisma.$transaction(async (tx) => {
    await tx.landholding.updateMany({
      where: { seqno_darro: { in: toUpdateSeqnos } },
      data: { status, updated_at: new Date() },
    });

    await tx.auditLog.createMany({
      data: toUpdate.map((r) => ({
        seqno_darro: r.seqno_darro,
        action: "STATUS_UPDATE",
        field_changed: "status",
        old_value: r.status ?? "For Initial Validation",
        new_value: status,
        changed_by: "System",
      })),
    });
  });

  return NextResponse.json({ updated: toUpdateSeqnos.length, skipped: notFound, outOfJurisdiction });
}

// Preview endpoint — validate without saving
export async function PUT(req: NextRequest) {
  const sessionUser = await requireEditor(req);
  if (!sessionUser || !EDITOR_ROLES.includes(sessionUser.role))
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const body = await req.json();
  const { seqnos } = body;

  if (!Array.isArray(seqnos) || seqnos.length === 0) {
    return NextResponse.json({ records: [], notFound: [] });
  }

  const cleaned = seqnos.map((s: string) => s.trim()).filter(Boolean);

  const found = await prisma.landholding.findMany({
    where: { seqno_darro: { in: cleaned } },
    select: {
      seqno_darro: true,
      landowner: true,
      province_edited: true,
      clno: true,
      status: true,
      data_flags: true,
    },
  });

  const foundSeqnos = found.map((r) => r.seqno_darro);
  const notFound = cleaned.filter((s) => !foundSeqnos.includes(s));

  // Province scoping
  const scopedProvince =
    sessionUser.office_level !== "regional" ? sessionUser.province ?? null : null;

  const outOfJurisdiction = scopedProvince
    ? found.filter((r) => r.province_edited !== scopedProvince).map((r) => r.seqno_darro)
    : [];
  const records = scopedProvince
    ? found.filter((r) => r.province_edited === scopedProvince)
    : found;

  return NextResponse.json({ records, notFound, outOfJurisdiction });
}
