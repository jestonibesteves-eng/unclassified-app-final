# Threat Catalog

> Written by Stage 2. Each entry cites the exact file/line that triggered it.

## Threats

---

### T-001 — Hardcoded fallback JWT secret
- **Category:** A07 — Identification & Authentication Failures / Secrets
- **Why it applies:** `lib/session.ts:4` uses `process.env.AUTH_SECRET ?? "dar-region5-fallback-secret"`. If the env var is missing at runtime (misconfigured deploy, `.env` not loaded), the fallback is a known, human-readable string in source code. An attacker with access to the source (or this audit) can forge valid session tokens for any user.
- **Triggered by:** `lib/session.ts:3-5`
  ```ts
  const SECRET = new TextEncoder().encode(
    process.env.AUTH_SECRET ?? "dar-region5-fallback-secret"
  );
  ```
- **Evidence:** Hardcoded in the signing secret path used by both `createSessionToken` and `verifySessionToken`
- **Research notes:** HS256 JWT with a known secret = complete auth bypass. Anyone who can forge a token with `role: "super_admin"` has full system access.
- **Stage 3 status:** Pending

---

### T-002 — Weak AUTH_SECRET entropy
- **Category:** A02 — Cryptographic Failures
- **Why it applies:** `.env:4` sets `AUTH_SECRET="dar-region5-unclassified-arrs-secret-2025"` — a human-readable phrase with predictable structure. HS256 security depends entirely on the secret's entropy. This string is guessable and could be found in dictionary/phrase attacks.
- **Triggered by:** `.env:4`
- **Evidence:** `AUTH_SECRET="dar-region5-unclassified-arrs-secret-2025"`
- **Research notes:** NIST SP 800-63B recommends cryptographically random secrets. Best practice is `openssl rand -base64 64`.
- **Stage 3 status:** Pending

---

### T-003 — Logout does not invalidate JWT server-side
- **Category:** A07 — Identification & Authentication Failures / Session Management
- **Why it applies:** `app/api/auth/logout/route.ts` only calls `res.cookies.delete(SESSION_COOKIE)`. The `dar_session` JWT is not tracked server-side, so there is no revocation list. A captured cookie remains valid for up to 8 hours after the user logs out.
- **Triggered by:** `app/api/auth/logout/route.ts:4-8`
  ```ts
  export async function POST() {
    const res = NextResponse.json({ ok: true });
    res.cookies.delete(SESSION_COOKIE);
    return res;
  }
  ```
- **Research notes:** Stateless JWTs cannot be revoked without a server-side denylist or short expiry. 8h is a long window for a captured token to remain valid after logout.
- **Stage 3 status:** Pending

---

### T-004 — No login rate limiting or account lockout
- **Category:** A07 — Identification & Authentication Failures
- **Why it applies:** `app/api/auth/login/route.ts` performs password verification with no rate limit, no lockout, and no CAPTCHA. An attacker can attempt unlimited passwords against any known username.
- **Triggered by:** `app/api/auth/login/route.ts:6-43` — entire handler, no limiting logic present
- **Research notes:** bcrypt cost 12 provides ~200ms/attempt on modern hardware. At 5 req/s that's still 432,000 guesses/day per account. OWASP recommends lockout after 5–10 failures or exponential backoff.
- **Stage 3 status:** Pending

---

### T-005 — Raw error object returned to client on 500
- **Category:** A05 — Security Misconfiguration / Error Disclosure
- **Why it applies:** `app/api/records/[seqno]/route.ts:159-161` catches exceptions and returns `String(e)` as the JSON error body. This can expose SQLite error text, file paths, column names, or internal state to any caller.
- **Triggered by:** `app/api/records/[seqno]/route.ts:159-161`
  ```ts
  } catch (e) {
    console.error("PATCH /api/records/[seqno] error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
  ```
- **Research notes:** Database errors from SQLite via better-sqlite3 include table/column names and query fragments. Even `"SqliteError: UNIQUE constraint failed: Landholding.seqno_darro"` is more information than a client needs.
- **Stage 3 status:** Pending

