# Provincial Overview Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a grid-icon button to the Accomplishment Tracker header that opens a read-only modal showing all 7 Region V provinces plus the regional total in a table-grid layout, mirroring the active metric tab (COCROM/ARB/Area/Amount).

**Architecture:** A new `/api/progress/bulk` endpoint runs the same SQL as `/api/progress` but grouped by `province_edited`, returning all provinces in one request. A new `ProvinceOverviewModal` component renders the results in a grid (metric rows × province columns) using a shared `lib/gauge-utils.tsx` that both the existing `DashboardProgress` and the new modal import from.

**Tech Stack:** Next.js App Router, better-sqlite3 (rawDb), React createPortal, html-to-image, Tailwind CSS

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `lib/gauge-utils.tsx` | **Create** | Shared SemiGauge component, gauge geometry, status helpers, format helpers, EncSubfilter type |
| `components/DashboardProgress.tsx` | **Modify** | Import from gauge-utils (remove duplicates), add grid-icon button, render ProvinceOverviewModal |
| `app/api/progress/bulk/route.ts` | **Create** | Grouped SQL queries returning per-province + regional data in one request |
| `components/ProvinceOverviewModal.tsx` | **Create** | Modal component — table grid layout, cell rendering, export-as-image |

---

## Task 1: Extract shared gauge utilities to `lib/gauge-utils.tsx`

**Files:**
- Create: `lib/gauge-utils.tsx`
- Modify: `components/DashboardProgress.tsx`

- [ ] **Step 1: Create `lib/gauge-utils.tsx`**

```tsx
"use client";

import React from "react";

export type EncSubfilter = "cocrom" | "arb" | "area" | "amount";

/* ── Gauge geometry ── */
export const CX = 120, CY = 114, R = 96;
export const START_X = CX - R; // 24
export const END_X   = CX + R; // 216

export function gaugePoint(p: number): { x: number; y: number } {
  const angle = Math.PI * (1 - p);
  return { x: CX + R * Math.cos(angle), y: CY - R * Math.sin(angle) };
}

export function gaugeArc(p: number): string | null {
  const clamped = Math.min(Math.max(p, 0), 1);
  if (clamped < 0.004) return null;
  if (clamped >= 0.999) return `M ${START_X} ${CY} A ${R} ${R} 0 0 1 ${END_X} ${CY}`;
  const { x, y } = gaugePoint(clamped);
  return `M ${START_X} ${CY} A ${R} ${R} 0 0 1 ${x.toFixed(3)} ${y.toFixed(3)}`;
}

/* ── Status helpers ── */
export function statusColor(pct: number): string {
  if (pct >= 80) return "#10b981";
  if (pct >= 50) return "#f59e0b";
  return "#ef4444";
}

export function statusTextClass(pct: number): string {
  if (pct >= 80) return "text-emerald-600";
  if (pct >= 50) return "text-amber-500";
  return "text-red-500";
}

export function statusLabel(pct: number): string {
  if (pct >= 80) return "On Track";
  if (pct >= 50) return "At Risk";
  return "Critical";
}

/* ── Deadline ── */
export function daysToDeadline(deadline: Date): number {
  return Math.max(0, Math.floor((deadline.getTime() - Date.now()) / 86400000));
}

/* ── Formatters ── */
export function fmtArea(n: number)   { return n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ha"; }
export function fmtAmount(n: number) { return "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
export function fmtCount(n: number)  { return n.toLocaleString(); }
export function fmtAreaShort(n: number)    { return n.toLocaleString("en-PH", { maximumFractionDigits: 1 }) + " ha."; }
export function fmtAmountShort(n: number): string {
  if (n >= 1_000_000_000) return "₱" + (n / 1_000_000_000).toFixed(2) + "B";
  if (n >= 1_000_000)     return "₱" + (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000)         return "₱" + (n / 1_000).toFixed(1) + "K";
  return "₱" + n.toLocaleString();
}

/* ── SemiGauge ── */
export function SemiGauge({
  value, total, color, subA, subB, totalLabel,
}: {
  value:      number;
  total:      number;
  color:      string;
  subA:       string;
  subB:       string;
  totalLabel: string;
}) {
  const p       = total > 0 ? Math.min(value / total, 1) : 0;
  const pct     = p * 100;
  const arcPath = gaugeArc(p);
  const gradId  = `gg-${color.replace(/[^a-f0-9]/gi, "")}`;

  return (
    <div style={{ maxWidth: "260px", margin: "0 auto" }}>
      <svg viewBox="0 0 240 140" width="100%" aria-hidden>
        <defs>
          <linearGradient id={gradId} x1={START_X} y1="0" x2={END_X} y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="1"    />
          </linearGradient>
        </defs>
        <path
          d={`M ${START_X} ${CY} A ${R} ${R} 0 0 1 ${END_X} ${CY}`}
          fill="none" stroke="#edf0f3" strokeWidth="22" strokeLinecap="round"
        />
        {arcPath && (
          <path d={arcPath} fill="none" stroke={`url(#${gradId})`}
            strokeWidth="22" strokeLinecap="round" />
        )}
        <text x={CX} y="68" fontSize="30" fontWeight="800"
          fill={total === 0 ? "#d1d5db" : color} textAnchor="middle" letterSpacing="-1">
          {total === 0 ? "—" : `${pct.toFixed(1)}%`}
        </text>
        <text x={CX} y="84" fontSize="9" fontWeight="600" fill="#4b5563" textAnchor="middle">
          {total === 0 ? "no data" : subA}
        </text>
        {total > 0 && (
          <text x={CX} y="97" fontSize="9" fill="#9ca3af" textAnchor="middle">{subB}</text>
        )}
        <text x={START_X} y="133" fontSize="9" fontWeight="600" fill="#9ca3af" textAnchor="middle">0</text>
        <text x={END_X}   y="133" fontSize="9" fontWeight="600" fill="#9ca3af" textAnchor="middle">{totalLabel}</text>
      </svg>
    </div>
  );
}
```

- [ ] **Step 2: Update `components/DashboardProgress.tsx` — replace local definitions with imports**

At the top of the file, add this import and remove the duplicate local definitions:

```tsx
import {
  EncSubfilter,
  SemiGauge,
  statusColor, statusTextClass, daysToDeadline,
  fmtArea, fmtAmount, fmtCount, fmtAreaShort, fmtAmountShort,
} from "@/lib/gauge-utils";
```

Remove these sections from `DashboardProgress.tsx` (they are now in gauge-utils):
- `type EncSubfilter = ...` (line 6)
- `function daysToDeadline(...)` (lines 48–50)
- The `CX`, `CY`, `R`, `START_X`, `END_X` constants (lines 96–98)
- `function gaugePoint(...)` (lines 100–105)
- `function gaugeArc(...)` (lines 108–114)
- `function statusColor(...)` (lines 68–72)
- `function statusTextClass(...)` (lines 74–78)
- `function fmtArea/fmtAmount/fmtCount/fmtAreaShort/fmtAmountShort` (lines 80–89)
- `function SemiGauge(...)` (lines 117–173)

Keep in `DashboardProgress.tsx`:
- `SimpleMilestone`, `EncodingData`, `ProgressResponse` types
- `ENC_SUB_CFG` constant
- `COMMITTED_COCROMS` constant
- `fmtDeadlineLabel` function
- `SimpleCard`, `EncodingCard`, `SkeletonCard` components
- `DashboardProgress` default export

- [ ] **Step 3: Start dev server and verify the dashboard still renders**

```powershell
npm run dev
```

Navigate to `http://localhost:3000`. The Accomplishment Tracker (Validation, Encoding, Distribution cards) should render identically to before. Check all 4 tabs (COCROM, ARB, Area, Amount).

