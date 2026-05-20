# COCROM Breakdown Redefinition — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite 6 Prisma queries on the dashboard so the COCROM stat card (top number + "eligible/not eligible" + 4-bucket breakdown) excludes "Not Eligible for Encoding" landholdings and bucketizes eligible ARBs by landholding status + `date_encoded` / `date_distributed`, per `docs/superpowers/specs/2026-04-18-cocrom-breakdown-redefinition-design.md`.

**Architecture:** All 6 queries live inside `getStats()` in `app/page.tsx`, invoked by `Promise.all`. The helper `arbWhere(extraLandholding)` (line 31) builds `{ landholding: { province_edited: ..., ...extraLandholding } }` and already scopes queries to the user's province. New queries reuse this helper. Bucket rules that span multiple landholding statuses use a Prisma `OR` clause with one branch per status-group.

**Tech Stack:** Next.js 16 App Router, Prisma 7 (`@prisma/client`) with `better-sqlite3` adapter, TypeScript. No test framework in this project — verification is manual via the running dashboard plus a SQLite sanity-check query.

**File Structure:**
- **Modify:** `app/page.tsx` — only the 6 query lines inside `getStats()`. No signatures change, no new files, no new imports.
- **Unchanged:** `components/DashboardClient.tsx` (presentational; takes the numbers as props and doesn't care how they're computed).

---

## Task 1: Exclude "Not Eligible for Encoding" landholdings from the total and eligible counts

**Files:**
- Modify: `app/page.tsx:242` (`cocromCount`)
- Modify: `app/page.tsx:244` (`eligibleArbCount`)

**Context:** The existing queries use `arbProvinceScope` = `arbWhere()` — only a province filter, no landholding-status filter. Per spec, both queries must additionally require `landholding.status ≠ "Not Eligible for Encoding"`.

Note on SQLite null semantics: `status { not: "Not Eligible for Encoding" }` also matches rows where `status IS NULL`. The schema default for `status` is `"For Initial Validation"`, so null rows are rare. If any exist they're non-NEE and correctly included — matching the spec's "all statuses except NEE" intent.

- [ ] **Step 1: Edit `cocromCount` to exclude NEE landholdings**

Replace line 242:

```typescript
    // COCROMs — total ARB rows
    prisma.arb.count({ where: { ...arbProvinceScope } }),
```

with:

```typescript
    // COCROMs — total ARB rows (excludes "Not Eligible for Encoding" LHs)
    prisma.arb.count({ where: { ...arbWhere({ status: { not: "Not Eligible for Encoding" } }) } }),
```

- [ ] **Step 2: Edit `eligibleArbCount` to exclude NEE landholdings**

Replace line 244:

```typescript
    // COCROMs — eligible ARBs
    prisma.arb.count({ where: { ...arbProvinceScope, eligibility: "Eligible" } }),
```

with:

```typescript
    // COCROMs — eligible ARBs (excludes "Not Eligible for Encoding" LHs)
    prisma.arb.count({ where: { ...arbWhere({ status: { not: "Not Eligible for Encoding" } }), eligibility: "Eligible" } }),
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. If Prisma types complain that the `not` key isn't accepted on the status scalar filter, double-check the key is `not` (lowercase), not `NOT`.

- [ ] **Step 4: Manual verification in the browser**

With the dev server running (`npm run dev`), reload the dashboard and compare against the pre-change screenshot:

- The big "TOTAL NO. OF COCROMs" number should drop by roughly the count of ARBs previously living under "Not Eligible for Encoding" landholdings.
- The top breakdown "X eligible · Y not eligible" should still make sense: `X + Y` = new total. `X` typically will not change much (NEE landholdings hold mostly Not-Eligible ARBs); `Y` drops.
- The bottom 4-bucket row is still wrong (Task 2 fixes it) — ignore it for now.

Optional SQLite sanity query (run from the project root):

```bash
sqlite3 dev.db "SELECT COUNT(*) AS excluded_arbs FROM Arb a JOIN Landholding l ON l.seqno_darro = a.seqno_darro WHERE l.status = 'Not Eligible for Encoding';"
```

The "TOTAL NO. OF COCROMs" should have dropped by exactly this number compared to the previous card reading.

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx
git commit -m "fix: exclude Not Eligible for Encoding LHs from dashboard COCROM total and eligible counts"
```

---

## Task 2: Rewrite the 4-bucket breakdown queries (For Val. · For Enc. · Encoded · Distributed)

