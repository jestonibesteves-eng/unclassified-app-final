# Skeleton Loader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an animated skeleton loading screen that appears while the dashboard fetches data, replacing the blank page with gray pulse blocks that mirror the real dashboard layout.

**Architecture:** Create a single `app/loading.tsx` file — Next.js App Router automatically renders it while `app/page.tsx` resolves. No changes to existing files. The skeleton is a pure static React component using Tailwind `animate-pulse` and the existing `card-bezel`/`card-bezel-inner` CSS classes from `app/globals.css`.

**Tech Stack:** Next.js 15 App Router (`loading.tsx` convention), Tailwind CSS (`animate-pulse`, `bg-gray-200/300`), existing global CSS classes (`card-bezel`, `card-bezel-inner`, `card-bezel-inner-open`)

---

### Task 1: Create `app/loading.tsx` skeleton screen

**Files:**
- Create: `app/loading.tsx`

**Context — real layout structure (from `app/page.tsx` and `components/DashboardClient.tsx`):**
- Header: `mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between`
- Stat cards wrapper: `mb-6 flex flex-col lg:flex-row gap-4`
  - Per Landholding: `flex-[4] min-w-0 bg-emerald-100 rounded-xl p-3`, 4-col grid inside
  - Per ARB: `flex-[2] min-w-0 bg-orange-100 rounded-xl p-3`, 2-col grid inside
  - Each stat card: `card-bezel h-full` > `card-bezel-inner h-full border-t-4 {color} p-5`
- Issue strip: `card-bezel mb-6` > `card-bezel-inner-open`
- Charts row 1: `grid grid-cols-1 gap-6 mb-6 lg:grid-cols-2`, two `card-bezel` cards each with dark green header + body
- COCROM row: single full-width `card-bezel` with 2-col inner grid
- Accomplishment Tracker: `card-bezel mb-6` with header buttons + 3-col inner grid of sub-cards
- Not Eligible: `mt-6` > `card-bezel` > 2-col grid with label + bar rows each

**CSS classes already in `app/globals.css`:**
- `.card-bezel` — outer bevel frame (dark border radius, subtle shadow)
- `.card-bezel-inner` — white inner with overflow hidden
- `.card-bezel-inner-open` — white inner without overflow hidden (used by issue strip)

- [ ] **Step 1: Verify `app/loading.tsx` does not already exist**

```bash
ls app/loading.tsx 2>/dev/null && echo "EXISTS" || echo "NOT FOUND"
```

Expected: `NOT FOUND`

- [ ] **Step 2: Create `app/loading.tsx`**

