# Accomplishment Tracker — Gauge Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the line charts in the three Accomplishment Tracker milestone cards with semi-circle SVG gauge charts, remove the period toggle, and strip time-series queries from the API.

**Architecture:** All UI changes are isolated to `components/DashboardProgress.tsx`. A pure `gaugeArc(p)` helper computes the SVG arc path string from a 0–1 progress ratio; `SemiGauge` renders it. The API route loses its three `series` SQL queries and the corresponding response fields. No new dependencies.

**Tech Stack:** Next.js (App Router), React, TypeScript, SVG (no new libraries), better-sqlite3 (API side)

**Spec:** `docs/superpowers/specs/2026-04-21-accomplishment-tracker-gauge-redesign.md`

---

## File Map

| File | Change |
|------|--------|
| `app/api/progress/route.ts` | Remove `valSeries`, `encSeries`, `distSeries` SQL queries and `series` response fields |
| `components/DashboardProgress.tsx` | Remove `MilestoneChart`, period state/toggle, progress bars; add `gaugeArc`, `SemiGauge`; refactor `SimpleCard`, `EncodingCard`, `SkeletonCard` |

---

## Task 1: Strip series from API route

**Files:**
- Modify: `app/api/progress/route.ts`

- [ ] **Step 1: Remove `valSeries` query and its response field**

In `app/api/progress/route.ts`, delete these lines (approximately lines 71–84):

```ts
// DELETE THIS ENTIRE BLOCK:
const valSeries = rawDb.prepare(`
  SELECT ${auditFmt} as d, COUNT(DISTINCT al.seqno_darro) as n
  FROM "AuditLog" al
  JOIN "Landholding" l ON al.seqno_darro = l.seqno_darro
  WHERE (
    (al.field_changed IN ('condoned_amount_confirmed','amendarea_validated_confirmed')
      AND al.new_value = '1')
    OR (al.field_changed = 'status' AND al.new_value = 'Not Eligible for Encoding')
  )
  AND al.created_at >= date('now','${lookback}')
  ${lhWhere}
  GROUP BY ${auditFmt}
  ORDER BY d ASC
`).all() as { d: string; n: number }[];
```

- [ ] **Step 2: Remove `encSeries` query**

Delete this block (approximately lines 113–131):

```ts
// DELETE THIS ENTIRE BLOCK:
const encSeries = rawDb.prepare(`
  SELECT
    ${encFmt} as d,
    COUNT(*) as cocrom,
    COUNT(DISTINCT a.arb_name) as arb,
    SUM(CASE WHEN ${IS_CLEAN(AREA_CLEAN)}
        THEN CAST(${AREA_CLEAN} AS REAL) ELSE 0 END) as area,
    SUM(CASE WHEN ${IS_CLEAN(AMOUNT_CLEAN)}
        THEN CAST(${AMOUNT_CLEAN} AS REAL) ELSE 0 END) as amount
  FROM "Arb" a
  JOIN "Landholding" l ON a.seqno_darro = l.seqno_darro
  WHERE a.carpable = 'CARPABLE' AND a.eligibility = 'Eligible'
    AND ${ENC_STATUSES}
    AND a.date_encoded IS NOT NULL
    AND ${ENC_DATE} >= date('now','${lookback}')
    ${lhWhere}
  GROUP BY ${encFmt}
  ORDER BY d ASC
`).all() as { d: string; cocrom: number; arb: number; area: number; amount: number }[];
```

- [ ] **Step 3: Remove `distSeries` query**

Delete this block (approximately lines 147–157):

```ts
// DELETE THIS ENTIRE BLOCK:
const distSeries = rawDb.prepare(`
  SELECT ${auditFmt} as d, COUNT(*) as n
  FROM "AuditLog" al
  JOIN "Landholding" l ON al.seqno_darro = l.seqno_darro
  WHERE al.field_changed = 'date_distributed'
    AND al.new_value IS NOT NULL AND al.new_value != ''
    AND al.created_at >= date('now','${lookback}')
    ${lhWhere}
  GROUP BY ${auditFmt}
  ORDER BY d ASC
`).all() as { d: string; n: number }[];
```

- [ ] **Step 4: Remove `series` from the JSON response and strip now-unused variables**

