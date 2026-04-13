# Findings

> Stage 3 writes this file. Stage 5 updates `status` and `pen_test` fields.
> Every T-xxx from threat-catalog.md must appear here as a finding or a cleared note.

## Severity legend

| Severity | Meaning |
|---|---|
| Critical | Unauthenticated RCE; auth bypass; mass data exposure; hardcoded prod secret |
| High | Privilege escalation; authenticated RCE; exploitable injection; SSRF; stored XSS |
| Medium | Info disclosure; missing hardening with real impact; limited-blast injection; session issues |
| Low | Defense-in-depth gaps; verbose errors without sensitive info; minor config hardening |
| Info | Non-exploitable observations; best-practice recommendations |

## Status legend

| Status | Meaning |
|---|---|
| `open` | Confirmed finding, awaiting Stage 4 approval |
| `approved` | Approved for fix in Stage 4 |
| `rejected` | User declined fix; reason recorded |
| `deferred` | Deferred to a later pass |
| `mitigated` | Fix applied and pen test passes |
| `blocked` | Cannot be mitigated automatically; blocker recorded |

---

## F-001 — Hardcoded fallback JWT signing secret

- **Severity:** High
- **Source threat:** T-001
- **Location:** `lib/session.ts:3-5`
- **Evidence:**
  ```ts
  const SECRET = new TextEncoder().encode(
    process.env.AUTH_SECRET ?? "dar-region5-fallback-secret"
  );
  ```
- **Reasoning:** If `AUTH_SECRET` is absent from the environment (misconfigured deploy, missing `.env` on a new server), every session token is signed with the known string `"dar-region5-fallback-secret"`. An attacker with source code access can craft a JWT for any user — including `{ role: "super_admin" }` — that the server will accept as valid. This grants full access to the system, including all records, user management, and admin operations. The fallback is in the signing path used by both token creation and verification.
- **Proposed mitigation:** Remove the fallback. If `AUTH_SECRET` is missing at startup, throw and refuse to start — do not silently fall back to a predictable value.
  ```ts
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET environment variable is required");
  const SECRET = new TextEncoder().encode(secret);
  ```
- **High blast radius?** No — single-file change, no schema or middleware changes.
- **Status:** open
- **Pen test path:** `__tests__/security/f001-fallback-secret.test.ts` (to be written in Stage 5)
- **Fix notes:** —

---

## F-002 — Weak AUTH_SECRET entropy

- **Severity:** Medium
- **Source threat:** T-002
- **Location:** `.env:4`
- **Evidence:** `AUTH_SECRET="dar-region5-unclassified-arrs-secret-2025"`
- **Reasoning:** The current secret is a human-readable phrase with a predictable format (agency-region-system-year). HS256 security is directly proportional to secret entropy. A phrase-based secret is vulnerable to dictionary/phrase attacks and social engineering guesses by anyone who knows the system's context. If the secret is brute-forced, all issued tokens can be forged.
- **Proposed mitigation:** Replace with a cryptographically random value of at least 64 bytes:
  ```bash
  openssl rand -base64 64
  ```
  This is an operational action (rotating the env var), not a code change. All existing sessions will be invalidated — users will need to log in again.
- **High blast radius?** No — env var change only. Existing sessions invalidated (expected/acceptable).
- **Status:** open
- **Pen test path:** N/A — cannot write a test for secret entropy; document as manual verification.
- **Fix notes:** —

---

## F-003 — Raw error object returned to client on 500 (two locations)

- **Severity:** Medium
- **Source threat:** T-005
- **Location 1:** `app/api/records/[seqno]/route.ts:161`
- **Location 2:** `app/api/arbs/list/route.ts:184`
- **Evidence:**
  ```ts
  // records/[seqno]/route.ts:161
  return NextResponse.json({ error: String(e) }, { status: 500 });

  // arbs/list/route.ts:184
  return NextResponse.json({ error: String(err) }, { status: 500 });
  ```
- **Reasoning:** `String(err)` on a SQLite or Prisma exception produces messages like:
  - `SqliteError: UNIQUE constraint failed: Landholding.seqno_darro`
  - `SqliteError: table "Arb" has no column named xyz`
  - Internal file paths if the DB file is missing
  These reveal internal schema names, constraint names, and database internals. An attacker can use deliberate error triggering to enumerate the schema.
- **Proposed mitigation:** Return a generic message to the client; keep the detail server-side (already logged).
  ```ts
  return NextResponse.json({ error: "An internal error occurred. Please try again." }, { status: 500 });
  ```
- **High blast radius?** No — two one-line changes.
- **Status:** open
- **Pen test path:** `__tests__/security/f003-error-disclosure.test.ts`
- **Fix notes:** —

---

## F-004 — Logout does not invalidate JWT server-side

