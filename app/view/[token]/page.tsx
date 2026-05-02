import { Suspense } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getStats } from "@/lib/dashboard-stats";
import {
  ProvinceBarChart,
  StatusWithAreaChart,
  NotEligibleReasonsChart,
  type CocromSourceRow,
} from "@/components/DashboardCharts";
import { CocromChartsRow } from "@/components/CocromChartsRow";
import DashboardAreaToggle from "@/components/DashboardAreaToggle";
import DashboardProvinceFilter from "@/components/DashboardProvinceFilter";
import { DashboardStatCards } from "@/components/DashboardClient";
import { StatusBreakdownButton } from "@/components/StatusBreakdownButton";
import DashboardProgress from "@/components/DashboardProgress";
import DeadlineCountdown from "@/components/DeadlineCountdown";

const TOKEN_KEY = "public_dashboard_token";

async function validateToken(candidate: string): Promise<boolean> {
  const setting = await prisma.setting.findUnique({ where: { key: TOKEN_KEY } });
  return !!setting && setting.value === candidate;
}

export default async function PublicDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { token } = await params;
  const valid = await validateToken(token);
  if (!valid) notFound();

  const sp = await searchParams;
  const areaMode = sp.area === "original" ? "original" : "validated";
  const useValidated = areaMode === "validated";

  const selectedProvinces = sp.provinces
    ? String(sp.provinces).split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  const provinceFilter: string | string[] | null =
    selectedProvinces.length > 0 ? selectedProvinces : null;

  const [regionTarget, allProvincesRaw, stats] = await Promise.all([
    prisma.commitmentTarget.findFirst({ where: { region: "V", province: null } }),
    prisma.landholding.groupBy({
      by: ["province_edited"],
      where: { province_edited: { not: null } },
      orderBy: { province_edited: "asc" },
    }),
    getStats(provinceFilter),
  ]);

  const targetDate  = regionTarget?.target_date ?? "2026-06-15";
  const allProvinces = allProvincesRaw.map((r) => r.province_edited as string);

  const {
    total,
    byProvince,
    byStatus,
    statusAreaMap,
    distinctCarpableARBCount,
    serviceCarpableARBCount,
    nonCarpableARBCount,
    totalOriginalArea,
    totalValidatedArea,
    validatedCount,
    validatedArea,
    validatedCondoned,
    notEligibleForEncodingCount,
    notEligibleForEncodingArea,
    notEligibleForEncodingCondoned,
    noIssuesCount,
    distinctLOCount,
    totalCondoned,
    cocromCount,
    eligibleArbCount,
    cocromForValidation,
    cocromForEncoding,
    cocromEncoded,
    cocromDistributed,
    eligibleDistinctCarpableARBCount,
    landholdingsWithArbs,
    cocromEncodingData,
    cocromDistributionData,
    cocromDistNotEligible,
    notEligibleByProvince,
    notEligibleByReason,
  } = stats;

  const shownArea = useValidated ? totalValidatedArea : totalOriginalArea;

  const provinceData = byProvince.map((p) => ({
    name: p.province_edited ?? "Unknown",
    value: p._count,
    area: p._sum.amendarea ?? 0,
  }));

  const statusData =
    byStatus.length > 0
      ? byStatus.map((s) => ({
          name: s.status ?? "For Initial Validation",
          value: s._count,
          area: statusAreaMap[s.status ?? "For Initial Validation"] ?? 0,
        }))
      : [{ name: "For Initial Validation", value: total, area: statusAreaMap["For Initial Validation"] ?? 0 }];

  const SOURCE_LH_STATUSES = [
    "For Encoding",
    "Partially Encoded",
    "Fully Encoded",
    "Partially Distributed",
  ] as const;
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

  const now = new Date().toLocaleString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Manila",
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-screen-2xl mx-auto px-6 py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            {/* Left: logo + title */}
            <div className="flex items-center gap-4 lg:shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/dar-logo.svg"
                alt="DAR Bicol Region"
                className="w-12 h-12 rounded-full flex-shrink-0"
                style={{ boxShadow: "0 0 0 1.5px rgba(212,175,55,0.3), 0 2px 8px rgba(0,0,0,0.15)" }}
              />
              <div>
                <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-emerald-600 leading-none mb-1">
                  DAR · Bicol Region
                </p>
                <h1 className="text-[20px] font-bold text-gray-900 leading-tight tracking-tight">
                  Unclassified ARRs
                </h1>
                <p className="text-[11px] text-gray-400">Data Management System — Public Dashboard</p>
              </div>
            </div>

            {/* Centre: deadline countdown — right on mobile, centred on desktop */}
            <div className="flex justify-end lg:flex-1 lg:mx-4 lg:justify-center">
              <DeadlineCountdown targetDate={targetDate} />
            </div>

            {/* Right: date + live + toggle — row on mobile, column on desktop */}
            <div className="flex items-center justify-between lg:flex-col lg:items-end gap-2 lg:shrink-0">
              <div className="lg:text-right">
                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
                  Region V · Reconciled List
                </p>
                <p className="text-[11px] text-gray-500 font-mono mt-0.5">As of {now}</p>
                <span className="inline-flex items-center gap-1.5 mt-1.5 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-semibold uppercase tracking-widest">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live
                </span>
              </div>
              <Suspense>
                <DashboardAreaToggle current={areaMode} />
              </Suspense>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-screen-2xl mx-auto px-6 py-6 space-y-6">
        {/* Province Filter */}
        <Suspense>
          <DashboardProvinceFilter provinces={allProvinces} selected={selectedProvinces} />
        </Suspense>

        {/* Stat Cards */}
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
          selectedProvinces={selectedProvinces}
          publicToken={token}
          hideExport
        />

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ChartCard title="Records per Province (Total Scope)">
            <ProvinceBarChart data={provinceData} />
          </ChartCard>
          <ChartCard title="Records by Status">
            <StatusWithAreaChart data={statusData} action={<StatusBreakdownButton publicToken={token} hideExport selectedProvinces={selectedProvinces} />} />
          </ChartCard>
        </div>

        {/* Charts Row 2 */}
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

        {/* Accomplishment Tracker */}
        <DashboardProgress selectedProvinces={selectedProvinces} publicToken={token} targetDate={targetDate} />

        {/* Not Eligible for Encoding */}
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

        <p className="text-center text-[10px] text-gray-300 pb-4">
          This is a read-only public summary. Data is live and updated in real time.
        </p>
      </div>
    </div>
  );
}

function ChartCard({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm">
      <div className="bg-green-900 px-4 py-2.5 flex items-center justify-between">
        <h3 className="text-[10px] font-semibold text-green-300 uppercase tracking-[0.13em]">{title}</h3>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
      <div className="p-4 bg-white">{children}</div>
    </div>
  );
}