- [ ] **Step 4: Commit**

```bash
git add lib/gauge-utils.tsx components/DashboardProgress.tsx
git commit -m "refactor: extract shared gauge utilities to lib/gauge-utils.tsx"
```

---

## Task 2: Build the bulk progress API endpoint

**Files:**
- Create: `app/api/progress/bulk/route.ts`

- [ ] **Step 1: Create `app/api/progress/bulk/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { rawDb } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";

const TOKEN_KEY = "public_dashboard_token";

// ── SQL helpers (same as /api/progress) ────────────────────────────────────
const AREA_CLEAN   = `TRIM(REPLACE(COALESCE(a.area_allocated,''),',',''))`;
const AMOUNT_CLEAN = `TRIM(REPLACE(COALESCE(a.allocated_condoned_amount,''),',',''))`;
const IS_CLEAN     = (col: string) =>
  `(${col} GLOB '[0-9]*' AND ${col} NOT GLOB '*[^0-9.]*')`;

const LH_AREA    = `TRIM(REPLACE(COALESCE(l.amendarea,''),',',''))`;
const LH_AREA_V  = `TRIM(REPLACE(COALESCE(l.amendarea_validated,''),',',''))`;
const LH_AMOUNT  = `TRIM(REPLACE(COALESCE(l.condoned_amount,''),',',''))`;
const LH_REVAL   = `TRIM(REPLACE(COALESCE(l.net_of_reval_no_neg,''),',',''))`;
const IS_CLEAN_L = (c: string) => `(${c} GLOB '[0-9]*' AND ${c} NOT GLOB '*[^0-9.]*')`;

const VAL_COND = `(
  l.status = 'Not Eligible for Encoding'
  OR (
    l.amendarea_validated_confirmed = 1
    AND l.condoned_amount_confirmed = 1
    AND l.amendarea_validated IS NOT NULL
    AND l.status != 'Not Eligible for Encoding'
    AND ABS(l.amendarea_validated - COALESCE(arb_totals.total_area, 0)) < 0.01
  )
)`;

export type BulkEntry = {
  committed_cocroms: number;
  validation: {
    total: number; completed: number;
    area_total: number; area_completed: number;
    amount_total: number; amount_completed: number;
  };
  encoding: {
    cocrom_total: number; cocrom_completed: number;
    arb_total: number;   arb_completed: number;
    area_total: number;  area_completed: number;
    amount_total: number; amount_completed: number;
    lh_validated: number; lh_not_validated: number;
  };
  distribution: {
    cocrom_total: number; cocrom_completed: number;
    arb_total: number;   arb_completed: number;
    area_total: number;  area_completed: number;
    amount_total: number; amount_completed: number;
    lh_validated: number; lh_not_validated: number;
  };
};

export type BulkProgressResponse = {
  region: BulkEntry;
  provinces: Record<string, BulkEntry>;
};

const PROVINCES = [
  "ALBAY", "CAMARINES NORTE", "CAMARINES SUR - I",
  "CAMARINES SUR - II", "CATANDUANES", "MASBATE", "SORSOGON",
];

function emptyEntry(): BulkEntry {
  return {
    committed_cocroms: 0,
    validation:   { total: 0, completed: 0, area_total: 0, area_completed: 0, amount_total: 0, amount_completed: 0 },
    encoding:     { cocrom_total: 0, cocrom_completed: 0, arb_total: 0, arb_completed: 0, area_total: 0, area_completed: 0, amount_total: 0, amount_completed: 0, lh_validated: 0, lh_not_validated: 0 },
    distribution: { cocrom_total: 0, cocrom_completed: 0, arb_total: 0, arb_completed: 0, area_total: 0, area_completed: 0, amount_total: 0, amount_completed: 0, lh_validated: 0, lh_not_validated: 0 },
  };
}

export async function GET(req: NextRequest) {
  try {
    // Auth: session OR public token
    const publicToken = req.nextUrl.searchParams.get("token");
    let isAuthed = false;
    if (publicToken) {
      const setting = rawDb.prepare(`SELECT value FROM "Setting" WHERE key = ?`).get(TOKEN_KEY) as { value: string } | undefined;
      if (setting?.value === publicToken) isAuthed = true;
    }
    if (!isAuthed) {
      const sessionCookie = req.cookies.get(SESSION_COOKIE)?.value;
      const sessionUser   = sessionCookie ? await verifySessionToken(sessionCookie) : null;
      if (!sessionUser) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
      // Only regional users can see the full province breakdown
      if (sessionUser.office_level !== "regional") {
        return NextResponse.json({ error: "Regional access required." }, { status: 403 });
      }
      isAuthed = true;
    }

    // ── Build result map ──────────────────────────────────────────────────
    const result: Record<string, BulkEntry> = {};
    for (const p of [...PROVINCES, "__REGION__"]) result[p] = emptyEntry();

    // ── Validation total (grouped by province) ────────────────────────────
    const valTotals = rawDb.prepare(
      `SELECT province_edited, COUNT(*) as n FROM "Landholding" GROUP BY province_edited`
    ).all() as { province_edited: string | null; n: number }[];
    let regionValTotal = 0;
    for (const row of valTotals) {
      const p = row.province_edited?.toUpperCase().trim() ?? "";
      if (result[p]) result[p].validation.total = row.n;
      regionValTotal += row.n;
    }
    result["__REGION__"].validation.total = regionValTotal;

    // ── Validation completed (grouped by province) ────────────────────────
    const valCompleted = rawDb.prepare(`
      SELECT l.province_edited, COUNT(*) as n
      FROM "Landholding" l
      LEFT JOIN (
        SELECT a.seqno_darro,
               SUM(CASE WHEN ${IS_CLEAN(AREA_CLEAN)} THEN CAST(${AREA_CLEAN} AS REAL) ELSE 0 END) AS total_area
        FROM "Arb" a WHERE a.carpable = 'CARPABLE'
        GROUP BY a.seqno_darro
      ) arb_totals ON arb_totals.seqno_darro = l.seqno_darro
      WHERE ${VAL_COND}
      GROUP BY l.province_edited
    `).all() as { province_edited: string | null; n: number }[];
    let regionValCompleted = 0;
    for (const row of valCompleted) {
      const p = row.province_edited?.toUpperCase().trim() ?? "";
      if (result[p]) result[p].validation.completed = row.n;
      regionValCompleted += row.n;
    }
    result["__REGION__"].validation.completed = regionValCompleted;

    // ── Validation area/amount metrics (grouped by province) ──────────────
    const valMetrics = rawDb.prepare(`
      SELECT
        l.province_edited,
        SUM(CASE WHEN ${IS_CLEAN_L(LH_AREA_V)} THEN CAST(${LH_AREA_V} AS REAL)
                 WHEN ${IS_CLEAN_L(LH_AREA)}   THEN CAST(${LH_AREA}   AS REAL)
                 ELSE 0 END) as area_total,
        SUM(CASE
          WHEN l.status = 'Not Eligible for Encoding' THEN
            CASE WHEN ${IS_CLEAN_L(LH_AREA_V)} THEN CAST(${LH_AREA_V} AS REAL)
                 WHEN ${IS_CLEAN_L(LH_AREA)}   THEN CAST(${LH_AREA}   AS REAL)
                 ELSE 0 END
          WHEN l.amendarea_validated_confirmed = 1
               AND l.condoned_amount_confirmed = 1
               AND l.amendarea_validated IS NOT NULL
               AND l.status != 'Not Eligible for Encoding'
               AND ABS(l.amendarea_validated - COALESCE(arb_totals.total_area, 0)) < 0.01
            THEN CASE WHEN ${IS_CLEAN_L(LH_AREA_V)} THEN CAST(${LH_AREA_V} AS REAL) ELSE 0 END
          ELSE 0
        END) as area_completed,
        SUM(CASE WHEN ${IS_CLEAN_L(LH_AMOUNT)} THEN CAST(${LH_AMOUNT} AS REAL)
                 WHEN ${IS_CLEAN_L(LH_REVAL)}  THEN CAST(${LH_REVAL}  AS REAL)
                 ELSE 0 END) as amount_total,
        SUM(CASE WHEN ${VAL_COND} THEN
          CASE WHEN ${IS_CLEAN_L(LH_AMOUNT)} THEN CAST(${LH_AMOUNT} AS REAL)
               WHEN ${IS_CLEAN_L(LH_REVAL)}  THEN CAST(${LH_REVAL}  AS REAL)
               ELSE 0 END
        ELSE 0 END) as amount_completed
      FROM "Landholding" l
      LEFT JOIN (
        SELECT a.seqno_darro,
               SUM(CASE WHEN ${IS_CLEAN(AREA_CLEAN)} THEN CAST(${AREA_CLEAN} AS REAL) ELSE 0 END) AS total_area
        FROM "Arb" a WHERE a.carpable = 'CARPABLE'
        GROUP BY a.seqno_darro
      ) arb_totals ON arb_totals.seqno_darro = l.seqno_darro
      GROUP BY l.province_edited
    `).all() as { province_edited: string | null; area_total: number; area_completed: number; amount_total: number; amount_completed: number }[];
    let rAreaTotal = 0, rAreaCompleted = 0, rAmountTotal = 0, rAmountCompleted = 0;
    for (const row of valMetrics) {
      const p = row.province_edited?.toUpperCase().trim() ?? "";
      if (result[p]) {
        result[p].validation.area_total      = row.area_total;
        result[p].validation.area_completed  = row.area_completed;
        result[p].validation.amount_total    = row.amount_total;
        result[p].validation.amount_completed = row.amount_completed;
      }
      rAreaTotal      += row.area_total;
      rAreaCompleted  += row.area_completed;
      rAmountTotal    += row.amount_total;
      rAmountCompleted += row.amount_completed;
    }
    result["__REGION__"].validation.area_total      = rAreaTotal;
    result["__REGION__"].validation.area_completed  = rAreaCompleted;
    result["__REGION__"].validation.amount_total    = rAmountTotal;
    result["__REGION__"].validation.amount_completed = rAmountCompleted;

    // ── Encoding agg (grouped by province) ───────────────────────────────
    const encAgg = rawDb.prepare(`
      SELECT
        l.province_edited,
        COUNT(*) as cocrom_total,
        SUM(CASE WHEN a.date_encoded IS NOT NULL THEN 1 ELSE 0 END) as cocrom_completed,
        COUNT(DISTINCT a.arb_name) as arb_total,
        COUNT(DISTINCT CASE WHEN a.date_encoded IS NOT NULL THEN a.arb_name ELSE NULL END) as arb_completed,
        SUM(CASE WHEN ${IS_CLEAN(AREA_CLEAN)} THEN CAST(${AREA_CLEAN} AS REAL) ELSE 0 END) as area_total,
        SUM(CASE WHEN a.date_encoded IS NOT NULL AND ${IS_CLEAN(AREA_CLEAN)} THEN CAST(${AREA_CLEAN} AS REAL) ELSE 0 END) as area_completed,
        SUM(CASE WHEN ${IS_CLEAN(AMOUNT_CLEAN)} THEN CAST(${AMOUNT_CLEAN} AS REAL) ELSE 0 END) as amount_total,
        SUM(CASE WHEN a.date_encoded IS NOT NULL AND ${IS_CLEAN(AMOUNT_CLEAN)} THEN CAST(${AMOUNT_CLEAN} AS REAL) ELSE 0 END) as amount_completed
      FROM "Arb" a
      JOIN "Landholding" l ON a.seqno_darro = l.seqno_darro
      WHERE a.carpable = 'CARPABLE' AND a.eligibility = 'Eligible'
      GROUP BY l.province_edited
    `).all() as { province_edited: string | null; cocrom_total: number; cocrom_completed: number; arb_total: number; arb_completed: number; area_total: number; area_completed: number; amount_total: number; amount_completed: number }[];
    let rEnc = { cocrom_total: 0, cocrom_completed: 0, arb_total: 0, arb_completed: 0, area_total: 0, area_completed: 0, amount_total: 0, amount_completed: 0 };
    for (const row of encAgg) {
      const p = row.province_edited?.toUpperCase().trim() ?? "";
      if (result[p]) {
        result[p].encoding.cocrom_total      = row.cocrom_total;
        result[p].encoding.cocrom_completed  = row.cocrom_completed;
        result[p].encoding.arb_total         = row.arb_total;
        result[p].encoding.arb_completed     = row.arb_completed;
        result[p].encoding.area_total        = row.area_total;
        result[p].encoding.area_completed    = row.area_completed;
        result[p].encoding.amount_total      = row.amount_total;
        result[p].encoding.amount_completed  = row.amount_completed;
      }
      rEnc.cocrom_total     += row.cocrom_total;
      rEnc.cocrom_completed += row.cocrom_completed;
      rEnc.arb_total        += row.arb_total;
      rEnc.arb_completed    += row.arb_completed;
      rEnc.area_total       += row.area_total;
      rEnc.area_completed   += row.area_completed;
      rEnc.amount_total     += row.amount_total;
      rEnc.amount_completed += row.amount_completed;
    }
    Object.assign(result["__REGION__"].encoding, rEnc);

    // ── Encoding LH breakdown (grouped by province) ───────────────────────
    const encLh = rawDb.prepare(`
      SELECT
        l.province_edited,
        COUNT(CASE WHEN l.amendarea_validated_confirmed = 1 AND l.condoned_amount_confirmed = 1 THEN 1 END) as lh_validated,
        COUNT(CASE WHEN NOT (l.amendarea_validated_confirmed = 1 AND l.condoned_amount_confirmed = 1) THEN 1 END) as lh_not_validated
      FROM (
        SELECT DISTINCT a.seqno_darro
        FROM "Arb" a
        WHERE a.carpable = 'CARPABLE' AND a.eligibility = 'Eligible' AND a.date_encoded IS NOT NULL
      ) enc
      JOIN "Landholding" l ON l.seqno_darro = enc.seqno_darro
      GROUP BY l.province_edited
    `).all() as { province_edited: string | null; lh_validated: number; lh_not_validated: number }[];
    let rEncLhV = 0, rEncLhN = 0;
    for (const row of encLh) {
      const p = row.province_edited?.toUpperCase().trim() ?? "";
      if (result[p]) {
        result[p].encoding.lh_validated     = row.lh_validated;
        result[p].encoding.lh_not_validated = row.lh_not_validated;
      }
      rEncLhV += row.lh_validated;
      rEncLhN += row.lh_not_validated;
    }
    result["__REGION__"].encoding.lh_validated     = rEncLhV;
    result["__REGION__"].encoding.lh_not_validated = rEncLhN;

    // ── Distribution agg (grouped by province) ───────────────────────────
    const distAgg = rawDb.prepare(`
      SELECT
        l.province_edited,
        COUNT(*) as cocrom_total,
        SUM(CASE WHEN a.date_distributed IS NOT NULL THEN 1 ELSE 0 END) as cocrom_completed,
        COUNT(DISTINCT a.arb_name) as arb_total,
        COUNT(DISTINCT CASE WHEN a.date_distributed IS NOT NULL THEN a.arb_name END) as arb_completed,
        SUM(CASE WHEN ${IS_CLEAN(AREA_CLEAN)} THEN CAST(${AREA_CLEAN} AS REAL) ELSE 0 END) as area_total,
        SUM(CASE WHEN a.date_distributed IS NOT NULL AND ${IS_CLEAN(AREA_CLEAN)} THEN CAST(${AREA_CLEAN} AS REAL) ELSE 0 END) as area_completed,
        SUM(CASE WHEN ${IS_CLEAN(AMOUNT_CLEAN)} THEN CAST(${AMOUNT_CLEAN} AS REAL) ELSE 0 END) as amount_total,
        SUM(CASE WHEN a.date_distributed IS NOT NULL AND ${IS_CLEAN(AMOUNT_CLEAN)} THEN CAST(${AMOUNT_CLEAN} AS REAL) ELSE 0 END) as amount_completed
      FROM "Arb" a
      JOIN "Landholding" l ON a.seqno_darro = l.seqno_darro
      WHERE a.carpable = 'CARPABLE' AND a.eligibility = 'Eligible' AND a.date_encoded IS NOT NULL
      GROUP BY l.province_edited
    `).all() as { province_edited: string | null; cocrom_total: number; cocrom_completed: number; arb_total: number; arb_completed: number; area_total: number; area_completed: number; amount_total: number; amount_completed: number }[];
    let rDist = { cocrom_total: 0, cocrom_completed: 0, arb_total: 0, arb_completed: 0, area_total: 0, area_completed: 0, amount_total: 0, amount_completed: 0 };
    for (const row of distAgg) {
      const p = row.province_edited?.toUpperCase().trim() ?? "";
      if (result[p]) {
        result[p].distribution.cocrom_total      = row.cocrom_total;
        result[p].distribution.cocrom_completed  = row.cocrom_completed;
        result[p].distribution.arb_total         = row.arb_total;
        result[p].distribution.arb_completed     = row.arb_completed;
        result[p].distribution.area_total        = row.area_total;
        result[p].distribution.area_completed    = row.area_completed;
        result[p].distribution.amount_total      = row.amount_total;
        result[p].distribution.amount_completed  = row.amount_completed;
      }
      rDist.cocrom_total     += row.cocrom_total;
      rDist.cocrom_completed += row.cocrom_completed;
      rDist.arb_total        += row.arb_total;
      rDist.arb_completed    += row.arb_completed;
      rDist.area_total       += row.area_total;
      rDist.area_completed   += row.area_completed;
      rDist.amount_total     += row.amount_total;
      rDist.amount_completed += row.amount_completed;
    }
    Object.assign(result["__REGION__"].distribution, rDist);

    // ── Distribution LH breakdown (grouped by province) ───────────────────
    const distLh = rawDb.prepare(`
      SELECT
        l.province_edited,
        COUNT(CASE WHEN l.amendarea_validated_confirmed = 1 AND l.condoned_amount_confirmed = 1 THEN 1 END) as lh_validated,
        COUNT(CASE WHEN NOT (l.amendarea_validated_confirmed = 1 AND l.condoned_amount_confirmed = 1) THEN 1 END) as lh_not_validated
      FROM (
        SELECT DISTINCT a.seqno_darro
        FROM "Arb" a
        WHERE a.carpable = 'CARPABLE' AND a.eligibility = 'Eligible' AND a.date_distributed IS NOT NULL
      ) dist
      JOIN "Landholding" l ON l.seqno_darro = dist.seqno_darro
      GROUP BY l.province_edited
    `).all() as { province_edited: string | null; lh_validated: number; lh_not_validated: number }[];
    let rDistLhV = 0, rDistLhN = 0;
    for (const row of distLh) {
      const p = row.province_edited?.toUpperCase().trim() ?? "";
      if (result[p]) {
        result[p].distribution.lh_validated     = row.lh_validated;
        result[p].distribution.lh_not_validated = row.lh_not_validated;
      }
      rDistLhV += row.lh_validated;
      rDistLhN += row.lh_not_validated;
    }
    result["__REGION__"].distribution.lh_validated     = rDistLhV;
    result["__REGION__"].distribution.lh_not_validated = rDistLhN;

    // ── CommitmentTarget per province ─────────────────────────────────────
    const commitRows = rawDb.prepare(
      `SELECT province, committed FROM "CommitmentTarget" WHERE region = 'V'`
    ).all() as { province: string | null; committed: number }[];
    for (const row of commitRows) {
      if (row.province === null) {
        result["__REGION__"].committed_cocroms = row.committed;
      } else {
        const p = row.province.toUpperCase().trim();
        if (result[p]) result[p].committed_cocroms = row.committed;
      }
    }

    // ── Assemble response ─────────────────────────────────────────────────
    const provinces: Record<string, BulkEntry> = {};
    for (const p of PROVINCES) provinces[p] = result[p];

    return NextResponse.json({
      region: result["__REGION__"],
      provinces,
    } satisfies BulkProgressResponse);

  } catch (err) {
    console.error("[/api/progress/bulk]", err);
    return NextResponse.json({ error: "Failed to load bulk progress data." }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify the endpoint returns data**

With the dev server running, open in browser (must be logged in):
```
http://localhost:3000/api/progress/bulk
```

Expected: JSON object with `region` key (containing `validation`, `encoding`, `distribution`, `committed_cocroms`) and `provinces` key with entries for all 7 provinces. Each province entry should have non-zero `validation.total`.

- [ ] **Step 3: Commit**

```bash
git add app/api/progress/bulk/route.ts
git commit -m "feat: add /api/progress/bulk endpoint for provincial overview"
```

---

## Task 3: Build `ProvinceOverviewModal`

**Files:**
- Create: `components/ProvinceOverviewModal.tsx`

- [ ] **Step 1: Create `components/ProvinceOverviewModal.tsx`**

```tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  SemiGauge, statusColor, statusLabel,
  fmtAreaShort, fmtAmountShort,
  EncSubfilter,
} from "@/lib/gauge-utils";
import type { BulkEntry, BulkProgressResponse } from "@/app/api/progress/bulk/route";

