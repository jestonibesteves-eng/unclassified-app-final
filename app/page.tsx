import { Suspense } from "react";
import { cookies } from "next/headers";
import { prisma, rawDb } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";
import {
  ProvinceBarChart,
  StatusWithAreaChart,
  CocromEncodingChart,
  CocromDistributionChart,
  NotEligibleReasonsChart,
  type CocromEncodingData,
  type CocromSourceRow,
  type CocromDistributionRow,
  type CocromDistNotEligible,
  type NotEligibleReasonRow,
} from "@/components/DashboardCharts";
import DashboardAreaToggle from "@/components/DashboardAreaToggle";
import DashboardProvinceFilter from "@/components/DashboardProvinceFilter";
import { DashboardStatCards, IssueStrip } from "@/components/DashboardClient";
import DashboardProgress from "@/components/DashboardProgress";

async function getStats(provinceFilter: string | string[] | null) {
  const scope =
    provinceFilter === null
      ? {}
      : Array.isArray(provinceFilter)
        ? { province_edited: { in: provinceFilter } }
        : { province_edited: provinceFilter };

  // Helper: builds ARB `where` clause with optional extra landholding filters
  const arbWhere = (extraLandholding?: Record<string, unknown>) => {
    const lhBase =
      provinceFilter === null
        ? {}
        : Array.isArray(provinceFilter)
          ? { province_edited: { in: provinceFilter } }
          : { province_edited: provinceFilter };
    const lhFull = extraLandholding ? { ...lhBase, ...extraLandholding } : lhBase;
    return Object.keys(lhFull).length > 0 ? { landholding: lhFull } : {};
  };
  // Kept for backward compat with existing spread usages below
  const arbProvinceScope = arbWhere();

  const [
    total,
    byProvince,
    byStatus,
    distinctCarpableARBGroups,
    serviceCarpableARBCount,
    nonCarpableARBCount,
    originalSum,
    validatedDirectSum,
    fallbackSum,
    validatedRow,
    noIssuesCount,
    zeroAmendareaCount,
    zeroCondonedCount,
    negativeCondonedCount,
    crossProvinceCount,
    distinctLOGroups,
    condonedDirectSum,
    condonedFallbackSum,
    cocromCount,
    eligibleArbCount,
    cocromForValidation,
    cocromForEncoding,
    cocromEncoded,
    cocromDistributed,
    byStatusValidatedArea,
    byStatusFallbackArea,
    cocromChartArbsRaw,
    cocromDistChartArbsRaw,
    notEligibleRaw,
  ] = await Promise.all([
    prisma.landholding.count({ where: scope }),
    prisma.landholding.groupBy({
      by: ["province_edited"],
      where: scope,
      _count: true,
      _sum: { amendarea: true },
      orderBy: { _count: { province_edited: "desc" } },
    }),
    prisma.landholding.groupBy({ by: ["status"], where: scope, _count: true }),
    // Distinct CARPable ARB names
    prisma.arb.groupBy({
      by: ["arb_name"],
      where: { ...arbProvinceScope, carpable: "CARPABLE", arb_name: { not: null } },
    }),
    // Service count — total CARPable ARBs
    prisma.arb.count({
      where: { ...arbProvinceScope, carpable: "CARPABLE" },
    }),
    // Non-CARPable lots
    prisma.arb.count({
      where: { ...arbProvinceScope, carpable: "NON-CARPABLE" },
    }),
    prisma.landholding.aggregate({ where: scope, _sum: { amendarea: true } }),
    prisma.landholding.aggregate({
      where: { ...scope, amendarea_validated: { not: null } },
      _sum: { amendarea_validated: true },
    }),
    prisma.landholding.aggregate({
      where: { ...scope, amendarea_validated: null },
      _sum: { amendarea: true },
    }),
    // A landholding is "validated" when both confirmations are set AND
    // the total ARB area matches the validated AMENDAREA (to 4 decimal places).
    Promise.resolve((() => {
      const provinceParams: string[] =
        provinceFilter === null ? [] :
        Array.isArray(provinceFilter) ? provinceFilter : [provinceFilter];
      const provinceClause =
        provinceParams.length === 0 ? "" :
        provinceParams.length === 1
          ? "AND l.province_edited = ?"
          : `AND l.province_edited IN (${provinceParams.map(() => "?").join(",")})`;
      const sql = `
        SELECT
          COUNT(*) AS count,
          COALESCE(SUM(COALESCE(l.amendarea_validated, l.amendarea)), 0) AS area
        FROM "Landholding" l
        WHERE (
          l.status = 'Not Eligible for Encoding'
          OR (
            l.amendarea_validated_confirmed = 1
            AND l.condoned_amount_confirmed = 1
            AND l.amendarea_validated IS NOT NULL
            AND ROUND(COALESCE(
              (SELECT SUM(CASE WHEN a.area_allocated IS NOT NULL AND a.area_allocated NOT LIKE '%*'
                               THEN CAST(a.area_allocated AS REAL) ELSE 0 END)
               FROM "Arb" a WHERE a.seqno_darro = l.seqno_darro), 0), 4)
              = ROUND(l.amendarea_validated, 4)
          )
        )
        ${provinceClause}
      `;
      return rawDb.prepare(sql).get(provinceParams) as { count: number; area: number };
    })()),
    prisma.landholding.count({
      where: {
        ...scope,
        AND: [
          {
            OR: [
              { amendarea_validated: { gt: 0 } },
              { AND: [{ amendarea_validated: null }, { amendarea: { gt: 0 } }] },
            ],
          },
          {
            OR: [
              { condoned_amount: { gt: 0 } },
              { AND: [{ condoned_amount: null }, { net_of_reval_no_neg: { gt: 0 } }] },
            ],
          },
        ],
      },
    }),
    prisma.landholding.count({
      where: {
        ...scope,
        OR: [
          { amendarea_validated: { lte: 0 } },
          { AND: [{ amendarea_validated: null }, { amendarea: { lte: 0 } }] },
          { AND: [{ amendarea_validated: null }, { amendarea: null } ] },
        ],
      },
    }),
    // Zero Condoned Amount (NET_OF_REVAL) — matches Records Browser zero_condoned, excluding negative-flagged
    // Must explicitly allow null data_flags, as NOT { contains } silently drops NULL rows in SQL
    prisma.landholding.count({
      where: {
        ...scope,
        AND: [
          {
            OR: [
              { condoned_amount: { lte: 0 } },
              { AND: [{ condoned_amount: null }, { net_of_reval_no_neg: { lte: 0 } }] },
            ],
          },
          {
            OR: [
              { data_flags: null },
              { data_flags: { not: { contains: "Negative NET OF REVAL" } } },
            ],
          },
        ],
      },
    }),
    // Negative Condoned Amount (NET_OF_REVAL) — matches Records Browser "Negative NET OF REVAL" filter exactly
    prisma.landholding.count({
      where: {
        ...scope,
        data_flags: { contains: "Negative NET OF REVAL" },
        OR: [
          { condoned_amount: null },
          { condoned_amount: { lte: 0 } },
        ],
      },
    }),
    // Cross Province Duplicates
    prisma.landholding.count({
      where: { ...scope, cross_province: { not: null } },
    }),
    // Distinct landowner count
    prisma.landholding.groupBy({
      by: ["landowner"],
      where: { ...scope, landowner: { not: null } },
    }),
    // Total validated condoned amount (direct)
    prisma.landholding.aggregate({
      where: { ...scope, condoned_amount: { not: null } },
      _sum: { condoned_amount: true },
    }),
    // Total condoned amount fallback (use net_of_reval_no_neg where condoned_amount is null)
    prisma.landholding.aggregate({
      where: { ...scope, condoned_amount: null },
      _sum: { net_of_reval_no_neg: true },
    }),
    // COCROMs — total ARB rows
    prisma.arb.count({
      where: { ...arbProvinceScope },
    }),
    // COCROMs — eligible ARBs
    prisma.arb.count({ where: { ...arbProvinceScope, eligibility: "Eligible" } }),
    // COCROM breakdown (eligible ARBs only; enc'd/distrib. use date fields)
    prisma.arb.count({ where: { ...arbWhere({ status: "For Further Validation" }), eligibility: "Eligible" } }),
    prisma.arb.count({ where: { ...arbWhere({ status: "For Encoding" }), eligibility: "Eligible" } }),
    prisma.arb.count({ where: { ...arbProvinceScope, eligibility: "Eligible", date_encoded: { not: null } } }),
    prisma.arb.count({ where: { ...arbProvinceScope, eligibility: "Eligible", date_distributed: { not: null } } }),
    // Area per status — validated (where amendarea_validated is set)
    prisma.landholding.groupBy({
      by: ["status"],
      where: { ...scope, amendarea_validated: { not: null } },
      _sum: { amendarea_validated: true },
    }),
    // Area per status — fallback (use amendarea where amendarea_validated is null)
    prisma.landholding.groupBy({
      by: ["status"],
      where: { ...scope, amendarea_validated: null },
      _sum: { amendarea: true },
    }),
    // COCROM encoding status chart — all ARBs in relevant landholding statuses
    prisma.arb.findMany({
      where: {
        date_distributed: null,
        landholding: {
          ...scope,
          status: { in: ["Partially Encoded", "Fully Encoded", "Partially Distributed", "For Encoding"] },
        },
      },
      select: {
        arb_name:       true,
        area_allocated: true,
        eligibility:    true,
        carpable:       true,
        date_encoded:   true,
        landholding:    { select: { status: true } },
      },
    }),
    // COCROM distribution chart — all ARBs from Partially/Fully Distributed landholdings
    prisma.arb.findMany({
      where: {
        landholding: {
          ...scope,
          status: { in: ["Partially Distributed", "Fully Distributed"] },
        },
      },
      select: {
        arb_name:         true,
        area_allocated:   true,
        eligibility:      true,
        carpable:         true,
        date_distributed: true,
        landholding:      { select: { province_edited: true } },
      },
    }),
    // Not Eligible for Encoding — by province and by reason
    prisma.landholding.findMany({
      where: { ...scope, status: "Not Eligible for Encoding" },
      select: {
        province_edited:       true,
        non_eligibility_reason: true,
        amendarea_validated:   true,
        amendarea:             true,
      },
    }),
  ]);

  // Build area-per-status map (hybrid: validated if available, else original)
  const statusAreaMap: Record<string, number> = {};
  for (const r of byStatusValidatedArea) {
    const key = r.status ?? "For Initial Validation";
    statusAreaMap[key] = (statusAreaMap[key] ?? 0) + (r._sum.amendarea_validated ?? 0);
  }
  for (const r of byStatusFallbackArea) {
    const key = r.status ?? "For Initial Validation";
    statusAreaMap[key] = (statusAreaMap[key] ?? 0) + (r._sum.amendarea ?? 0);
  }

  const totalOriginalArea = originalSum._sum.amendarea ?? 0;
  const totalValidatedArea =
    (validatedDirectSum._sum.amendarea_validated ?? 0) +
    (fallbackSum._sum.amendarea ?? 0);
  const validatedCount = validatedRow.count;
  const validatedArea = validatedRow.area;
  const distinctLOCount = distinctLOGroups.length;
  const distinctCarpableARBCount = distinctCarpableARBGroups.length;
  const totalCondoned =
    (condonedDirectSum._sum.condoned_amount ?? 0) +
    (condonedFallbackSum._sum.net_of_reval_no_neg ?? 0);

  // ── COCROM encoding chart aggregation ────────────────────────────────────
  const parseAllocatedArea = (s: string | null): number => {
    if (!s) return 0;
    const cleaned = s.trim().replace(/,/g, "");
    if (!/^\d+(\.\d+)?$/.test(cleaned)) return 0;
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  };

  type SegAcc = { count: number; arbs: Set<string>; area: number };
  const encAcc: Record<"encoded" | "forEncoding" | "arbNotEligible" | "nonArbNotEligible", SegAcc> = {
    encoded:           { count: 0, arbs: new Set(), area: 0 },
    forEncoding:       { count: 0, arbs: new Set(), area: 0 },
    arbNotEligible:    { count: 0, arbs: new Set(), area: 0 },
    nonArbNotEligible: { count: 0, arbs: new Set(), area: 0 },
  };

  for (const arb of cocromChartArbsRaw) {
    const lhStatus = arb.landholding.status;

    // "For Encoding" landholdings: only eligible+CARPable+unencoded ARBs are shown
    if (lhStatus === "For Encoding") {
      if (
        arb.carpable !== "CARPABLE" ||
        arb.eligibility !== "Eligible" ||
        arb.date_encoded !== null
      ) continue;
      encAcc.forEncoding.count++;
      if (arb.arb_name) encAcc.forEncoding.arbs.add(arb.arb_name);
      encAcc.forEncoding.area += parseAllocatedArea(arb.area_allocated);
      continue;
    }

    // Remaining statuses: Partially Encoded / Fully Encoded / Partially Distributed
    let seg: keyof typeof encAcc;
    if (arb.carpable !== "CARPABLE") {
      seg = "nonArbNotEligible";
    } else if (arb.eligibility !== "Eligible") {
      seg = "arbNotEligible";
    } else if (arb.date_encoded) {
      seg = "encoded";
    } else {
      seg = "forEncoding";
    }
    encAcc[seg].count++;
    if (arb.arb_name) encAcc[seg].arbs.add(arb.arb_name);
    encAcc[seg].area += parseAllocatedArea(arb.area_allocated);
  }

  const cocromEncodingData: CocromEncodingData = {
    encoded:           { count: encAcc.encoded.count,           arbs: encAcc.encoded.arbs.size,           area: encAcc.encoded.area           },
    forEncoding:       { count: encAcc.forEncoding.count,       arbs: encAcc.forEncoding.arbs.size,       area: encAcc.forEncoding.area       },
    arbNotEligible:    { count: encAcc.arbNotEligible.count,    arbs: encAcc.arbNotEligible.arbs.size,    area: encAcc.arbNotEligible.area    },
    nonArbNotEligible: { count: encAcc.nonArbNotEligible.count, arbs: encAcc.nonArbNotEligible.arbs.size, area: encAcc.nonArbNotEligible.area },
  };

  // ── COCROM distribution chart aggregation (per province + not-eligible summary) ────
  const distProvMap = new Map<string, { count: number; arbs: Set<string>; area: number }>();
  const distNotElig = {
    arbNotEligible:    { count: 0, arbs: new Set<string>(), area: 0 },
    nonArbNotEligible: { count: 0, arbs: new Set<string>(), area: 0 },
  };

  for (const arb of cocromDistChartArbsRaw) {
    const area = parseAllocatedArea(arb.area_allocated);

    // Distributed ARBs → per-province bar chart
    if (arb.date_distributed !== null) {
      const prov = arb.landholding.province_edited ?? "Unknown";
      if (!distProvMap.has(prov)) distProvMap.set(prov, { count: 0, arbs: new Set(), area: 0 });
      const acc = distProvMap.get(prov)!;
      acc.count++;
      if (arb.arb_name) acc.arbs.add(arb.arb_name);
      acc.area += area;
      continue;
    }

    // Not-distributed ARBs → classify into not-eligible buckets for sidenote
    if (arb.carpable !== "CARPABLE") {
      distNotElig.nonArbNotEligible.count++;
      if (arb.arb_name) distNotElig.nonArbNotEligible.arbs.add(arb.arb_name);
      distNotElig.nonArbNotEligible.area += area;
    } else if (arb.eligibility !== "Eligible") {
      distNotElig.arbNotEligible.count++;
      if (arb.arb_name) distNotElig.arbNotEligible.arbs.add(arb.arb_name);
      distNotElig.arbNotEligible.area += area;
    }
    // eligible + CARPable but not yet distributed → not included in sidenote
  }

  const cocromDistributionData: CocromDistributionRow[] = Array.from(distProvMap.entries())
    .map(([province, acc]) => ({
      province,
      count: acc.count,
      arbs:  acc.arbs.size,
      area:  acc.area,
    }))
    .sort((a, b) => b.count - a.count);

  const cocromDistNotEligible: CocromDistNotEligible = {
    arbNotEligible:    { count: distNotElig.arbNotEligible.count,    arbs: distNotElig.arbNotEligible.arbs.size,    area: distNotElig.arbNotEligible.area    },
    nonArbNotEligible: { count: distNotElig.nonArbNotEligible.count, arbs: distNotElig.nonArbNotEligible.arbs.size, area: distNotElig.nonArbNotEligible.area },
  };

  // ── Not Eligible for Encoding aggregation ────────────────────────────────
  const neProvMap    = new Map<string, { count: number; area: number }>();
  const neReasonMap  = new Map<string, { count: number; area: number }>();

  for (const lh of notEligibleRaw) {
    const area   = lh.amendarea_validated ?? lh.amendarea ?? 0;
    const prov   = lh.province_edited          ?? "Unknown";
    const reason = lh.non_eligibility_reason?.trim() || "Not specified";

    const p = neProvMap.get(prov) ?? { count: 0, area: 0 };
    p.count++; p.area += area;
    neProvMap.set(prov, p);

    const r = neReasonMap.get(reason) ?? { count: 0, area: 0 };
    r.count++; r.area += area;
    neReasonMap.set(reason, r);
  }

  const notEligibleByProvince = Array.from(neProvMap.entries())
    .map(([name, v]) => ({ name, value: v.count, area: v.area }))
    .sort((a, b) => b.value - a.value);

  const notEligibleByReason: NotEligibleReasonRow[] = Array.from(neReasonMap.entries())
    .map(([name, v]) => ({ name, count: v.count, area: v.area }))
    .sort((a, b) => b.count - a.count);

  return {
    total, byProvince, byStatus, statusAreaMap,
    distinctCarpableARBCount, serviceCarpableARBCount, nonCarpableARBCount,
    totalOriginalArea, totalValidatedArea, validatedCount, validatedArea,
    noIssuesCount, zeroAmendareaCount, zeroCondonedCount, negativeCondonedCount, crossProvinceCount,
    distinctLOCount, totalCondoned, cocromCount, eligibleArbCount,
    cocromForValidation, cocromForEncoding, cocromEncoded, cocromDistributed,
    cocromEncodingData, cocromDistributionData, cocromDistNotEligible,
    notEligibleByProvince, notEligibleByReason,
  };
}

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const areaMode = sp.area === "original" ? "original" : "validated";
  const useValidated = areaMode === "validated";

  // Resolve the current user's province scope
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const sessionUser = token ? await verifySessionToken(token) : null;
  const provinceScope =
    sessionUser && sessionUser.office_level !== "regional"
      ? sessionUser.province ?? null
      : null;

  // Regional users can filter by one or more provinces via ?provinces=
  const isRegional = !provinceScope;
  const selectedProvinces = isRegional && sp.provinces
    ? String(sp.provinces).split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  const provinceFilter: string | string[] | null =
    provinceScope
      ? provinceScope
      : selectedProvinces.length > 0 ? selectedProvinces : null;

  // Fetch all provinces for the filter UI (regional only)
  const allProvinces = isRegional
    ? (await prisma.landholding.groupBy({
        by: ["province_edited"],
        where: { province_edited: { not: null } },
        orderBy: { province_edited: "asc" },
      })).map((r) => r.province_edited as string)
    : [];

  const {
    total, byProvince, byStatus, statusAreaMap,
    distinctCarpableARBCount, serviceCarpableARBCount, nonCarpableARBCount,
    totalOriginalArea, totalValidatedArea, validatedCount, validatedArea,
    noIssuesCount, zeroAmendareaCount, zeroCondonedCount, negativeCondonedCount, crossProvinceCount,
    distinctLOCount, totalCondoned, cocromCount, eligibleArbCount,
    cocromForValidation, cocromForEncoding, cocromEncoded, cocromDistributed,
    cocromEncodingData, cocromDistributionData, cocromDistNotEligible,
    notEligibleByProvince, notEligibleByReason,
  } = await getStats(provinceFilter);

  const provinceData = byProvince.map((p) => ({
    name: p.province_edited ?? "Unknown",
    value: p._count,
    area: p._sum.amendarea ?? 0,
  }));

  const unprocessedCount = Math.max(
    0,
    total - noIssuesCount - zeroAmendareaCount - zeroCondonedCount - negativeCondonedCount,
  );

  const flagData = [
    { name: "No Issues",                               value: noIssuesCount },
    { name: "Zero Validated AMENDAREA",                value: zeroAmendareaCount },
    { name: "Zero Condoned Amount (NET_OF_REVAL)",     value: zeroCondonedCount },
    { name: "Negative Condoned Amount (NET_OF_REVAL)", value: negativeCondonedCount },
    { name: "Cross Province Duplicates",               value: crossProvinceCount },
    ...(unprocessedCount > 0 ? [{ name: "Unprocessed", value: unprocessedCount }] : []),
  ];

  const statusData =
    byStatus.length > 0
      ? byStatus.map((s) => ({
          name: s.status ?? "For Initial Validation",
          value: s._count,
          area: statusAreaMap[s.status ?? "For Initial Validation"] ?? 0,
        }))
      : [{ name: "For Initial Validation", value: total, area: statusAreaMap["For Initial Validation"] ?? 0 }];

  const shownArea = useValidated ? totalValidatedArea : totalOriginalArea;

  const SOURCE_LH_STATUSES = ["For Encoding", "Partially Encoded", "Fully Encoded", "Partially Distributed"] as const;
  const cocromSourceLandholdings: CocromSourceRow[] = SOURCE_LH_STATUSES.map((status) => ({
    status,
    count: byStatus.find((s) => s.status === status)?._count ?? 0,
    area: statusAreaMap[status] ?? 0,
  }));

  const DIST_SOURCE_STATUSES = ["Partially Distributed", "Fully Distributed"] as const;
  const cocromDistSourceLandholdings: CocromSourceRow[] = DIST_SOURCE_STATUSES.map((status) => ({
    status,
    count: byStatus.find((s) => s.status === status)?._count ?? 0,
    area: statusAreaMap[status] ?? 0,
  }));

  return (
    <div className="page-enter">
      {/* ── Header ── */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-semibold uppercase tracking-widest">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </span>
          </div>
          <h2 className="text-[1.6rem] font-bold text-gray-900 leading-tight">Dashboard</h2>
          <p className="text-[12px] text-gray-400 mt-0.5 tracking-wide">
            {provinceScope
              ? <><span className="font-semibold text-emerald-700">{provinceScope}</span> — Unclassified ARRs</>
              : selectedProvinces.length > 0
                ? <><span className="font-semibold text-emerald-700">{selectedProvinces.join(", ")}</span> — Unclassified ARRs</>
                : "Region V Unclassified ARRs — Reconciled List"
            }
            &nbsp;·&nbsp;
            <span className="font-mono">As of {new Date().toLocaleString("en-PH", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
          </p>
        </div>
        <Suspense>
          <DashboardAreaToggle current={areaMode} />
        </Suspense>
      </div>

      {/* ── Province filter (regional only) ── */}
      {isRegional && (
        <Suspense>
          <DashboardProvinceFilter provinces={allProvinces} selected={selectedProvinces} />
        </Suspense>
      )}

      {/* ── Animated Stat Cards ── */}
      <DashboardStatCards
        total={total}
        totalArea={shownArea}
        validatedCount={validatedCount}
        validatedArea={validatedArea}
        noIssuesCount={noIssuesCount}
        useValidated={useValidated}
        distinctLOCount={distinctLOCount}
        totalCondoned={totalCondoned}
        cocromCount={cocromCount}
        eligibleArbCount={eligibleArbCount}
        cocromForValidation={cocromForValidation}
        cocromForEncoding={cocromForEncoding}
        cocromEncoded={cocromEncoded}
        cocromDistributed={cocromDistributed}
        distinctCarpableARBCount={distinctCarpableARBCount}
        serviceCarpableARBCount={serviceCarpableARBCount}
        nonCarpableARBCount={nonCarpableARBCount}
      />

      {/* ── Issue Breakdown Strip ── */}
      <IssueStrip
        data={{
          noIssues: noIssuesCount,
          zeroAmendarea: zeroAmendareaCount,
          zeroCondoned: zeroCondonedCount,
          negativeCondoned: negativeCondonedCount,
          crossProvince: crossProvinceCount,
          unprocessed: unprocessedCount,
          total,
        }}
      />

      {/* ── Charts Row 1 ── */}
      <div className="grid grid-cols-1 gap-6 mb-6 lg:grid-cols-2">
        <ChartCard title="Records by Province">
          <ProvinceBarChart data={provinceData} />
        </ChartCard>
        <ChartCard title="Records by Status">
          <StatusWithAreaChart data={statusData} />
        </ChartCard>
      </div>

      {/* ── Charts Row 2 ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title={'Status of Encoding (landholding under "For Encoding" status and above only)'}>
          <CocromEncodingChart
            data={cocromEncodingData}
            sourceLandholdings={cocromSourceLandholdings}
          />
        </ChartCard>
        <ChartCard title={'Status of Distribution (Landholdings w/ Status "Partially and Fully Distributed" only)'}>
          <CocromDistributionChart
            data={cocromDistributionData}
            sourceLandholdings={cocromDistSourceLandholdings}
            notEligible={cocromDistNotEligible}
            totals={{
              cocrom: cocromCount,
              arbs:   distinctCarpableARBCount,
              area:   shownArea,
            }}
          />
        </ChartCard>
      </div>

      {/* ── COCROM Distribution Progress ── */}
      <DashboardProgress />

      {/* ── Not Eligible for Encoding (full-width) ── */}
      <div className="mt-6">
        <ChartCard title="Landholdings Not Eligible for Encoding">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div>
              <p className="text-[9px] uppercase tracking-[0.13em] font-semibold text-gray-400 mb-3">
                By Province
              </p>
              <ProvinceBarChart data={notEligibleByProvince} />
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-[0.13em] font-semibold text-gray-400 mb-3">
                By Non-Eligibility Reason
              </p>
              <NotEligibleReasonsChart data={notEligibleByReason} />
            </div>
          </div>
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card-bezel">
      <div className="card-bezel-inner">
        <div className="bg-green-900 px-4 py-2.5">
          <h3 className="text-[10px] font-semibold text-green-300 uppercase tracking-[0.13em]">
            {title}
          </h3>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
