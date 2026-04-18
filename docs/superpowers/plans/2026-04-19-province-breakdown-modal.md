# Province Breakdown Table Modal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a table-icon button to the "Per Landholding Data" stat group that opens a modal with a per-province breakdown table (Records, LOs, Area, Amount Condoned — Scope vs Validated), data bars on validated columns, CSV export, and Export as Image.

**Architecture:** A new API route (`/api/dashboard/province-table`) queries all landholdlings and aggregates per province in JS. A new client component (`ProvinceBreakdownModal`) fetches lazily on first open and renders the table with inline data bars. The icon button and modal are wired into the existing `DashboardStatCards` in `DashboardClient.tsx`.

**Tech Stack:** Next.js 16 App Router, Prisma (better-sqlite3), React 19, Tailwind CSS, html2canvas (new dependency)

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `app/api/dashboard/province-table/route.ts` | Create | API: aggregate per-province stats, auth via session or public token |
| `components/ProvinceBreakdownModal.tsx` | Create | Client modal: table, data bars, CSV + image export |
| `components/DashboardClient.tsx` | Modify | Add icon button + modal to `DashboardStatCards` |
| `app/page.tsx` | Modify | Pass `selectedProvinces` to `DashboardStatCards` |
| `app/view/[token]/page.tsx` | Modify | Pass `selectedProvinces` and `publicToken` to `DashboardStatCards` |

---

## Task 1: Install html2canvas

**Files:**
- Modify: `package.json` (via npm install)

- [ ] **Step 1: Install the package**

```bash
cd "C:/Users/Jestoni Esteves/claude/unclassified-app"
npm install html2canvas
npm install --save-dev @types/html2canvas
```

Expected: `added N packages` with no errors.

- [ ] **Step 2: Verify the types resolve**

```bash
npx tsc --noEmit 2>&1 | grep html2canvas || echo "No html2canvas type errors"
```

Expected: `No html2canvas type errors`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install html2canvas for province breakdown image export"
```

---

## Task 2: Create API Route `/api/dashboard/province-table`

**Files:**
- Create: `app/api/dashboard/province-table/route.ts`

This route accepts `?provinces=A,B` (optional filter) and `?token=` (for public dashboard access). It queries all matching landholdlings and aggregates per province in JS, returning rows sorted alphabetically plus a total row.

Auth: requires either a valid session cookie (`dar_session`) OR a valid public dashboard token passed as `?token=`.

**Definition of "validated":** `status` is not null AND `status !== "For Initial Validation"`.

- [ ] **Step 1: Create the route file**

```ts
// app/api/dashboard/province-table/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";

