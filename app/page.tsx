import { Suspense } from "react";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";
import {
  ProvinceBarChart,
  StatusWithAreaChart,
  NotEligibleReasonsChart,
  type CocromEncodingData,
  type CocromSourceRow,
  type CocromDistributionRow,
  type CocromDistNotEligible,
  type NotEligibleReasonRow,
} from "@/components/DashboardCharts";
import { CocromChartsRow } from "@/components/CocromChartsRow";
import DashboardAreaToggle from "@/components/DashboardAreaToggle";
import DashboardProvinceFilter from "@/components/DashboardProvinceFilter";
import DashboardExportButtons from "@/components/DashboardExportButtons";
import PublicDashboardShareButton from "@/components/PublicDashboardShareButton";
import { DashboardStatCards, IssueStrip } from "@/components/DashboardClient";
import DashboardProgress from "@/components/DashboardProgress";
import { getStats } from "@/lib/dashboard-stats";
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
    totalOriginalArea, totalValidatedArea, validatedCount, validatedArea, validatedCondoned,
    notEligibleForEncodingCount, notEligibleForEncodingArea, notEligibleForEncodingCondoned,
    noIssuesCount, zeroAmendareaCount, zeroCondonedCount, negativeCondonedCount, crossProvinceCount,
    distinctLOCount, totalCondoned, cocromCount, eligibleArbCount,
    cocromForValidation, cocromForEncoding, cocromEncoded, cocromDistributed,
    eligibleDistinctCarpableARBCount, landholdingsWithArbs,
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
    <div className="page-enter" id="dashboard-content">
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
            <span className="font-mono">As of {new Date().toLocaleString("en-PH", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Manila" })}</span>
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            {sessionUser?.role === "super_admin" && <PublicDashboardShareButton />}
            <Suspense>
              <DashboardAreaToggle current={areaMode} />
            </Suspense>
          </div>
          <DashboardExportButtons />
        </div>
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
        validatedCondoned={validatedCondoned}
        notEligibleForEncodingCount={notEligibleForEncodingCount}
        notEligibleForEncodingArea={notEligibleForEncodingArea}
        notEligibleForEncodingCondoned={notEligibleForEncodingCondoned}
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
        eligibleDistinctCarpableARBCount={eligibleDistinctCarpableARBCount}
        distinctCarpableARBCount={distinctCarpableARBCount}
        serviceCarpableARBCount={serviceCarpableARBCount}
        nonCarpableARBCount={nonCarpableARBCount}
        landholdingsWithArbs={landholdingsWithArbs}
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
        <ChartCard title="Records per Province (Total Scope)">
          <ProvinceBarChart data={provinceData} />
        </ChartCard>
        <ChartCard title="Records by Status">
          <StatusWithAreaChart data={statusData} />
        </ChartCard>
      </div>

      {/* ── Charts Row 2 ── */}
      <CocromChartsRow
        encodingData={cocromEncodingData}
        encodingSourceLandholdings={cocromSourceLandholdings}
        distributionData={cocromDistributionData}
        distributionSourceLandholdings={cocromDistSourceLandholdings}
        distributionNotEligible={cocromDistNotEligible}
        distributionTotals={{
          cocrom: cocromCount,
          arbs:   distinctCarpableARBCount,
          area:   shownArea,
          amount: totalCondoned,
        }}
      />

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
