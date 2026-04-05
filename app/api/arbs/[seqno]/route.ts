import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";

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
