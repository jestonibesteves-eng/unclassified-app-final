# Skeleton Loader Design

## Goal

Show an animated skeleton screen while the dashboard page is loading, so users see meaningful structure instead of a blank/spinning page.

## Approach

**Option A — `app/loading.tsx` (full-page skeleton)**

Next.js App Router automatically renders `app/loading.tsx` while the page's async data fetching resolves. When data is ready, Next.js swaps in the real page. No changes to the server component or data-fetching logic are needed.

## Architecture

- **New file:** `app/loading.tsx` — a single static React component (no data fetching, no state)
- **No existing files modified** — pure additive change
- The skeleton mirrors the visual weight and layout of the real dashboard exactly, section by section

## Sections Covered

All 7 dashboard sections get skeleton treatment:

| Section | Real UI | Skeleton |
|---|---|---|
| Header | Badge, title, subtitle, action buttons | Gray pulse blocks at matching sizes |
| Stat Cards — Per Landholding | 4-col grid of metric cards | 4 cards, each with label/value/sub-value blocks |
| Stat Cards — Per ARB | 2-col grid | 2 cards with same structure |
| Issue Strip | Horizontal flag bar | Single row with pill-shaped blocks |
| Charts Row | Records per Province + Records by Status (side by side) | Two chart cards with bar-row blocks |
| COCROM Charts Row | Encoding + Distribution charts | Full-width card with 2-col inner layout |
| Accomplishment Tracker | 3-col grid with Daily/Weekly/Monthly | Card with header buttons + 3 inner chart cards |
| Not Eligible | By Province + By Reason (side by side) | Two chart cards |

## Visual Style

- Skeleton blocks use `bg-gray-200 animate-pulse rounded` (Tailwind)
- Darker `bg-gray-300` for prominent elements (chart card headers, large values)
- All blocks sized to match the real element's visual weight (not pixel-perfect, but proportionally correct)
- Green primary color is NOT used in the skeleton — pure gray palette

## Constraints

- Must be fully responsive (mobile, tablet, desktop) matching the real dashboard's responsive breakpoints
- No JavaScript logic — pure JSX/CSS
- No imports from components that do data fetching

## File

- `app/loading.tsx` — new file