Replace the `return NextResponse.json({...})` block with:

```ts
return NextResponse.json({
  period,
  validation: {
    total:     valTotal,
    completed: valCompleted,
  },
  encoding: {
    cocrom_total:     encAgg?.cocrom_total     ?? 0,
    cocrom_completed: encAgg?.cocrom_completed ?? 0,
    arb_total:        encAgg?.arb_total        ?? 0,
    arb_completed:    encAgg?.arb_completed    ?? 0,
    area_total:       encAgg?.area_total       ?? 0,
    area_completed:   encAgg?.area_completed   ?? 0,
    amount_total:     encAgg?.amount_total     ?? 0,
    amount_completed: encAgg?.amount_completed ?? 0,
  },
  distribution: {
    total:     distTotal,
    completed: distCompleted,
  },
});
```

Also delete these now-unused variables at the top of the `GET` handler:

```ts
// DELETE these — no longer needed without series queries:
const rawPeriod = req.nextUrl.searchParams.get("period") ?? "week";
const period    = (["day", "week", "month"].includes(rawPeriod) ? rawPeriod : "week") as ...

const auditFmt = ...
const encFmt   = ...
const lookback = ...
```

- [ ] **Step 5: Verify the API compiles**

```bash
npx tsc --noEmit
```

Expected: no errors related to `route.ts`.

- [ ] **Step 6: Commit**

```bash
git add app/api/progress/route.ts
git commit -m "feat: remove time-series queries from progress API"
```

---

## Task 2: Update TypeScript interfaces in DashboardProgress

**Files:**
- Modify: `components/DashboardProgress.tsx` (top of file, interfaces only)

- [ ] **Step 1: Remove `PeriodType` and period-related config**

Delete these declarations (approximately lines 9–11, 51–57):

```ts
// DELETE:
type PeriodType   = "day" | "week" | "month";
type EncSubfilter = "cocrom" | "arb" | "area" | "amount";

// DELETE:
const PERIOD_LABELS: Record<PeriodType, string> = {
  day: "Daily", week: "Weekly", month: "Monthly",
};

// DELETE these two functions:
function formatDateLabel(date: string, period: PeriodType): string { ... }
// (the entire function body)
```

Keep `EncSubfilter` — it's still used by `EncodingCard`.

Also delete the `periodsLeft` helper function — it takes a `PeriodType` argument and is only used by the old `SimpleCard`/`EncodingCard` pace calculation (replaced in Tasks 4–5 with a direct weeks calculation):

```ts
// DELETE:
function periodsLeft(period: PeriodType): number { ... }
```

- [ ] **Step 2: Update `SimpleMilestone` interface — remove `series`**

Replace:

```ts
interface SimpleMilestone {
  total:     number;
  completed: number;
  series:    { date: string; count: number }[];
}
```

With:

```ts
interface SimpleMilestone {
  total:     number;
  completed: number;
}
```

- [ ] **Step 3: Update `EncodingData` interface — remove `series`**

Replace:

```ts
interface EncodingData {
  cocrom_total:     number;
  cocrom_completed: number;
  arb_total:        number;
  arb_completed:    number;
  area_total:       number;
  area_completed:   number;
  amount_total:     number;
  amount_completed: number;
  series: { date: string; cocrom: number; arb: number; area: number; amount: number }[];
}
```

With:

```ts
interface EncodingData {
  cocrom_total:     number;
  cocrom_completed: number;
  arb_total:        number;
  arb_completed:    number;
  area_total:       number;
  area_completed:   number;
  amount_total:     number;
  amount_completed: number;
}
```

- [ ] **Step 4: Update `ProgressResponse` — remove `period` field**

Replace:

```ts
interface ProgressResponse {
  period:       PeriodType;
  validation:   SimpleMilestone;
  encoding:     EncodingData;
  distribution: SimpleMilestone;
}
```

With:

```ts
interface ProgressResponse {
  validation:   SimpleMilestone;
  encoding:     EncodingData;
  distribution: SimpleMilestone;
}
```

- [ ] **Step 5: Verify no type errors**

```bash
npx tsc --noEmit
```

Expected: errors about missing `series` property usages — that's expected, we'll fix them in subsequent tasks.