---

### T-006 — xlsx Prototype Pollution via user-uploaded files
- **Category:** A06 — Vulnerable and Outdated Components
- **Why it applies:** `app/api/arbs/upload/route.ts:99` calls `XLSX.read(buffer, { type: "buffer" })` on untrusted user-uploaded bytes. `xlsx` 0.18.5 is vulnerable to Prototype Pollution (GHSA-4r6h-8v6p-xvw6). A crafted Excel file can mutate `Object.prototype`, corrupting application-wide object behavior and potentially enabling privilege escalation or bypassing object property checks.
- **Triggered by:** `app/api/arbs/upload/route.ts:99` and `package.json:29`
  ```ts
  rawRows = parseFile(buffer);  // → XLSX.read(buffer, ...)
  ```
- **Research notes:** GHSA-4r6h-8v6p-xvw6 is unpatched in the SheetJS CE (community edition) branch. The maintained fork `@sheet/core` (commercial) has fixes. The recommended mitigation is sandboxing the parse step or using a different parser. A second CVE (ReDoS, GHSA-5pgg-2g8v-p4x9) is lower risk here as the attack vector is regex-based, not via upload.
- **Stage 3 status:** Pending

---

### T-007 — Next.js DoS with Server Components (CVE)
- **Category:** A06 — Vulnerable and Outdated Components
- **Why it applies:** `package.json:25` pins `"next": "16.2.1"`, which is affected by GHSA-q4gf-8mx6-v5v3 (Denial of Service with Server Components). Exploitability depends on whether the project uses Server Components in the affected pattern.
- **Triggered by:** `package.json:25`
- **Research notes:** The advisory details a request crafting technique that causes the Next.js runtime to spin on certain Server Component renders. The app uses the App Router and does use Server Components. Fix is to upgrade Next.js. Severity: Medium (DoS only, no data exposure).
- **Stage 3 status:** Pending

---

### T-008 — Dual auth architecture — NextAuth `authorized()` callback status
- **Category:** A01 — Broken Access Control / A05 — Security Misconfiguration
- **Why it applies:** `auth.config.ts` defines an `authorized()` callback that enforces authentication and must-change-password redirects. `auth.ts` exports `auth`, `signIn`, `signOut`. However, `proxy.ts` (the actual request interceptor) does NOT call `auth()` — it calls only `verifySessionToken()` from the custom session. If `auth.config.ts` is wired up elsewhere (e.g., via Next.js runtime internals), it runs parallel auth logic with different state. If it is not wired up, it is dead code that creates confusion about what protects the app.
- **Triggered by:** `proxy.ts:1-58` (no import of `auth` from `auth.ts`) and `auth.config.ts:1-33`
- **Research notes:** In Next.js 16+, the `proxy.ts` file is the sole request interceptor. `auth.config.ts` with an `authorized` callback is the NextAuth-recommended way to protect routes using their middleware integration. Both approaches being present simultaneously indicates an incomplete migration or accidental duplication. The risk: if a route is protected by one system but not the other, and the "wrong" one fires, coverage may be inconsistent.
- **Stage 3 status:** Pending

---

### T-009 — No Content-Security-Policy header
- **Category:** A05 — Security Misconfiguration
- **Why it applies:** No CSP header is configured in `next.config.ts` or added in `proxy.ts` responses. While the app uses React (which escapes by default), a CSP would block inline script injection and reduce the impact of any XSS that does occur via third-party resources or future `dangerouslySetInnerHTML` usage.
- **Triggered by:** `next.config.ts:1-7` (no `headers()` config) and `proxy.ts:11-14` (only `X-Robots-Tag` set)
- **Research notes:** OWASP recommends CSP as a defense-in-depth layer. For an internal app with no CDN assets, a strict policy (`default-src 'self'`) is achievable. Info-level unless combined with an XSS vector.
- **Stage 3 status:** Pending

---

