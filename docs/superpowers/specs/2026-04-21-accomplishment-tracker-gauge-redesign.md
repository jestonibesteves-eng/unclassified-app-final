# Accomplishment Tracker — Gauge Redesign Spec

**Date:** 2026-04-21
**Status:** Approved

## Goal

Replace the line charts in the three Accomplishment Tracker milestone cards (Validation, Encoding, Distribution) with semi-circle gauge charts that show cumulative progress toward a fixed 100% target. Remove the period toggle and redundant progress bar. Keep the required pace label below each gauge.

## What Changes

### Components

**`components/DashboardProgress.tsx`** — primary file. All changes are here.

1. **Remove `MilestoneChart`** — the shared line chart sub-component. No longer used.
2. **Remove period state and toggle** — `PeriodType`, `period` state, `periodsLeft()`, `PERIOD_LABELS`, and the Daily/Weekly/Monthly button group in the header.
3. **Add `SemiGauge`** — a new internal SVG component that renders a semi-circle gauge:
   - Accepts: `value` (completed), `total` (target), `color` (hex string)
   - Renders a grey track arc and a colored progress arc from 0° to `(value/total)*180°`
   - Center label: `"{value} {unit}"` on line 1, `"{pct}% of {total} {unitPlural}"` on line 2
   - Min/max labels: `0` on the left end, `total.toLocaleString()` on the right end
   - Color follows existing `statusColors(pct)` logic: red < 50%, amber 50–79%, green ≥ 80%
4. **Refactor `SimpleCard`** (used for Validation and Distribution):
   - Remove progress bar `<div>` — gauge handles visual progress
   - Replace `<MilestoneChart>` with `<SemiGauge>`
   - Add required pace label below the gauge: `"Need {pace}/wk to meet deadline"` or `"✓ Target reached"` if pace is 0
5. **Refactor `EncodingCard`**:
   - Same as SimpleCard changes above
   - Keep the 4 subfilter tabs (COCROM / ARB / Area / Amount) — they now control which metric the gauge displays
   - The gauge switches `value`, `total`, `color`, and center label text when a tab is selected
   - `fmtArea` / `fmtAmount` formatting applies to center label for Area and Amount tabs

### API

**`app/api/progress/route.ts`** — minor cleanup.

- Remove the three `series` SQL queries (`valSeries`, `encSeries`, `distSeries`) — no longer consumed by the UI
- Remove `series` fields from the JSON response
- `ProgressResponse` type in `DashboardProgress.tsx` updated to drop `series` from all three milestone interfaces

### Types

Update interfaces in `DashboardProgress.tsx`:
```ts
interface SimpleMilestone {
  total:     number;
  completed: number;
  // series removed
}

interface EncodingData {
  cocrom_total: number; cocrom_completed: number;
  arb_total:    number; arb_completed:    number;
  area_total:   number; area_completed:   number;
  amount_total: number; amount_completed: number;
  // series removed
}
```

## Gauge Arc Math

The SVG arc spans 180° (a half-circle). Given a viewBox of `0 0 220 130` and center `(110, 112)` with radius `86`:

- Start point (0%): `(24, 112)`
- End point (100%): `(196, 112)`
- For progress `p` (0–1), the arc end point:
  - `angle = Math.PI - p * Math.PI` (radians from right, going counter-clockwise)
  - `x = 110 + 86 * Math.cos(angle)`
  - `y = 112 - 86 * Math.sin(angle)` (SVG y-axis inverted)
  - Use `large-arc-flag = p > 0.5 ? 1 : 0`

Minimum visible arc: if `p < 0.005`, render a short nub (2px arc) so the progress color is always visible.

## Layout — Card Structure (Option B)

```
┌─────────────────────────────────┐
│ [dark green header] VALIDATION  │
├─────────────────────────────────┤
│  22          0.2%               │
│  of 10,344   10,322 left        │
│                                 │
│    ╭────── gauge arc ──────╮    │
│  0 ████░░░░░░░░░░░░░░ 10,344   │
│       22 validated              │
│      0.2% of 10,344             │
│                                 │
│  Need 1,291/wk to meet deadline │
└─────────────────────────────────┘
```

No separate progress bar — the gauge is the only progress indicator.

## Encoding Card Subfilter Behavior

| Tab    | `value`          | `total`          | Center unit  | Color accent |
|--------|-----------------|-----------------|--------------|-------------|
| COCROM | cocrom_completed | cocrom_total    | COCROMs      | #f59e0b     |
| ARB    | arb_completed   | arb_total       | ARBs         | #8b5cf6     |
| Area   | area_completed  | area_total      | ha.          | #06b6d4     |
| Amount | amount_completed| amount_total    | (₱ amount)   | #f97316     |

The status color (red/amber/green) always reflects the percentage of the active tab.

## Required Pace Label

- Calculated as: `remaining / weeksToDeadline`
- `weeksToDeadline` derived from the existing `daysToDeadline()` helper: `Math.ceil(daysLeft / 7)`
- If `remaining <= 0`, show `"✓ Target reached"` in green instead of the pace text
- Unit is always `/wk` (weekly pace only — no daily/monthly variants since the period toggle is removed)

## Skeleton State

`SkeletonCard` currently renders a `h-36 bg-gray-100 rounded` placeholder for the line chart. Update it to render a semi-circle shaped placeholder — a `w-full h-32` div with a centered half-oval using `border-radius: 50% 50% 0 0` — to match the gauge shape during loading.

## Out of Scope

- Province-level breakdown inside cards
- Status badge (Critical / At Risk / On Track) in card header
- Projected completion date
- Any changes to other dashboard sections