**Files:**
- Modify: `app/page.tsx:246` (`cocromForValidation`)
- Modify: `app/page.tsx:247` (`cocromForEncoding`)
- Modify: `app/page.tsx:248` (`cocromEncoded`)
- Modify: `app/page.tsx:249` (`cocromDistributed`)

**Context:** The new rules (from spec) are LH-first, mutually exclusive, and exhaustive for eligible ARBs:

| Bucket | Rule |
|---|---|
| For Validation | LH ∈ {For Initial Validation, For Further Validation} |
| For Encoding | LH = "For Encoding" — OR — LH ∈ {Partially Encoded, Fully Encoded} AND DE=∅ — OR — LH = "Partially Distributed" AND DE=∅ AND DD=∅ |
| Encoded | LH ∈ {Partially Encoded, Fully Encoded} AND DE≠∅ — OR — LH ∈ {Partially Distributed, Fully Distributed} AND DE≠∅ AND DD=∅ |
| Distributed | LH ∈ {Partially Distributed, Fully Distributed} AND DD≠∅ |

Prisma pattern for compound OR rules: each `OR` branch builds a full `landholding` clause via `arbWhere({...})` (which embeds the province scope), then merges any `date_encoded` / `date_distributed` conditions at the ARB level with the spread operator. This avoids the foot-gun where a top-level `landholding` key and an OR-branch `landholding` key interact ambiguously.

- [ ] **Step 1: Edit `cocromForValidation` to include "For Initial Validation"**

Replace line 246:

```typescript
    prisma.arb.count({ where: { ...arbWhere({ status: "For Further Validation" }), eligibility: "Eligible" } }),
```

with:

```typescript
    // For Validation: LH ∈ {For Initial Validation, For Further Validation}
    prisma.arb.count({
      where: {
        ...arbWhere({ status: { in: ["For Initial Validation", "For Further Validation"] } }),
        eligibility: "Eligible",
      },
    }),
```

- [ ] **Step 2: Edit `cocromForEncoding` to cover the 3-branch rule**

Replace line 247:

```typescript
    prisma.arb.count({ where: { ...arbWhere({ status: "For Encoding" }), eligibility: "Eligible" } }),
```

with:

```typescript
    // For Encoding: LH=For Encoding  OR  Partially/Fully Encoded with DE=∅  OR  Partially Distributed with DE=∅ AND DD=∅
    prisma.arb.count({
      where: {
        eligibility: "Eligible",
        OR: [
          arbWhere({ status: "For Encoding" }),
          { ...arbWhere({ status: { in: ["Partially Encoded", "Fully Encoded"] } }), date_encoded: null },
          { ...arbWhere({ status: "Partially Distributed" }), date_encoded: null, date_distributed: null },
        ],
      },
    }),
```

- [ ] **Step 3: Edit `cocromEncoded` to cover the 2-branch rule**

Replace line 248:

```typescript
    prisma.arb.count({ where: { ...arbProvinceScope, eligibility: "Eligible", date_encoded: { not: null }, date_distributed: null } }),
```

with:

```typescript
    // Encoded: Partially/Fully Encoded with DE≠∅  OR  Partially/Fully Distributed with DE≠∅ AND DD=∅
    prisma.arb.count({
      where: {
        eligibility: "Eligible",
        OR: [
          { ...arbWhere({ status: { in: ["Partially Encoded", "Fully Encoded"] } }), date_encoded: { not: null } },
          { ...arbWhere({ status: { in: ["Partially Distributed", "Fully Distributed"] } }), date_encoded: { not: null }, date_distributed: null },
        ],
      },
    }),
```

- [ ] **Step 4: Edit `cocromDistributed` to require Partially/Fully Distributed LH**

Replace line 249:

```typescript
    prisma.arb.count({ where: { ...arbProvinceScope, eligibility: "Eligible", date_distributed: { not: null } } }),
```

with:

```typescript
    // Distributed: Partially/Fully Distributed with DD≠∅
    prisma.arb.count({
      where: {
        ...arbWhere({ status: { in: ["Partially Distributed", "Fully Distributed"] } }),
        eligibility: "Eligible",
        date_distributed: { not: null },
      },
    }),
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. If Prisma complains about `OR` wrapping these arguments (TS will infer `Prisma.ArbWhereInput[]`), the shape `OR: [arbWhere({...}), {...arbWhere({...}), date_encoded: null}]` is idiomatic Prisma — each element is a `ArbWhereInput`. If a type error appears specifically on a branch that spreads `arbWhere(...)`, you may need to give that branch its explicit type annotation; do *not* change the query semantics to appease the type.

- [ ] **Step 6: Verify the identity `ForVal + ForEnc + Encoded + Distributed === eligibleArbCount`**

Reload the dashboard. Read the four bucket numbers from the card:
`X for val. · Y for enc. · Z enc'd · W distrib.`