### T-010 — Session cookie missing `Secure` flag in non-production environments
- **Category:** A02 — Cryptographic Failures / Session Management
- **Why it applies:** `app/api/auth/login/route.ts:36` and `app/api/auth/change-password/route.ts:28` set `secure: process.env.NODE_ENV === "production"`. If the demo deployment runs with `NODE_ENV` not set to `"production"` (e.g., started with `next dev`), the session cookie is transmitted over plain HTTP, enabling cookie theft on non-TLS connections.
- **Triggered by:** `app/api/auth/login/route.ts:36`
  ```ts
  secure: process.env.NODE_ENV === "production",
  ```
- **Research notes:** Demo site is at `unclassifieddemo.dar-bicol.com` — if served over HTTPS this is mitigated in practice, but the code allows insecure transmission in dev mode.
- **Stage 3 status:** Pending

---

### T-011 — No file size limit on ARB upload at application layer
- **Category:** A05 — Security Misconfiguration
- **Why it applies:** `app/api/arbs/upload/route.ts:93` calls `req.formData()` without a size constraint. Next.js has a 4MB default body limit, but this is not explicitly enforced at the route level. A large file will be parsed entirely into memory before any validation, enabling resource exhaustion.
- **Triggered by:** `app/api/arbs/upload/route.ts:93-99`
- **Research notes:** Lower severity since Next.js default limit exists. Explicit limit would be better practice. More relevant if the 4MB limit is adjusted in config.
- **Stage 3 status:** Pending

---

## Cleared threats

| OWASP ID | Threat | Reason cleared |
|---|---|---|
| A03 SQL Injection | Dynamic SET clause in `PATCH /api/records/[seqno]` | Column names come from a developer-defined object (`updateData`), not from user input. Values use `?` parameterization. Verified at `route.ts:132-140`. |
| A03 SQL Injection | `prisma.$queryRaw` in `/api/arbs/export` | Tagged template literal — Prisma parameterizes automatically. No user input in the query body. Verified at `app/api/arbs/export/route.ts:23-37`. |
| A03 Command Injection | No shell commands found | No `child_process.exec`, `execSync`, `spawn`, or `eval` calls in any API route. |
| A03 Template Injection / SSTI | React rendering | App uses React JSX — no `dangerouslySetInnerHTML` detected in API routes. Server-rendered HTML via Next.js does not use template strings with user input. |
| A08 Deserialization | No unsafe deserialization | No `pickle`, `yaml.load`, `eval(JSON.parse(...))` patterns. JSON parsing uses `req.json()` (safe). |
| A10 SSRF | No user-supplied URLs fetched | No webhook URL, avatar URL, or import URL features. App fetches no external URLs based on user input. |
| A04 CSRF | Cookie is `SameSite: lax` + state-mutating routes require JSON body | All mutation routes accept `application/json` — plain HTML form cross-origin posts cannot set `Content-Type: application/json`, mitigating CSRF. `SameSite: lax` also blocks most cross-site cookie submission. |
| A08 Supply chain / defu | Prototype Pollution in `defu` | Transitive dev-only dependency via `@hono/node-server` → `@prisma/dev`. Not present in the runtime bundle. |
| A08 Supply chain / hono | Multiple Hono moderate CVEs | Hono is used only in Prisma's dev tooling (`@prisma/dev`), not in the application runtime. |

---

## Research log

- `npm audit` run locally — 11 vulnerable packages identified, narrowed to runtime-relevant: `next` (high DoS), `xlsx` (high: Prototype Pollution + ReDoS). Others (`hono`, `defu`, `@hono/node-server`, `@prisma/dev`, `prisma`) are dev/transitive tooling deps.
- Next.js 16 proxy/middleware docs confirmed: `proxy.ts` is the sole request interceptor; `auth.config.ts`'s `authorized()` is the NextAuth middleware integration pattern — having both simultaneously is the dual-auth concern.
- bcryptjs 3.0.3: no known CVEs. Cost factor 12 is appropriate.
- jose (JWT): no known CVEs in current version. HS256 is used correctly.
- Prisma 7.6.0 tagged as `moderate` in npm audit but only through the dev tooling path — cleared for runtime.
