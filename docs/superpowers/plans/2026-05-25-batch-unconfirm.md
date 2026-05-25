# Batch Unconfirm Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a superadmin-only `/admin/unconfirm` page that batch-clears `amendarea_validated_confirmed` and/or `condoned_amount_confirmed` flags on pasted SEQNOs and recomputes each LH's status.

**Architecture:** Three self-contained pieces — (1) a new POST-only API route at `/api/admin/batch-unconfirm` that handles both preview and execute modes, (2) a new client page at `/admin/unconfirm`, (3) a sidebar entry wired to `superAdminOnly: true`. The API route is fully independent; the page imports nothing except shared hooks and components already used throughout the codebase.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind CSS, better-sqlite3 (via `rawDb`), Prisma (via `prisma`), `computeAndUpdateStatus` from `lib/computeStatus.ts`.

---

## File Map

| File | Status | Responsibility |
|------|--------|---------------|
| `app/api/admin/batch-unconfirm/route.ts` | **Create** | POST handler — preview + execute modes, auth, DB writes, audit log, status recompute |
| `app/admin/unconfirm/page.tsx` | **Create** | Client page — mode selector, textarea, preview table, confirm modal, results |
| `components/Sidebar.tsx` | **Modify** | Add `IconUnconfirm` SVG + nav entry in Admin group |

---

## Task 1: API Route

**Files:**
- Create: `app/api/admin/batch-unconfirm/route.ts`

- [ ] **Step 1: Create the file with auth guard and request parsing**

