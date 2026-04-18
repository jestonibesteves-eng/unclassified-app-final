import { prisma } from "@/lib/db";
import type {
  CocromEncodingData,
  CocromDistributionRow,
  CocromDistNotEligible,
  NotEligibleReasonRow,
} from "@/components/DashboardCharts";

export async function getStats(provinceFilter: string | string[] | null) {
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
    validatedRowResult,
    total,
    byProvince,
    byStatus,
    distinctCarpableARBGroups,
    serviceCarpableARBCount,
    nonCarpableARBCount,
    originalSum,
    validatedDirectSum,
    fallbackSum,
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
    eligibleDistinctCarpableARBGroups,
    landholdingsWithArbs,
    byStatusValidatedArea,
    byStatusFallbackArea,
    cocromChartArbsRaw,
    cocromDistChartArbsRaw,
    notEligibleRaw,
  ] = await Promise.all([
    // ── Validated-row: async Prisma (non-blocking) ─────────────────────────
    (async (): Promise<{ count: number; area: number; condoned: number; not_eligible_count: number; not_eligible_area: number; not_eligible_condoned: number }> => {
      const [notEligibleLHs, confirmedLHs] = await Promise.all([
        prisma.landholding.findMany({
          where: { ...scope, status: "Not Eligible for Encoding" },
          select: { seqno_darro: true, amendarea_validated: true, amendarea: true, condoned_amount: true, net_of_reval_no_neg: true },
        }),
        prisma.landholding.findMany({
          where: {
            ...scope,
            amendarea_validated_confirmed: true,
            condoned_amount_confirmed: true,
            amendarea_validated: { not: null },
            NOT: { status: "Not Eligible for Encoding" },
          },
          select: { seqno_darro: true, amendarea_validated: true, condoned_amount: true, net_of_reval_no_neg: true },
        }),
      ]);
      const arbTotals = new Map<string, number>();
      if (confirmedLHs.length > 0) {
        const arbRows = await prisma.arb.findMany({
          where: { seqno_darro: { in: confirmedLHs.map((l) => l.seqno_darro) } },
          select: { seqno_darro: true, area_allocated: true },
        });
        for (const a of arbRows) {
          if (!a.area_allocated) continue;
          const s = String(a.area_allocated).trim().replace(/,/g, "");
          if (s.endsWith("*")) continue;
          const n = parseFloat(s);
          if (!isNaN(n)) arbTotals.set(a.seqno_darro, (arbTotals.get(a.seqno_darro) ?? 0) + n);
        }
      }
      const matchingConfirmedLHs = confirmedLHs.filter((l) => {
        const arbTotal = arbTotals.get(l.seqno_darro) ?? 0;
        const validated = Number(l.amendarea_validated!);
        return parseFloat(arbTotal.toFixed(4)) === parseFloat(validated.toFixed(4));
      });
      let count = 0, area = 0, condoned = 0;
      let not_eligible_count = 0, not_eligible_area = 0, not_eligible_condoned = 0;
      for (const lh of notEligibleLHs) {
        count++;
        area += Number(lh.amendarea_validated ?? lh.amendarea ?? 0);
        condoned += Number(lh.condoned_amount ?? lh.net_of_reval_no_neg ?? 0);
        not_eligible_count++;
        not_eligible_area += Number(lh.amendarea_validated ?? lh.amendarea ?? 0);
        not_eligible_condoned += Number(lh.condoned_amount ?? lh.net_of_reval_no_neg ?? 0);
      }
      for (const lh of matchingConfirmedLHs) {
        count++;
        area += Number(lh.amendarea_validated ?? 0);
        condoned += Number(lh.condoned_amount ?? lh.net_of_reval_no_neg ?? 0);
      }
      return { count, area, condoned, not_eligible_count, not_eligible_area, not_eligible_condoned };
    })(),
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
    // Service count — total CARPable ARBs (excluding "Not Eligible for Encoding" LHs)
    prisma.arb.count({
      where: { ...arbWhere({ status: { not: "Not Eligible for Encoding" } }), carpable: "CARPABLE" },
    }),
    // Non-CARPable lots (excluding "Not Eligible for Encoding" LHs)
    prisma.arb.count({
      where: { ...arbWhere({ status: { not: "Not Eligible for Encoding" } }), carpable: "NON-CARPABLE" },
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
    // COCROMs — total ARB rows (excludes "Not Eligible for Encoding" LHs)
    prisma.arb.count({ where: { ...arbWhere({ status: { not: "Not Eligible for Encoding" } }) } }),
    // COCROMs — eligible ARBs (excludes "Not Eligible for Encoding" LHs)
    prisma.arb.count({ where: { ...arbWhere({ status: { not: "Not Eligible for Encoding" } }), eligibility: "Eligible" } }),
    // COCROM breakdown (eligible ARBs only; enc'd/distrib. use date fields)
    // For Validation: LH ∈ {For Initial Validation, For Further Validation}
    prisma.arb.count({
      where: {
        ...arbWhere({ status: { in: ["For Initial Validation", "For Further Validation"] } }),
        eligibility: "Eligible",
      },
    }),
    // For Encoding: LH=For Encoding  OR  Partially/Fully Encoded with DE=∅  OR  Partially Distributed with DE=∅ AND DD=∅
    prisma.arb.count({
      where: {
        eligibility: "Eligible",
        OR: [
          arbWhere({ status: "For Encoding" }),
          { ...arbWhere({ status: { in: ["Partially Encoded", "Fully Encoded"] } }), date_encoded: null },
          { ...arbWhere({ status: "Partially Distributed" }), date_encoded: null, date_distributed: null },
        ],
      },
    }),
    // Encoded: Partially/Fully Encoded with DE≠∅  OR  Partially/Fully Distributed with DE≠∅ AND DD=∅
    prisma.arb.count({
      where: {
        eligibility: "Eligible",
        OR: [
          { ...arbWhere({ status: { in: ["Partially Encoded", "Fully Encoded"] } }), date_encoded: { not: null } },
          { ...arbWhere({ status: { in: ["Partially Distributed", "Fully Distributed"] } }), date_encoded: { not: null }, date_distributed: null },
        ],
      },
    }),
    // Distributed: Partially/Fully Distributed with DD≠∅
    prisma.arb.count({
      where: {
        ...arbWhere({ status: { in: ["Partially Distributed", "Fully Distributed"] } }),
        eligibility: "Eligible",
        date_distributed: { not: null },
      },
    }),
    // Distinct eligible CARPable ARB names (for ARBs UPLOADED breakdown)
    prisma.arb.groupBy({
      by: ["arb_name"],
      where: { ...arbProvinceScope, carpable: "CARPABLE", eligibility: "Eligible", arb_name: { not: null } },
    }),
    // Landholdings that have at least one ARB record uploaded (any status, any eligibility)
    prisma.landholding.count({
      where: { ...scope, arbs: { some: {} } },
    }),
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
  const validatedCount = validatedRowResult.count;
  const validatedArea = validatedRowResult.area;
  const validatedCondoned = validatedRowResult.condoned;
  const notEligibleForEncodingCount = validatedRowResult.not_eligible_count;
  const notEligibleForEncodingArea = validatedRowResult.not_eligible_area;
  const notEligibleForEncodingCondoned = validatedRowResult.not_eligible_condoned;
  const distinctLOCount = distinctLOGroups.length;
  const distinctCarpableARBCount = distinctCarpableARBGroups.length;
  const eligibleDistinctCarpableARBCount = eligibleDistinctCarpableARBGroups.length;

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
    totalOriginalArea, totalValidatedArea, validatedCount, validatedArea, validatedCondoned,
    notEligibleForEncodingCount, notEligibleForEncodingArea, notEligibleForEncodingCondoned,
    noIssuesCount, zeroAmendareaCount, zeroCondonedCount, negativeCondonedCount, crossProvinceCount,
    distinctLOCount, totalCondoned, cocromCount, eligibleArbCount,
    cocromForValidation, cocromForEncoding, cocromEncoded, cocromDistributed,
    eligibleDistinctCarpableARBCount, landholdingsWithArbs,
    cocromEncodingData, cocromDistributionData, cocromDistNotEligible,
    notEligibleByProvince, notEligibleByReason,
  };
}
