import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";
import { computeAndUpdateStatus } from "@/lib/computeStatus";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionUser = token ? await verifySessionToken(token) : null;
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = parseInt(searchParams.get("limit") ?? "50");
  const search = searchParams.get("search") ?? "";
  const province = searchParams.get("province") ?? "";
  const municipality = searchParams.get("municipality") ?? "";
  const source = searchParams.get("source") ?? "";
  const flag = searchParams.get("flag") ?? "";
  const status = searchParams.get("status") ?? "";

  // Office-level scoping: provincial/municipal users only see their province
  const scopedProvince =
    sessionUser.office_level === "regional"
      ? province
      : sessionUser.province ?? province;

  // Municipal-level users are locked to their municipality
  const scopedMunicipality =
    sessionUser.office_level === "municipal"
      ? sessionUser.municipality ?? municipality
      : municipality;

  const where: Prisma.LandholdingWhereInput = {
    AND: [
      search
        ? {
            OR: [
              { seqno_darro: { contains: search } },
              { clno: { contains: search } },
              { landowner: { contains: search } },
              { claim_no: { contains: search } },
            ],
          }
        : {},
      scopedProvince ? { province_edited: scopedProvince } : {},
      scopedMunicipality ? { municipality: { contains: scopedMunicipality } } : {},
      source ? { source } : {},
      flag === "none"
        ? {
            AND: [
              { OR: [{ amendarea_validated: { gt: 0 } }, { AND: [{ amendarea_validated: null }, { amendarea: { gt: 0 } }] }] },
              { OR: [{ condoned_amount: { gt: 0 } }, { AND: [{ condoned_amount: null }, { net_of_reval_no_neg: { gt: 0 } }] }] },
            ],
          }
        : flag === "zero_amendarea"
        ? {
            OR: [
              { amendarea_validated: { lte: 0 } },
              { AND: [{ amendarea_validated: null }, { amendarea: { lte: 0 } }] },
              { AND: [{ amendarea_validated: null }, { amendarea: null }] },
            ],
          }
        : flag === "zero_condoned"
        ? {
            OR: [
              { condoned_amount: { lte: 0 } },
              { AND: [{ condoned_amount: null }, { net_of_reval_no_neg: { lte: 0 } }] },
            ],
          }
        : flag === "cross_province"
        ? { cross_province: { not: null } }
        : flag
        ? {
            data_flags: { contains: flag },
            NOT: { condoned_amount: { gt: 0 } },
          }
        : {},
      status ? { status } : {},
    ],
  };

  const [rawRecords, total] = await Promise.all([
    prisma.landholding.findMany({
      where,
      select: {
        id: true,
        seqno_darro: true,
        clno: true,
        claim_no: true,
        landowner: true,
        province_edited: true,
        claimclass: true,
        amendarea: true,
        amendarea_validated: true,
        net_of_reval_no_neg: true,
        source: true,
        duplicate_clno: true,
        cross_province: true,
        data_flags: true,
        status: true,
        condoned_amount: true,
        dar_match_status: true,
        amendarea_validated_confirmed: true,
        condoned_amount_confirmed: true,
      },
      orderBy: { seqno_darro: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.landholding.count({ where }),
  ]);

  // Compute arb_area_mismatch for rows where both confirmations are set
  const confirmedSeqnos = rawRecords
    .filter((r) => r.amendarea_validated_confirmed && r.condoned_amount_confirmed)
    .map((r) => r.seqno_darro);

  const arbTotals: Record<string, number> = {};
  if (confirmedSeqnos.length > 0) {
    const arbRows = await prisma.arb.findMany({
      where: { seqno_darro: { in: confirmedSeqnos } },
      select: { seqno_darro: true, area_allocated: true },
    });
    for (const a of arbRows) {
      if (!a.area_allocated) continue;
      const s = String(a.area_allocated);
      if (s.endsWith("*")) continue;
      const n = parseFloat(s);
      if (!isNaN(n)) arbTotals[a.seqno_darro] = (arbTotals[a.seqno_darro] ?? 0) + n;
    }
  }

  const records = rawRecords.map((r) => {
    const bothConfirmed = r.amendarea_validated_confirmed && r.condoned_amount_confirmed;
    let arb_area_mismatch = false;
    let arb_total_area: number | null = null;
    if (bothConfirmed) {
      const validatedArea = r.amendarea_validated ?? r.amendarea ?? 0;
      const arbTotal = arbTotals[r.seqno_darro] ?? 0;
      arb_total_area = arbTotal;
      arb_area_mismatch = parseFloat(arbTotal.toFixed(4)) !== parseFloat(validatedArea.toFixed(4));
    }
    const { amendarea_validated_confirmed, condoned_amount_confirmed, ...rest } = r;
    return { ...rest, arb_area_mismatch, arb_total_area };
  });

  // Recompute statuses for the current page in the background so the list
  // stays fresh without requiring a manual Save Changes on each record.
  Promise.all(rawRecords.map((r) => computeAndUpdateStatus(r.seqno_darro))).catch(() => {});

  return NextResponse.json({ records, total, page, limit });
}
