# Batch Unconfirm — Design Spec
_Date: 2026-05-25_

## Overview

A superadmin-only feature that allows batch-clearing the `amendarea_validated_confirmed` and/or `condoned_amount_confirmed` flags on multiple landholdings at once, then auto-recomputes the status of each affected record. The user identifies target records by pasting a list of SEQNOs.

---

## Scope

| In scope | Out of scope |
|----------|-------------|
| Batch unconfirm area, amount, or both | Single-record undo (already exists in DetailModal) |
| Status recomputation per affected LH | Reverting "Not Eligible for Encoding" status |
| Audit log entries per flag change | Any change to confirmation values themselves |
| Superadmin-only access | Editor/admin access |

---

## API — `POST /api/admin/batch-unconfirm`

### Authentication & Authorization
- Reads session cookie, calls `verifySessionToken`
- Returns `403 Forbidden` if user is not authenticated or `role !== "super_admin"`

### Request Body
```json
{
  "seqnos": ["R5-UC-00001", "R5-UC-00002"],
  "type": "area" | "amount" | "both"
}
```

- `seqnos` — required, non-empty array of SEQNO_DARRO strings
- `type` — required, one of `"area"`, `"amount"`, `"both"`

### Logic (per seqno, processed sequentially)

1. Fetch `amendarea_validated_confirmed`, `condoned_amount_confirmed`, `province_edited`, `landowner`, `clno` from DB
2. If seqno not found → add to `skipped` with reason `"Not found"`
3. If the target flag(s) are already `false` → add to `skipped` with reason `"Already unconfirmed"`
4. Otherwise, inside a single SQLite transaction:
   - Set `amendarea_validated_confirmed = 0` if `type` is `"area"` or `"both"` and it was `true`
   - Set `condoned_amount_confirmed = 0` if `type` is `"amount"` or `"both"` and it was `true`
   - Set `updated_at = datetime('now')`
   - Write one audit log row per flag cleared:
     - `field`: `"amendarea_validated_confirmed"` or `"condoned_amount_confirmed"`
     - `old_value`: `"true"`, `new_value`: `"false"`
     - `source`: `"admin_batch_unconfirm"`
5. Call `computeAndUpdateStatus(seqno)` after the transaction (updates status in DB)

### Response
```json
{
  "updated": 355,
  "skipped": [
    { "seqno_darro": "R5-UC-00050", "reason": "Already unconfirmed" },
    { "seqno_darro": "R5-UC-00999", "reason": "Not found" }
  ]
}
```

### Error responses
| Status | Condition |
|--------|-----------|
| 401 | No valid session |
| 403 | Role is not `super_admin` |
| 400 | Missing/invalid `seqnos` or `type` |
| 500 | Unexpected server error (wrapped in try-catch) |

---

## Page — `app/admin/unconfirm/page.tsx`

### Access guard
Uses `useUser()` hook. If `user?.role !== "super_admin"`, renders a "Not authorized" message — no data is fetched.

### Layout (top to bottom)

#### 1. Mode selector
Three pill/tab buttons (single-select):
- `Area Only` — clears `amendarea_validated_confirmed`
- `Amount Only` — clears `condoned_amount_confirmed`
- `Both` — clears both flags

#### 2. Input panel
- `<textarea>` — one SEQNO per line, free-form paste
- Row count indicator below: e.g. `"361 SEQNOs entered"`
- **Preview** button (disabled when textarea is empty)
  - Calls `POST /api/admin/batch-unconfirm` with a `preview: true` flag
  - API in preview mode fetches current flags without writing anything, returns per-row status

#### 3. Preview table
Shown after a successful preview call.

Columns: `SEQNO_DARRO` | `Landowner` | `Province` | `Area Confirmed?` | `Amount Confirmed?` | `Result`

Row color-coding:
- **Green row** — flag is currently `true`, will be cleared
- **Gray row** — flag already `false`, will be skipped

Summary line above the table:
> "X records will be unconfirmed · Y already unconfirmed (skipped)"

**Unconfirm X Records** button → opens a confirmation modal.

#### 4. Confirmation modal
Simple modal:
> "This will clear the [area / amount / area & amount] confirmation for X landholdings and recompute their status. This cannot be undone in bulk. Proceed?"

**Cancel** | **Confirm & Execute** buttons.

#### 5. Results panel
Replaces the preview table after execution:
- Bold count: `"355 records unconfirmed successfully."`
- Collapsible "Skipped (6)" list showing seqno + reason per row
- **Start Over** button to reset the form

---

## Preview mode in API

The API accepts an optional `preview: true` field in the request body. When set:
- Runs the same lookup and skip logic
- Does NOT write to the DB (no UPDATE, no audit log, no status recompute)
- Returns the same response shape with per-row `action: "unconfirm" | "skip"` and `reason` fields added

```json
{
  "rows": [
    { "seqno_darro": "R5-UC-00001", "landowner": "...", "province": "...",
      "area_confirmed": true, "amount_confirmed": false,
      "action": "unconfirm", "reason": null },
    { "seqno_darro": "R5-UC-00050", "landowner": "...", "province": "...",
      "area_confirmed": false, "amount_confirmed": false,
      "action": "skip", "reason": "Already unconfirmed" }
  ]
}
```

---

## Sidebar entry

In `components/Sidebar.tsx`, add to the `Admin` group:

```ts
{ href: "/admin/unconfirm", label: "Batch Unconfirm", Icon: IconUnconfirm, chip: "violet", superAdminOnly: true }
```

A new `IconUnconfirm` SVG (undo/revert style, 10×10) is added alongside the other icon functions.

---

## Audit trail

Every flag that is cleared produces one row in `AuditLog`:

| field | value |
|-------|-------|
| `seqno_darro` | the LH seqno |
| `action` | `"RECORD_UPDATE"` |
| `field` | `"amendarea_validated_confirmed"` or `"condoned_amount_confirmed"` |
| `old_value` | `"true"` |
| `new_value` | `"false"` |
| `changed_by` | superadmin username |
| `source` | `"admin_batch_unconfirm"` |

---

## Files touched

| File | Change |
|------|--------|
| `app/api/admin/batch-unconfirm/route.ts` | **New** — POST handler |
| `app/admin/unconfirm/page.tsx` | **New** — page component |
| `components/Sidebar.tsx` | Add sidebar entry + `IconUnconfirm` SVG |
| `proxy.ts` | No change needed (admin pages already require auth; role enforced in route/page) |
