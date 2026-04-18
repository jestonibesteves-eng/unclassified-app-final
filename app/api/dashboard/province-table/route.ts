import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";
import { validatePublicToken } from "@/app/api/admin/public-token/route";

export type ProvinceTableRow = {
  province: string;
  records_scope: number;
  records_validated: number;
  lo_scope: number;
  lo_validated: number;
  area_scope: number;
  area_validated: number;
  amount_scope: number;
  amount_validated: number;
};

export async function GET(req: NextRequest) {
  // Auth: valid session OR valid public token
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

  const lhs = await prisma.landholding.findMany({
    where: scope,
    select: {
      province_edited: true,
      landowner: true,
      amendarea: true,
      amendarea_validated: true,
      net_of_reval_no_neg: true,
      condoned_amount: true,
      status: true,
    },
  });

  type Acc = {
    records_scope: number;
    records_validated: number;
    lo_scope: Set<string>;
    lo_validated: Set<string>;
    area_scope: number;
    area_validated: number;
    amount_scope: number;
    amount_validated: number;
  };

  const provMap = new Map<string, Acc>();
  const allLoScope = new Set<string>();
  const allLoValidated = new Set<string>();

  for (const lh of lhs) {
    const prov = lh.province_edited ?? "Unknown";
    if (!provMap.has(prov)) {
      provMap.set(prov, {
        records_scope: 0,
        records_validated: 0,
        lo_scope: new Set(),
        lo_validated: new Set(),
        area_scope: 0,
        area_validated: 0,
        amount_scope: 0,
        amount_validated: 0,
      });
    }
    const acc = provMap.get(prov)!;
    const validated = lh.status != null && lh.status !== "For Initial Validation";

    acc.records_scope++;
    acc.area_scope += lh.amendarea ?? 0;
    acc.amount_scope += lh.net_of_reval_no_neg ?? 0;
    if (lh.landowner) { acc.lo_scope.add(lh.landowner); allLoScope.add(lh.landowner); }

    if (validated) {
      acc.records_validated++;
      acc.area_validated += lh.amendarea_validated ?? lh.amendarea ?? 0;
      acc.amount_validated += lh.condoned_amount ?? lh.net_of_reval_no_neg ?? 0;
      if (lh.landowner) { acc.lo_validated.add(lh.landowner); allLoValidated.add(lh.landowner); }
    }
  }

  const rows: ProvinceTableRow[] = Array.from(provMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([province, acc]) => ({
      province,
      records_scope: acc.records_scope,
      records_validated: acc.records_validated,
      lo_scope: acc.lo_scope.size,
      lo_validated: acc.lo_validated.size,
      area_scope: acc.area_scope,
      area_validated: acc.area_validated,
      amount_scope: acc.amount_scope,
      amount_validated: acc.amount_validated,
    }));

  const total: ProvinceTableRow = rows.reduce(
    (t, r) => ({
      province: "R-V TOTAL",
      records_scope: t.records_scope + r.records_scope,
      records_validated: t.records_validated + r.records_validated,
      lo_scope: 0, // computed below from global set
      lo_validated: 0,
      area_scope: t.area_scope + r.area_scope,
      area_validated: t.area_validated + r.area_validated,
      amount_scope: t.amount_scope + r.amount_scope,
      amount_validated: t.amount_validated + r.amount_validated,
    }),
    {
      province: "R-V TOTAL",
      records_scope: 0, records_validated: 0,
      lo_scope: 0, lo_validated: 0,
      area_scope: 0, area_validated: 0,
      amount_scope: 0, amount_validated: 0,
    }
  );
  total.lo_scope = allLoScope.size;
  total.lo_validated = allLoValidated.size;

  return NextResponse.json({ rows, total });
  } catch (err) {
    console.error("[/api/dashboard/province-table]", err);
    return NextResponse.json({ error: "Failed to load province data." }, { status: 500 });
  }
}