const PROVINCES = [
  "ALBAY", "CAMARINES NORTE", "CAMARINES SUR - I",
  "CAMARINES SUR - II", "CATANDUANES", "MASBATE", "SORSOGON",
];

const PROVINCE_SHORT: Record<string, string> = {
  "ALBAY":              "ALBAY",
  "CAMARINES NORTE":    "CAM. NORTE",
  "CAMARINES SUR - I":  "CAM. SUR - I",
  "CAMARINES SUR - II": "CAM. SUR - II",
  "CATANDUANES":        "CATANDUANES",
  "MASBATE":            "MASBATE",
  "SORSOGON":           "SORSOGON",
};

type MetricKey = "validation" | "encoding" | "distribution";

const METRIC_ROWS: Record<EncSubfilter, { key: MetricKey; label: string; unit: string }[]> = {
  cocrom: [
    { key: "validation",   label: "VALIDATION",   unit: "LH" },
    { key: "encoding",     label: "ENCODING",     unit: "ARB" },
    { key: "distribution", label: "DISTRIBUTION", unit: "ARB" },
  ],
  arb: [
    { key: "validation",   label: "VALIDATION",   unit: "LH" },
    { key: "encoding",     label: "ENCODING",     unit: "ARB" },
    { key: "distribution", label: "DISTRIBUTION", unit: "ARB" },
  ],
  area: [
    { key: "validation",   label: "VALIDATION",   unit: "LH" },
    { key: "encoding",     label: "ENCODING",     unit: "ARB" },
    { key: "distribution", label: "DISTRIBUTION", unit: "ARB" },
  ],
  amount: [
    { key: "validation",   label: "VALIDATION",   unit: "LH" },
    { key: "encoding",     label: "ENCODING",     unit: "ARB" },
    { key: "distribution", label: "DISTRIBUTION", unit: "ARB" },
  ],
};

