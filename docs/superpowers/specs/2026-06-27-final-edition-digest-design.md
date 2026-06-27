# Final Edition Weekly Digest — Design Spec

**Date:** 2026-06-27
**System:** Unclassified ARRs Data Management System
**Status:** Approved

---

## Overview

A "Final Edition" special treatment applied to the last weekly digest sent before the June 30, 2026 Regional Title and COCROM Distribution event. The digest auto-sends every Monday at 7:00 AM PHT; the last send is **June 29, 2026**, covering the week of June 22–28. This spec defines what makes that send visually and tonally distinct from all previous digests.

The Final Edition is auto-detected but overridable. No manual content editing is required — all special content is generated automatically.

---

## Detection Logic

A new helper in `lib/email.ts`:

```ts
function isFinalEdition(weekEnd: Date, targetDate: string, override?: boolean): boolean
```

- Returns `true` if `override === true`
- Returns `true` if `targetDate − weekEnd ≤ 2 days` (auto-detect: weekEnd = Jun 28, targetDate = Jun 30 → 2-day gap)
- Returns `false` otherwise

A new Setting key `email_digest_final_edition_override` (`"true"` / `"false"`, default `"false"`) stored in the existing `Setting` table. The `/digest` admin page exposes a **"Send as Final Edition"** checkbox that reads/writes this key. The override auto-resets to `"false"` after a successful send.

---

## Email Changes

All changes are conditional on `isFinalEdition() === true`. Normal digest is unchanged.

### Subject Line

| Variant | Final Edition Subject |
|---|---|
| Regional | `🎉 DAR Region V — Final Progress Digest · Eve of Distribution · Jun 22–28, 2026` |
| Provincial | `🎉 DAR Region V — Final Progress Digest · Eve of Distribution · Albay · Jun 22–28, 2026` |

### Header — Edition Bar

Replaces the 5px green accent bar at the top. A full gold shimmer band with:

```
FINAL EDITION  ·  JUNE 30, 2026  ·  DISTRIBUTION DAY
```

- Background: gold shimmer animation (`#f59e0b → #fcd34d → #f59e0b`)
- Text: `font-size: 10px; font-weight: 700; letter-spacing: 0.26em; text-transform: uppercase; color: #0c3318`
- Separator dots: dark green circles

### Header — Two-Zone Split Layout

The header is split into a **left zone (58%)** and a **right zone (42%)**, separated by a thin vertical gold rule.

**Left zone** (identical to normal, minus the existing countdown badge):
- Brand: `DAR · Region V · Bicol`
- Week pill: `Jun 22–28, 2026`
- Title: `Weekly Progress Digest` (same font/weight as normal)
- Subtitle changes to: `Final Report — Regional Title & COCROM Distribution`
- Province chip (provincial variant only): `📍 Province of [Province]`

**Right zone** (replaces the existing countdown badge):
- Background: `#0a2d18` (slightly darker green)
- Radial gold glow overlay
- Message in gold (`#fbbf24`):
  - `Tomorrow's` — 22px, 800 weight, displayed as its own line
  - `the big day! Let's do our best. Good luck!` — 15px, 700 weight

### Body — "Distribution Day Tomorrow" Block

A dark green (`#0f3d20`) block replacing the existing light amber banner. No label — opens directly with the message text in white at 85% opacity:

> *"Today is the last day before the Regional Title and COCROM Distribution. Below are the final numbers as we head into tomorrow's big event. Thank you for your commitment and hard work throughout this effort — the data reflects it."*

### Body — Closing Note

Inserted between the cumulative table / provincial breakdown and the footer, separated by a 2px gold (`#fde68a`) horizontal rule:

> *"Tomorrow, **June 30, 2026**, marks the culmination of this campaign as DAR Region V distributes COCROMs across Bicol. The numbers in this final digest are a testament to the dedication of every team involved. Well done!"*

### Everything Else

The two activity cards, cumulative progress table, provincial breakdown table, and footer are **identical** to the normal digest — same data, same layout, same styling.

---

## Admin UI Change

In `/digest` page, add below the existing "Send until" date field:

- Checkbox: **"Send as Final Edition"**
- Label: `Override: send the next digest as the special Final Edition regardless of date`
- Bound to `email_digest_final_edition_override` setting
- Auto-resets to `false` after a successful send (handled in `sendWeeklyDigest`)

---

## Files to Change

| File | Change |
|---|---|
| `lib/email.ts` | Add `isFinalEdition()` helper; add conditional branches in `buildSubjectLine()` and `buildEmailHtml()` for all Final Edition elements |
| `app/digest/page.tsx` | Add "Send as Final Edition" checkbox to Digest Settings card |
| `app/api/admin/digest/settings/route.ts` | Include `finalEditionOverride` in GET response and PUT handler |
| `lib/digest.ts` | Pass override flag through to `sendWeeklyDigest()` and reset after send |

---

## Visual Reference

Preview files (browser-only, not production code):
- `Regional: .superpowers/brainstorm/final-edition-preview.html`
- `Provincial: .superpowers/brainstorm/final-edition-preview-provincial.html`
