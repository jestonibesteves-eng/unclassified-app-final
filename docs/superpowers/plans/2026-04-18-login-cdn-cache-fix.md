# Login CDN Stale-HTML Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Disable prerender + CDN caching on `/login` and `/change-password` by adding pass-through server-component layouts with `export const dynamic = "force-dynamic"`, so Hostinger hCDN no longer serves year-old HTML pointing to deleted chunk files.

**Architecture:** Two new tiny `layout.tsx` files, one per segment. Each is a server component that just returns `children` and exports `dynamic = "force-dynamic"`. Next.js applies the route segment config from the layout to the entire segment (including the `"use client"` page below), so the page is no longer prerendered. Next.js then emits `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate` instead of `s-maxage=31536000`, and hCDN stops caching the HTML.

**Tech Stack:** Next.js 16 App Router, TypeScript. No test framework in this project — verification is via `curl -I` against the live production URLs after deploy.

**File Structure:**
- **Create:** `app/login/layout.tsx` — 5 lines, pass-through layout with `dynamic` export
- **Create:** `app/change-password/layout.tsx` — same shape, different function name
- **Unchanged:** `app/login/page.tsx`, `app/change-password/page.tsx`, root `app/layout.tsx` — no behavior changes to the pages themselves

---

## Task 1: Add force-dynamic layouts to `/login` and `/change-password`

**Files:**
- Create: `app/login/layout.tsx`
- Create: `app/change-password/layout.tsx`

**Context:** Both segments currently have only a `"use client"` `page.tsx` and no `layout.tsx`. Next.js auto-wraps them in the root layout. Adding a segment-level `layout.tsx` adds one more nested layout between root and page. The layout must be a server component (no `"use client"` directive) so route segment config exports are respected without ambiguity.

- [ ] **Step 1: Create `app/login/layout.tsx`**

Create the file with this exact content:

```tsx
export const dynamic = "force-dynamic";

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
```

- [ ] **Step 2: Create `app/change-password/layout.tsx`**

Create the file with this exact content:

```tsx
export const dynamic = "force-dynamic";

export default function ChangePasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0, no errors. If TypeScript complains that `React` is not defined for the `React.ReactNode` type, import it: `import type { ReactNode } from "react";` and change the annotation to `ReactNode`. (In this project's setup, `React.ReactNode` typically works via the ambient types.)

- [ ] **Step 4: Lint (optional sanity check)**

Run: `npm run lint -- app/login/layout.tsx app/change-password/layout.tsx`
Expected: exit 0, no errors/warnings on the new files. Skip if lint runs too slowly.

- [ ] **Step 5: Commit**

```bash
git add app/login/layout.tsx app/change-password/layout.tsx
git commit -m "fix: add force-dynamic layouts to /login and /change-password to prevent CDN stale-HTML

Hostinger hCDN caches prerendered /login HTML for up to a year due
to Next.js's s-maxage=31536000 on static routes. After each deploy,
chunk filenames change and the cached HTML references 404s. The
pass-through layouts attach force-dynamic to each segment so Next.js
emits no-store headers and hCDN stops caching. See spec:
docs/superpowers/specs/2026-04-18-login-cdn-cache-fix-design.md"
```

---

## Task 2: Deploy and purge hCDN, then verify

**Files:** none (operational task)

**Context:** The code change only prevents *future* bad caching. The current bad cache at hCDN will persist until its TTL expires (up to 1 year). A one-time manual purge is required.

- [ ] **Step 1: Push and deploy**

```bash
git push origin main
```

Then run the normal Hostinger deployment (however the user currently deploys — git pull + `npm run build` + process restart on the VPS, or via hPanel's git-deploy feature).

- [ ] **Step 2: Purge hCDN cache**

In Hostinger hPanel: navigate to the relevant site → **Cache / Performance** (exact menu label may differ by hPanel version) → **Purge** (or "Clear cache"). Scope: site-wide or at least `/login`.

- [ ] **Step 3: Verify `/login` is no longer cached**

```bash
curl -sI https://unclassified.dar-bicol.com/login | grep -iE "cache-control|x-nextjs-cache|x-hcdn-cache-status|age:"
```

Expected output should contain:
- `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`
- `x-hcdn-cache-status: DYNAMIC` (or absent / MISS — anything other than HIT)

Expected output should NOT contain:
- `Cache-Control: s-maxage=31536000`
- `x-nextjs-cache: HIT`
- `x-nextjs-prerender: 1`
- `Age: <large number>`

If the old headers are still present, the purge didn't take effect. Re-run the purge; it may take a minute or two to propagate across edge nodes.

- [ ] **Step 4: Verify the current CSS chunk URL works**

```bash
# Extract the stylesheet URL from the live page
CSS_URL=$(curl -sk https://unclassified.dar-bicol.com/login | grep -oE 'href="/_next/static/chunks/[^"]+\.css"' | head -1 | sed -E 's/href="//;s/"$//')
echo "CSS URL: $CSS_URL"
curl -sI "https://unclassified.dar-bicol.com${CSS_URL}" | head -5
```

Expected: `HTTP/1.1 200 OK` and `Content-Type: text/css; charset=utf-8`. If it returns 404, the cache purge was incomplete — hCDN is still serving stale HTML pointing to stale chunk URLs. Re-purge.

- [ ] **Step 5: Manual browser check**

Open https://unclassified.dar-bicol.com/login in a browser and confirm the page is fully styled — dark green gradient background, white card, IBM Plex font, "Sign In" button styled. If still broken, check DevTools Console for errors and compare the `<link rel="stylesheet" href="...">` URL against what's actually on disk.

- [ ] **Step 6: Monitor for recurrence**

Over the next few days, check `/login` at least once after each new deploy. Expected: every curl should consistently return `no-store` headers and `DYNAMIC`/MISS cache status — never HIT again. If HIT appears after a deploy, the fix didn't stick; investigate whether the layout files are actually being deployed and whether Next.js is honoring them.

---

## Self-review

**Spec coverage:**

- Fix at `/login` via force-dynamic layout → Task 1 Step 1. ✅
- Fix at `/change-password` (prophylactic) → Task 1 Step 2. ✅
- Use a layout (server component) rather than modifying the `"use client"` page → Task 1 design, both Steps 1 and 2. ✅
- One-time hCDN purge → Task 2 Step 2. ✅
- Verification via `curl -I` looking for absence of `s-maxage` and `x-nextjs-cache: HIT` → Task 2 Step 3. ✅
- Verification that CSS chunk returns 200 text/css → Task 2 Step 4. ✅
- No changes to login UI/behavior, no CSS/Tailwind changes → honored (only new files added). ✅
- No global `Cache-Control` override → honored (scoped to two segments only). ✅

**Placeholder scan:** no TBD/TODO/"handle edge cases" language. Every code step shows the actual file contents or exact shell command.

**Type consistency:** `React.ReactNode` is the same shape used in `app/layout.tsx:27`. Function names (`LoginLayout`, `ChangePasswordLayout`) don't collide with anything. No imports needed beyond the built-in React type.