// Extract the metric total/completed/color/subA/subB from a BulkEntry for a given row + sub
function resolveMetric(entry: BulkEntry, metricKey: MetricKey, sub: EncSubfilter) {
  const enc  = entry.encoding;
  const dist = entry.distribution;
  const val  = entry.validation;

  let total = 0, completed = 0;

  if (metricKey === "validation") {
    total     = sub === "area" ? val.area_total     : sub === "amount" ? val.amount_total     : val.total;
    completed = sub === "area" ? val.area_completed : sub === "amount" ? val.amount_completed : val.completed;
  } else if (metricKey === "encoding") {
    total     = sub === "cocrom" ? enc.cocrom_total     : sub === "arb" ? enc.arb_total     : sub === "area" ? enc.area_total     : enc.amount_total;
    completed = sub === "cocrom" ? enc.cocrom_completed : sub === "arb" ? enc.arb_completed : sub === "area" ? enc.area_completed : enc.amount_completed;
  } else {
    total     = sub === "cocrom" ? dist.cocrom_total     : sub === "arb" ? dist.arb_total     : sub === "area" ? dist.area_total     : dist.amount_total;
    completed = sub === "cocrom" ? dist.cocrom_completed : sub === "arb" ? dist.arb_completed : sub === "area" ? dist.area_completed : dist.amount_completed;
  }

  const pct   = total > 0 ? (completed / total) * 100 : 0;
  const color = statusColor(pct);

  const fmtVal   = (n: number) => sub === "area" ? fmtAreaShort(n) : sub === "amount" ? fmtAmountShort(n) : n.toLocaleString();
  const verb     = metricKey === "validation" ? "validated" : metricKey === "encoding" ? "encoded" : "distributed";
  const unitMap: Record<EncSubfilter, string> = {
    cocrom: metricKey === "validation" ? "LHs" : metricKey === "encoding" ? "COCROMs" : "COCROMs",
    arb:    metricKey === "validation" ? "LHs" : "ARBs",
    area:   "ha.",
    amount: "",
  };
  const ofMap: Record<EncSubfilter, string> = {
    cocrom: metricKey === "validation" ? "total LHs" : metricKey === "encoding" ? "eligible COCROMs" : "encoded COCROMs",
    arb:    metricKey === "validation" ? "total LHs" : metricKey === "encoding" ? "total ARBs" : "total ARBs",
    area:   metricKey === "validation" ? "ha. total" : "ha. encoded",
    amount: metricKey === "validation" ? "total condoned" : "total",
  };

  const subA = sub === "amount" ? `${fmtAmountShort(completed)} ${verb}`
             : sub === "area"   ? `${fmtAreaShort(completed)} ${verb}`
             : `${completed.toLocaleString()} ${unitMap[sub]} ${verb}`;
  const subB = sub === "amount" ? `of ${fmtAmountShort(total)} ${ofMap[sub]}`
             : sub === "area"   ? `of ${fmtAreaShort(total)} ${ofMap[sub]}`
             : `of ${total.toLocaleString()} ${ofMap[sub]}`;

  return { total, completed, pct, color, subA, subB, fmtVal };
}

