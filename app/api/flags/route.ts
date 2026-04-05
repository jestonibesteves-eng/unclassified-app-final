import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionUser = token ? await verifySessionToken(token) : null;
  if (!sessionUser || !["super_admin", "admin"].includes(sessionUser.role))
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const { searchParams } = req.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = parseInt(searchParams.get("limit") ?? "50");
  const search = searchParams.get("search") ?? "";
  const flag = searchParams.get("flag") ?? "";
  const province = searchParams.get("province") ?? "";

  const scopedProvince =
    sessionUser.office_level === "regional"
      ? province
      : sessionUser.province ?? province;

  const where: Prisma.LandholdingWhereInput = {
    AND: [
      { data_flags: { not: null } },
      search
        ? {
            OR: [
              { seqno_darro: { contains: search } },
              { clno: { contains: search } },
              { landowner: { contains: search } },
            ],
          }
        : {},
      flag ? { data_flags: { contains: flag } } : {},
      scopedProvince ? { province_edited: scopedProvince } : {},
    ],
  };

  const [records, total] = await Promise.all([
    prisma.landholding.findMany({
      where,
      select: {
        seqno_darro: true,
        clno: true,
        landowner: true,
        province_edited: true,
        claimclass: true,
        osarea: true,
        net_of_reval: true,
        data_flags: true,
        status: true,
        source: true,
        duplicate_clno: true,
        cross_province: true,
      },
      orderBy: { seqno_darro: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.landholding.count({ where }),
  ]);

  return NextResponse.json({ records, total, page, limit });
}
