# Public Dashboard Full View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `/view/[token]` from a partial dashboard to a fully interactive public view — province filter, area toggle, all stat cards, all charts — with the sidebar, export buttons, share button, issue strip, and accomplishment tracker explicitly hidden.

**Architecture:** (1) Extend `AppShell` to suppress the sidebar/shell for `/view/` routes. (2) Move `getStats()` from `app/page.tsx` to `lib/dashboard-stats.ts` so both dashboards share one source of truth. (3) Rewrite `app/view/[token]/page.tsx` to read `?provinces=` and `?area=` search params server-side, call the shared `getStats()`, and render the full component set.

**Tech Stack:** Next.js 15 App Router (React Server Components), Prisma + better-sqlite3, Tailwind CSS, Recharts (via existing DashboardCharts components)

---

## File Map

| Action | File | Change |
|--------|------|--------|
| Modify | `components/AppShell.tsx` | Suppress shell for `/view/*` routes |
| Create | `lib/dashboard-stats.ts` | Shared `getStats()` extracted from `app/page.tsx` |
| Modify | `app/page.tsx` | Remove local `getStats()`, import from lib |
| Modify | `app/view/[token]/page.tsx` | Full rewrite with all dashboard components |

---

## Task 1: Suppress AppShell for public view routes

**Files:**
- Modify: `components/AppShell.tsx`

`AppShell` currently hides the sidebar for exact-match paths (`/login`, `/change-password`). The public view lives at `/view/[token]` — a dynamic prefix — so we need a prefix-based check alongside the existing exact check.

- [ ] **Step 1: Update AppShell to skip shell for /view/ prefix**

Replace `components/AppShell.tsx` with:

```tsx
"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import MobileHeader from "@/components/MobileHeader";

const NO_SHELL_EXACT = ["/login", "/change-password"];
const NO_SHELL_PREFIX = ["/view/"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isNoShell =
    NO_SHELL_EXACT.some((p) => pathname === p) ||
    NO_SHELL_PREFIX.some((p) => pathname.startsWith(p));

  if (isNoShell) {
    return <>{children}</>;
  }

  return (
    <>
      <Sidebar />
      <div className="flex flex-1 min-h-dvh">
        <div className="hidden md:block w-64 flex-shrink-0" aria-hidden="true" />
        <main className="flex-1 min-w-0 min-h-dvh bg-gray-50 flex flex-col">
          <MobileHeader />
          <div className="flex-1 p-6">{children}</div>
        </main>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify login and change-password pages still work**

Navigate to `http://localhost:3000/login` — no sidebar should appear. Navigate to `http://localhost:3000/view/any-token` — no sidebar should appear (it will 404 on bad token, but no sidebar visible).

- [ ] **Step 3: Commit**

```bash
git add components/AppShell.tsx
git commit -m "feat: suppress app shell for /view/* public routes"
```

---

## Task 2: Extract getStats() to lib/dashboard-stats.ts

**Files:**
- Create: `lib/dashboard-stats.ts`
- Reference: `app/page.tsx` lines 24–524 (the full `getStats` function)

`getStats()` in `app/page.tsx` is a single async function (lines 24–524) that runs all Prisma queries, aggregates COCROM chart data, and returns fully processed stats. It imports `prisma` from `@/lib/db` and uses type annotations from `@/components/DashboardCharts`.

- [ ] **Step 1: Create lib/dashboard-stats.ts**

Create the file with this structure, copying the function body verbatim from `app/page.tsx` lines 25–523:

```ts
import { prisma } from "@/lib/db";
import type {
  CocromEncodingData,
  CocromDistributionRow,
  CocromDistNotEligible,
  NotEligibleReasonRow,
} from "@/components/DashboardCharts";

export async function getStats(provinceFilter: string | string[] | null) {
  // ── Copy the entire body of getStats() from app/page.tsx lines 25–523 here ──
  // The function body begins with:
  //   const scope = provinceFilter === null ? {} : ...
  // and ends with the return statement:
  //   return { total, byProvince, byStatus, statusAreaMap, ... };
}
```

The return type is inferred — do not add an explicit return type annotation.

The four types imported above (`CocromEncodingData`, `CocromDistributionRow`, `CocromDistNotEligible`, `NotEligibleReasonRow`) are used as inline type annotations inside the function body (e.g. `const cocromEncodingData: CocromEncodingData = { ... }`). The local `type SegAcc` alias and `parseAllocatedArea` helper stay inside the function — do not move them out.

- [ ] **Step 2: Check TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors. If there are import errors, verify the four type imports match the exported names in `components/DashboardCharts.tsx`.

- [ ] **Step 3: Commit**

```bash
git add lib/dashboard-stats.ts
git commit -m "feat: extract getStats to lib/dashboard-stats"
```