/* ── Compact cell ── */
function OverviewCell({
  entry, metricKey, sub, targetDate, isRegion = false,
}: {
  entry:      BulkEntry;
  metricKey:  MetricKey;
  sub:        EncSubfilter;
  targetDate: string;
  isRegion?:  boolean;
}) {
  const deadline  = new Date(`${targetDate}T00:00:00+08:00`);
  const daysLeft  = Math.max(0, Math.floor((deadline.getTime() - Date.now()) / 86400000));
  const weeksLeft = Math.ceil(daysLeft / 7);

  const { total, completed, pct, color, subA, subB, fmtVal } = resolveMetric(entry, metricKey, sub);
  const remaining = total - completed;
  const pace      = weeksLeft > 0 && remaining > 0 ? Math.ceil(remaining / weeksLeft) : 0;
  const label     = statusLabel(pct);

  const bgClass = isRegion ? "bg-green-50 border border-green-200" : "bg-white border border-gray-100";

  return (
    <div className={`rounded-lg ${bgClass} p-2 flex flex-col gap-1 min-w-0`}>
      {/* Status badge */}
      <div className="flex justify-end">
        <span
          className="text-[7px] font-bold px-1.5 py-0.5 rounded-full"
          style={{ background: `${color}22`, color }}
        >
          {label}
        </span>
      </div>

      {/* Count + percentage */}
      <div className="flex items-start justify-between gap-1">
        <div>
          <p className="text-[13px] font-bold leading-none tabular-nums" style={{ color }}>
            {fmtVal(completed)}
          </p>
          <p className="text-[8px] text-gray-400 mt-0.5">of {fmtVal(total)}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[11px] font-bold leading-none tabular-nums" style={{ color }}>
            {total === 0 ? "—" : `${pct.toFixed(1)}%`}
          </p>
          <p className="text-[7px] text-gray-400 mt-0.5">{fmtVal(remaining)} left</p>
        </div>
      </div>

      {/* Gauge */}
      <div className="w-full">
        <SemiGauge
          value={completed} total={total} color={color}
          subA={subA} subB={subB} totalLabel={fmtVal(total)}
        />
      </div>

      {/* Need/wk */}
      <p className="text-[7px] text-gray-400 text-center -mt-1">
        {total === 0 ? "No data" : pace === 0
          ? <span className="text-emerald-600 font-semibold">✓ Target reached</span>
          : <>Need <span className="font-semibold text-gray-600">{fmtVal(pace)}/wk</span></>
        }
      </p>

      {/* Commitment strip — Distribution only, COCROM tab only */}
      {metricKey === "distribution" && sub === "cocrom" && (() => {
        const available  = (entry.distribution.cocrom_total) - (entry.distribution.cocrom_completed);
        const committed  = entry.committed_cocroms;
        const fulfillPct = committed > 0 ? (available / committed) * 100 : 0;
        return (
          <div className="rounded border-l-2 border-sky-400 bg-sky-50 px-2 py-1.5 mt-1">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[6.5px] font-bold uppercase tracking-wide text-sky-500">
                Commitment Fulfillment
              </span>
              <span className="text-[9px] font-bold text-sky-600 tabular-nums">
                {committed > 0 ? `${fulfillPct.toFixed(1)}%` : "—"}
              </span>
            </div>
            {committed > 0 ? (
              <>
                <div className="h-1.5 rounded-full bg-sky-100 overflow-hidden mb-1">
                  <div
                    className="h-full rounded-full bg-sky-400"
                    style={{ width: `${Math.min(fulfillPct, 100).toFixed(1)}%` }}
                  />
                </div>
                <div className="flex justify-between">
                  <span className="text-[6px] text-sky-400">{available.toLocaleString()} avail.</span>
                  <span className="text-[6px] text-sky-400">{committed.toLocaleString()} committed</span>
                </div>
              </>
            ) : (
              <p className="text-[7px] text-sky-400 italic">No target set</p>
            )}
          </div>
        );
      })()}
    </div>
  );
}

