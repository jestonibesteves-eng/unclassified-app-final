# Province Breakdown Table Modal — Design Spec

## Goal

Add a table-icon button to the top-right of the "Per Landholding Data" stat group. Clicking it opens a modal with a per-province breakdown table showing scope vs. validated values for Records, LOs, Area, and Amount Condoned — with data bars on the Validated columns and export buttons (CSV and image).

---

## User Story

As a dashboard viewer, I want to see the province-by-province breakdown of the Per Landholding Data group in a table so I can compare validation progress across provinces at a glance.

---

## Feature Details

### Trigger

- A small table-grid icon button is placed in the top-right corner of the `div.flex-[4]` "Per Landholding Data" section inside `DashboardStatCards` (in `components/DashboardClient.tsx`).
- Button style: `w-7 h-7`, white background, `border border-emerald-200`, emerald icon stroke, rounded, subtle shadow.
- Clicking opens `ProvinceBreakdownModal`.

### Modal

- Full-screen overlay (`fixed inset-0 bg-black/40 z-50`), centered card.
- Card max-width: `max-w-5xl w-full`, rounded-xl, white background.
- Header bar: `bg-green-900 text-green-300`, "Province Breakdown — Per Landholding Data", × close button.
- Scrollable table body (horizontal scroll on small screens).
- Footer: left legend note, right-side export buttons.

### Table Structure

Two header rows (standard HTML `<thead>`):

**Row 1 — group headers:**

| Province | No. of Records (colspan 2) | No. of LOs (colspan 2) | Area has. (colspan 2) | Amount Condoned (colspan 2) |
|---|---|---|---|---|

**Row 2 — sub-headers:**

Each group has: `Scope` | `Validated ▪`

- Scope sub-header: muted gray
- Validated sub-header: colored to match metric (green / purple / blue / teal), bold

**Data rows** — one per province (from `province_edited`), alphabetical.

**TOTAL row** — `R-V TOTAL`, `bg-emerald-50`, `border-t-2 border-emerald-300`, bold values.

### Data Bars

The Validated cell for each province and each metric shows:
- A `position: absolute` background div with `linear-gradient(90deg, <color> <pct>%, transparent <pct>%)` where `pct = validated / scope * 100` (clamped 0–100).
- The number and `%` badge are `position: relative` so they sit above the bar.
- Bar colors: Records → `#d1fae5` (emerald-100), LOs → `#ede9fe` (violet-100), Area → `#dbeafe` (blue-100), Amount → `#ccfbf1` (teal-100).
- TOTAL row uses slightly darker bar fills: `#a7f3d0`, `#ddd6fe`, `#bfdbfe`, `#99f6e4`.

### Export Buttons (modal footer)

**Export CSV**
- Secondary outlined button (white bg, gray border).
- Generates CSV inline from the JS data array (no network request).
- Columns: Province, Records Scope, Records Validated, Records %, LOs Scope, LOs Validated, LOs %, Area Scope, Area Validated, Area %, Amount Scope, Amount Validated, Amount %.
- Filename: `province-breakdown-<YYYY-MM-DD>.csv`.

**Export as Image**
- Primary button (`bg-green-900 text-green-300`).
- Uses `html2canvas` (already in the project via `app/api/export/route.ts` — or install if absent).
- Captures the `<div id="province-table-capture">` wrapper (table + header, no footer buttons).
- Downloads as `province-breakdown-<YYYY-MM-DD>.png`.

---

## Data Source

### New API Route: `GET /api/dashboard/province-table`

Returns per-province aggregated data. Accepts `?provinces=A,B` filter (same pattern as the main dashboard).

**Definition of "validated" for this table:**
- A record is "validated" if `status` is not null AND `status != "For Initial Validation"` — i.e., it has been assigned any processing status by an officer.

**Response shape:**
```ts
type ProvinceTableRow = {
  province: string;
  records_scope: number;
  records_validated: number;
  lo_scope: number;          // distinct `lo` values
  lo_validated: number;      // distinct `lo` values for validated records
  area_scope: number;        // sum(amendarea)
  area_validated: number;    // sum(amendarea_validated ?? amendarea) for validated records
  amount_scope: number;      // sum(net_of_reval_no_neg ?? 0)
  amount_validated: number;  // sum(condoned_amount ?? net_of_reval_no_neg ?? 0) for validated records
};

type ProvinceTableResponse = {
  rows: ProvinceTableRow[];   // sorted by province asc
  total: ProvinceTableRow;    // aggregated TOTAL row (province = "R-V TOTAL")
};
```

**Query strategy:** A single `prisma.landholding.findMany` with `province_edited`, `lo`, `amendarea`, `amendarea_validated`, `net_of_reval_no_neg`, `condoned_amount`, `status` — then aggregate in JS (avoids N+1 and complex groupBy limitations).

---

## Component Architecture

### New files
- `app/api/dashboard/province-table/route.ts` — API route
- `components/ProvinceBreakdownModal.tsx` — "use client" modal component

### Modified files
- `components/DashboardClient.tsx` — add icon button + modal render to `DashboardStatCards`

### New npm dependency
- `html2canvas` — for Export as Image

---

## Behaviour Details

- Modal opens on button click; closes on ✕ or backdrop click.
- Data is fetched lazily (on first open) using `useState` + `useEffect`. A loading spinner replaces the table while fetching.
- Province filter from the dashboard URL (`?provinces=`) is passed to the API route via a prop on `ProvinceBreakdownModal`.
- The modal is rendered in both the private dashboard (`app/page.tsx`) and the public dashboard (`app/view/[token]/page.tsx`) since `DashboardStatCards` is shared.
- Percentages display as integers (e.g. `94%`). Division by zero → `0%`.
- Area values: 2 decimal places. Amount values: Philippine Peso with comma-separated thousands, no decimals in the table (use `toLocaleString("en-PH", { maximumFractionDigits: 0 })`).

---

## Out of Scope

- Sorting by column (click to sort)
- Pagination
- Drill-down per province
