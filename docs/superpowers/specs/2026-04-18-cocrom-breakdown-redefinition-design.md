# COCROM Stat Card — Breakdown Redefinition

**Date:** 2026-04-18
**Scope:** Dashboard "TOTAL NO. OF COCROMs" stat card on `app/page.tsx`

## Goal

Redefine the "eligible / not eligible" and the 4-bucket pipeline breakdown shown beneath the total COCROM count, so that the buckets accurately reflect the workflow state of each eligible ARB and sum exactly to the eligible-ARB total.

## Background

The current card shows:

```
150                                         (cocromCount)
144 eligible · 6 not eligible                (top breakdown)
X for val. · Y for enc. · Z enc'd · W distrib.  (bottom breakdown)
```

The bottom breakdown is already eligible-only, but its 4 rules rely only on landholding (LH) status + `eligibility` flag, without using `date_encoded` (DE) and `date_distributed` (DD) to capture partial-state landholdings (Partially Encoded, Partially Distributed) correctly. As a result the bucket numbers do not reconcile with the user's mental model of "where are the 144 eligible ARBs in the pipeline."

## Data invariants (asserted by user)

- **All Non-CARPable lots are Not Eligible.** ⇒ every Eligible ARB is CARPable.
- **LH status "For Encoding"** ⇒ every ARB under that LH has DE = ∅ (no partial encoding under this status).
- **LH status "Fully Distributed"** ⇒ every CARPable ARB under that LH has DD ≠ ∅. Any drift means the LH should have been "Partially Distributed" — i.e. a status-assignment error, not a bucket problem.
- **LH status "Not Eligible for Encoding"** ⇒ all ARBs under it are treated as Not Eligible for counting purposes. Any eligible/encoded/distributed ARBs found under NEE LHs are data drift and are ignored entirely by this card.

Given these invariants, the 8 possible landholding statuses collapse to 7 counted + 1 excluded ("Not Eligible for Encoding"), and every eligible ARB falls into exactly one of the 4 buckets.

## Final rules

### Scope filter (applies to entire card)

Add to both the total count and the eligible breakdown:

```
landholding.status ≠ "Not Eligible for Encoding"
```

Affected queries:

- `cocromCount`   (total COCROMs, the big number)
- `eligibleArbCount`   (the "eligible" half of the top breakdown)

The "not eligible" half of the top breakdown is derived as `cocromCount − eligibleArbCount` and therefore inherits the filter automatically.

### Four buckets (eligible ARBs only, below the divider)

Let LH = landholding status, DE = `arb.date_encoded`, DD = `arb.date_distributed`.

| Bucket | Rule |
|---|---|
| **For Validation** (`cocromForValidation`) | LH ∈ {For Initial Validation, For Further Validation} |
| **For Encoding** (`cocromForEncoding`) | LH = "For Encoding" — **OR** — LH ∈ {Partially Encoded, Fully Encoded} AND DE = ∅ — **OR** — LH = "Partially Distributed" AND DE = ∅ AND DD = ∅ |
| **Encoded** (`cocromEncoded`) | LH ∈ {Partially Encoded, Fully Encoded} AND DE ≠ ∅ — **OR** — LH ∈ {Partially Distributed, Fully Distributed} AND DE ≠ ∅ AND DD = ∅ |
| **Distributed** (`cocromDistributed`) | LH ∈ {Partially Distributed, Fully Distributed} AND DD ≠ ∅ |

Implicit on all four: `eligibility = "Eligible"` (already present in the existing queries).

### Coverage matrix

For an eligible (∴ CARPable) ARB:

| LH Status | DE=∅, DD=∅ | DE≠∅, DD=∅ | DE=∅, DD≠∅ | DE≠∅, DD≠∅ |
|---|---|---|---|---|
| For Initial Validation | For Val. | For Val. | For Val. | For Val. |
| For Further Validation | For Val. | For Val. | For Val. | For Val. |
| For Encoding | For Enc. | *invariant: impossible* | *invariant: impossible* | *invariant: impossible* |
| Partially Encoded | For Enc. | Encoded | *drift* | *drift* |
| Fully Encoded | For Enc. | Encoded | *drift* | *drift* |
| Partially Distributed | For Enc. | Encoded | Distributed | Distributed |
| Fully Distributed | *invariant: impossible* | *invariant: impossible* | Distributed | Distributed |
| Not Eligible for Encoding | — (excluded) | — | — | — |

"*drift*" cells (Encoded/Fully Encoded with DD set) represent status mis-assignment and are not in any bucket. Under the stated invariants these cells are empty.

## Expected behavior

Assuming data integrity:

```
cocromForValidation + cocromForEncoding + cocromEncoded + cocromDistributed === eligibleArbCount
```

If this identity breaks in production, the gap is a **data-integrity signal** (a landholding's status is inconsistent with its ARBs' DE/DD fields), not a formula bug. Surface this diagnostic can be added later if useful; not required for this change.

## Non-goals

- No UI label changes. Captions stay: `"for val. · for enc. · enc'd · distrib."`
- No new buckets or residual "Other" bucket.
- No changes to the Status-of-Encoding or Status-of-Distribution charts below the card.
- No schema changes, no migration.

## Files affected

- `app/page.tsx` — 6 Prisma query rewrites. All queries must preserve the existing `arbProvinceScope` / `arbWhere(...)` filter so role-scoped views (DARPO-level) continue to work:
  - `cocromCount`
  - `eligibleArbCount`
  - `cocromForValidation`
  - `cocromForEncoding`
  - `cocromEncoded`
  - `cocromDistributed`

No changes to `components/DashboardClient.tsx` (the presentational component is agnostic to the formula).

## Verification

1. Reload the dashboard and confirm the 4 bucket numbers sum to the "eligible" count.
2. Confirm the total COCROM count drops by exactly the number of ARBs that were previously counted under "Not Eligible for Encoding" landholdings.
3. Spot-check one landholding in each of {Partially Encoded with some DE=∅, Partially Distributed with mixed DE/DD, Fully Distributed} to make sure ARBs land in the right bucket.
