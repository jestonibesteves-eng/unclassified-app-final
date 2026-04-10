import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";
import { computeAndUpdateStatus } from "@/lib/computeStatus";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionUser = token ? await verifySessionToken(token) : null;
  if (!sessionUser || sessionUser.role !== "super_admin")
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  // Get all seqnos that have at least one ARB
  const seqnos = await prisma.arb.findMany({
    distinct: ["seqno_darro"],
    select: { seqno_darro: true },
  });

  let updated = 0;
  for (const { seqno_darro } of seqnos) {
    await computeAndUpdateStatus(seqno_darro);
    updated++;
  }

  return NextResponse.json({ recomputed: updated });
}