---

## Task 3: Update app/page.tsx to import from lib

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Replace the local getStats function with an import**

At the top of `app/page.tsx`, add this import (after the existing imports):

```ts
import { getStats } from "@/lib/dashboard-stats";
```

Then **delete** the entire `async function getStats(...)` block — lines 24–524. The `Dashboard` component below it should remain untouched.

- [ ] **Step 2: Verify TypeScript compiles and dev server works**

```bash
npx tsc --noEmit
```

Then open `http://localhost:3000` and confirm the private dashboard renders identically to before — same numbers, same charts, same filters.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "refactor: import getStats from lib/dashboard-stats in dashboard page"
```

---

## Task 4: Rewrite app/view/[token]/page.tsx

**Files:**
- Modify: `app/view/[token]/page.tsx`

This is a full replacement. The new page:
- Reads `?provinces=` and `?area=` search params server-side
- Validates the token (same as before)
- Fetches `allProvinces` for the filter UI
- Calls shared `getStats(provinceFilter)`
- Builds `provinceData`, `statusData`, `cocromSourceLandholdings`, `cocromDistSourceLandholdings` from the returned raw groupBy results
- Renders the full layout with `DashboardAreaToggle`, `DashboardProvinceFilter`, `DashboardStatCards`, Charts Row 1, Charts Row 2, Not Eligible chart
- **Does not render:** `IssueStrip`, `DashboardProgress`, export buttons, share button, sidebar (suppressed by Task 1)

- [ ] **Step 1: Replace app/view/[token]/page.tsx with the full implementation**

```tsx
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getStats } from "@/lib/dashboard-stats";
import {
  ProvinceBarChart,
  StatusWithAreaChart,
  CocromEncodingChart,
  CocromDistributionChart,
  NotEligibleReasonsChart,
  type CocromSourceRow,
} from "@/components/DashboardCharts";
import DashboardAreaToggle from "@/components/DashboardAreaToggle";
import DashboardProvinceFilter from "@/components/DashboardProvinceFilter";
import { DashboardStatCards } from "@/components/DashboardClient";

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

  const allProvinces = (
    await prisma.landholding.groupBy({
      by: ["province_edited"],
      where: { province_edited: { not: null } },
      orderBy: { province_edited: "asc" },
    })
  ).map((r) => r.province_edited as string);

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
  } = await getStats(provinceFilter);

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
        <div className="max-w-6xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
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
            <div className="flex flex-col items-end gap-2">
              <div className="text-right">
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
      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
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
        />

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ChartCard title="Records by Province">
            <ProvinceBarChart data={provinceData} />
          </ChartCard>
          <ChartCard title="Records by Status">
            <StatusWithAreaChart data={statusData} />
          </ChartCard>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ChartCard title={'Status of Encoding (landholding under "For Encoding" status and above only)'}>
            <CocromEncodingChart
              data={cocromEncodingData}
              sourceLandholdings={cocromSourceLandholdings}
            />
          </ChartCard>
          <ChartCard
            title={'Status of Distribution (Landholdings w/ Status "Partially and Fully Distributed" only)'}
          >
            <CocromDistributionChart
              data={cocromDistributionData}
              sourceLandholdings={cocromDistSourceLandholdings}
              notEligible={cocromDistNotEligible}
              totals={{
                cocrom: cocromCount,
                arbs: distinctCarpableARBCount,
                area: shownArea,
              }}
            />
          </ChartCard>
        </div>

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

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm">
      <div className="bg-green-900 px-4 py-2.5">
        <h3 className="text-[10px] font-semibold text-green-300 uppercase tracking-[0.13em]">{title}</h3>
      </div>
      <div className="p-4 bg-white">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Check TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors. Common issue to watch for: if `getStats()` doesn't return `byProvince` or `byStatus` with the expected Prisma groupBy shape, check that those fields are in the return statement of the extracted `lib/dashboard-stats.ts`.

- [ ] **Step 3: Verify the public dashboard in the browser**

1. Open `http://localhost:3000` as super_admin and click **Share** to get the public URL
2. Open the public URL in an incognito window (no session cookie)
3. Verify: no sidebar, no share button, no export buttons, no sign-out shown
4. Verify: province filter buttons are present and clicking one reloads with filtered numbers
5. Verify: Validated/Original Area toggle works
6. Verify: Charts Row 1 (Province + Status), Charts Row 2 (COCROM Encoding + Distribution), Not Eligible for Encoding chart all render correctly
7. Verify: IssueStrip and DashboardProgress/Accomplishment Tracker are absent

- [ ] **Step 4: Commit**

```bash
git add app/view/[token]/page.tsx
git commit -m "feat: public dashboard full view with province filter, area toggle, and all charts"
```
