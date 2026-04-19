// app/api/dashboard/status-table/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";
import { validatePublicToken } from "@/lib/public-token";

export const dynamic = "force-dynamic";

export type StatusTableCell = { count: number; area: number };
export type StatusTableRow = {
  status: string;
  byProvince: Record<string, StatusTableCell>;
  total: StatusTableCell;
};

const CANONICAL_ORDER = [
  "For Initial Validation",
  "For Further Validation",
  "For Encoding",
  "Partially Encoded",
  "Fully Encoded",
  "Partially Distributed",
  "Fully Distributed",
  "Not Eligible for Encoding",
];

export async function GET(req: NextRequest) {
  const sessionToken = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionUser = sessionToken ? await verifySessionToken(sessionToken) : null;
  const { searchParams } = req.nextUrl;
  const publicToken = searchParams.get("token");

  if (!sessionUser) {
    if (!publicToken || !(await validatePublicToken(publicToken))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const provincesParam = searchParams.get("provinces");
    const provinceList = provincesParam
      ? provincesParam.split(",").map((s) => s.trim()).filter(Boolean)
      : null;

    const scope =
      provinceList && provinceList.length > 0
        ? { province_edited: { in: provinceList } }
        : { province_edited: { not: null } };

    // JS-side aggregation is required — Prisma groupBy cannot express
    // COALESCE(amendarea_validated, amendarea) in a _sum.
    const lhs = await prisma.landholding.findMany({
      where: scope,
      select: {
        province_edited: true,
        status: true,
        amendarea_validated: true,
        amendarea: true,
      },
    });

    // Accumulate per (status, province)
    const statusMap = new Map<string, Map<string, StatusTableCell>>();
    const provinceSet = new Set<string>();

    for (const lh of lhs) {
      const province = lh.province_edited!;
      const status = lh.status ?? "For Initial Validation";
      const area = Number(lh.amendarea_validated ?? lh.amendarea ?? 0);

      provinceSet.add(province);
      if (!statusMap.has(status)) statusMap.set(status, new Map());
      const provMap = statusMap.get(status)!;
      const prev = provMap.get(province) ?? { count: 0, area: 0 };
      provMap.set(province, { count: prev.count + 1, area: prev.area + area });
    }

    const provinces = Array.from(provinceSet).sort();

    const orderedStatuses = [
      ...CANONICAL_ORDER.filter((s) => statusMap.has(s)),
      ...Array.from(statusMap.keys()).filter((s) => !CANONICAL_ORDER.includes(s)),
    ];

    const rows: StatusTableRow[] = orderedStatuses.map((status) => {
      const provMap = statusMap.get(status)!;
      const byProvince: Record<string, StatusTableCell> = {};
      let totalCount = 0;
      let totalArea = 0;
      for (const p of provinces) {
        const cell = provMap.get(p) ?? { count: 0, area: 0 };
        byProvince[p] = cell;
        totalCount += cell.count;
        totalArea += cell.area;
      }
      return { status, byProvince, total: { count: totalCount, area: totalArea } };
    });

    const grandTotal: StatusTableRow = {
      status: "GRAND TOTAL",
      byProvince: Object.fromEntries(
        provinces.map((p) => [
          p,
          rows.reduce(
            (acc, r) => ({
              count: acc.count + (r.byProvince[p]?.count ?? 0),
              area: acc.area + (r.byProvince[p]?.area ?? 0),
            }),
            { count: 0, area: 0 }
          ),
        ])
      ),
      total: rows.reduce(
        (acc, r) => ({ count: acc.count + r.total.count, area: acc.area + r.total.area }),
        { count: 0, area: 0 }
      ),
    };

    return NextResponse.json({ rows, grandTotal, provinces });
  } catch (err) {
    console.error("[/api/dashboard/status-table]", err);
    return NextResponse.json({ error: "Failed to load status data." }, { status: 500 });
  }
}
