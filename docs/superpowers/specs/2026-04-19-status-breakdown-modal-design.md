# Status Breakdown Modal Design

## Goal

Add a table icon button to the "Records by Status" chart that opens a modal showing a province × status breakdown table — giving users a full-picture view of all LH counts and validated areas at once.

## Architecture

New API route returns status-by-province aggregated data. A new `StatusBreakdownModal` component (mirrors `ProvinceBreakdownModal`) renders the table in a portal modal. A tiny `StatusBreakdownButton` client component owns modal state and is injected into the Records by Status `ChartCard` via a new optional `action` prop.

## Tech Stack

Next.js 15 App Router, Prisma + better-sqlite3, Tailwind CSS, `html-to-image` (PNG export), `react-dom/client` createPortal, TypeScript.

---

## Section 1 — API Route

**File:** `app/api/dashboard/status-table/route.ts`

### Response Types

```ts
export type StatusTableCell = { count: number; area: number };
export type StatusTableRow  = {
  status: string;
  byProvince: Record<string, StatusTableCell>; // keyed by province name
  total: StatusTableCell;                       // R-V TOTAL column
};
export type StatusTableResponse = {
  rows: StatusTableRow[];         // one per status, in canonical order
  grandTotal: StatusTableRow;     // GRAND TOTAL row
  provinces: string[];            // alphabetically sorted province names
};
```

### Canonical Status Order

```
For Initial Validation
For Further Validation
For Encoding
Partially Encoded
Fully Encoded
Partially Distributed
Fully Distributed
Not Eligible for Encoding
```

Statuses present in data but not in the canonical list are appended at the end.

### Area Field

`area` per cell = `amendarea_validated ?? amendarea` for each matching landholding, summed per (status, province) group.

### Query Logic

1. Fetch all landholdings in scope with `province_edited`, `status`, `amendarea_validated`, `amendarea`:
   ```ts
   prisma.landholding.findMany({
     where: { province_edited: { not: null }, ...(provinceFilter) },
     select: { province_edited, status, amendarea_validated, amendarea }
   })
   ```
2. Accumulate into a `Map<status, Map<province, { count, area }>>` in JS.
3. Derive `provinces` (sorted), `rows` (in canonical order), `grandTotal`.

### Auth

Same dual-auth pattern as `province-table`: session cookie OR `?token=` public token via `validatePublicToken` from `lib/public-token.ts`.

### Query Parameters

- `provinces` (optional): comma-separated province names to filter scope
- `token` (optional): public dashboard token

---

## Section 2 — Component: `StatusBreakdownModal.tsx`

**File:** `components/StatusBreakdownModal.tsx`

### Props

```ts
type Props = {
  open: boolean;
  onClose: () => void;
  selectedProvinces?: string[];
  publicToken?: string;
  hideExport?: boolean;
};
```

### State

```ts
rows: StatusTableRow[]
grandTotal: StatusTableRow | null
provinces: string[]
loading: boolean
error: string | null
exportError: string | null
asOf: string          // formatted timestamp set on successful fetch
```

### Behavior

- Fetches `/api/dashboard/status-table` when `open` becomes true (or `selectedProvinces` changes while open).
- `asOf` timestamp is set from `new Date()` at fetch completion time.
- Escape key closes (document-level `keydown` listener, cleaned up on unmount/close).
- Renders via `createPortal` to `document.body` to escape CSS stacking context.
- Backdrop click closes the modal.

### Table Layout

```
┌──────────────────────┬─────────────────┬─────────────────┬──────────────┐
│ Status               │   Albay         │ Camarines Norte │  R-V TOTAL   │
│                      ├────────┬────────┼────────┬────────┼────────┬─────┤
│                      │  LHs   │  Area  │  LHs   │  Area  │  LHs   │Area │
├──────────────────────┼────────┼────────┼────────┼────────┼────────┼─────┤
│ For Initial Valid.   │  9905  │ 0.0000 │   ...  │  ...   │  ...   │ ... │
│ For Further Valid.   │   431  │ ...    │   ...  │  ...   │  ...   │ ... │
│ ...                  │        │        │        │        │        │     │
├──────────────────────┼────────┼────────┼────────┼────────┼────────┼─────┤
│ GRAND TOTAL          │        │        │        │        │        │     │
└──────────────────────┴────────┴────────┴────────┴────────┴────────┴─────┘
```

- **Sticky `thead`** inside a scrollable container (horizontal + vertical scroll).
- **Sticky first column** (status name) so it stays visible on horizontal scroll.
- Area formatted to 4 decimal places. LH count as integer.
- Grand Total row is bold with a top border.
- Empty cells (no LHs for that status+province) show `—` for LHs and `—` for area.

### Export

- **CSV**: Flattens table into rows. Header: `Status, [Province] LHs, [Province] Area (has.), ..., R-V TOTAL LHs, R-V TOTAL Area (has.)`. Filename: `status-breakdown-YYYY-MM-DD.csv`.
- **PNG**: `toPng()` from `html-to-image` on a `captureRef` div, `pixelRatio: 2`. A hidden title bar (`exportTitleRef`) is revealed during capture showing "Status of Unclassified ARRs (per Landholding)" and the as-of date, then re-hidden after.
- Both export buttons hidden when `hideExport` is true.
- Export errors shown as small footer text (separate `exportError` state) — does not replace table.

### Modal Header

```
Status Breakdown by Province          [×]
as of April 19, 2026 · 10:42 AM
```

---

## Section 3 — Integration

### ChartCard Enhancement

**File:** `components/DashboardCharts.tsx` (or wherever `ChartCard` is defined)

Add optional prop:
```ts
type ChartCardProps = {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;   // NEW — renders in top-right of card header
};
```

The `action` node is rendered in the card header's top-right corner, matching the visual position of the existing table icon in `DashboardClient.tsx`.

### StatusBreakdownButton

**File:** `components/StatusBreakdownButton.tsx` (new, `"use client"`)

```ts
type Props = {
  selectedProvinces?: string[];
  publicToken?: string;
  hideExport?: boolean;
};
```

Owns `open` boolean state. Renders:
1. Grid icon button (same style as existing table icon in `DashboardClient.tsx` — green tint, rounded, hover state).
2. `<StatusBreakdownModal open={open} onClose={() => setOpen(false)} ... />`.

### app/page.tsx

```tsx
<ChartCard
  title="Records by Status"
  action={<StatusBreakdownButton selectedProvinces={selectedProvinces} />}
>
  <StatusWithAreaChart data={statusData} />
</ChartCard>
```

`selectedProvinces` comes from the existing province filter state already on the page.

### app/view/[token]/page.tsx

```tsx
<ChartCard
  title="Records by Status"
  action={
    <StatusBreakdownButton
      publicToken={token}
      hideExport
    />
  }
>
  <StatusWithAreaChart data={statusData} />
</ChartCard>
```

---

## Files Created / Modified

| Action | File |
|--------|------|
| Create | `app/api/dashboard/status-table/route.ts` |
| Create | `components/StatusBreakdownModal.tsx` |
| Create | `components/StatusBreakdownButton.tsx` |
| Modify | `components/DashboardCharts.tsx` — add `action?` prop to `ChartCard` |
| Modify | `app/page.tsx` — pass `action` to Records by Status ChartCard |
| Modify | `app/view/[token]/page.tsx` — same, with `hideExport` + `publicToken` |
| No change | `proxy.ts` — existing `/api/dashboard/` bypass rule already covers the new route |
