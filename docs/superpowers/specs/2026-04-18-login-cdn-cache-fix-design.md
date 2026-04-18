# Login Page Unstyled — CDN Stale-HTML Fix

**Date:** 2026-04-18
**Scope:** `/login` (primary) and `/change-password` (prophylactic) on production

## Problem

Intermittently, production renders `/login` as completely unstyled HTML — browser defaults, no Tailwind, no background color, no fonts. Hard-refresh does not fix it. Only `/login` is affected; authenticated pages never break.

### Root cause

Next.js 16 prerenders `/login` at build time (a `"use client"` page with no server-side data — treated as fully static). For prerendered routes, Next.js emits:

```
Cache-Control: s-maxage=31536000
```

That tells any shared cache in front (CDN, reverse proxy) to cache the HTML for **one full year**. This is designed for platforms like Vercel, which automatically purge the CDN on deploy.

Hostinger's hCDN (`Server: hcdn`, `platform: hostinger`) **does not auto-purge on deploy.** So on deploy:

1. `next build` emits new chunk filenames (new hashes) into `.next/static/chunks/*`
2. Old chunks are deleted from disk
3. hCDN still has the **old HTML** cached (with `Age:` up to a year)
4. Users hit the cached HTML → it references old chunk URLs → those URLs return **404** (the file is gone)
5. Browser refuses the 404 response as a stylesheet → unstyled page

### Evidence from diagnosis

From `curl -I https://unclassified.dar-bicol.com/login`:

```
x-nextjs-cache: HIT
x-nextjs-prerender: 1
Cache-Control: s-maxage=31536000
Age: 524525                   # ~6 days old
x-hcdn-cache-status: HIT
```

From `curl -I https://unclassified.dar-bicol.com/_next/static/chunks/0nklytgvj3cxj.css` (a chunk URL taken from that cached HTML):

```
HTTP/1.1 404 Not Found
Content-Type: text/plain; charset=utf-8
```

From browser DevTools console on the broken page:

```
Refused to apply style from '.../0nklytgvj3cxj.css' because its MIME type
('text/plain') is not a supported stylesheet MIME type
```

The `text/plain` is the MIME of the 404 error-page body, not a misconfiguration on the CSS file. The real issue is the file is gone and the 404 response isn't a valid stylesheet.

### Why only `/login`

`/login` is the only page that is:
- Unauthenticated (no cookie-based bypass at the CDN)
- Static / prerendered (Next.js emits long `s-maxage`)

Authenticated pages (dashboard, records, etc.) carry cookies, which causes hCDN to treat them as `DYNAMIC` and skip caching. So the stale-cache problem doesn't affect them.

### Why intermittent, and why hard-refresh doesn't help

- **Intermittent:** different hCDN edge nodes (`-kul-edge3`, etc.) have independent caches. A new edge sees fresh HTML; an old edge serves stale HTML. The user's DNS may route to different edges over time.
- **Hard-refresh doesn't help:** browser hard-refresh sends `Cache-Control: no-cache` on the *request*, which busts the browser cache. It does not bust hCDN's edge cache. hCDN honors its own TTL.

## Fix

### Code change

Both affected pages (`app/login/page.tsx`, `app/change-password/page.tsx`) are `"use client"` components. Route Segment Config on `"use client"` pages is ambiguous in practice, so apply the config via a server-component layout at each segment instead.

Create `app/login/layout.tsx`:

```tsx
export const dynamic = "force-dynamic";

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
```

Create `app/change-password/layout.tsx` with identical content (swap the function name to `ChangePasswordLayout`). `/change-password` is currently not cache-HIT because unauth users hit a 307 redirect, but an authed user hard-refreshing could still trigger the same problem with its prerendered HTML. Belt-and-suspenders.

These layouts are pass-through — they don't add DOM, don't interfere with the root layout's providers (layouts nest), and exist solely to attach the `dynamic` route segment config to the segment.

### What `force-dynamic` does

- Disables Next.js prerendering for this route
- Next.js emits `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate` instead of `s-maxage=31536000`
- hCDN will no longer cache the HTML
- Each request re-renders the HTML shell server-side with current chunk hashes — cheap, no DB calls, just React

### One-time CDN purge

The existing bad cache at hCDN will persist after the deploy until its TTL expires (up to 1 year) or it's manually evicted. After the deploy, purge the cache via **Hostinger hPanel → Website → Cache / Performance → Purge** (or the equivalent in the current hPanel UI). Without this, users will continue seeing the broken page from cached copies even though the fix is live.

### Verification

After deploy AND purge:

```bash
curl -sI https://unclassified.dar-bicol.com/login
```

Expect:
- `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`
- No `x-nextjs-cache: HIT`
- No `Age: <large>`
- No `x-hcdn-cache-status: HIT` (should be `DYNAMIC` or absent)

And then, take the CSS chunk URL from the returned HTML:

```bash
curl -sI https://unclassified.dar-bicol.com/_next/static/chunks/<hash>.css
```

Expect `HTTP/1.1 200 OK` with `Content-Type: text/css`.

## Non-goals

- No UI/behavior changes to the login form
- No changes to the Tailwind / CSS pipeline
- No server-side / Hostinger config changes (beyond the manual purge)
- No global `Cache-Control` override in `next.config.ts` — scoped to the affected pages via `force-dynamic`

## Alternatives considered

**Global `Cache-Control: no-store` header via `next.config.ts`:** works but heavier-handed — disables CDN caching for every route. `force-dynamic` on the two affected pages is narrower and idiomatic.

**Disable Turbopack for production builds:** not the cause. Cause is stale HTML cached by CDN, not chunk-path differences.

**Add `.htaccess` with MIME-type overrides:** doesn't apply — the 404 is a genuine missing-file, not a MIME misconfiguration.

**Purge CDN on every deploy via hPanel API:** better operational hygiene but orthogonal — the root issue is that Next.js marks `/login` as year-cacheable. Fix that and the deploy-purge requirement goes away.

## Files affected

- **Create:** `app/login/layout.tsx` (pass-through layout with `export const dynamic = "force-dynamic";`)
- **Create:** `app/change-password/layout.tsx` (same, different function name)

Two new small files. No changes to the existing page files. No tests — this project has no test framework; verification is via the `curl -I` checks above after deploy.

## Unrelated-but-noted

The secondary console error on the broken page:

```
Uncaught (in promise) SyntaxError: Unexpected token '<', '<!DOCTYPE'... is not valid JSON
```

is almost certainly a client-side fetch (session check on mount via `UserContext`) receiving the HTML 404 page instead of JSON. It should clear up once the CDN stops serving stale HTML that references dead chunks. If it persists after the fix, investigate separately.