- [ ] **Step 6: Commit**

```bash
git add components/DashboardProgress.tsx
git commit -m "refactor: remove series/period types from DashboardProgress"
```

---

## Task 3: Add `gaugeArc` helper and `SemiGauge` component

**Files:**
- Modify: `components/DashboardProgress.tsx` (add after the imports / config section, before `SimpleCard`)

- [ ] **Step 1: Remove the `MilestoneChart` component**

Delete the entire `MilestoneChart` function (approximately lines 83–155 in the original file). It accepts `chartData`, `accent`, `pace`, `period`, `label` and renders a `LineChart`. Delete it entirely.

Also remove the `LineChart, Line, ReferenceLine` imports from the recharts import at the top of the file — they are no longer used:

```ts
// Change this:
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";

// To: (remove recharts import entirely — no recharts used in this file anymore)
// DELETE the recharts import line
```

- [ ] **Step 2: Add `gaugeArc` pure function**

Add this function after the `fmtCount` helpers and before `SemiGauge`:

```ts
/**
 * Computes the SVG arc path for a semi-circle gauge.
 * The gauge spans from (24,112) on the left to (196,112) on the right,
 * going counter-clockwise over the top (viewBox 0 0 220 130, center 110,112, radius 86).
 *
 * p=0 → no arc rendered (returns null)
 * p=1 → full semi-circle
 */
function gaugeArc(p: number): string | null {
  const clamped = Math.min(Math.max(p, 0), 1);
  if (clamped < 0.003) return null; // nothing to draw

  // Full arc: direct path from left to right point
  if (clamped >= 0.999) return "M 24 112 A 86 86 0 0 0 196 112";

  // Partial arc: compute endpoint
  // Angle starts at π (left point) and sweeps toward 0 (right point)
  const angle = Math.PI * (1 - clamped);
  const ex = (110 + 86 * Math.cos(angle)).toFixed(3);
  const ey = (112 - 86 * Math.sin(angle)).toFixed(3);
  return `M 24 112 A 86 86 0 0 0 ${ex} ${ey}`;
}
```

- [ ] **Step 3: Add `SemiGauge` component**

Add this component immediately after `gaugeArc`:

```tsx
function SemiGauge({
  value,
  total,
  color,
  line1,
  line2,
}: {
  value:    number;
  total:    number;
  color:    string;
  line1:    string; // e.g. "22 validated"
  line2:    string; // e.g. "0.2% of 10,344 landholdings"
}) {
  const p    = total > 0 ? value / total : 0;
  const path = gaugeArc(p);

  return (
    <svg viewBox="0 0 220 130" width="100%" aria-hidden>
      {/* Track */}
      <path
        d="M 24 112 A 86 86 0 0 0 196 112"
        fill="none" stroke="#f1f5f9" strokeWidth="22" strokeLinecap="round"
      />
      {/* Progress */}
      {path && (
        <path
          d={path}
          fill="none" stroke={color} strokeWidth="22" strokeLinecap="round"
        />
      )}
      {/* Min label */}
      <text x="16" y="126" fontSize="9" fill="#cbd5e1" textAnchor="middle">0</text>
      {/* Max label */}
      <text x="204" y="126" fontSize="9" fill="#cbd5e1" textAnchor="middle">
        {total.toLocaleString()}
      </text>
      {/* Center: line 1 */}
      <text x="110" y="95" fontSize="13" fontWeight="800" fill={color} textAnchor="middle">
        {line1}
      </text>
      {/* Center: line 2 */}
      <text x="110" y="110" fontSize="9" fill="#94a3b8" textAnchor="middle">
        {line2}
      </text>
    </svg>
  );
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: errors only in `SimpleCard` and `EncodingCard` (still referencing old props) — not in `SemiGauge` itself.

- [ ] **Step 5: Commit**

```bash
git add components/DashboardProgress.tsx
git commit -m "feat: add gaugeArc helper and SemiGauge SVG component"
```

---

## Task 4: Refactor `SimpleCard` (Validation + Distribution)

**Files:**
- Modify: `components/DashboardProgress.tsx` (`SimpleCard` function)

- [ ] **Step 1: Replace `SimpleCard` entirely**

Delete the existing `SimpleCard` function and replace it with:

```tsx
function SimpleCard({
  title,
  accent,
  data,
}: {
  title:  string;
  accent: string;
  data:   SimpleMilestone;
}) {
  const pct       = data.total > 0 ? (data.completed / data.total) * 100 : 0;
  const remaining = data.total - data.completed;
  const weeksLeft = Math.ceil(daysToDeadline() / 7);
  const pace      = weeksLeft > 0 && remaining > 0
    ? Math.ceil(remaining / weeksLeft)
    : 0;
  const col = statusColors(pct);

  const verb  = title === "Validation" ? "validated" : "distributed";
  const noun  = title === "Validation" ? "landholdings" : "ARBs";
  const line1 = `${data.completed.toLocaleString()} ${verb}`;
  const line2 = `${pct.toFixed(1)}% of ${data.total.toLocaleString()} ${noun}`;

  return (
    <div className="card-bezel">
      <div className="card-bezel-inner">
        <div className="bg-green-900 px-5 py-2.5 rounded-t-[17px]">
          <h3 className="text-[10px] font-semibold text-green-300 uppercase tracking-[0.13em]">{title}</h3>
        </div>

        {/* Stats row */}
        <div className="px-5 pt-4 pb-2 flex items-start justify-between gap-2">
          <div>
            <p className={`text-[1.6rem] font-bold tabular-nums leading-none ${col.text}`}>
              {data.completed.toLocaleString()}
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">of {data.total.toLocaleString()}</p>
          </div>
          <div className="text-right">
            <p className={`text-[1.1rem] font-bold tabular-nums leading-none ${col.text}`}>
              {pct.toFixed(1)}%
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">{remaining.toLocaleString()} left</p>
          </div>
        </div>

        {/* Gauge */}
        <div className="px-4">
          <SemiGauge
            value={data.completed}
            total={data.total}
            color={accent}
            line1={line1}
            line2={line2}
          />
        </div>

        {/* Required pace */}
        <div className="px-5 pb-5 text-center">
          {pace === 0 ? (
            <p className="text-[10px] font-semibold text-emerald-600">✓ Target reached</p>
          ) : (
            <p className="text-[10px] text-gray-500">
              Need <span className="font-bold text-gray-700">{pace.toLocaleString()}/wk</span> to meet deadline
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles (SimpleCard only)**

```bash
npx tsc --noEmit
```

Expected: `SimpleCard`-related errors gone; only `EncodingCard` errors remain.

- [ ] **Step 3: Commit**

```bash
git add components/DashboardProgress.tsx
git commit -m "feat: refactor SimpleCard to use SemiGauge"
```

---

## Task 5: Refactor `EncodingCard`

**Files:**
- Modify: `components/DashboardProgress.tsx` (`EncodingCard` function)

- [ ] **Step 1: Replace `EncodingCard` entirely**

Delete the existing `EncodingCard` and replace with:

```tsx
function EncodingCard({ data }: { data: EncodingData }) {
  const [sub, setSub] = useState<EncSubfilter>("cocrom");
  const cfg = ENC_SUB_CFG[sub];

  const total     = sub === "cocrom" ? data.cocrom_total
                  : sub === "arb"    ? data.arb_total
                  : sub === "area"   ? data.area_total
                  :                   data.amount_total;

  const completed = sub === "cocrom" ? data.cocrom_completed
                  : sub === "arb"    ? data.arb_completed
                  : sub === "area"   ? data.area_completed
                  :                   data.amount_completed;

  const pct       = total > 0 ? (completed / total) * 100 : 0;
  const remaining = total - completed;
  const weeksLeft = Math.ceil(daysToDeadline() / 7);
  const pace      = weeksLeft > 0 && remaining > 0
    ? Math.ceil(remaining / weeksLeft)
    : 0;
  const col = statusColors(pct);

  const fmtVal = (n: number) =>
    sub === "area"   ? fmtArea(n)
    : sub === "amount" ? fmtAmount(n)
    : fmtCount(n);

  const unitLabel = sub === "cocrom" ? "COCROMs"
                  : sub === "arb"    ? "ARBs"
                  : sub === "area"   ? "ha."
                  :                   "condoned amt";

  const line1 = `${fmtVal(completed)} encoded`;
  const line2 = `${pct.toFixed(1)}% of ${fmtVal(total)} ${unitLabel}`;

  return (
    <div className="card-bezel">
      <div className="card-bezel-inner">
        <div className="bg-green-900 px-5 py-2.5 rounded-t-[17px]">
          <h3 className="text-[10px] font-semibold text-green-300 uppercase tracking-[0.13em]">Encoding</h3>
        </div>

        {/* Subfilter tabs */}
        <div className="px-5 pt-3 pb-0 flex gap-1">
          {(["cocrom", "arb", "area", "amount"] as EncSubfilter[]).map((s) => {
            const c = ENC_SUB_CFG[s];
            const active = sub === s;
            return (
              <button
                key={s}
                onClick={() => setSub(s)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all border ${
                  active
                    ? "border-current bg-white shadow-sm"
                    : "border-transparent text-gray-400 hover:text-gray-600 bg-gray-50"
                }`}
                style={active ? { color: c.accent, borderColor: c.accent } : undefined}
              >
                {c.label}
              </button>
            );
          })}
        </div>

        {/* Stats row */}
        <div className="px-5 pt-3 pb-2 flex items-start justify-between gap-2">
          <div>
            <p className={`text-[1.6rem] font-bold tabular-nums leading-none ${col.text}`}>
              {fmtVal(completed)}
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">of {fmtVal(total)}</p>
          </div>
          <div className="text-right">
            <p className={`text-[1.1rem] font-bold tabular-nums leading-none ${col.text}`}>
              {pct.toFixed(1)}%
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">{fmtVal(remaining)} left</p>
          </div>
        </div>

        {/* Gauge */}
        <div className="px-4">
          <SemiGauge
            value={completed}
            total={total}
            color={cfg.accent}
            line1={line1}
            line2={line2}
          />
        </div>

        {/* Required pace */}
        <div className="px-5 pb-5 text-center">
          {pace === 0 ? (
            <p className="text-[10px] font-semibold text-emerald-600">✓ Target reached</p>
          ) : (
            <p className="text-[10px] text-gray-500">
              Need <span className="font-bold text-gray-700">{fmtVal(pace)}/wk</span> to meet deadline
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript is clean**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add components/DashboardProgress.tsx
git commit -m "feat: refactor EncodingCard to use SemiGauge with subfilter tabs"
```

---

## Task 6: Update `SkeletonCard` and header; clean up `DashboardProgress`

**Files:**
- Modify: `components/DashboardProgress.tsx` (`SkeletonCard`, `DashboardProgress` main component)

- [ ] **Step 1: Replace `SkeletonCard`**

Delete the existing `SkeletonCard` and replace with:

```tsx
function SkeletonCard() {
  return (
    <div className="card-bezel animate-pulse">
      <div className="card-bezel-inner">
        <div className="bg-gray-200 h-9 rounded-t-[17px]" />
        <div className="p-5">
          <div className="flex justify-between mb-4">
            <div className="h-8 bg-gray-100 rounded w-1/4" />
            <div className="h-6 bg-gray-100 rounded w-1/5" />
          </div>
          {/* Semi-circle gauge skeleton */}
          <div className="flex justify-center">
            <div
              className="bg-gray-100"
              style={{
                width: "100%",
                height: "96px",
                borderRadius: "50% 50% 0 0 / 100% 100% 0 0",
              }}
            />
          </div>
          <div className="h-3 bg-gray-100 rounded w-2/5 mx-auto mt-4" />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update `DashboardProgress` main component — remove period state and load logic**

In the `DashboardProgress` function, replace the state declarations and `load` callback:

```tsx
// BEFORE — delete all of this:
const [period, setPeriod]     = useState<PeriodType>("week");
const [response, setResponse] = useState<ProgressResponse | null>(null);
const [loading, setLoading]   = useState(true);

const load = useCallback(async (p: PeriodType) => {
  setLoading(true);
  try {
    const res  = await fetch(`/api/progress?period=${p}`);
    const json = await res.json();
    if (json?.validation && json?.encoding && json?.distribution) {
      setResponse(json as ProgressResponse);
    }
  } catch (e) {
    console.error("Progress fetch error:", e);
  } finally {
    setLoading(false);
  }
}, []);

useEffect(() => { load(period); }, [period, load]);
```

```tsx
// AFTER — replace with:
const [response, setResponse] = useState<ProgressResponse | null>(null);
const [loading, setLoading]   = useState(true);

useEffect(() => {
  let cancelled = false;
  (async () => {
    try {
      const res  = await fetch("/api/progress");
      const json = await res.json();
      if (!cancelled && json?.validation && json?.encoding && json?.distribution) {
        setResponse(json as ProgressResponse);
      }
    } catch (e) {
      console.error("Progress fetch error:", e);
    } finally {
      if (!cancelled) setLoading(false);
    }
  })();
  return () => { cancelled = true; };
}, []);
```

- [ ] **Step 3: Remove period toggle from the header JSX**

In the `return (...)` of `DashboardProgress`, delete the period toggle button group:

```tsx
// DELETE this entire block:
<div className="flex gap-1 p-1 bg-gray-100 rounded-lg self-start flex-shrink-0">
  {(["day", "week", "month"] as PeriodType[]).map((p) => (
    <button
      key={p}
      onClick={() => setPeriod(p)}
      className={`px-3 py-1 rounded-md text-[11px] font-semibold transition-all ${
        period === p ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"
      }`}
    >
      {PERIOD_LABELS[p]}
    </button>
  ))}
</div>
```

- [ ] **Step 4: Update the cards render block — remove `period` prop**

Find the grid render block and replace:

```tsx
// BEFORE:
<SimpleCard  title="Validation"   accent="#3b82f6" data={response.validation}   period={period} />
<EncodingCard                                       data={response.encoding}     period={period} />
<SimpleCard  title="Distribution" accent="#10b981" data={response.distribution} period={period} />

// AFTER:
<SimpleCard  title="Validation"   accent="#3b82f6" data={response.validation}   />
<EncodingCard                                       data={response.encoding}     />
<SimpleCard  title="Distribution" accent="#10b981" data={response.distribution} />
```

- [ ] **Step 5: Remove unused imports**

Remove `useCallback` from the React import if `useCallback` is no longer used:

```ts
// Change:
import { useState, useEffect, useCallback } from "react";
// To:
import { useState, useEffect } from "react";
```

- [ ] **Step 6: Final TypeScript check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 7: Commit**

```bash
git add components/DashboardProgress.tsx
git commit -m "feat: update SkeletonCard and DashboardProgress header for gauge redesign"
```

---

## Task 7: Browser verification

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Open the dashboard and verify Validation card**

Navigate to the dashboard. In the Accomplishment Tracker section:
- Validation card shows a semi-circle gauge with a tiny red arc (0.2% complete)
- Stats row above: "22" in red on the left, "0.2%" and "10,322 left" on the right
- Gauge center: "22 validated" / "0.2% of 10,344 landholdings"
- Below gauge: "Need 1,291/wk to meet deadline"
- No period toggle anywhere in the section
- No progress bar below the stats row

- [ ] **Step 3: Verify Distribution card**

- Gauge shows roughly 43% of the arc filled in amber
- Below gauge: "Need 505/wk to meet deadline"

- [ ] **Step 4: Verify Encoding card**

- COCROM tab active by default: gauge shows full amber arc (100%)
- Below gauge: "✓ Target reached"
- Click ARB tab: gauge and stats update to ARB numbers, color changes to purple (#8b5cf6)
- Click Area tab: gauge updates to area figures in cyan (#06b6d4), values show "ha." suffix
- Click Amount tab: gauge updates to amount in orange (#f97316), values show ₱ prefix

- [ ] **Step 5: Verify skeleton state**

Temporarily add a `setTimeout` delay in the fetch, reload the page, observe:
- Skeleton shows semi-circle shaped grey placeholder (not a rectangle)
- Remove the delay after confirming

- [ ] **Step 6: Verify mobile layout**

Resize browser to 375px width:
- Cards stack vertically (single column)
- Gauge SVG scales correctly within card width

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat: complete accomplishment tracker gauge redesign"
```
