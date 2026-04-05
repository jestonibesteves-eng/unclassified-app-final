import { Suspense } from "react";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";
import {
  ProvinceBarChart,
  FlagPieChart,
  StatusBarChart,
  SourcePieChart,
} from "@/components/DashboardCharts";
import DashboardAreaToggle from "@/components/DashboardAreaToggle";
import { DashboardStatCards, IssueStrip } from "@/components/DashboardClient";

async function getStats(provinceScope: string | null) {
  // Base filter applied to every query when user is scoped to a province
  const scope = provinceScope ? { province_edited: provinceScope } : {};

  const [
    total,
    byProvince,
    bySource,
    byStatus,
    arbCount,
    originalSum,
    validatedDirectSum,
    fallbackSum,
    validatedCount,
    noIssuesCount,
    zeroAmendareaCount,
    zeroCondonedCount,
    negativeCondonedCount,
    crossProvinceCount,
  ] = await Promise.all([
    prisma.landholding.count({ where: scope }),
    prisma.landholding.groupBy({
      by: ["province_edited"],
      where: scope,
      _count: true,
      orderBy: { _count: { province_edited: "desc" } },
    }),
    prisma.landholding.groupBy({ by: ["source"], where: scope, _count: true }),
    prisma.landholding.groupBy({ by: ["status"], where: scope, _count: true }),
    prisma.arb.count({
      where: provinceScope ? { landholding: { province_edited: provinceScope } } : {},
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
    prisma.landholding.count({ where: { ...scope, amendarea_validated: { not: null } } }),
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
  ]);

  const totalOriginalArea = originalSum._sum.amendarea ?? 0;
  const totalValidatedArea =
    (validatedDirectSum._sum.amendarea_validated ?? 0) +
    (fallbackSum._sum.amendarea ?? 0);

  return {
    total, byProvince, bySource, byStatus, arbCount,
    totalOriginalArea, totalValidatedArea, validatedCount,
    noIssuesCount, zeroAmendareaCount, zeroCondonedCount, negativeCondonedCount, crossProvinceCount,
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

  const {
    total, byProvince, bySource, byStatus, arbCount,
    totalOriginalArea, totalValidatedArea, validatedCount,
    noIssuesCount, zeroAmendareaCount, zeroCondonedCount, negativeCondonedCount, crossProvinceCount,
  } = await getStats(provinceScope);

  const provinceData = byProvince.map((p) => ({
    name: p.province_edited ?? "Unknown",
    value: p._count,
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

  const sourceData = bySource.map((s) => ({
    name: s.source ?? "Unknown",
    value: s._count,
  }));

  const statusData =
    byStatus.length > 0
      ? byStatus.map((s) => ({
          name: s.status ?? "For Initial Validation",
          value: s._count,
        }))
      : [{ name: "For Initial Validation", value: total }];

  const shownArea = useValidated ? totalValidatedArea : totalOriginalArea;

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

      {/* ── Animated Stat Cards ── */}
      <DashboardStatCards
        total={total}
        totalArea={shownArea}
        validatedCount={validatedCount}
        arbCount={arbCount}
        noIssuesCount={noIssuesCount}
        useValidated={useValidated}
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
        <ChartCard title="Records by Data Flag">
          <FlagPieChart data={flagData} />
        </ChartCard>
      </div>

      {/* ── Charts Row 2 ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Records by Source">
          <SourcePieChart data={sourceData} />
        </ChartCard>
        <ChartCard title="Records by Status">
          <StatusBarChart data={statusData} />
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