- **Severity:** Medium
- **Source threat:** T-003
- **Location:** `app/api/auth/logout/route.ts:4-8`
- **Evidence:**
  ```ts
  export async function POST() {
    const res = NextResponse.json({ ok: true });
    res.cookies.delete(SESSION_COOKIE);
    return res;
  }
  ```
- **Reasoning:** The `dar_session` JWT is stateless. Logout only instructs the browser to delete its cookie. If an attacker captured the JWT (e.g., via XSS, network sniff, or shared device), the token remains cryptographically valid until its 8-hour `exp` claim passes. The server has no mechanism to reject it. This means "log out and hand the device to someone else" does not actually terminate the session.
- **Proposed mitigation:** Two options (in order of impact):
  1. **Short-lived tokens + server denylist** (more secure): Maintain a small in-memory or DB set of invalidated JTI (JWT ID) values. On logout, add the token's JTI. On verify, reject tokens whose JTI is in the set.
  2. **Reduce token lifetime** (simpler): Drop from 8h to 1h. Limits the damage window without code complexity. Combined with the existing HttpOnly cookie, this significantly reduces practical risk.
  
  For this internal system, option 2 is recommended as the pragmatic fix.
- **High blast radius?** No for option 2 (change `"8h"` → `"1h"` in two places). Option 1 requires a denylist store.
- **Status:** open
- **Pen test path:** `__tests__/security/f004-session-invalidation.test.ts`
- **Fix notes:** —

---

## F-005 — No login rate limiting or account lockout

- **Severity:** Medium
- **Source threat:** T-004
- **Location:** `app/api/auth/login/route.ts:6-43`
- **Evidence:** Entire handler contains no rate limiting, lockout, or delay logic. `bcrypt.compare` runs on every attempt.
- **Reasoning:** An attacker who knows a valid username can submit unlimited password guesses. bcrypt cost 12 (~200ms/attempt) provides some throttling, but with concurrent requests an attacker can still attempt ~300 guesses/minute against a single account. There is no lockout, no CAPTCHA, and no IP-based throttling. For an internal government system with sensitive records, this is an unacceptable brute-force surface.
- **Proposed mitigation:** Add Next.js middleware-level or route-level rate limiting using a lightweight in-memory store (e.g., a `Map<ip, { count, resetAt }>`). Lock an IP out for 15 minutes after 10 failed attempts. Alternatively, integrate a library like `rate-limiter-flexible`.
  Since this is a standalone Next.js app with no Redis, an in-memory per-IP limiter is the pragmatic approach. Caveat: resets on server restart.
- **High blast radius?** No — additive change to one route.
- **Status:** open
- **Pen test path:** `__tests__/security/f005-rate-limiting.test.ts`
- **Fix notes:** —

---

## F-006 — xlsx Prototype Pollution via user-uploaded files

- **Severity:** High
- **Source threat:** T-006
- **Location:** `app/api/arbs/upload/route.ts:99`, `package.json:29`
- **Evidence:**
  ```ts
  const wb = XLSX.read(buffer, { type: "buffer" });
  // buffer is from user-uploaded file
  ```
  `xlsx` 0.18.5 — GHSA-4r6h-8v6p-xvw6 (Prototype Pollution): a crafted XLSX file can mutate `Object.prototype` during parsing, affecting all subsequent object property lookups in the Node.js process.
- **Reasoning:** Prototype Pollution via `Object.prototype` mutation can:
  - Bypass `hasOwnProperty` checks
  - Inject properties into objects that appear to have no property set (e.g., `obj.role` becoming `"super_admin"` if prototype was polluted)
  - Cause denial of service via corrupted iterators
  The upload endpoint is accessible to `editor`, `admin`, and `super_admin` — a malicious insider or compromised editor account could submit a crafted file.
- **Proposed mitigation:** The SheetJS community edition (the `xlsx` npm package) is no longer maintained for security issues. Options:
  1. **Replace with `exceljs`** — actively maintained, no known Prototype Pollution CVEs: `npm install exceljs`
  2. **Pin and sandbox** — not viable without significant infrastructure changes
  Recommended: replace `xlsx` with `exceljs` for the upload parse step. The export (write) side can also be migrated but is lower priority.
- **High blast radius?** Medium — the `parseFile()` function in the upload route and ARB row mapping would need to be rewritten for the `exceljs` API. Export routes (`/api/records/export`, `/api/arbs/export`) use `xlsx` for writing only and can be migrated separately.
- **Status:** open
- **Pen test path:** `__tests__/security/f006-xlsx-prototype-pollution.test.ts`
- **Fix notes:** —

---

## F-007 — Next.js DoS via Server Components (GHSA-q4gf-8mx6-v5v3)

