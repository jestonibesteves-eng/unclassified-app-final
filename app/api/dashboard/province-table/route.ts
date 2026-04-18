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

    // ── Fetch all three sets in parallel ─────────────────────────────────────
    const [allLHs, notEligibleLHs, confirmedLHs] = await Promise.all([
      // All in-scope landholdings (for scope counts)
      prisma.landholding.findMany({
        where: scope,
        select: {
          province_edited: true,
          landowner: true,
          amendarea: true,
          net_of_reval_no_neg: true,
        },
      }),
      // Bucket 1: Not Eligible for Encoding → validated
      prisma.landholding.findMany({
        where: { ...scope, status: "Not Eligible for Encoding" },
        select: {
          province_edited: true,
          landowner: true,
          amendarea_validated: true,
          amendarea: true,
          condoned_amount: true,
          net_of_reval_no_neg: true,
        },
      }),
      // Bucket 2: Both confirmations set + validated area filled
      prisma.landholding.findMany({
        where: {
          ...scope,
          amendarea_validated_confirmed: true,
          condoned_amount_confirmed: true,
          amendarea_validated: { not: null },
          NOT: { status: "Not Eligible for Encoding" },
        },
        select: {
          seqno_darro: true,
          province_edited: true,
          landowner: true,
          amendarea_validated: true,
          condoned_amount: true,
          net_of_reval_no_neg: true,
        },
      }),
    ]);

    // ── ARB area matching for Bucket 2 ───────────────────────────────────────
    let matchingSeqnos = new Set<string>();
    if (confirmedLHs.length > 0) {
      const arbRows = await prisma.arb.findMany({
        where: { seqno_darro: { in: confirmedLHs.map((l) => l.seqno_darro) } },
        select: { seqno_darro: true, area_allocated: true },
      });
      const arbTotals = new Map<string, number>();
      for (const a of arbRows) {
        if (!a.area_allocated) continue;
        const s = String(a.area_allocated).trim().replace(/,/g, "");
        if (s.endsWith("*")) continue;
        const n = parseFloat(s);
        if (!isNaN(n)) arbTotals.set(a.seqno_darro, (arbTotals.get(a.seqno_darro) ?? 0) + n);
      }
      for (const lh of confirmedLHs) {
        const arbTotal = arbTotals.get(lh.seqno_darro) ?? 0;
        const validated = Number(lh.amendarea_validated!);
        if (parseFloat(arbTotal.toFixed(4)) === parseFloat(validated.toFixed(4))) {
          matchingSeqnos.add(lh.seqno_darro);
        }
      }
    }

    // ── Build per-province accumulators ──────────────────────────────────────
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

    function getAcc(prov: string): Acc {
      if (!provMap.has(prov)) {
        provMap.set(prov, {
          records_scope: 0, records_validated: 0,
          lo_scope: new Set(), lo_validated: new Set(),
          area_scope: 0, area_validated: 0,
          amount_scope: 0, amount_validated: 0,
        });
      }
      return provMap.get(prov)!;
    }

    // Scope pass — all landholdings
    for (const lh of allLHs) {
      const prov = lh.province_edited ?? "Unknown";
      const acc = getAcc(prov);
      acc.records_scope++;
      acc.area_scope += lh.amendarea ?? 0;
      acc.amount_scope += lh.net_of_reval_no_neg ?? 0;
      if (lh.landowner) { acc.lo_scope.add(lh.landowner); allLoScope.add(lh.landowner); }
    }

    // Validated pass — Bucket 1 (Not Eligible for Encoding)
    for (const lh of notEligibleLHs) {
      const prov = lh.province_edited ?? "Unknown";
      const acc = getAcc(prov);
      acc.records_validated++;
      acc.area_validated += Number(lh.amendarea_validated ?? lh.amendarea ?? 0);
      acc.amount_validated += Number(lh.condoned_amount ?? lh.net_of_reval_no_neg ?? 0);
      if (lh.landowner) { acc.lo_validated.add(lh.landowner); allLoValidated.add(lh.landowner); }
    }

    // Validated pass — Bucket 2 (confirmed + ARB area match)
    for (const lh of confirmedLHs) {
      if (!matchingSeqnos.has(lh.seqno_darro)) continue;
      const prov = lh.province_edited ?? "Unknown";
      const acc = getAcc(prov);
      acc.records_validated++;
      acc.area_validated += Number(lh.amendarea_validated ?? 0);
      acc.amount_validated += Number(lh.condoned_amount ?? lh.net_of_reval_no_neg ?? 0);
      if (lh.landowner) { acc.lo_validated.add(lh.landowner); allLoValidated.add(lh.landowner); }
    }

    // ── Build output rows ─────────────────────────────────────────────────────
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
        lo_scope: 0,
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