const TOKEN_KEY = "public_dashboard_token";

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
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;
  const sessionUser = sessionToken ? await verifySessionToken(sessionToken) : null;

  const { searchParams } = req.nextUrl;
  const publicToken = searchParams.get("token");

  if (!sessionUser) {
    if (!publicToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const setting = await prisma.setting.findUnique({ where: { key: TOKEN_KEY } });
    if (!setting || setting.value !== publicToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

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
      lo: true,
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
    if (lh.lo) { acc.lo_scope.add(lh.lo); allLoScope.add(lh.lo); }

    if (validated) {
      acc.records_validated++;
      acc.area_validated += lh.amendarea_validated ?? lh.amendarea ?? 0;
      acc.amount_validated += lh.condoned_amount ?? lh.net_of_reval_no_neg ?? 0;
      if (lh.lo) { acc.lo_validated.add(lh.lo); allLoValidated.add(lh.lo); }
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
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "C:/Users/Jestoni Esteves/claude/unclassified-app"
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors referencing `province-table/route.ts`.

- [ ] **Step 3: Smoke-test the route**

Start the dev server (`npm run dev`) if not already running, then open in browser or run:

```bash
curl "http://localhost:3000/api/dashboard/province-table" -H "Cookie: dar_session=<your-session-cookie>"
```

Expected: JSON with `{ rows: [...], total: { province: "R-V TOTAL", ... } }`.

- [ ] **Step 4: Commit**

```bash
git add app/api/dashboard/province-table/route.ts
git commit -m "feat: add /api/dashboard/province-table API route"
```

---

## Task 3: Create `ProvinceBreakdownModal` Component

**Files:**
- Create: `components/ProvinceBreakdownModal.tsx`

This is a `"use client"` modal that:
- Fetches `/api/dashboard/province-table` lazily on first open
- Renders a grouped-column table with data bars on Validated columns
- Exports CSV inline
- Exports as image using `html2canvas` (dynamic import)

- [ ] **Step 1: Create the component file**

```tsx
// components/ProvinceBreakdownModal.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import type { ProvinceTableRow } from "@/app/api/dashboard/province-table/route";

type Props = {
  open: boolean;
  onClose: () => void;
  selectedProvinces?: string[];
  publicToken?: string;
};

function pct(val: number, scope: number) {
  if (scope === 0) return 0;
  return Math.min(100, Math.round((val / scope) * 100));
}

function fmtArea(n: number) {
  return n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtAmount(n: number) {
  return "₱" + n.toLocaleString("en-PH", { maximumFractionDigits: 0 });
}

function DataBar({
  value,
  scope,
  color,
  bold,
}: {
  value: number;
  scope: number;
  color: string;
  bold?: boolean;
}) {
  const p = pct(value, scope);
  return (
    <td className="relative px-2 py-1.5" style={{ minWidth: 90 }}>
      <div
        className="absolute inset-0 rounded-sm"
        style={{ background: `linear-gradient(90deg, ${color} ${p}%, transparent ${p}%)` }}
      />
      <span className={`relative text-[10px] ${bold ? "font-bold" : "font-semibold"}`}>
        {bold ? value.toLocaleString() : value.toLocaleString()}
      </span>
      <span className="relative ml-1 text-[8px] text-gray-400">{p}%</span>
    </td>
  );
}

function DataBarArea({
  value,
  scope,
  color,
  bold,
}: {
  value: number;
  scope: number;
  color: string;
  bold?: boolean;
}) {
  const p = pct(value, scope);
  return (
    <td className="relative px-2 py-1.5" style={{ minWidth: 100 }}>
      <div
        className="absolute inset-0 rounded-sm"
        style={{ background: `linear-gradient(90deg, ${color} ${p}%, transparent ${p}%)` }}
      />
      <span className={`relative text-[10px] ${bold ? "font-bold" : "font-semibold"}`}>
        {fmtArea(value)}
      </span>
      <span className="relative ml-1 text-[8px] text-gray-400">{p}%</span>
    </td>
  );
}

function DataBarAmount({
  value,
  scope,
  color,
  bold,
}: {
  value: number;
  scope: number;
  color: string;
  bold?: boolean;
}) {
  const p = pct(value, scope);
  return (
    <td className="relative px-2 py-1.5" style={{ minWidth: 110 }}>
      <div
        className="absolute inset-0 rounded-sm"
        style={{ background: `linear-gradient(90deg, ${color} ${p}%, transparent ${p}%)` }}
      />
      <span className={`relative text-[10px] ${bold ? "font-bold" : "font-semibold"}`}>
        {fmtAmount(value)}
      </span>
      <span className="relative ml-1 text-[8px] text-gray-400">{p}%</span>
    </td>
  );
}

export function ProvinceBreakdownModal({ open, onClose, selectedProvinces, publicToken }: Props) {
  const [rows, setRows] = useState<ProvinceTableRow[]>([]);
  const [total, setTotal] = useState<ProvinceTableRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetched = useRef(false);
  const captureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || fetched.current) return;
    fetched.current = true;
    setLoading(true);
    const params = new URLSearchParams();
    if (selectedProvinces && selectedProvinces.length > 0) {
      params.set("provinces", selectedProvinces.join(","));
    }
    if (publicToken) params.set("token", publicToken);
    fetch(`/api/dashboard/province-table?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        setRows(data.rows ?? []);
        setTotal(data.total ?? null);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load province data.");
        setLoading(false);
      });
  }, [open, selectedProvinces, publicToken]);

  function exportCsv() {
    const header = [
      "Province",
      "Records Scope", "Records Validated", "Records %",
      "LOs Scope", "LOs Validated", "LOs %",
      "Area Scope", "Area Validated", "Area %",
      "Amount Scope", "Amount Validated", "Amount %",
    ].join(",");
    const dataRows = [...rows, ...(total ? [total] : [])].map((r) =>
      [
        `"${r.province}"`,
        r.records_scope, r.records_validated, pct(r.records_validated, r.records_scope),
        r.lo_scope, r.lo_validated, pct(r.lo_validated, r.lo_scope),
        r.area_scope.toFixed(2), r.area_validated.toFixed(2), pct(r.area_validated, r.area_scope),
        r.amount_scope.toFixed(2), r.amount_validated.toFixed(2), pct(r.amount_validated, r.amount_scope),
      ].join(",")
    );
    const csv = [header, ...dataRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `province-breakdown-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportImage() {
    if (!captureRef.current) return;
    const html2canvas = (await import("html2canvas")).default;
    const canvas = await html2canvas(captureRef.current, { scale: 2, useCORS: true });
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `province-breakdown-${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="max-w-5xl w-full rounded-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-green-900 px-5 py-3 flex items-center justify-between flex-shrink-0">
          <h2 className="text-[10px] font-bold text-green-300 uppercase tracking-[0.13em]">
            Province Breakdown — Per Landholding Data
          </h2>
          <button
            onClick={onClose}
            className="text-green-400 hover:text-green-200 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Table body */}
        <div className="flex-1 overflow-auto bg-white">
          {loading && (
            <div className="flex items-center justify-center py-16 text-sm text-gray-400">
              Loading…
            </div>
          )}
          {error && (
            <div className="flex items-center justify-center py-16 text-sm text-red-500">
              {error}
            </div>
          )}
          {!loading && !error && (
            <div ref={captureRef}>
              <table className="w-full border-collapse text-left" style={{ minWidth: 720 }}>
                <thead>
                  {/* Group header row */}
                  <tr className="bg-emerald-50">
                    <th
                      rowSpan={2}
                      className="px-3 py-2 text-[9px] font-semibold text-gray-600 border-b border-r-2 border-emerald-100 border-r-emerald-200 sticky left-0 bg-emerald-50 z-10"
                      style={{ minWidth: 120 }}
                    >
                      Province
                    </th>
                    <th colSpan={2} className="px-2 py-1.5 text-center text-[8px] font-bold text-emerald-700 uppercase tracking-[0.1em] border-b border-r-2 border-emerald-100 border-r-emerald-200">
                      No. of Records
                    </th>
                    <th colSpan={2} className="px-2 py-1.5 text-center text-[8px] font-bold text-violet-700 uppercase tracking-[0.1em] border-b border-r-2 border-emerald-100 border-r-emerald-200">
                      No. of LOs
                    </th>
                    <th colSpan={2} className="px-2 py-1.5 text-center text-[8px] font-bold text-blue-700 uppercase tracking-[0.1em] border-b border-r-2 border-emerald-100 border-r-emerald-200">
                      Area (has.)
                    </th>
                    <th colSpan={2} className="px-2 py-1.5 text-center text-[8px] font-bold text-teal-700 uppercase tracking-[0.1em] border-b border-emerald-100">
                      Amount Condoned
                    </th>
                  </tr>
                  {/* Sub-header row */}
                  <tr className="bg-emerald-50">
                    <th className="px-2 pb-1.5 text-[8px] font-normal text-gray-400 border-b-2 border-emerald-300">Scope</th>
                    <th className="px-2 pb-1.5 text-[8px] font-semibold text-emerald-700 border-b-2 border-emerald-300 border-r-2 border-r-emerald-200">Validated ▪</th>
                    <th className="px-2 pb-1.5 text-[8px] font-normal text-gray-400 border-b-2 border-violet-300">Scope</th>
                    <th className="px-2 pb-1.5 text-[8px] font-semibold text-violet-700 border-b-2 border-violet-300 border-r-2 border-r-emerald-200">Validated ▪</th>
                    <th className="px-2 pb-1.5 text-[8px] font-normal text-gray-400 border-b-2 border-blue-300">Scope</th>
                    <th className="px-2 pb-1.5 text-[8px] font-semibold text-blue-700 border-b-2 border-blue-300 border-r-2 border-r-emerald-200">Validated ▪</th>
                    <th className="px-2 pb-1.5 text-[8px] font-normal text-gray-400 border-b-2 border-teal-300">Scope</th>
                    <th className="px-2 pb-1.5 text-[8px] font-semibold text-teal-700 border-b-2 border-teal-300">Validated ▪</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr
                      key={r.province}
                      className={`border-b border-gray-100 ${i % 2 === 1 ? "bg-gray-50" : "bg-white"}`}
                    >
                      <td className={`px-3 py-1.5 text-[10px] font-semibold text-gray-800 border-r-2 border-emerald-100 sticky left-0 z-10 ${i % 2 === 1 ? "bg-gray-50" : "bg-white"}`}>
                        {r.province}
                      </td>
                      <td className="px-2 py-1.5 text-right text-[10px] text-gray-400">{r.records_scope.toLocaleString()}</td>
                      <DataBar value={r.records_validated} scope={r.records_scope} color="#d1fae5" />
                      <td className="px-2 py-1.5 text-right text-[10px] text-gray-400">{r.lo_scope.toLocaleString()}</td>
                      <DataBar value={r.lo_validated} scope={r.lo_scope} color="#ede9fe" />
                      <td className="px-2 py-1.5 text-right text-[10px] text-gray-400">{fmtArea(r.area_scope)}</td>
                      <DataBarArea value={r.area_validated} scope={r.area_scope} color="#dbeafe" />
                      <td className="px-2 py-1.5 text-right text-[10px] text-gray-400">{fmtAmount(r.amount_scope)}</td>
                      <DataBarAmount value={r.amount_validated} scope={r.amount_scope} color="#ccfbf1" />
                    </tr>
                  ))}
                  {/* TOTAL row */}
                  {total && (
                    <tr className="bg-emerald-50 border-t-2 border-emerald-300">
                      <td className="px-3 py-2 text-[10px] font-bold text-emerald-800 uppercase tracking-wide border-r-2 border-emerald-200 sticky left-0 bg-emerald-50 z-10">
                        R-V TOTAL
                      </td>
                      <td className="px-2 py-2 text-right text-[10px] font-semibold text-gray-600">{total.records_scope.toLocaleString()}</td>
                      <DataBar value={total.records_validated} scope={total.records_scope} color="#a7f3d0" bold />
                      <td className="px-2 py-2 text-right text-[10px] font-semibold text-gray-600">{total.lo_scope.toLocaleString()}</td>
                      <DataBar value={total.lo_validated} scope={total.lo_scope} color="#ddd6fe" bold />
                      <td className="px-2 py-2 text-right text-[10px] font-semibold text-gray-600">{fmtArea(total.area_scope)}</td>
                      <DataBarArea value={total.area_validated} scope={total.area_scope} color="#bfdbfe" bold />
                      <td className="px-2 py-2 text-right text-[10px] font-semibold text-gray-600">{fmtAmount(total.amount_scope)}</td>
                      <DataBarAmount value={total.amount_validated} scope={total.amount_scope} color="#99f6e4" bold />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 bg-emerald-50 border-t border-emerald-100 px-5 py-2.5 flex items-center justify-between">
          <span className="text-[9px] text-gray-400">▪ Data bars show % of scope validated</span>
          <div className="flex gap-2">
            <button
              onClick={exportCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gray-300 bg-white text-[9px] font-semibold text-gray-600 hover:bg-gray-50 tracking-wide"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/>
              </svg>
              Export CSV
            </button>
            <button
              onClick={exportImage}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-green-900 text-[9px] font-bold text-green-300 hover:bg-green-800 tracking-wide"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
              </svg>
              Export as Image
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "C:/Users/Jestoni Esteves/claude/unclassified-app"
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/ProvinceBreakdownModal.tsx
git commit -m "feat: add ProvinceBreakdownModal component with data bars and export"
```

---

## Task 4: Wire Icon Button into `DashboardStatCards`

**Files:**
- Modify: `components/DashboardClient.tsx` — add `selectedProvinces?`, `publicToken?` props; add modal state + icon button to Per Landholding Data header; render modal
- Modify: `app/page.tsx` — pass `selectedProvinces` prop
- Modify: `app/view/[token]/page.tsx` — pass `selectedProvinces` and `publicToken` props

### 4a — Update `DashboardStatCards`

- [ ] **Step 1: Add import at the top of `components/DashboardClient.tsx`**

Find the existing imports at the top of the file (line ~1) and add:

```ts
import { ProvinceBreakdownModal } from "@/components/ProvinceBreakdownModal";
```

- [ ] **Step 2: Add new props to `DashboardStatCards`**

The current function signature starts at line ~195. Add two optional props to both the destructure and the type:

```ts
export function DashboardStatCards({
  total, totalArea, validatedCount, validatedArea, validatedCondoned,
  notEligibleForEncodingCount, notEligibleForEncodingArea, notEligibleForEncodingCondoned,
  distinctCarpableARBCount, serviceCarpableARBCount, nonCarpableARBCount,
  noIssuesCount, useValidated, distinctLOCount, totalCondoned,
  cocromCount, eligibleArbCount, cocromForValidation, cocromForEncoding, cocromEncoded, cocromDistributed,
  eligibleDistinctCarpableARBCount, landholdingsWithArbs,
  selectedProvinces,
  publicToken,
}: {
  total: number;
  totalArea: number;
  validatedCount: number;
  validatedArea: number;
  validatedCondoned: number;
  notEligibleForEncodingCount: number;
  notEligibleForEncodingArea: number;
  notEligibleForEncodingCondoned: number;
  distinctCarpableARBCount: number;
  serviceCarpableARBCount: number;
  nonCarpableARBCount: number;
  noIssuesCount: number;
  useValidated: boolean;
  distinctLOCount: number;
  totalCondoned: number;
  cocromCount: number;
  eligibleArbCount: number;
  cocromForValidation: number;
  cocromForEncoding: number;
  cocromEncoded: number;
  cocromDistributed: number;
  eligibleDistinctCarpableARBCount: number;
  landholdingsWithArbs: number;
  selectedProvinces?: string[];
  publicToken?: string;
}) {
```

- [ ] **Step 3: Add modal state inside the function body**

Immediately after the opening `{` of the function body (before the `return`), add:

```ts
  const [tableOpen, setTableOpen] = useState(false);
```

- [ ] **Step 4: Replace the Per Landholding Data header and add modal render**

Find this line inside the return JSX (around line ~231):

```tsx
        <p className="text-[10px] uppercase tracking-[0.13em] font-semibold text-emerald-700 mb-2">Per Landholding Data</p>
```

Replace it with:

```tsx
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] uppercase tracking-[0.13em] font-semibold text-emerald-700">Per Landholding Data</p>
          <button
            onClick={() => setTableOpen(true)}
            title="View as province breakdown table"
            className="w-7 h-7 flex items-center justify-center rounded-md bg-white border border-emerald-200 shadow-sm hover:bg-emerald-50 transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <line x1="3" y1="9" x2="21" y2="9"/>
              <line x1="3" y1="15" x2="21" y2="15"/>
              <line x1="9" y1="3" x2="9" y2="21"/>
              <line x1="15" y1="3" x2="15" y2="21"/>
            </svg>
          </button>
        </div>
        <ProvinceBreakdownModal
          open={tableOpen}
          onClose={() => setTableOpen(false)}
          selectedProvinces={selectedProvinces}
          publicToken={publicToken}
        />
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

### 4b — Update `app/page.tsx`

- [ ] **Step 6: Pass `selectedProvinces` to `DashboardStatCards` in `app/page.tsx`**

Find the `<DashboardStatCards` JSX in `app/page.tsx` (around line ~161). Add the `selectedProvinces` prop:

```tsx
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
      />
```

### 4c — Update `app/view/[token]/page.tsx`

- [ ] **Step 7: Pass `selectedProvinces` and `publicToken` to `DashboardStatCards` in `app/view/[token]/page.tsx`**

Find the `<DashboardStatCards` JSX in `app/view/[token]/page.tsx` (around line ~184). Add both props:

```tsx
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
      />
```

- [ ] **Step 8: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 9: Manual smoke test**

1. Open `http://localhost:3000` (logged in).
2. Click the table-grid icon in the top-right of "Per Landholding Data".
3. Modal opens, loading spinner briefly, then table with province rows appears.
4. Validated columns show colored data bars with % badge.
5. R-V TOTAL row appears at the bottom with slightly darker bars.
6. Click "Export CSV" — a `.csv` file downloads with province data.
7. Click "Export as Image" — a `.png` file downloads showing the table.
8. Click ✕ or backdrop — modal closes.
9. With `?provinces=Albay` in URL, open modal — only Albay row appears.
10. Open public dashboard at `/view/<token>` — same icon and modal work.

- [ ] **Step 10: Commit**

```bash
git add components/DashboardClient.tsx app/page.tsx "app/view/[token]/page.tsx"
git commit -m "feat: add province breakdown table modal to Per Landholding Data stat group"
```
