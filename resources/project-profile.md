# Project Profile

> Written by Stage 1. Do not edit manually — Stage 1 will overwrite if re-run.

## Project identity

- **Name:** unclassified-app
- **Description:** Internal DAR Region V landholding records management system. Tracks landholdngs, ARBs, audit logs, and user management for the Department of Agrarian Reform (Philippines), Bicol region.
- **Deployment:** `https://unclassifieddemo.dar-bicol.com` (demo). Internal use only.
- **Sensitivity:** High — contains government land records, amounts, and eligibility data.

## Languages & runtimes

- TypeScript (strict), Node.js
- React 19.2.4

## Frameworks & major libraries

| Library | Version | Role |
|---|---|---|
| Next.js | 16.2.1 | Full-stack framework (App Router, proxy/middleware) |
| next-auth | 5.0.0-beta.30 | Credentials auth provider (parallel to custom session) |
| Prisma | 7.6.0 | ORM (SQLite via better-sqlite3 adapter) |
| better-sqlite3 | 12.8.0 | Raw SQL access used alongside Prisma |
| bcryptjs | 3.0.3 | Password hashing (cost factor 12) |
| jose | transitive via next-auth | JWT signing/verification |
| xlsx | 0.18.5 | Parses user-uploaded Excel/CSV; generates exports |
| @tanstack/react-table | 8.21.3 | Data table UI |
| recharts | 3.8.1 | Dashboard charts |

## Entry points

**Pages (App Router):**
- `/login` — public
- `/change-password` — authenticated, forced on first login
- `/` — dashboard
- `/records` — records browser
- `/arbs` — ARB viewer
- `/batch` — batch updates (editor+)
- `/flags` — data flags (admin+)
- `/audit` — audit log (admin+)
- `/users` — user management (admin+)

**API routes (27 total):**
- `POST /api/auth/login` — custom credentials login → sets `dar_session` JWT cookie
- `POST /api/auth/logout` — clears `dar_session` cookie (no server-side invalidation)
- `POST /api/auth/change-password` — re-hashes password, reissues token
- `GET /api/auth/[...nextauth]` — NextAuth handler (Credentials provider only)
- `GET /api/me` — returns current user from JWT
- `GET /api/records` — paginated landholding list with filters
- `GET/PATCH /api/records/[seqno]` — single record read/update
- `GET /api/records/export` — bulk XLSX export
- `PUT/POST /api/arbs/upload` — ARB file upload (parse preview / commit)
- `GET /api/arbs/export` — bulk ARB XLSX export
- `GET /api/arbs/[seqno]` — ARBs for a landholding
- `GET/PATCH /api/arbs/item/[id]` — single ARB edit
- `GET/POST /api/arbs/list` — ARB list
- `GET/POST /api/arbs/manual` — manual ARB entry
- `GET /api/audit` — audit log (admin-gated)
- `GET /api/flags` — data flags list (admin-gated)
- `GET/POST /api/users` — user list/creation (admin-gated)
- `PATCH /api/users/[id]` — user edit (admin-gated)
- `POST /api/users/[id]/reset-password` — admin password reset
- `PUT/POST /api/batch` — batch landholding updates (editor+)
- `POST /api/admin/recompute-status` — bulk status recompute (super_admin only)
- `GET /api/provinces` — province reference list
- `GET /api/municipalities` — municipality reference list

## Auth layer

**Two authentication systems co-exist:**

1. **Custom JWT session** (`lib/session.ts`) — the primary, active session mechanism:
   - HS256 JWT signed with `AUTH_SECRET` env var **OR** hardcoded fallback `"dar-region5-fallback-secret"` (`lib/session.ts:4`)
   - Stored in `dar_session` HttpOnly cookie (8h expiry, `sameSite: lax`, `secure` only in production)
   - `proxy.ts` verifies with `verifySessionToken()` before every non-public request
   - Every API route handler re-verifies inline with `verifySessionToken()`

2. **NextAuth Credentials provider** (`auth.ts`, `auth.config.ts`) — parallel, unclear if active:
   - `auth.config.ts` defines `authorized()` callback duplicating auth/redirect logic
   - `auth.ts` exports `{ handlers, auth, signIn, signOut }`
   - `proxy.ts` does NOT call `auth()` — it calls only the custom verifier
   - No code in the repo calls `auth()` from `auth.ts` within the request path
   - Status: likely a partially-integrated dependency that is not the active auth path

**Roles:** `super_admin > admin > editor > viewer`
**Office levels:** `regional > provincial > municipal` — data scoping via province/municipality fields

**Proxy coverage:**
- All unauthenticated requests → redirect `/login`
- Admin pages (`/flags`, `/audit`, `/users`) → redirect `/` if not admin
- Admin APIs (`/api/flags`, `/api/audit`) → 403 if not admin (proxy-level check)
- Other admin APIs (`/api/users`, `/api/admin/*`) → rely on inline route handler checks only

## Data stores

- **SQLite** at path from `DATABASE_URL` env var (`file:./dev.db` default)
- Two write paths:
  - **Prisma ORM** — reads and most writes
  - **`rawDb` (better-sqlite3)** — direct writes in `PATCH /api/records/[seqno]` and ARB upload commit (workaround for Prisma WASM adapter timeout)
- `prisma.$queryRaw` used in `app/api/arbs/export/route.ts:23` — tagged template literal, parameterized, no user input in query
- Dynamic SET clause in PATCH route (`app/api/records/[seqno]/route.ts:134`) — column names from developer-defined object, values parameterized with `?` — assessed safe

## External integrations

- None — fully self-contained

## File uploads

- **ARB Excel/CSV upload** (`POST /api/arbs/upload`):
  - Multipart `formData()` — no explicit size limit in app code; relies on Next.js ~4MB default
  - Parsed with `xlsx` 0.18.5 (two high-severity CVEs: Prototype Pollution + ReDoS)
  - No MIME type validation; `xlsx.read()` attempts parse on any uploaded bytes
  - Processed in-memory, not stored on disk

## Infrastructure & deployment

- Next.js standalone deployment (no Dockerfile or CI config found)
- `robots.txt` present: `Disallow: /`
- `X-Robots-Tag: noindex, nofollow` on all responses via `proxy.ts`
- `next.config.ts`: `allowedDevOrigins: ["192.168.1.101"]` only
- `.env` present (gitignored). Contains `AUTH_SECRET` and `DATABASE_URL`

## Existing security tooling

- ESLint (code quality only)
- No test suite found (no `__tests__/`, `spec/`, `*.test.ts`)
- No SAST, no dependency audit in CI, no WAF

## Notable observations

1. `lib/session.ts:4` — hardcoded fallback `"dar-region5-fallback-secret"` if `AUTH_SECRET` unset
2. `.env` — `AUTH_SECRET` is a human-readable low-entropy string
3. `/api/auth/logout` — clears cookie only; JWT valid for up to 8h post-logout
4. `/api/auth/login` — no rate limiting or lockout
5. `app/api/records/[seqno]/route.ts:161` — `String(e)` returned in 500 response (raw error leakage)
6. `xlsx` 0.18.5 — Prototype Pollution (GHSA-4r6h-8v6p-xvw6) and ReDoS (GHSA-5pgg-2g8v-p4x9)
7. `next` 16.2.1 — DoS with Server Components (GHSA-q4gf-8mx6-v5v3)
8. No Content-Security-Policy header configured anywhere
9. Dual auth architecture — NextAuth parallel setup whose `authorized()` callback may be inactive
