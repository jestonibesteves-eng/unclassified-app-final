# Status Breakdown Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a table icon button to the "Records by Status" chart that opens a modal showing LH count and validated area broken down by status × province.

**Architecture:** New API route aggregates Landholding rows in JS (no raw SQL needed). New `StatusBreakdownModal` renders the table in a portal, mirroring `ProvinceBreakdownModal` exactly. A tiny `StatusBreakdownButton` client component owns open state and is injected into each `ChartCard` via a new optional `action` prop. Both `ChartCard` local functions (in `app/page.tsx` and `app/view/[token]/page.tsx`) must be updated independently since they are not shared.

**Tech Stack:** Next.js App Router, Prisma + better-sqlite3, Tailwind CSS, `html-to-image` (PNG export), `react-dom` createPortal, TypeScript.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `app/api/dashboard/status-table/route.ts` | Query + aggregate LH data by status × province |
| Create | `components/StatusBreakdownModal.tsx` | Portal modal with scrollable table, CSV + PNG export |
| Create | `components/StatusBreakdownButton.tsx` | Client component owning open state + rendering button + modal |
| Modify | `app/page.tsx` lines 257-270 | Add `action?` prop to local `ChartCard`; pass button to Records by Status card |
| Modify | `app/view/[token]/page.tsx` lines 264-273 | Same ChartCard update; pass button with `publicToken` + `hideExport` |

---

## Task 1: API Route

**Files:**
- Create: `app/api/dashboard/status-table/route.ts`

- [ ] **Step 1: Create the route file with types and query logic**

```ts
// app/api/dashboard/status-table/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";
import { validatePublicToken } from "@/lib/public-token";

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
```

- [ ] **Step 2: Verify the route responds correctly**

Start the dev server if not running: `npm run dev`

Open in browser: `http://localhost:3000/api/dashboard/status-table`

Expected: JSON with `{ rows: [...], grandTotal: {...}, provinces: [...] }`. Each row has `status`, `byProvince` (object keyed by province name), `total`.

- [ ] **Step 3: Commit**

```bash
git add app/api/dashboard/status-table/route.ts
git commit -m "feat: add status-table API route for status × province breakdown"
```

---

## Task 2: StatusBreakdownModal Component

**Files:**
- Create: `components/StatusBreakdownModal.tsx`

- [ ] **Step 1: Create the component**