```typescript
// app/api/admin/batch-unconfirm/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma, rawDb } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";
import { computeAndUpdateStatus } from "@/lib/computeStatus";

type UnconfirmType = "area" | "amount" | "both";

type PreviewRow = {
  seqno_darro: string;
  landowner: string | null;
  province: string | null;
  clno: string | null;
  area_confirmed: boolean;
  amount_confirmed: boolean;
  action: "unconfirm" | "skip";
  reason: string | null;
};

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    const sessionUser = token ? await verifySessionToken(token) : null;
    if (!sessionUser)
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    if (sessionUser.role !== "super_admin")
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });

    const body = await req.json() as { seqnos?: unknown; type?: unknown; preview?: unknown };

    const rawSeqnos = Array.isArray(body.seqnos) ? body.seqnos : [];
    const seqnos = rawSeqnos
      .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
      .map((s) => s.trim().toUpperCase());

    const type: UnconfirmType | null =
      body.type === "area" || body.type === "amount" || body.type === "both"
        ? (body.type as UnconfirmType)
        : null;

    const isPreview = Boolean(body.preview);

    if (!seqnos.length)
      return NextResponse.json({ error: "No SEQNOs provided." }, { status: 400 });
    if (!type)
      return NextResponse.json(
        { error: "type must be \"area\", \"amount\", or \"both\"." },
        { status: 400 }
      );

    const unconfirmArea   = type === "area"   || type === "both";
    const unconfirmAmount = type === "amount" || type === "both";

    // Fetch current confirmation state for all requested SEQNOs
    const records = await prisma.landholding.findMany({
      where: { seqno_darro: { in: seqnos } },
      select: {
        seqno_darro: true,
        landowner: true,
        province_edited: true,
        clno: true,
        amendarea_validated_confirmed: true,
        condoned_amount_confirmed: true,
      },
    });

    const foundMap = Object.fromEntries(records.map((r) => [r.seqno_darro, r]));

    // Build per-row preview analysis
    const previewRows: PreviewRow[] = seqnos.map((seqno) => {
      const rec = foundMap[seqno];
      if (!rec) {
        return {
          seqno_darro: seqno,
          landowner: null,
          province: null,
          clno: null,
          area_confirmed: false,
          amount_confirmed: false,
          action: "skip" as const,
          reason: "Not found",
        };
      }
      const areaWillChange   = unconfirmArea   && (rec.amendarea_validated_confirmed ?? false);
      const amountWillChange = unconfirmAmount && (rec.condoned_amount_confirmed     ?? false);
      const willChange = areaWillChange || amountWillChange;
      return {
        seqno_darro: seqno,
        landowner: rec.landowner,
        province: rec.province_edited,
        clno: rec.clno,
        area_confirmed:   rec.amendarea_validated_confirmed ?? false,
        amount_confirmed: rec.condoned_amount_confirmed     ?? false,
        action:  willChange ? "unconfirm" : "skip",
        reason:  willChange ? null        : "Already unconfirmed",
      };
    });

    // Preview mode — return analysis without writing anything
    if (isPreview) {
      return NextResponse.json({ rows: previewRows });
    }

    // Execute mode
    const insertAudit = rawDb.prepare(
      `INSERT INTO "AuditLog" (seqno_darro, action, field_changed, old_value, new_value, changed_by, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    );

    const toUpdate = previewRows.filter((r) => r.action === "unconfirm");
    const skipped  = previewRows
      .filter((r) => r.action === "skip")
      .map((r) => ({ seqno_darro: r.seqno_darro, reason: r.reason ?? "Already unconfirmed" }));

    // Process sequentially — avoids SQLite contention on large batches
    for (const row of toUpdate) {
      const rec = foundMap[row.seqno_darro];
      const sets: string[] = [];

      rawDb.transaction(() => {
        if (unconfirmArea && (rec.amendarea_validated_confirmed ?? false)) {
          sets.push('"amendarea_validated_confirmed" = 0');
          insertAudit.run(
            row.seqno_darro, "RECORD_UPDATE", "amendarea_validated_confirmed",
            "true", "false", sessionUser.username, "admin_batch_unconfirm"
          );
        }
        if (unconfirmAmount && (rec.condoned_amount_confirmed ?? false)) {
          sets.push('"condoned_amount_confirmed" = 0');
          insertAudit.run(
            row.seqno_darro, "RECORD_UPDATE", "condoned_amount_confirmed",
            "true", "false", sessionUser.username, "admin_batch_unconfirm"
          );
        }
        if (sets.length > 0) {
          rawDb
            .prepare(
              `UPDATE "Landholding" SET ${sets.join(", ")}, "updated_at" = datetime('now') WHERE seqno_darro = ?`
            )
            .run(row.seqno_darro);
        }
      })();

      // Status recompute runs outside the transaction — it uses Prisma async queries
      await computeAndUpdateStatus(row.seqno_darro);
    }

    return NextResponse.json({ updated: toUpdate.length, skipped });
  } catch (err) {
    console.error("[batch-unconfirm] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error." },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Verify the route file compiles**

```bash
npx tsc --noEmit
```

Expected: no errors related to `app/api/admin/batch-unconfirm/route.ts`

- [ ] **Step 3: Smoke-test the auth guard in browser**

Start the dev server (`npm run dev`). Log in as a non-superadmin user and run in the browser console:

```javascript
fetch('/api/admin/batch-unconfirm', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ seqnos: ['R5-UC-00001'], type: 'both' })
}).then(r => r.json()).then(console.log)
```

Expected: `{ error: "Forbidden." }` with status 403.

Log in as superadmin and run the same. Expected: `{ updated: ..., skipped: [...] }` with status 200 (or 400 if the SEQNO doesn't exist — `{ error: "No SEQNOs provided." }` is for empty array).

- [ ] **Step 4: Smoke-test preview mode**

As superadmin in browser console:

```javascript
fetch('/api/admin/batch-unconfirm', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ seqnos: ['R5-UC-00001'], type: 'both', preview: true })
}).then(r => r.json()).then(console.log)
```

Expected: `{ rows: [{ seqno_darro: 'R5-UC-00001', ..., action: 'unconfirm' | 'skip', reason: ... }] }` — no DB changes.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/batch-unconfirm/route.ts
git commit -m "feat: POST /api/admin/batch-unconfirm — preview + execute, audit log, status recompute"
```

---

## Task 2: Sidebar Entry

**Files:**
- Modify: `components/Sidebar.tsx`

- [ ] **Step 1: Add `IconUnconfirm` SVG after `IconDigest`**

In `components/Sidebar.tsx`, locate the `IconDigest` function (ends around line 126) and insert immediately after its closing brace:

```typescript
function IconUnconfirm() {
  return (
    <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7.5a4 4 0 1 0 .8-2.4" />
      <polyline points="1 5 3 7.5 5.5 5" />
      <line x1="6" y1="7" x2="10" y2="7" />
      <line x1="6" y1="9.5" x2="9" y2="9.5" />
    </svg>
  );
}
```

- [ ] **Step 2: Add nav entry to the Admin group**

In `components/Sidebar.tsx`, find the Admin group items array (the block containing `href: "/admin/backup"`). Add the new entry after the `digest` entry and before `backup`:

```typescript
// BEFORE:
{ href: "/digest",                   label: "Weekly Digest",      Icon: IconDigest,    chip: "violet", superAdminOnly: true },
{ href: "/admin/backup",             label: "Backup",             Icon: IconBackup,    chip: "violet", superAdminOnly: true },

// AFTER:
{ href: "/digest",                   label: "Weekly Digest",      Icon: IconDigest,    chip: "violet", superAdminOnly: true },
{ href: "/admin/unconfirm",          label: "Batch Unconfirm",    Icon: IconUnconfirm, chip: "violet", superAdminOnly: true },
{ href: "/admin/backup",             label: "Backup",             Icon: IconBackup,    chip: "violet", superAdminOnly: true },
```

- [ ] **Step 3: Verify it renders**

Open the app as superadmin. Confirm "Batch Unconfirm" appears in the Admin sidebar section with a violet chip. Log in as admin (non-super): the item must not appear.

- [ ] **Step 4: Commit**

```bash
git add components/Sidebar.tsx
git commit -m "feat: add Batch Unconfirm sidebar entry (superadmin only)"
```

---

## Task 3: Admin Page

**Files:**
- Create: `app/admin/unconfirm/page.tsx`

- [ ] **Step 1: Create the page file**

```typescript
// app/admin/unconfirm/page.tsx
"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useUser } from "@/components/UserContext";
import { useToast } from "@/components/Toast";

type UnconfirmType = "area" | "amount" | "both";

type PreviewRow = {
  seqno_darro: string;
  landowner: string | null;
  province: string | null;
  clno: string | null;
  area_confirmed: boolean;
  amount_confirmed: boolean;
  action: "unconfirm" | "skip";
  reason: string | null;
};

type DoneResult = {
  updated: number;
  skipped: { seqno_darro: string; reason: string }[];
};

const MODES: { value: UnconfirmType; label: string; desc: string }[] = [
  { value: "area",   label: "Area Only",   desc: "Clear Validated AMENDAREA confirmation" },
  { value: "amount", label: "Amount Only",  desc: "Clear Validated Condoned Amount confirmation" },
  { value: "both",   label: "Both",         desc: "Clear both Area & Amount confirmations" },
];

export default function BatchUnconfirmPage() {
  const { user } = useUser();
  const toast = useToast();
  const isSuperAdmin = user?.role === "super_admin";

  const [type, setType]           = useState<UnconfirmType>("both");
  const [input, setInput]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [preview, setPreview]     = useState<PreviewRow[] | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [result, setResult]       = useState<DoneResult | null>(null);
  const [showSkipped, setShowSkipped] = useState(false);

  const seqnos = input
    .split("\n")
    .map((l) => l.trim().toUpperCase())
    .filter(Boolean);

  const toUnconfirm = preview?.filter((r) => r.action === "unconfirm") ?? [];
  const toSkip      = preview?.filter((r) => r.action === "skip")      ?? [];

  async function handlePreview() {
    setLoading(true);
    setPreview(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/batch-unconfirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seqnos, type, preview: true }),
      });
      const data = await res.json() as { rows?: PreviewRow[]; error?: string };
      if (!res.ok) { toast(data.error ?? "Preview failed.", "error"); return; }
      setPreview(data.rows ?? []);
    } catch {
      toast("Server did not respond.", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleExecute() {
    setShowConfirm(false);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/batch-unconfirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seqnos, type }),
      });
      const data = await res.json() as DoneResult & { error?: string };
      if (!res.ok) { toast(data.error ?? "Unconfirm failed.", "error"); return; }
      setResult(data);
      setPreview(null);
      setInput("");
    } catch {
      toast("Server did not respond.", "error");
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setResult(null);
    setPreview(null);
    setInput("");
    setShowSkipped(false);
  }

  // Loading state — user not yet resolved
  if (!user) return null;

  // Access guard
  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p className="text-sm text-gray-500">You do not have permission to access this page.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Batch Unconfirm</h1>
        <p className="text-sm text-gray-500 mt-1">
          Clear validated area / amount confirmation flags and recompute status for multiple landholdings at once.
          Superadmin only.
        </p>
      </div>

      {/* Mode selector */}
      <div className="card-bezel">
        <div className="card-bezel-inner-open p-4 space-y-3">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">What to unconfirm</p>
          <div className="flex gap-2 flex-wrap">
            {MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => { setType(m.value); setPreview(null); setResult(null); }}
                className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${
                  type === m.value
                    ? "bg-green-800 text-white border-green-800"
                    : "bg-white text-gray-600 border-gray-300 hover:border-green-700 hover:text-green-800"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400">{MODES.find((m) => m.value === type)?.desc}</p>
        </div>
      </div>

      {/* Input panel — hidden after a successful execute */}
      {!result && (
        <div className="card-bezel">
          <div className="card-bezel-inner-open p-4 space-y-3">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">
              Paste SEQNOs — one per line
            </p>
            <textarea
              value={input}
              onChange={(e) => { setInput(e.target.value); setPreview(null); }}
              rows={10}
              placeholder={"R5-UC-00001\nR5-UC-00002\nR5-UC-00003"}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-600 resize-y"
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400">
                {seqnos.length} SEQNO{seqnos.length !== 1 ? "s" : ""} entered
              </p>
              <button
                onClick={handlePreview}
                disabled={seqnos.length === 0 || loading}
                className="px-4 py-2 bg-green-800 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-40 transition-colors"
              >
                {loading ? "Loading…" : "Preview"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview table */}
      {preview && !result && (
        <div className="card-bezel">
          <div className="card-bezel-inner-open">
            {/* Summary bar */}
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
              <p className="text-sm text-gray-700">
                <span className="font-semibold text-green-700">{toUnconfirm.length} will be unconfirmed</span>
                {toSkip.length > 0 && (
                  <span className="text-gray-400 ml-2">
                    · {toSkip.length} already unconfirmed (skip)
                  </span>
                )}
              </p>
              <button
                onClick={() => setShowConfirm(true)}
                disabled={toUnconfirm.length === 0 || loading}
                className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-40 transition-colors"
              >
                Unconfirm {toUnconfirm.length} Records
              </button>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">SEQNO</th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Landowner</th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Province</th>
                    <th className="px-3 py-2 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Area ✓</th>
                    <th className="px-3 py-2 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Amt ✓</th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {preview.map((row) => (
                    <tr
                      key={row.seqno_darro}
                      className={row.action === "unconfirm" ? "bg-green-50/60" : "opacity-50"}
                    >
                      <td className="px-3 py-2 font-mono font-semibold text-gray-800">{row.seqno_darro}</td>
                      <td className="px-3 py-2 text-gray-600 max-w-[180px] truncate">{row.landowner ?? "—"}</td>
                      <td className="px-3 py-2 text-gray-600">{row.province ?? "—"}</td>
                      <td className="px-3 py-2 text-center font-semibold">
                        {row.area_confirmed ? <span className="text-emerald-600">✓</span> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2 text-center font-semibold">
                        {row.amount_confirmed ? <span className="text-emerald-600">✓</span> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        {row.action === "unconfirm" ? (
                          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-green-100 text-green-700">
                            Will unconfirm
                          </span>
                        ) : (
                          <span className="text-gray-400 text-[11px]">{row.reason}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Result panel */}
      {result && (
        <div className="card-bezel">
          <div className="card-bezel-inner-open p-4 space-y-3">
            <p className="text-base font-bold text-green-800">
              {result.updated} record{result.updated !== 1 ? "s" : ""} unconfirmed successfully.
            </p>
            {result.skipped.length > 0 && (
              <div>
                <button
                  onClick={() => setShowSkipped((v) => !v)}
                  className="text-xs text-gray-500 underline underline-offset-2"
                >
                  {showSkipped ? "Hide" : "Show"} skipped ({result.skipped.length})
                </button>
                {showSkipped && (
                  <ul className="mt-2 space-y-0.5">
                    {result.skipped.map((s) => (
                      <li key={s.seqno_darro} className="text-xs font-mono text-gray-500">
                        {s.seqno_darro} — {s.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <button
              onClick={handleReset}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Start Over
            </button>
          </div>
        </div>
      )}

      {/* Confirmation modal */}
      {showConfirm &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4">
              <h2 className="text-base font-bold text-gray-900">Confirm Batch Unconfirm</h2>
              <p className="text-sm text-gray-600">
                This will clear the{" "}
                <span className="font-semibold">
                  {type === "area" ? "area" : type === "amount" ? "amount" : "area & amount"}
                </span>{" "}
                confirmation for{" "}
                <span className="font-bold">{toUnconfirm.length} landholding{toUnconfirm.length !== 1 ? "s" : ""}</span>{" "}
                and recompute their status. This cannot be undone in bulk.
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExecute}
                  disabled={loading}
                  className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-40 transition-colors"
                >
                  {loading ? "Processing…" : "Confirm & Execute"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Manual end-to-end test as superadmin**

1. Navigate to `/admin/unconfirm`
2. Select **Area Only**
3. Paste 2-3 SEQNOs that you know have `amendarea_validated_confirmed = true`, plus one that does not
4. Click **Preview**
   - Confirmed rows appear green-tinted with "Will unconfirm"
   - Already-unconfirmed row appears dimmed with reason "Already unconfirmed"
   - Summary line shows correct counts
5. Click **Unconfirm X Records** → confirmation modal appears with correct description
6. Click **Confirm & Execute**
   - Loading state appears
   - Result panel shows "X records unconfirmed successfully"
   - Skipped list shows the already-unconfirmed SEQNO
7. Open the Audit Log page (`/audit`) and verify entries with `source = admin_batch_unconfirm` exist for each cleared flag
8. Open one of the unconfirmed LHs in the Records Browser detail modal — confirm the "Confirmed" badge is gone and status has been recomputed correctly

- [ ] **Step 4: Verify access guard**

Log in as an admin (non-superadmin) and navigate to `/admin/unconfirm`. Expected: "You do not have permission to access this page." message.

- [ ] **Step 5: Commit**

```bash
git add app/admin/unconfirm/page.tsx
git commit -m "feat: /admin/unconfirm page — batch unconfirm area/amount with preview and status recompute"
```

---

## Task 4: Final push

- [ ] **Step 1: Run a full type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 2: Push to GitHub**

```bash
git push origin main
```

---

## Self-Review Checklist

- [x] Spec §API auth (401/403) → Task 1 Step 1 (auth guard)
- [x] Spec §preview mode → Task 1 Step 1 (`isPreview` branch returns rows without writing)
- [x] Spec §execute mode — clear flags, audit log, status recompute → Task 1 Step 1 (execute branch)
- [x] Spec §skip logic (not found / already unconfirmed) → Task 1 Step 1 (`previewRows` map)
- [x] Spec §sequential processing → Task 1 Step 1 (`for` loop, not `Promise.all`)
- [x] Spec §audit source `"admin_batch_unconfirm"` → Task 1 Step 1 (`insertAudit.run(...)`)
- [x] Spec §sidebar `superAdminOnly` → Task 2
- [x] Spec §mode selector (area/amount/both) → Task 3 Step 1 (`MODES` array + buttons)
- [x] Spec §preview table color-coding → Task 3 Step 1 (green-tinted / dimmed rows)
- [x] Spec §confirmation modal → Task 3 Step 1 (`showConfirm` portal)
- [x] Spec §results panel + skipped list → Task 3 Step 1 (`result` state block)
- [x] Spec §page-level superadmin guard → Task 3 Step 1 (`if (!isSuperAdmin)` block)
- [x] Type consistency: `UnconfirmType`, `PreviewRow`, `DoneResult` defined in Task 1 and re-declared locally in Task 3 (page uses its own local copy — no shared import needed, keeps files independent)