The sum `X + Y + Z + W` must equal the "eligible" number displayed directly above it. If it doesn't, stop and investigate before committing — the identity failing means either (a) a query has a bug, or (b) the data violates one of the stated invariants (e.g. an eligible ARB under a Fully Distributed LH with DD=∅, which shouldn't exist). Option (b) is a data issue, not a code issue, but the plan shouldn't move forward until you've confirmed which.

- [ ] **Step 7: Spot-check three specific landholdings**

Pick one landholding in each of the following categories via the `/landholdings` list or SQLite, and confirm its eligible ARBs land in the expected buckets. Use a temporary SQLite query rather than eyeballing the UI.

Category A — Partially Encoded with some DE=∅ eligible ARBs:

```bash
sqlite3 dev.db "SELECT a.seqno_darro, a.arb_name, a.eligibility, a.date_encoded, a.date_distributed FROM Arb a JOIN Landholding l ON l.seqno_darro = a.seqno_darro WHERE l.status = 'Partially Encoded' AND a.eligibility = 'Eligible' AND a.date_encoded IS NULL LIMIT 5;"
```

Expected: each row here should count in **For Enc.** (not in Encoded).

Category B — Partially Distributed with mixed DE/DD:

```bash
sqlite3 dev.db "SELECT a.seqno_darro, a.arb_name, a.date_encoded, a.date_distributed, CASE WHEN a.date_distributed IS NOT NULL THEN 'Distributed' WHEN a.date_encoded IS NOT NULL THEN 'Encoded' ELSE 'For Encoding' END AS expected_bucket FROM Arb a JOIN Landholding l ON l.seqno_darro = a.seqno_darro WHERE l.status = 'Partially Distributed' AND a.eligibility = 'Eligible' LIMIT 10;"
```

Expected: the `expected_bucket` column matches the formula; the dashboard totals should line up with counts-per-bucket from this LH.

Category C — Fully Distributed:

```bash
sqlite3 dev.db "SELECT COUNT(*) AS fully_dist_elig_with_null_dd FROM Arb a JOIN Landholding l ON l.seqno_darro = a.seqno_darro WHERE l.status = 'Fully Distributed' AND a.eligibility = 'Eligible' AND a.date_distributed IS NULL;"
```

Expected: `0`. If this is non-zero, the data violates the Fully-Distributed invariant — surface it to the user before committing, since it means a landholding was marked "Fully Distributed" while an eligible ARB still has no DD.

- [ ] **Step 8: Commit**

```bash
git add app/page.tsx
git commit -m "feat: rewrite COCROM 4-bucket breakdown with LH-first, date-aware rules

Bucket rules now start from landholding status and make the buckets
mutually exclusive and exhaustive for eligible ARBs, so the 4 numbers
sum to the eligible-ARB count. See spec:
docs/superpowers/specs/2026-04-18-cocrom-breakdown-redefinition-design.md"
```

---

## Self-review

**Spec coverage:**

- Scope filter on `cocromCount` and `eligibleArbCount` to exclude NEE → Task 1 Steps 1–2. ✅
- "For Validation" rule (`LH ∈ {For Initial Validation, For Further Validation}`) → Task 2 Step 1. ✅
- "For Encoding" 3-branch rule → Task 2 Step 2. ✅
- "Encoded" 2-branch rule → Task 2 Step 3. ✅
- "Distributed" rule → Task 2 Step 4. ✅
- Expected identity `ForVal + ForEnc + Encoded + Distributed == eligibleArbCount` verified → Task 2 Step 6. ✅
- Spot-check on Partially Encoded / Partially Distributed / Fully Distributed → Task 2 Step 7. ✅
- No UI changes, no schema changes, no chart changes → honored (only `app/page.tsx` modified). ✅
- Existing `arbProvinceScope` / `arbWhere(...)` filter preserved in every new query → all 6 replacements use `arbWhere(...)`. ✅

**Placeholder scan:** no TBD/TODO/"handle edge cases" language. Every code step shows the actual replacement.

**Type consistency:** all 6 queries remain `prisma.arb.count(...)` returning `number`, matching their existing destructuring at `app/page.tsx:63–68`. Bucket variable names (`cocromCount`, `eligibleArbCount`, `cocromForValidation`, `cocromForEncoding`, `cocromEncoded`, `cocromDistributed`) are unchanged — no rename, so `DashboardStatCards` props (line 632–637) still bind correctly.
