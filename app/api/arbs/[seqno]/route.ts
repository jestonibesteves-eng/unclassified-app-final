import { NextRequest, NextResponse } from "next/server";
import { prisma, rawDb } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";
import { computeAndUpdateStatus } from "@/lib/computeStatus";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ seqno: string }> }
) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionUser = token ? await verifySessionToken(token) : null;
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { seqno } = await params;
  const decoded = decodeURIComponent(seqno);

  const [landholding, arbs] = await Promise.all([
    prisma.landholding.findUnique({
      where: { seqno_darro: decoded },
      select: {
        seqno_darro: true, landowner: true, province_edited: true,
        clno: true, claimclass: true, osarea: true, amendarea: true, amendarea_validated: true,
        condoned_amount: true, net_of_reval_no_neg: true,
        net_of_reval: true, source: true, status: true, data_flags: true,
      },
    }),
    prisma.arb.findMany({
      where: { seqno_darro: decoded },
      orderBy: { id: "asc" },
    }),
  ]);

  if (!landholding) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (sessionUser.office_level !== "regional" && sessionUser.province &&
      landholding.province_edited !== sessionUser.province)
    return NextResponse.json({ error: "Outside your jurisdiction." }, { status: 403 });

  return NextResponse.json({ landholding, arbs });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ seqno: string }> }
) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionUser = token ? await verifySessionToken(token) : null;
  if (!sessionUser || !["super_admin", "admin", "editor"].includes(sessionUser.role))
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const { seqno } = await params;
  const decoded = decodeURIComponent(seqno);

  const landholding = await prisma.landholding.findUnique({
    where: { seqno_darro: decoded },
    select: { province_edited: true },
  });
  if (!landholding) return NextResponse.json({ error: "Not found." }, { status: 404 });

  if (sessionUser.office_level !== "regional" && sessionUser.province &&
      landholding.province_edited !== sessionUser.province)
    return NextResponse.json({ error: "Outside your jurisdiction." }, { status: 403 });

  const deleteResult = rawDb.prepare(`DELETE FROM "Arb" WHERE seqno_darro = ?`).run(decoded);
  const count = deleteResult.changes;
  rawDb.prepare(
    `INSERT INTO "AuditLog" (seqno_darro, action, field_changed, old_value, new_value, changed_by, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
  ).run(decoded, "ARB_DELETE_ALL", "arbs", `${count} ARB(s) deleted`, null, sessionUser.username);
  await computeAndUpdateStatus(decoded);

  return NextResponse.json({ deleted: count });
}