/* ── Skeleton cell ── */
function SkeletonCell() {
  return (
    <div className="rounded-lg bg-gray-50 border border-gray-100 p-2 animate-pulse">
      <div className="h-3 bg-gray-200 rounded w-1/2 mb-2" />
      <div className="h-5 bg-gray-200 rounded w-2/3 mb-1" />
      <div className="h-12 bg-gray-100 rounded-full mx-auto w-full mb-1" style={{ borderRadius: "50% 50% 0 0 / 100% 100% 0 0" }} />
      <div className="h-2 bg-gray-200 rounded w-1/2 mx-auto" />
    </div>
  );
}

/* ── Main modal ── */
export function ProvinceOverviewModal({
  open, onClose, activeTab, targetDate, publicToken,
}: {
  open:        boolean;
  onClose:     () => void;
  activeTab:   EncSubfilter;
  targetDate:  string;
  publicToken?: string;
}) {
  const [data, setData]       = useState<BulkProgressResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const captureRef            = useRef<HTMLDivElement>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Fetch on open
  useEffect(() => {
    if (!open) return;
    if (data) return; // already loaded
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (publicToken) params.set("token", publicToken);
    fetch(`/api/progress/bulk${params.toString() ? "?" + params.toString() : ""}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => { setData(json as BulkProgressResponse); setLoading(false); })
      .catch((err) => { setError(`Failed to load data. (${err?.message ?? "unknown"})`); setLoading(false); });
  }, [open, publicToken, data]);

  async function handleExport() {
    if (!captureRef.current) return;
    setExportError(null);
    try {
      const { toPng } = await import("html-to-image");
      const url = await toPng(captureRef.current, { pixelRatio: 2 });
      const a = document.createElement("a");
      a.href = url;
      a.download = `provincial-overview-${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
    } catch (err) {
      console.error("[ProvinceOverviewModal] export", err);
      setExportError("Export failed. Please try again.");
    }
  }

  if (!open) return null;

  const rows = METRIC_ROWS[activeTab];
  const columns = ["REGION V", ...PROVINCES];

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[98vw] max-h-[96vh] overflow-hidden flex flex-col">
        {/* Modal header */}
        <div className="bg-green-900 px-5 py-3 flex items-center justify-between rounded-t-2xl shrink-0">
          <div>
            <h2 className="text-[11px] font-bold text-green-300 uppercase tracking-[0.12em]">
              Accomplishment Overview by Province
            </h2>
            <p className="text-[9px] text-green-500 mt-0.5 uppercase tracking-wide">
              {activeTab.toUpperCase()} · As of {new Date().toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-green-400 hover:text-white text-lg leading-none w-7 h-7 flex items-center justify-center rounded-md hover:bg-green-800 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="overflow-auto flex-1 p-4">
          {error ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <p className="text-red-500 text-sm">{error}</p>
              <button
                onClick={() => { setError(null); setData(null); }}
                className="px-4 py-1.5 rounded-md bg-green-700 text-white text-xs hover:bg-green-800"
              >
                Retry
              </button>
            </div>
          ) : (
            <div ref={captureRef}>
              {/* Column headers row */}
              <div
                className="grid gap-2 mb-2"
                style={{ gridTemplateColumns: `140px repeat(${columns.length}, minmax(0, 1fr))` }}
              >
                <div /> {/* row-label spacer */}
                {columns.map((col) => (
                  <div
                    key={col}
                    className={`text-center text-[8px] font-bold uppercase tracking-wide py-1.5 px-1 rounded-md ${
                      col === "REGION V"
                        ? "bg-green-800 text-green-300"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {col === "REGION V" ? col : PROVINCE_SHORT[col] ?? col}
                  </div>
                ))}
              </div>

              {/* Metric rows */}
              {rows.map(({ key, label, unit }) => (
                <div
                  key={key}
                  className="grid gap-2 mb-3"
                  style={{ gridTemplateColumns: `140px repeat(${columns.length}, minmax(0, 1fr))` }}
                >
                  {/* Row label */}
                  <div className="flex flex-col justify-center pr-2">
                    <span className="text-[9px] font-bold text-gray-600 uppercase tracking-wide">{label}</span>
                    <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded bg-green-100 text-green-700 uppercase tracking-wide w-fit mt-0.5">
                      {unit}
                    </span>
                  </div>

                  {/* Region V cell */}
                  {loading || !data ? (
                    <SkeletonCell />
                  ) : (
                    <OverviewCell
                      entry={data.region}
                      metricKey={key}
                      sub={activeTab}
                      targetDate={targetDate}
                      isRegion
                    />
                  )}

                  {/* Province cells */}
                  {PROVINCES.map((prov) =>
                    loading || !data ? (
                      <SkeletonCell key={prov} />
                    ) : (
                      <OverviewCell
                        key={prov}
                        entry={data.provinces[prov] ?? {
                          committed_cocroms: 0,
                          validation: { total: 0, completed: 0, area_total: 0, area_completed: 0, amount_total: 0, amount_completed: 0 },
                          encoding: { cocrom_total: 0, cocrom_completed: 0, arb_total: 0, arb_completed: 0, area_total: 0, area_completed: 0, amount_total: 0, amount_completed: 0, lh_validated: 0, lh_not_validated: 0 },
                          distribution: { cocrom_total: 0, cocrom_completed: 0, arb_total: 0, arb_completed: 0, area_total: 0, area_completed: 0, amount_total: 0, amount_completed: 0, lh_validated: 0, lh_not_validated: 0 },
                        }}
                        metricKey={key}
                        sub={activeTab}
                        targetDate={targetDate}
                      />
                    )
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-5 py-3 flex items-center justify-between shrink-0 bg-gray-50">
          <div>
            {exportError && <p className="text-[10px] text-red-500">{exportError}</p>}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-md text-[10px] text-gray-500 hover:bg-gray-200 transition-colors"
            >
              Close
            </button>
            <button
              onClick={handleExport}
              disabled={loading || !!error}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-green-700 text-white text-[10px] font-semibold hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 12l-4-4h2.5V2h3v6H12L8 12z"/>
                <rect x="2" y="13" width="12" height="1.5" rx="0.75"/>
              </svg>
              Export as Image
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
```

- [ ] **Step 2: Commit**

```bash
git add components/ProvinceOverviewModal.tsx
git commit -m "feat: add ProvinceOverviewModal component"
```

---

## Task 4: Wire the trigger button in `DashboardProgress`

**Files:**
- Modify: `components/DashboardProgress.tsx`

- [ ] **Step 1: Add import for `ProvinceOverviewModal` at the top of `DashboardProgress.tsx`**

Add after the existing imports:
```tsx
import { ProvinceOverviewModal } from "./ProvinceOverviewModal";
```

- [ ] **Step 2: Add `showOverview` state to `DashboardProgress`**

Inside `DashboardProgress`, after the existing `useState` calls, add:

```tsx
const [showOverview, setShowOverview] = useState(false);
```

- [ ] **Step 3: Add the grid icon button after the tab filter buttons**

In the header section, the tab buttons live in this block:
```tsx
<div className="flex items-center gap-1 self-start shrink-0">
  {(["cocrom", "arb", "area", "amount"] as EncSubfilter[]).map((s) => {
    /* ... existing tab buttons ... */
  })}
</div>
```

Add the overview button inside that same div, after the `.map(...)` closing parenthesis:

```tsx
<button
  onClick={() => setShowOverview(true)}
  title="View all provinces"
  className="ml-1 p-1.5 rounded-md border border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-all"
>
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <rect x="1" y="1" width="5" height="5" rx="1"/>
    <rect x="7" y="1" width="5" height="5" rx="1"/>
    <rect x="13" y="1" width="2" height="5" rx="1"/>
    <rect x="1" y="7" width="5" height="5" rx="1"/>
    <rect x="7" y="7" width="5" height="5" rx="1"/>
    <rect x="13" y="7" width="2" height="5" rx="1"/>
    <rect x="1" y="13" width="5" height="2" rx="1"/>
    <rect x="7" y="13" width="5" height="2" rx="1"/>
    <rect x="13" y="13" width="2" height="2" rx="1"/>
  </svg>
</button>
```

- [ ] **Step 4: Render `ProvinceOverviewModal` at the bottom of the `DashboardProgress` return**

Add just before the closing `</div>` of the main `mt-8 mb-6` wrapper:

```tsx
<ProvinceOverviewModal
  open={showOverview}
  onClose={() => setShowOverview(false)}
  activeTab={sub}
  targetDate={targetDate}
  publicToken={publicToken}
/>
```

- [ ] **Step 5: Manual test — open the modal**

1. Navigate to the dashboard at `http://localhost:3000`
2. Confirm the grid icon appears to the right of the COCROM/ARB/Area/Amount tabs
3. Click the icon — the modal should open with a loading state briefly, then show the 3 metric rows × 8 province columns
4. Switch between COCROM / ARB / Area / Amount tabs and reopen — the modal title should update to match
5. Click Export as Image — a PNG file should download
6. Press Escape or click the backdrop — modal should close
7. On the public view (`/view/[token]`), verify the modal also works (public token is passed through)

- [ ] **Step 6: Commit**

```bash
git add components/DashboardProgress.tsx
git commit -m "feat: add provincial overview modal trigger to Accomplishment Tracker"
```

---

## Self-Review Notes

**Spec coverage check:**
- ✅ Button after province filter tabs with grid icon
- ✅ Opens `ProvinceOverviewModal` via `createPortal`
- ✅ Read-only (no click-to-filter)
- ✅ Table grid: metric rows × province columns
- ✅ Region V first with distinct green background
- ✅ COCROM tab: Validation + Encoding + Distribution rows
- ✅ Mirrors active tab (activeTab prop controls metric selection)
- ✅ Each cell: status badge, percentage, SemiGauge, raw count, need/wk
- ✅ Distribution cells: X3 commitment strip (blue bar, available, committed, fulfillment %)
- ✅ No CommitmentTarget → "No target set"
- ✅ Loading skeleton
- ✅ Fetch error + Retry button
- ✅ Export as Image (html-to-image, existing dependency)
- ✅ `/api/progress/bulk` — single SQL scan grouped by province
- ✅ Regional column derived by summing across provinces
- ✅ CommitmentTarget queried per province in one query
- ✅ Public token auth supported in bulk endpoint
- ✅ Only regional users see the overview (403 for province-level users)