```tsx
export default function DashboardLoading() {
  return (
    <div>
      {/* ── Header ── */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <div className="h-5 w-14 rounded-full bg-gray-200 animate-pulse" />
          <div className="h-8 w-52 rounded bg-gray-300 animate-pulse" />
          <div className="h-3 w-80 rounded bg-gray-200 animate-pulse" />
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2">
            <div className="h-8 w-28 rounded-lg bg-gray-200 animate-pulse" />
            <div className="h-8 w-24 rounded-lg bg-gray-200 animate-pulse" />
          </div>
          <div className="flex gap-2">
            <div className="h-7 w-20 rounded-lg bg-gray-200 animate-pulse" />
            <div className="h-7 w-20 rounded-lg bg-gray-200 animate-pulse" />
          </div>
        </div>
      </div>

      {/* ── Stat Cards ── */}
      <div className="mb-6 flex flex-col lg:flex-row gap-4">
        {/* Per Landholding */}
        <div className="flex-[4] min-w-0 bg-emerald-50 rounded-xl p-3">
          <div className="h-2.5 w-36 rounded-full bg-emerald-200 animate-pulse mb-3" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="card-bezel h-full">
                <div className="card-bezel-inner h-full border-t-4 border-t-gray-200 p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className="h-2.5 w-20 rounded bg-gray-200 animate-pulse" />
                    <div className="w-2 h-2 rounded-full bg-gray-200 animate-pulse mt-0.5" />
                  </div>
                  <div className="h-8 w-24 rounded bg-gray-300 animate-pulse mb-2" />
                  <div className="h-2.5 w-full rounded bg-gray-200 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Per ARB */}
        <div className="flex-[2] min-w-0 bg-orange-50 rounded-xl p-3">
          <div className="h-2.5 w-28 rounded-full bg-orange-200 animate-pulse mb-3" />
          <div className="grid grid-cols-2 gap-4">
            {[0, 1].map((i) => (
              <div key={i} className="card-bezel h-full">
                <div className="card-bezel-inner h-full border-t-4 border-t-gray-200 p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className="h-2.5 w-16 rounded bg-gray-200 animate-pulse" />
                    <div className="w-2 h-2 rounded-full bg-gray-200 animate-pulse mt-0.5" />
                  </div>
                  <div className="h-8 w-20 rounded bg-gray-300 animate-pulse mb-2" />
                  <div className="h-2.5 w-full rounded bg-gray-200 animate-pulse mb-1" />
                  <div className="h-2.5 w-3/4 rounded bg-gray-200 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Issue Strip ── */}
      <div className="card-bezel mb-6">
        <div className="card-bezel-inner-open">
          <div className="flex items-center justify-between mb-3">
            <div className="h-2.5 w-36 rounded-full bg-gray-200 animate-pulse" />
            <div className="h-2.5 w-20 rounded-full bg-gray-200 animate-pulse" />
          </div>
          <div className="h-2.5 w-full rounded-full bg-gray-200 animate-pulse mb-4" />
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-sm bg-gray-200 animate-pulse" />
                <div className="h-3 w-8 rounded bg-gray-200 animate-pulse" />
                <div className="h-3 w-28 rounded bg-gray-200 animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Charts Row 1 ── */}
      <div className="grid grid-cols-1 gap-6 mb-6 lg:grid-cols-2">
        {/* Records per Province */}
        <div className="card-bezel">
          <div className="card-bezel-inner">
            <div className="bg-gray-300 px-4 py-2.5">
              <div className="h-2.5 w-44 rounded bg-gray-400 animate-pulse" />
            </div>
            <div className="p-4 flex flex-col gap-2.5">
              {[85, 60, 75, 45, 90, 55].map((w, i) => (
                <div
                  key={i}
                  className="h-5 rounded bg-gray-200 animate-pulse"
                  style={{ width: `${w}%` }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Records by Status */}
        <div className="card-bezel">
          <div className="card-bezel-inner">
            <div className="bg-gray-300 px-4 py-2.5 flex items-center justify-between">
              <div className="h-2.5 w-36 rounded bg-gray-400 animate-pulse" />
              <div className="flex items-center gap-2">
                <div className="h-6 w-20 rounded-md bg-gray-400 animate-pulse" />
                <div className="h-6 w-6 rounded-md bg-gray-400 animate-pulse" />
              </div>
            </div>
            <div className="p-4 flex flex-col gap-2.5">
              {[95, 30, 20, 15, 12].map((w, i) => (
                <div
                  key={i}
                  className="h-5 rounded bg-gray-200 animate-pulse"
                  style={{ width: `${w}%` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── COCROM Charts Row ── */}
      <div className="card-bezel mb-6">
        <div className="card-bezel-inner">
          <div className="bg-gray-300 px-4 py-2.5">
            <div className="h-2.5 w-52 rounded bg-gray-400 animate-pulse" />
          </div>
          <div className="p-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="h-32 rounded-lg bg-gray-200 animate-pulse" />
            <div className="h-32 rounded-lg bg-gray-200 animate-pulse" />
          </div>
        </div>
      </div>

      {/* ── Accomplishment Tracker ── */}
      <div className="card-bezel mb-6">
        <div className="card-bezel-inner">
          <div className="bg-gray-300 px-4 py-2.5 flex items-center justify-between">
            <div className="h-2.5 w-44 rounded bg-gray-400 animate-pulse" />
            <div className="flex gap-1">
              <div className="h-6 w-14 rounded-md bg-gray-400 animate-pulse" />
              <div className="h-6 w-16 rounded-md bg-gray-400 animate-pulse" />
              <div className="h-6 w-20 rounded-md bg-gray-400 animate-pulse" />
            </div>
          </div>
          <div className="p-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="card-bezel">
                <div className="card-bezel-inner p-4 flex flex-col gap-3">
                  <div className="h-2.5 w-24 rounded bg-gray-200 animate-pulse" />
                  <div className="h-24 w-full rounded-lg bg-gray-200 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Not Eligible for Encoding ── */}
      <div className="mt-6">
        <div className="card-bezel">
          <div className="card-bezel-inner">
            <div className="bg-gray-300 px-4 py-2.5">
              <div className="h-2.5 w-64 rounded bg-gray-400 animate-pulse" />
            </div>
            <div className="p-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="flex flex-col gap-3">
                <div className="h-2.5 w-20 rounded bg-gray-200 animate-pulse" />
                <div className="flex flex-col gap-2.5">
                  {[85, 60, 75, 45, 90].map((w, i) => (
                    <div
                      key={i}
                      className="h-5 rounded bg-gray-200 animate-pulse"
                      style={{ width: `${w}%` }}
                    />
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <div className="h-2.5 w-32 rounded bg-gray-200 animate-pulse" />
                <div className="flex flex-col gap-2.5">
                  {[70, 50, 65, 40, 55].map((w, i) => (
                    <div
                      key={i}
                      className="h-5 rounded bg-gray-200 animate-pulse"
                      style={{ width: `${w}%` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify the file compiles (TypeScript check)**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors related to `app/loading.tsx`. Any pre-existing errors elsewhere are acceptable.

- [ ] **Step 4: Start dev server and visually verify**

```bash
npm run dev
```

Open `http://localhost:3000` in a browser. You should see the skeleton for a moment before real data loads (or hold `Ctrl+Shift+J` → Network tab → throttle to "Slow 3G" to slow it down).

Confirm:
- All 8 sections render with gray animated blocks
- Blocks pulse smoothly
- Layout matches the real dashboard structure at desktop width (1200px+)
- Layout is responsive at mobile width (375px)

- [ ] **Step 5: Commit**

```bash
git add app/loading.tsx
git commit -m "feat: add skeleton loading screen for dashboard"
```
