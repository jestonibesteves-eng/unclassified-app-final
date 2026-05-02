# Provincial Overview Modal — Design Spec

**Date:** 2026-05-02
**Feature:** Province-at-a-glance modal in the Accomplishment Tracker

---

## Overview

A new icon button in the Accomplishment Tracker header (after the province filter tabs) opens a read-only modal that shows all 7 Region V provinces plus the regional total in a single table-grid view. The modal mirrors whichever metric tab is currently active (COCROM, ARB, Area, or Amount).

---

## Trigger & Button

- Placed to the right of the province filter tabs in the Accomplishment Tracker header
- Uses an image/grid icon (consistent with the existing table-icon button pattern)
- Opens `ProvinceOverviewModal` via `createPortal` (same pattern as `ProvinceBreakdownModal` and `StatusBreakdownModal`)
- No click-to-filter behavior inside the modal — read-only overview only

---

## Layout

### Modal Header
- Title: `ACCOMPLISHMENT OVERVIEW BY PROVINCE · [ACTIVE TAB]` (e.g., `· COCROM`)
- Close (✕) button top-right

### Modal Body — Table Grid
- **Columns:** Row-label column + Region V (first, distinct green background) + 7 province columns (Albay, Camarines Norte, Camarines Sur - I, Camarines Sur - II, Catanduanes, Masbate, Sorsogon)
- **Rows (COCROM tab):** Validation (LH) · Encoding (ARB) · Distribution (ARB)
- **Rows (ARB tab):** Same 3-row structure — each row corresponds to the ARB metric card shown on the main dashboard for that tab
- **Rows (Area tab):** Same 3-row structure — each row corresponds to the Area metric card
- **Rows (Amount tab):** Same 3-row structure — each row corresponds to the Amount metric card
- The commitment strip (X3) only appears on the Distribution row of the COCROM tab; other tabs omit it

### Cell Contents (per metric × province)
Each cell contains:
1. Status badge (e.g., Critical / On Track)
2. Large percentage
3. Semi-gauge SVG (same arc style as main dashboard)
4. Raw count (e.g., `938 / 10,344`)
5. Need X/wk to meet deadline

### Distribution Cell — Additional Commitment Strip (COCROM tab only)
Below the standard cell content, a compact left-bordered blue strip shows:
- Label: `COMMITMENT FULFILLMENT`
- Fulfillment percentage (distributed vs committed to Central Office)
- Progress bar
- Two-line footer: `[N] available` / `[N] committed`

If no `CommitmentTarget` row exists for the province, the strip shows "No target set" instead.

### Modal Footer
- **Export as Image** button (right-aligned) — captures the modal body as PNG using `html-to-image` and triggers a download

---

## New Component

**`components/ProvinceOverviewModal.tsx`**
- Props: `open: boolean`, `onClose: () => void`, `activeTab: "COCROM" | "ARB" | "Area" | "Amount"`
- Rendered via `createPortal` into `document.body`
- Fires fetch on open, shows skeleton while loading, shows inline error + retry on failure

---

## New API Endpoint

**`GET /api/progress/bulk`**

Returns the same data shape as `/api/progress` for all provinces in one request.

### Response Shape
```json
{
  "region": {
    "validation": { "done": 938, "total": 10344, "pct": 9.1, "needPerWeek": 1344, "status": "Critical", "subA": 938, "subB": 9406 },
    "encoding":   { "done": 2380, "total": 12785, "pct": 18.6, "needPerWeek": 1487, "status": "Critical", "subA": 147, "subB": 365 },
    "distribution": { "done": 2108, "total": 2380, "pct": 88.6, "needPerWeek": 39, "status": "On Track", "subA": 120, "subB": 331, "available": 272, "committed": 10786, "commitPct": 2.5 }
  },
  "provinces": {
    "ALBAY": { /* same shape as region */ },
    "CAMARINES NORTE": { /* ... */ },
    "CAMARINES SUR - I": { /* ... */ },
    "CAMARINES SUR - II": { /* ... */ },
    "CATANDUANES": { /* ... */ },
    "MASBATE": { /* ... */ },
    "SORSOGON": { /* ... */ }
  }
}
```

### Implementation
- Single SQL scan over `Landholding` grouped by province — same logic as existing `/api/progress` route, batched
- Single `CommitmentTarget` query for all provinces at once (`WHERE region = 'V'`)
- No province filter parameter needed — always returns all Region V provinces

---

## Error Handling & Edge Cases

| Scenario | Behavior |
|---|---|
| Fetch in-flight | Skeleton cards with gray placeholder gauges |
| Fetch error | Inline error message + Retry button inside modal |
| Province has no `CommitmentTarget` | Distribution strip shows "No target set" |
| Province has zero records | Cell renders with 0% gauge — no crash |
| Export as Image | `html-to-image` captures modal body div, downloads as PNG |

---

## Files Affected

| File | Change |
|---|---|
| `components/ProvinceOverviewModal.tsx` | **New** — modal component |
| `app/api/progress/bulk/route.ts` | **New** — bulk data endpoint |
| `components/DashboardProgress.tsx` | **Edit** — add trigger button, wire modal open state |

---

## Out of Scope

- Clicking a province cell does not navigate or filter the dashboard
- No sorting or reordering of provinces
- No per-province deadline date (all use the same regional target date)
