# Sidebar Redesign — Design Spec

**Date:** 2026-05-20
**Status:** Approved

---

## Overview

Full visual and behavioral redesign of `components/Sidebar.tsx`, `components/MobileHeader.tsx`, and `components/SidebarContext.tsx`. The new sidebar adopts the **L3-A "Rich Header"** aesthetic: a forest green gradient header, color-coded icon chips per nav section, clean white body, JetBrains Mono typography, and a collapsible desktop rail with full mobile responsiveness.

---

## Visual Design

### Header
- Background: `linear-gradient(135deg, #14532d → #15803d → #16a34a)`
- Subtle radial shine overlay (top-right)
- Logo block: rounded square chip (`D`) with frosted glass border + brand name + sub-label
- Online badge: pill with glowing green dot + `Online · vX.X`
- **Toggle button** (`‹` / `›`): top-right of header, collapses/expands the sidebar

### Navigation Body
- Background: `#ffffff`
- Section labels: `5px`, `600` weight, `#94a3b8`, `0.2em` letter-spacing, uppercase
- Nav items: `JetBrains Mono`, `7.5px`, `#64748b` inactive / `#14532d` active
- Active state: `#f0fdf4` background + `2px #16a34a` left border rail
- **Color-coded icon chips** (18×18px, 5px border-radius) per section group:
  - Main (Dashboard, Records): `#dcfce7` bg / `#15803d` icon — green
  - Operations (Batch LH, ARB Batch): `#dbeafe` bg / `#1d4ed8` icon — blue
  - Admin — Users: `#fef3c7` bg / `#d97706` icon — amber
  - Admin — Audit Log: `#fce7f3` bg / `#be185d` icon — rose
  - Admin — Targets / Activity / Digest / Backup: `#ede9fe` bg / `#7c3aed` icon — violet
- Inactive chips: `opacity: 0.5`
- Nested child items (sub-nav): indented, smaller font, dot indicator, same left-border pattern

### Footer
- Background: `#fafafa`, `1px #f1f5f9` top border
- User avatar: 22×28px rounded square, `linear-gradient(135deg, #16a34a, #4ade80)`, initials
- Full name + role label
- Sign out button: below user card, red-tinted on hover

---

## Collapsible Behavior (Desktop)

### Expanded state — `256px` wide
- Full sidebar visible (header, nav labels, item text, footer)
- Toggle button shows `‹` (collapse)

### Collapsed state — `52px` icon rail
- Header shrinks to logo chip + `›` toggle button only (no brand text, no badge)
- Nav shows icon chips only — no text labels, no section headings
- Dividers (`24px` wide `1px #e2e8f0` line) replace section group labels
- Active item: chip stays full color, left border rail preserved
- Footer: avatar chip only (no name/role text)
- Tooltips on hover (native `title` attribute) showing item label

### Transition
- CSS `transition: width 250ms ease` on the `<aside>` element
- Text/labels fade out with `opacity` transition slightly faster (`150ms`) to avoid layout jank
- State persisted in `localStorage` key `sidebar-collapsed`

### Layout spacer
- The `div.hidden.md:block` spacer in `AppShell` must dynamically match sidebar width (`w-64` expanded / `w-[52px]` collapsed)
- Use a CSS custom property or shared context value to drive both

---

## Mobile Behavior

### Top bar (replaces current `MobileHeader`)
- Sticky, `h-12`, `bg-white/95 backdrop-blur-sm`, bottom border
- Left: hamburger icon → opens drawer
- Center: small logo chip + `"Unclassified ARRs"` title (JetBrains Mono)
- Sidebar is **hidden on mobile** — drawer only

### Slide-in drawer
- Slides in from left, same `256px` width as expanded desktop
- Dark backdrop overlay (`bg-black/50`) behind drawer — tap to close
- Drawer header matches desktop gradient header; includes `✕` close button
- Closes automatically on route change (existing behavior preserved)
- Mobile never shows the collapsed/icon-only state

---

## Files Changed

| File | Change |
|------|--------|
| `components/Sidebar.tsx` | Full rewrite — new visual design, collapsed state, tooltips |
| `components/SidebarContext.tsx` | Add `collapsed` / `toggleCollapsed` to context |
| `components/MobileHeader.tsx` | Update styling to match new green header palette |
| `components/AppShell.tsx` | Drive spacer width from sidebar context |

---

## What Stays the Same

- Role-based nav filtering logic (viewer / editor / admin / super_admin)
- Route-change close behavior on mobile
- Logout handler
- Nav group structure (`ALL_NAV_GROUPS`)
- Nested child item rendering for Batch and ARB sections
- `SidebarProvider` wrapping in layout

---

## Constraints

- Must remain fully responsive: tested at 375px (mobile), 768px (tablet), 1280px+ (desktop)
- No third-party animation libraries — CSS transitions only
- JetBrains Mono loaded via Google Fonts (`next/font` or `@import`)
- Existing `SidebarContext` shape extended, not replaced, to avoid breaking consumers