- **Severity:** Low (for this deployment context)
- **Source threat:** T-007
- **Location:** `package.json:25` — `"next": "16.2.1"`
- **Evidence:** Advisory GHSA-q4gf-8mx6-v5v3 affects Next.js versions with Server Components. This app uses App Router with Server Components.
- **Reasoning:** The advisory describes a DoS condition where crafted requests cause excessive processing in Server Component rendering. Exploitability requires an authenticated or network-accessible attacker. Since this is an internal system behind authentication (proxy blocks unauthenticated access), the practical risk is limited to insider DoS. Still, upgrading Next.js is the correct remediation and has additional bug-fix value.
- **Proposed mitigation:** Upgrade Next.js. Check the changelog for breaking changes between 16.2.1 and the latest 16.x patch release. This is a low-blast-radius patch upgrade within the same major.
- **High blast radius?** Low — patch version bump within Next.js 16.
- **Status:** open
- **Pen test path:** N/A — DoS tests are not appropriate for this environment. Document as manual verification with changelog review.
- **Fix notes:** —

---

## F-008 — Dual auth architecture: NextAuth `auth.config.ts` is dead code

- **Severity:** Info
- **Source threat:** T-008
- **Location:** `auth.config.ts:1-33`, `proxy.ts:1-58`
- **Evidence:** `proxy.ts` imports only from `@/lib/session` — it never imports or calls `auth` from `auth.ts`. Searched entire `app/` directory for `auth()` calls — none found. The `authorized()` callback in `auth.config.ts` is configured but never invoked in the active request path.
- **Reasoning:** `auth.config.ts` contains an `authorized()` callback that duplicates the auth and must-change-password redirect logic in `proxy.ts`. Since `proxy.ts` is the actual request interceptor and does not call NextAuth's middleware integration, `auth.config.ts` is unreachable dead code. This creates confusion for future maintainers about which auth system is active, and risks having the "wrong" one accidentally enabled if `proxy.ts` is ever refactored. The NextAuth handler at `/api/auth/[...nextauth]` is still present and issues its own sessions — it is unclear whether any client code uses NextAuth's session vs. the custom `dar_session`.
- **Proposed mitigation:** Remove `auth.config.ts`, `auth.ts`, and the `/api/auth/[...nextauth]` route entirely if they are not used. If NextAuth is kept for future OAuth integration, document clearly that `proxy.ts`'s custom JWT is the active auth path.
- **High blast radius?** Low — removing unused files has no runtime impact, but should be verified by checking all imports.
- **Status:** open
- **Pen test path:** N/A — architectural finding, no exploit vector to test.
- **Fix notes:** —

---

## F-009 — No Content-Security-Policy header

- **Severity:** Info
- **Source threat:** T-009
- **Location:** `next.config.ts:1-7`
- **Evidence:** No `headers()` export in `next.config.ts`. `proxy.ts` only sets `X-Robots-Tag`.
- **Reasoning:** No XSS vulnerability was found in the React components (no `dangerouslySetInnerHTML`, no `v-html`, no server-side HTML construction with user input). In the absence of an active XSS vector, CSP is defense-in-depth only. Rated Info for this audit pass.
- **Proposed mitigation:** Add `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and a starter CSP to `next.config.ts` headers config. These are straightforward to add and improve posture without functional impact.
- **High blast radius?** No.
- **Status:** open
- **Pen test path:** N/A — header presence is a config check, not an exploit test.
- **Fix notes:** —

---

## Cleared threats from catalog

| T-ID | Threat | Cleared reason |
|---|---|---|
| T-010 | Session cookie Secure flag | `.env` confirms `NEXTAUTH_URL=http://localhost:3000` is local dev only. Production deployment over HTTPS means the `secure: NODE_ENV === "production"` guard works correctly in practice. No finding. |
| T-011 | No file upload size limit | Next.js 16 enforces a 4MB body limit by default for API routes. The ARB upload use case (Excel files with hundreds of rows) is well under this limit. Low residual risk; recommend adding an explicit limit as a hardening step but not a finding. |

---

## Summary

| ID | Severity | Title | Status |
|---|---|---|---|
| F-001 | High | Hardcoded fallback JWT secret | open |
| F-002 | Medium | Weak AUTH_SECRET entropy | open |
| F-003 | Medium | Raw error returned to client (2 routes) | open |
| F-004 | Medium | Logout doesn't invalidate JWT | open |
| F-005 | Medium | No login rate limiting | open |
| F-006 | High | xlsx Prototype Pollution via file upload | open |
| F-007 | Low | Next.js DoS CVE (GHSA-q4gf-8mx6-v5v3) | open |
| F-008 | Info | NextAuth auth.config.ts is dead code | open |
| F-009 | Info | No Content-Security-Policy header | open |