```tsx
// components/StatusBreakdownModal.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { StatusTableRow } from "@/app/api/dashboard/status-table/route";

type Props = {
  open: boolean;
  onClose: () => void;
  selectedProvinces?: string[];
  publicToken?: string;
  hideExport?: boolean;
};

export function StatusBreakdownModal({ open, onClose, selectedProvinces, publicToken, hideExport }: Props) {
  const [rows, setRows] = useState<StatusTableRow[]>([]);
  const [grandTotal, setGrandTotal] = useState<StatusTableRow | null>(null);
  const [provinces, setProvinces] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const fetchedKey = useRef<string | null>(null);
  const captureRef = useRef<HTMLDivElement>(null);
  const exportTitleRef = useRef<HTMLDivElement>(null);

  // Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Fetch data
  useEffect(() => {
    if (!open) return;
    const key = (selectedProvinces ?? []).slice().sort().join(",") + "|" + (publicToken ?? "");
    if (fetchedKey.current === key) return;
    fetchedKey.current = key;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (selectedProvinces && selectedProvinces.length > 0) {
      params.set("provinces", selectedProvinces.join(","));
    }
    if (publicToken) params.set("token", publicToken);
    fetch(`/api/dashboard/status-table?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setRows(data.rows ?? []);
        setGrandTotal(data.grandTotal ?? null);
        setProvinces(data.provinces ?? []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("[StatusBreakdownModal]", err);
        setError(`Failed to load status data. (${err?.message ?? "unknown error"})`);
        setLoading(false);
      });
  }, [open, selectedProvinces, publicToken]);

  function exportCsv() {
    const provHeaders = provinces.flatMap((p) => [`"${p} LHs"`, `"${p} Area (has.)"`]);
    const header = ["Status", ...provHeaders, "R-V TOTAL LHs", "R-V TOTAL Area (has.)"].join(",");
    const allRows = [...rows, ...(grandTotal ? [grandTotal] : [])];
    const dataRows = allRows.map((r) => {
      const cells = provinces.flatMap((p) => [
        r.byProvince[p]?.count ?? 0,
        (r.byProvince[p]?.area ?? 0).toFixed(4),
      ]);
      return [`"${r.status.replace(/"/g, '""')}"`, ...cells, r.total.count, r.total.area.toFixed(4)].join(",");
    });
    const csv = [header, ...dataRows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `status-breakdown-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportImage() {
    if (!captureRef.current) return;
    setExportError(null);
    try {
      const { toPng } = await import("html-to-image");
      if (exportTitleRef.current) exportTitleRef.current.classList.remove("hidden");
      const url = await toPng(captureRef.current, { pixelRatio: 2 });
      if (exportTitleRef.current) exportTitleRef.current.classList.add("hidden");
      const a = document.createElement("a");
      a.href = url;
      a.download = `status-breakdown-${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
    } catch (err) {
      if (exportTitleRef.current) exportTitleRef.current.classList.add("hidden");
      console.error("[StatusBreakdownModal exportImage]", err);
      setExportError("Failed to export image. Try Export CSV instead.");
    }
  }

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="status-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      tabIndex={-1}
    >
      <div className="max-w-6xl w-full rounded-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-green-900 px-5 py-3 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 id="status-modal-title" className="text-[10px] font-bold text-green-300 uppercase tracking-[0.13em]">
              Status Breakdown by Province
            </h2>
            <p className="text-[9px] text-green-500 font-mono mt-0.5">
              As of {new Date().toLocaleString("en-PH", {
                year: "numeric", month: "long", day: "numeric",
                hour: "2-digit", minute: "2-digit", second: "2-digit",
                timeZone: "Asia/Manila",
              })}
            </p>
          </div>
          <button onClick={onClose} className="text-green-400 hover:text-green-200 text-xl leading-none" aria-label="Close">
            ×
          </button>
        </div>

        {/* Table body */}
        <div className="flex-1 overflow-auto bg-white">
          {loading && (
            <div className="flex items-center justify-center py-16 text-sm text-gray-400">Loading…</div>
          )}
          {error && (
            <div className="flex items-center justify-center py-16 text-sm text-red-500">{error}</div>
          )}
          {!loading && !error && (
            <div ref={captureRef}>
              {/* Hidden title bar — revealed only during PNG export */}
              <div ref={exportTitleRef} className="bg-green-900 px-5 py-3 hidden">
                <p className="text-[10px] font-bold text-green-300 uppercase tracking-[0.13em]">
                  Status of Unclassified ARRs (per Landholding)
                </p>
                <p className="text-[9px] text-green-500 font-mono mt-0.5">
                  As of {new Date().toLocaleString("en-PH", {
                    year: "numeric", month: "long", day: "numeric",
                    hour: "2-digit", minute: "2-digit", second: "2-digit",
                    timeZone: "Asia/Manila",
                  })}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="border-collapse text-left" style={{ minWidth: 600 }}>
                  <thead className="sticky top-0 z-20">
                    {/* Province group header row */}
                    <tr className="bg-emerald-50">
                      <th
                        rowSpan={2}
                        className="px-3 py-2 text-[9px] font-semibold text-gray-600 border-b-2 border-r-2 border-emerald-200 sticky left-0 bg-emerald-50 z-30"
                        style={{ minWidth: 160 }}
                      >
                        Status
                      </th>
                      {provinces.map((p) => (
                        <th
                          key={p}
                          colSpan={2}
                          className="px-2 py-1.5 text-center text-[8px] font-bold text-emerald-700 uppercase tracking-[0.08em] border-b border-r border-emerald-100"
                        >
                          {p}
                        </th>
                      ))}
                      <th
                        colSpan={2}
                        className="px-2 py-1.5 text-center text-[8px] font-bold text-green-900 uppercase tracking-[0.08em] border-b border-emerald-100 bg-emerald-100"
                      >
                        R-V TOTAL
                      </th>
                    </tr>
                    {/* LHs / Area sub-header row */}
                    <tr className="bg-emerald-50">
                      {provinces.map((p) => (
                        <>
                          <th key={`${p}-lh`} className="px-2 pb-1.5 text-[8px] font-normal text-gray-500 border-b-2 border-emerald-300 text-right" style={{ minWidth: 52 }}>
                            LHs
                          </th>
                          <th key={`${p}-area`} className="px-2 pb-1.5 text-[8px] font-normal text-gray-500 border-b-2 border-r border-emerald-200 text-right" style={{ minWidth: 80 }}>
                            Area (has.)
                          </th>
                        </>
                      ))}
                      <th className="px-2 pb-1.5 text-[8px] font-semibold text-green-800 border-b-2 border-emerald-300 text-right bg-emerald-100" style={{ minWidth: 52 }}>
                        LHs
                      </th>
                      <th className="px-2 pb-1.5 text-[8px] font-semibold text-green-800 border-b-2 border-emerald-300 text-right bg-emerald-100" style={{ minWidth: 88 }}>
                        Area (has.)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r.status} className={`border-b border-gray-100 ${i % 2 === 1 ? "bg-gray-50" : "bg-white"}`}>
                        <td className={`px-3 py-1.5 text-[10px] font-semibold text-gray-800 border-r-2 border-emerald-100 sticky left-0 z-10 ${i % 2 === 1 ? "bg-gray-50" : "bg-white"}`}>
                          {r.status}
                        </td>
                        {provinces.map((p) => {
                          const cell = r.byProvince[p];
                          return (
                            <>
                              <td key={`${p}-lh`} className="px-2 py-1.5 text-right text-[10px] text-gray-700 font-mono">
                                {cell?.count ? cell.count.toLocaleString() : "—"}
                              </td>
                              <td key={`${p}-area`} className="px-2 py-1.5 text-right text-[10px] text-gray-600 font-mono border-r border-emerald-100">
                                {cell?.area ? cell.area.toFixed(4) : "—"}
                              </td>
                            </>
                          );
                        })}
                        <td className="px-2 py-1.5 text-right text-[10px] font-semibold text-gray-800 font-mono bg-emerald-50">
                          {r.total.count.toLocaleString()}
                        </td>
                        <td className="px-2 py-1.5 text-right text-[10px] font-semibold text-gray-800 font-mono bg-emerald-50">
                          {r.total.area.toFixed(4)}
                        </td>
                      </tr>
                    ))}
                    {/* Grand Total row */}
                    {grandTotal && (
                      <tr className="bg-emerald-50 border-t-2 border-emerald-300">
                        <td className="px-3 py-2 text-[10px] font-bold text-emerald-800 uppercase tracking-wide border-r-2 border-emerald-200 sticky left-0 bg-emerald-50 z-10">
                          GRAND TOTAL
                        </td>
                        {provinces.map((p) => {
                          const cell = grandTotal.byProvince[p];
                          return (
                            <>
                              <td key={`${p}-lh`} className="px-2 py-2 text-right text-[10px] font-bold text-gray-800 font-mono">
                                {cell?.count ? cell.count.toLocaleString() : "—"}
                              </td>
                              <td key={`${p}-area`} className="px-2 py-2 text-right text-[10px] font-bold text-gray-800 font-mono border-r border-emerald-200">
                                {cell?.area ? cell.area.toFixed(4) : "—"}
                              </td>
                            </>
                          );
                        })}
                        <td className="px-2 py-2 text-right text-[10px] font-bold text-emerald-800 font-mono bg-emerald-100">
                          {grandTotal.total.count.toLocaleString()}
                        </td>
                        <td className="px-2 py-2 text-right text-[10px] font-bold text-emerald-800 font-mono bg-emerald-100">
                          {grandTotal.total.area.toFixed(4)}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 bg-emerald-50 border-t border-emerald-100 px-5 py-2.5 flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] text-gray-400">Area = validated AMENDAREA (falls back to scope AMENDAREA where not yet validated)</span>
            {exportError && <span className="text-[9px] text-red-500">{exportError}</span>}
          </div>
          {!hideExport && (
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
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
```

- [ ] **Step 2: Verify the file compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors referencing `StatusBreakdownModal.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/StatusBreakdownModal.tsx
git commit -m "feat: add StatusBreakdownModal component"
```

---

## Task 3: StatusBreakdownButton Client Component

**Files:**
- Create: `components/StatusBreakdownButton.tsx`

- [ ] **Step 1: Create the component**

```tsx
// components/StatusBreakdownButton.tsx
"use client";

import { useState } from "react";
import { StatusBreakdownModal } from "@/components/StatusBreakdownModal";

type Props = {
  selectedProvinces?: string[];
  publicToken?: string;
  hideExport?: boolean;
};

export function StatusBreakdownButton({ selectedProvinces, publicToken, hideExport }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="View as status breakdown table"
        aria-label="View as status breakdown table"
        className="w-7 h-7 flex items-center justify-center rounded-md bg-white border border-green-200 shadow-sm hover:bg-green-50 transition-colors"
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#059669"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="3" y1="15" x2="21" y2="15" />
          <line x1="9" y1="3" x2="9" y2="21" />
          <line x1="15" y1="3" x2="15" y2="21" />
        </svg>
      </button>
      <StatusBreakdownModal
        open={open}
        onClose={() => setOpen(false)}
        selectedProvinces={selectedProvinces}
        publicToken={publicToken}
        hideExport={hideExport}
      />
    </>
  );
}
```

- [ ] **Step 2: Verify the file compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors referencing `StatusBreakdownButton.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/StatusBreakdownButton.tsx
git commit -m "feat: add StatusBreakdownButton client component"
```

---

## Task 4: Wire into app/page.tsx

**Files:**
- Modify: `app/page.tsx`

**Context:** `ChartCard` is a local function defined at the bottom of `app/page.tsx` (around line 257). The Records by Status chart is at lines 211-213. `effectiveProvinces` is already defined (line ~47) and is the correct province filter to pass.

- [ ] **Step 1: Add import for StatusBreakdownButton**

At the top of `app/page.tsx`, add this import alongside the other component imports:

```ts
import { StatusBreakdownButton } from "@/components/StatusBreakdownButton";
```

- [ ] **Step 2: Update the local ChartCard function to accept an `action` prop**

Find the `ChartCard` function near the bottom of `app/page.tsx` (currently):

```tsx
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
```

Replace it with:

```tsx
function ChartCard({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="card-bezel">
      <div className="card-bezel-inner">
        <div className="bg-green-900 px-4 py-2.5 flex items-center justify-between">
          <h3 className="text-[10px] font-semibold text-green-300 uppercase tracking-[0.13em]">
            {title}
          </h3>
          {action && <div className="flex-shrink-0">{action}</div>}
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Pass the button to the Records by Status ChartCard**

Find (around line 211):

```tsx
<ChartCard title="Records by Status">
  <StatusWithAreaChart data={statusData} />
</ChartCard>
```

Replace with:

```tsx
<ChartCard
  title="Records by Status"
  action={<StatusBreakdownButton selectedProvinces={effectiveProvinces} />}
>
  <StatusWithAreaChart data={statusData} />
</ChartCard>
```

- [ ] **Step 4: Verify the page compiles and the button appears**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Open `http://localhost:3000` in the browser. Confirm a grid icon button appears in the top-right corner of the "Records by Status" chart card. Click it — the modal should open, load data, and render the status × province table.

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx
git commit -m "feat: wire StatusBreakdownButton into Records by Status chart"
```

---

## Task 5: Wire into app/view/[token]/page.tsx

**Files:**
- Modify: `app/view/[token]/page.tsx`

**Context:** `ChartCard` is also a local function in this file (around line 264). The Records by Status chart is at lines 218-220. The `token` variable (route param, validated at line 33) is the public token to pass. No `selectedProvinces` is needed for the public view — it shows all provinces. `hideExport` must be set.

- [ ] **Step 1: Add import for StatusBreakdownButton**

At the top of `app/view/[token]/page.tsx`, add:

```ts
import { StatusBreakdownButton } from "@/components/StatusBreakdownButton";
```

- [ ] **Step 2: Update the local ChartCard function to accept an `action` prop**

Find the `ChartCard` function near the bottom of `app/view/[token]/page.tsx` (currently):

```tsx
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

Replace with:

```tsx
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
```

- [ ] **Step 3: Pass the button to the Records by Status ChartCard**

Find (around line 218):

```tsx
<ChartCard title="Records by Status">
  <StatusWithAreaChart data={statusData} />
</ChartCard>
```

Replace with:

```tsx
<ChartCard
  title="Records by Status"
  action={<StatusBreakdownButton publicToken={token} hideExport />}
>
  <StatusWithAreaChart data={statusData} />
</ChartCard>
```

- [ ] **Step 4: Verify the public view**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Open the public dashboard URL (get the token from Settings → Share Dashboard, then open `http://localhost:3000/view/<token>`).

Confirm: grid icon appears on the Records by Status card, clicking it opens the modal, export buttons are hidden.

- [ ] **Step 5: Commit**

```bash
git add app/view/\[token\]/page.tsx
git commit -m "feat: wire StatusBreakdownButton into public view Records by Status chart"
```

---

## Self-Review

**Spec coverage:**
- ✅ API route with dual auth (session + public token)
- ✅ `?provinces=` filter support
- ✅ `amendarea_validated ?? amendarea` area logic
- ✅ Canonical status order
- ✅ StatusBreakdownModal with sticky thead + sticky first column
- ✅ Escape key closes, backdrop click closes
- ✅ As-of timestamp in header
- ✅ CSV export with province × LHs/Area columns
- ✅ PNG export via html-to-image with hidden title bar
- ✅ `hideExport` suppresses both export buttons
- ✅ `exportError` state separate from data load error
- ✅ `createPortal` to document.body
- ✅ Grand Total row bold + top border
- ✅ Empty cells show `—`
- ✅ `action?` prop added to ChartCard in both page files
- ✅ Public view wired with `hideExport` + `publicToken`

**Type consistency:**
- `StatusTableRow.byProvince` defined in route → used as `Record<string, StatusTableCell>` in modal ✅
- `StatusTableRow.total` is `StatusTableCell` → accessed as `.count` / `.area` in modal ✅
- `StatusBreakdownButton` props flow to `StatusBreakdownModal` props exactly ✅
