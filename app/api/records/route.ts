import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";

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

  const [records, total] = await Promise.all([
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
      },
      orderBy: { seqno_darro: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.landholding.count({ where }),
  ]);

  return NextResponse.json({ records, total, page, limit });
}
