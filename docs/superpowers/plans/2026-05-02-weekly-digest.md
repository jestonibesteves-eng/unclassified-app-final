# Weekly Digest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send a personalized weekly email digest every Monday at 8:00 AM PHT (manual by default, opt-in auto) reporting COCROM validation, encoding, and distribution progress to regional and provincial recipients.

**Architecture:** Three libraries (`lib/digest.ts` for data queries, `lib/email.ts` for HTML generation and SMTP sending) plus standard Next.js API routes under `/api/admin/digest/` and a single admin page at `/digest`. The scheduler in `instrumentation.node.ts` mirrors the existing daily-backup pattern (setTimeout → setInterval, with catch-up on startup). All routes require `super_admin`.

**Tech Stack:** Nodemailer (new dep) with Hostinger SMTP port 465/SSL, better-sqlite3 rawDb for DigestRecipient + Setting queries, Prisma for CommitmentTarget reads, Tailwind CSS for the admin UI page.

---

## File Structure

| File | Status | Responsibility |
|------|--------|----------------|
| `lib/digest.ts` | **Create** | Types, week-bounds helper, all SQL queries, `sendWeeklyDigest()` orchestrator |
| `lib/email.ts` | **Create** | Nodemailer transport, email-safe HTML builder, per-recipient `sendEmail()` |
| `app/digest/page.tsx` | **Create** | Admin UI — settings card + recipients table |
| `app/api/admin/digest/recipients/route.ts` | **Create** | GET list, POST add |
| `app/api/admin/digest/recipients/[id]/route.ts` | **Create** | PUT update, DELETE remove |
| `app/api/admin/digest/settings/route.ts` | **Create** | GET + PUT digest settings |
| `app/api/admin/digest/send/route.ts` | **Create** | POST manual send trigger |
| `app/api/admin/digest/preview/route.ts` | **Create** | GET computed data without sending |
| `lib/db.ts` | **Modify** | Add `DigestRecipient` table to `runMigrations()` |
| `instrumentation.node.ts` | **Modify** | Add `scheduleWeeklyDigest()` call inside `registerNode()` |
| `proxy.ts` | **Modify** | Add `"/digest"` to `ADMIN_PAGES` |

---

## Task 1: Install nodemailer

**Files:**
- Modify: `package.json` (via npm install)

- [ ] **Step 1: Install nodemailer**

```bash
npm install nodemailer
npm install --save-dev @types/nodemailer
```

- [ ] **Step 2: Verify package.json contains both entries**

Open `package.json` and confirm `"nodemailer"` appears under `dependencies` and `"@types/nodemailer"` under `devDependencies`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add nodemailer for weekly email digest"
```

---

## Task 2: Database migration — DigestRecipient table + Setting keys

**Files:**
- Modify: `lib/db.ts`

The `runMigrations(db)` function in `lib/db.ts` is called once inside `createRawDb()` (line 62). Add the new table creation at the end of that function.

- [ ] **Step 1: Open `lib/db.ts` and locate `runMigrations`**

Find the `runMigrations(db: Database.Database)` function (lines 26–51). It already has `db.prepare(...).run()` calls. You will append three new statements.

- [ ] **Step 2: Add the DigestRecipient table and two Setting keys**

At the end of the `runMigrations` function body, before its closing brace, add:

```typescript
  db.prepare(`
    CREATE TABLE IF NOT EXISTS "DigestRecipient" (
      "id"         INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "name"       TEXT NOT NULL,
      "nickname"   TEXT,
      "email"      TEXT NOT NULL UNIQUE,
      "role"       TEXT NOT NULL,
      "level"      TEXT NOT NULL,
      "province"   TEXT,
      "active"     INTEGER NOT NULL DEFAULT 1,
      "created_at" TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `).run();

  db.prepare(`INSERT OR IGNORE INTO "Setting" (key, value) VALUES ('email_digest_enabled', 'false')`).run();
  db.prepare(`INSERT OR IGNORE INTO "Setting" (key, value) VALUES ('email_digest_last_sent_at', '')`).run();
```

- [ ] **Step 3: Start the dev server to trigger migration**

```bash
npm run dev
```

Expected: Server starts without errors. The `DigestRecipient` table is created silently (no output needed — the `IF NOT EXISTS` guard makes it idempotent).

- [ ] **Step 4: Verify table exists**

```bash
npx better-sqlite3 ./dev.db ".schema DigestRecipient"
```

Expected output includes `CREATE TABLE "DigestRecipient"`.

- [ ] **Step 5: Commit**

```bash
git add lib/db.ts
git commit -m "feat: add DigestRecipient table and digest Setting keys migration"
```

---

## Task 3: lib/digest.ts — types, queries, orchestrator

**Files:**
- Create: `lib/digest.ts`

This file owns all data logic: week calculation, SQL queries (using `rawDb` and `prisma`), and the `sendWeeklyDigest()` orchestrator that reads recipients, fetches digest data, and dispatches emails.

Status value constants used throughout:
- **Validated states** (LH passed validation): `'For Encoding' | 'Fully Encoded' | 'Partially Encoded' | 'Fully Distributed' | 'Partially Distributed' | 'Not Eligible for Encoding'`
- **Encoded states** (LH has encoded COCROMs): `'Fully Encoded' | 'Partially Encoded' | 'Fully Distributed' | 'Partially Distributed'`

- [ ] **Step 1: Create `lib/digest.ts` with types and week-bounds helper**

```typescript
import { rawDb } from "@/lib/db";
import { prisma } from "@/lib/db";
import { buildEmailHtml, buildSubjectLine, sendEmail } from "@/lib/email";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DigestRecipient {
  id: number;
  name: string;
  nickname: string | null;
  email: string;
  role: string;
  level: "regional" | "provincial";
  province: string | null;
  active: number;
  created_at: string;
}

export interface DigestScope {
  level: "regional" | "provincial";
  province?: string;
}

export interface CumulativeMetric {
  completed: number;
  target: number;
  balance: number;
  pct: number;
}

export interface DigestData {
  scope: DigestScope;
  weeklyLhsValidated: number;
  weeklyCocromsEncoded: number;
  cumLhsValidated: CumulativeMetric;
  cumCocromsEncoded: CumulativeMetric;
  cumCocromsForDistribution: CumulativeMetric;
  provinces?: ProvinceSummary[];
}

export interface ProvinceSummary {
  province: string;
  weeklyLhsValidated: number;
  weeklyCocromsEncoded: number;
  lhsValidatedPct: number;
  cocromsEncodedPct: number;
  vsCommitment: number;
}

// ── Week bounds ───────────────────────────────────────────────────────────────

export function getWeekBounds(now: Date = new Date()): { weekStart: Date; weekEnd: Date } {
  // Shift now into PHT by adding 8 h so UTC day/hour arithmetic gives PHT values
  const phtNow = new Date(now.getTime() + 8 * 3600_000);
  const day = phtNow.getUTCDay(); // 0 = Sun
  const daysBack = day === 0 ? 6 : day - 1; // days since last Monday (PHT)

  const thisMondayPht = new Date(phtNow);
  thisMondayPht.setUTCDate(phtNow.getUTCDate() - daysBack);
  thisMondayPht.setUTCHours(0, 0, 0, 0); // Mon 00:00:00.000 PHT (as fake-UTC)

  // Previous week: [Mon 00:00, Sun 23:59:59.999] PHT
  const weekStartPht = new Date(thisMondayPht.getTime() - 7 * 86_400_000);
  const weekEndPht   = new Date(thisMondayPht.getTime() - 1);

  // Convert back to real UTC (subtract the 8-hour shift)
  return {
    weekStart: new Date(weekStartPht.getTime() - 8 * 3600_000),
    weekEnd:   new Date(weekEndPht.getTime()   - 8 * 3600_000),
  };
}

// ── Active recipients ─────────────────────────────────────────────────────────

export function getActiveRecipients(): DigestRecipient[] {
  return rawDb
    .prepare(`SELECT * FROM "DigestRecipient" WHERE active = 1 ORDER BY level, province, name`)
    .all() as DigestRecipient[];
}

// ── Digest data queries ───────────────────────────────────────────────────────

const VALIDATED_STATUSES = `'For Encoding','Fully Encoded','Partially Encoded','Fully Distributed','Partially Distributed','Not Eligible for Encoding'`;
const ENCODED_STATUSES   = `'Fully Encoded','Partially Encoded','Fully Distributed','Partially Distributed'`;

export async function getDigestData(
  weekStart: Date,
  weekEnd: Date,
  scope: DigestScope
): Promise<DigestData> {
  const ws = weekStart.toISOString();
  const we = weekEnd.toISOString();

  const provFilter  = scope.level === "provincial" && scope.province ? scope.province : null;
  const whereProvLh = provFilter ? `AND province_edited = ?` : "";
  const whereProvArb = provFilter
    ? `AND l.province_edited = ?`
    : "";
  const bindLh   = provFilter ? [ws, we, provFilter] : [ws, we];
  const bindBase = provFilter ? [provFilter] : [];

  // Section 1 — weekly activity -----------------------------------------------
  const weeklyLhsValidated = (
    rawDb
      .prepare(`SELECT COUNT(*) as c FROM "Landholding"
                WHERE updated_at >= ? AND updated_at <= ?
                AND status IN (${VALIDATED_STATUSES})
                ${whereProvLh}`)
      .get(...bindLh) as { c: number }
  ).c;

  const weeklyCocromsEncoded = (
    rawDb
      .prepare(`SELECT COUNT(*) as c FROM "Landholding"
                WHERE updated_at >= ? AND updated_at <= ?
                AND status IN (${ENCODED_STATUSES})
                ${whereProvLh}`)
      .get(...bindLh) as { c: number }
  ).c;

  // Section 2 — cumulative LHs validated --------------------------------------
  const lhRows = rawDb
    .prepare(`SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status IN (${VALIDATED_STATUSES}) THEN 1 END) as completed
      FROM "Landholding"
      ${provFilter ? `WHERE province_edited = ?` : ""}`)
    .get(...bindBase) as { total: number; completed: number };

  const cumLhsValidated = metric(lhRows.completed, lhRows.total);

  // Section 2 — cumulative COCROMs encoded ------------------------------------
  const encRow = rawDb
    .prepare(`SELECT
        COUNT(CASE WHEN (a.carpable = 'CARPABLE' OR a.eligibility = 'Eligible')
                        AND a.date_encoded IS NOT NULL AND a.date_encoded != '' THEN 1 END) as completed,
        COUNT(CASE WHEN (a.carpable = 'CARPABLE' OR a.eligibility = 'Eligible') THEN 1 END) as total
      FROM "Arb" a
      JOIN "Landholding" l ON a.landholding_id = l.id
      ${provFilter ? `WHERE l.province_edited = ?` : ""}`)
    .get(...bindBase) as { completed: number; total: number };

  const cumCocromsEncoded = metric(encRow.completed, encRow.total);

  // Section 2 — COCROMs for distribution (encoded, not yet distributed) -------
  const distRow = rawDb
    .prepare(`SELECT
        COUNT(CASE WHEN (a.carpable = 'CARPABLE' OR a.eligibility = 'Eligible')
                        AND a.date_encoded IS NOT NULL AND a.date_encoded != ''
                        AND (a.date_distributed IS NULL OR a.date_distributed = '') THEN 1 END) as available
      FROM "Arb" a
      JOIN "Landholding" l ON a.landholding_id = l.id
      ${provFilter ? `WHERE l.province_edited = ?` : ""}`)
    .get(...bindBase) as { available: number };

  const commitment = await getCommitment(scope);
  const cumCocromsForDistribution = metric(distRow.available, commitment);

  // Provincial breakdown (regional emails only) --------------------------------
  let provinces: ProvinceSummary[] | undefined;
  if (scope.level === "regional") {
    const provinceNames: string[] = (
      rawDb
        .prepare(`SELECT DISTINCT province_edited FROM "Landholding" WHERE province_edited IS NOT NULL ORDER BY province_edited`)
        .all() as { province_edited: string }[]
    ).map((r) => r.province_edited);

    provinces = await Promise.all(
      provinceNames.map((province) => getProvinceSummary(ws, we, province))
    );
  }

  return {
    scope,
    weeklyLhsValidated,
    weeklyCocromsEncoded,
    cumLhsValidated,
    cumCocromsEncoded,
    cumCocromsForDistribution,
    provinces,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function metric(completed: number, target: number): CumulativeMetric {
  const balance = completed - target;
  const pct     = target > 0 ? Math.round((completed / target) * 100) : 0;
  return { completed, target, balance, pct };
}

async function getCommitment(scope: DigestScope): Promise<number> {
  if (scope.level === "provincial" && scope.province) {
    const row = await prisma.commitmentTarget.findFirst({
      where: { region: "V", province: scope.province },
    });
    return row?.committed ?? 0;
  }
  // Regional: use the region-level row (province = null)
  const row = await prisma.commitmentTarget.findFirst({
    where: { region: "V", province: null },
  });
  return row?.committed ?? 0;
}

async function getProvinceSummary(
  ws: string,
  we: string,
  province: string
): Promise<ProvinceSummary> {
  const wLhs = (
    rawDb
      .prepare(`SELECT COUNT(*) as c FROM "Landholding"
                WHERE updated_at >= ? AND updated_at <= ?
                AND status IN (${VALIDATED_STATUSES})
                AND province_edited = ?`)
      .get(ws, we, province) as { c: number }
  ).c;

  const wEnc = (
    rawDb
      .prepare(`SELECT COUNT(*) as c FROM "Landholding"
                WHERE updated_at >= ? AND updated_at <= ?
                AND status IN (${ENCODED_STATUSES})
                AND province_edited = ?`)
      .get(ws, we, province) as { c: number }
  ).c;

  const lhRow = rawDb
    .prepare(`SELECT COUNT(*) as total,
               COUNT(CASE WHEN status IN (${VALIDATED_STATUSES}) THEN 1 END) as completed
              FROM "Landholding" WHERE province_edited = ?`)
    .get(province) as { total: number; completed: number };

  const encRow = rawDb
    .prepare(`SELECT
        COUNT(CASE WHEN (a.carpable = 'CARPABLE' OR a.eligibility = 'Eligible')
                        AND a.date_encoded IS NOT NULL AND a.date_encoded != '' THEN 1 END) as completed,
        COUNT(CASE WHEN (a.carpable = 'CARPABLE' OR a.eligibility = 'Eligible') THEN 1 END) as total
      FROM "Arb" a
      JOIN "Landholding" l ON a.landholding_id = l.id
      WHERE l.province_edited = ?`)
    .get(province) as { completed: number; total: number };

  const distRow = rawDb
    .prepare(`SELECT
        COUNT(CASE WHEN (a.carpable = 'CARPABLE' OR a.eligibility = 'Eligible')
                        AND a.date_encoded IS NOT NULL AND a.date_encoded != ''
                        AND (a.date_distributed IS NULL OR a.date_distributed = '') THEN 1 END) as available
      FROM "Arb" a
      JOIN "Landholding" l ON a.landholding_id = l.id
      WHERE l.province_edited = ?`)
    .get(province) as { available: number };

  const target = await getCommitment({ level: "provincial", province });
  const balance = distRow.available - target;

  return {
    province,
    weeklyLhsValidated: wLhs,
    weeklyCocromsEncoded: wEnc,
    lhsValidatedPct: lhRow.total > 0 ? Math.round((lhRow.completed / lhRow.total) * 100) : 0,
    cocromsEncodedPct: encRow.total > 0 ? Math.round((encRow.completed / encRow.total) * 100) : 0,
    vsCommitment: balance,
  };
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

export async function sendWeeklyDigest(
  weekStart: Date,
  weekEnd: Date
): Promise<{ sent: number; failed: number; recipients: string[] }> {
  const allRecipients = getActiveRecipients();
  if (allRecipients.length === 0) return { sent: 0, failed: 0, recipients: [] };

  // Compute distinct scopes needed
  const regionalData = await getDigestData(weekStart, weekEnd, { level: "regional" });

  // Provincial scopes — deduplicate by province
  const provinces = [
    ...new Set(
      allRecipients
        .filter((r) => r.level === "provincial" && r.province)
        .map((r) => r.province as string)
    ),
  ];
  const provincialDataMap = new Map<string, DigestData>();
  for (const province of provinces) {
    provincialDataMap.set(
      province,
      await getDigestData(weekStart, weekEnd, { level: "provincial", province })
    );
  }

  let sent = 0;
  let failed = 0;
  const sentRecipients: string[] = [];

  for (const recipient of allRecipients) {
    const data =
      recipient.level === "regional"
        ? regionalData
        : provincialDataMap.get(recipient.province ?? "") ?? regionalData;

    const subject = buildSubjectLine(
      recipient.level as "regional" | "provincial",
      recipient.province ?? undefined,
      weekStart,
      weekEnd
    );
    const html = buildEmailHtml(
      recipient.level as "regional" | "provincial",
      recipient,
      data,
      weekStart,
      weekEnd
    );

    const result = await sendEmail(recipient.email, subject, html);
    if (result.ok) {
      sent++;
      sentRecipients.push(recipient.email);
    } else {
      failed++;
      console.error(`[digest] Failed to send to ${recipient.email}: ${result.error}`);
    }
  }

  return { sent, failed, recipients: sentRecipients };
}
```

- [ ] **Step 2: Verify the file compiles**

```bash
npx tsc --noEmit
```

Expected: No errors in `lib/digest.ts`. Fix any type errors before proceeding.

- [ ] **Step 3: Commit**

```bash
git add lib/digest.ts
git commit -m "feat: add digest data queries and send orchestrator"
```

---

## Task 4: lib/email.ts — HTML template and SMTP

**Files:**
- Create: `lib/email.ts`

Email HTML must use **table-based layout with inline styles** — CSS grid/flex is unreliable in email clients.

- [ ] **Step 1: Create `lib/email.ts`**

```typescript
import nodemailer from "nodemailer";
import type { DigestData, DigestRecipient } from "@/lib/digest";

// ── Transport ─────────────────────────────────────────────────────────────────

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST!,
    port: parseInt(process.env.SMTP_PORT ?? "465"),
    secure: true,
    auth: {
      user: process.env.SMTP_USER!,
      pass: process.env.SMTP_PASS!,
    },
  });
}

// ── Date helpers ──────────────────────────────────────────────────────────────

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function phtDate(utc: Date): Date {
  return new Date(utc.getTime() + 8 * 3_600_000);
}

function fmtShort(utc: Date): string {
  const d = phtDate(utc);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function fmtYear(utc: Date): string {
  return String(phtDate(utc).getUTCFullYear());
}

// ── Subject line ──────────────────────────────────────────────────────────────

export function buildSubjectLine(
  variant: "regional" | "provincial",
  province: string | undefined,
  weekStart: Date,
  weekEnd: Date
): string {
  const range = `${fmtShort(weekStart)} – ${fmtShort(weekEnd)}, ${fmtYear(weekEnd)}`;
  if (variant === "provincial" && province) {
    return `📊 DAR Region V — Weekly Progress Digest · ${province} · ${range}`;
  }
  return `📊 DAR Region V — Weekly Progress Digest · ${range}`;
}

// ── Progress bar (table-safe) ─────────────────────────────────────────────────

function progressBar(pct: number, color = "#16a34a"): string {
  const clamped = Math.min(100, Math.max(0, pct));
  return `
    <table cellpadding="0" cellspacing="0" border="0" style="display:inline-table;vertical-align:middle;">
      <tr>
        <td style="width:80px;height:6px;background:#e2e8f0;border-radius:99px;overflow:hidden;padding:0;">
          <div style="width:${clamped}%;height:6px;background:${color};border-radius:99px;"></div>
        </td>
        <td style="padding-left:8px;font-size:11px;font-weight:600;color:#374151;white-space:nowrap;">${clamped}%</td>
      </tr>
    </table>`;
}

function balanceCell(balance: number): string {
  if (balance >= 0) {
    return `<span style="color:#16a34a;font-weight:600;font-size:12px;">+${balance.toLocaleString()} ahead</span>`;
  }
  return `<span style="color:#ef4444;font-weight:600;font-size:12px;">${balance.toLocaleString()} remaining</span>`;
}

// ── Email HTML ────────────────────────────────────────────────────────────────

export function buildEmailHtml(
  variant: "regional" | "provincial",
  recipient: DigestRecipient,
  data: DigestData,
  weekStart: Date,
  weekEnd: Date
): string {
  const weekRange    = `${fmtShort(weekStart)} – ${fmtShort(weekEnd)}, ${fmtYear(weekEnd)}`;
  const displayName  = recipient.nickname?.trim() || recipient.name;

  const provinceChip =
    variant === "provincial" && data.scope.province
      ? `<tr><td style="padding-top:12px;">
           <span style="display:inline-block;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.2);border-radius:6px;padding:5px 12px;font-size:12px;color:rgba(255,255,255,0.9);font-weight:600;">
             📍 Province of ${data.scope.province}
           </span>
         </td></tr>`
      : "";

  const { cumLhsValidated: lhv, cumCocromsEncoded: enc, cumCocromsForDistribution: dist } = data;

  const cumulativeRows = `
    <tr style="border-bottom:1px solid #f8fafc;">
      <td style="padding:12px 10px;font-size:13px;font-weight:500;color:#1e293b;">LHs Fully Validated</td>
      <td style="padding:12px 10px;font-size:13px;font-weight:700;color:#0f172a;text-align:right;">${lhv.completed.toLocaleString()}</td>
      <td style="padding:12px 10px;font-size:12px;color:#64748b;text-align:right;">${lhv.target.toLocaleString()} total LHs</td>
      <td style="padding:12px 10px;text-align:right;">${balanceCell(lhv.balance)}</td>
      <td style="padding:12px 10px;text-align:right;">${progressBar(lhv.pct)}</td>
    </tr>
    <tr style="border-bottom:1px solid #f8fafc;">
      <td style="padding:12px 10px;font-size:13px;font-weight:500;color:#1e293b;">COCROMs Encoded</td>
      <td style="padding:12px 10px;font-size:13px;font-weight:700;color:#0f172a;text-align:right;">${enc.completed.toLocaleString()}</td>
      <td style="padding:12px 10px;font-size:12px;color:#64748b;text-align:right;">${enc.target.toLocaleString()} eligible</td>
      <td style="padding:12px 10px;text-align:right;">${balanceCell(enc.balance)}</td>
      <td style="padding:12px 10px;text-align:right;">${progressBar(enc.pct)}</td>
    </tr>
    <tr>
      <td style="padding:12px 10px;font-size:13px;font-weight:500;color:#1e293b;">COCROMs for Distribution</td>
      <td style="padding:12px 10px;font-size:13px;font-weight:700;color:#0f172a;text-align:right;">${dist.completed.toLocaleString()}</td>
      <td style="padding:12px 10px;font-size:12px;color:#64748b;text-align:right;">${dist.target.toLocaleString()} committed</td>
      <td style="padding:12px 10px;text-align:right;">${balanceCell(dist.balance)}</td>
      <td style="padding:12px 10px;text-align:right;">${progressBar(dist.pct, "#f59e0b")}</td>
    </tr>`;

  const provincialBreakdown =
    variant === "regional" && data.provinces && data.provinces.length > 0
      ? `
    <tr><td colspan="5" style="padding:24px 0 0;">
      <div style="font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#94a3b8;padding-bottom:6px;border-bottom:1px solid #f1f5f9;">Provincial Breakdown</div>
    </td></tr>
    <tr><td colspan="5" style="padding:10px 0 0;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-size:12px;">
        <thead>
          <tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0;">
            <th style="text-align:left;padding:7px 10px;font-size:10px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:#94a3b8;">Province</th>
            <th style="text-align:right;padding:7px 10px;font-size:10px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:#94a3b8;">Validated (wk)</th>
            <th style="text-align:right;padding:7px 10px;font-size:10px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:#94a3b8;">Encoded (wk)</th>
            <th style="text-align:right;padding:7px 10px;font-size:10px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:#94a3b8;">LHs Val. %</th>
            <th style="text-align:right;padding:7px 10px;font-size:10px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:#94a3b8;">COCROMs Enc. %</th>
            <th style="text-align:right;padding:7px 10px;font-size:10px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:#94a3b8;">vs. Commitment</th>
          </tr>
        </thead>
        <tbody>
          ${data.provinces
            .map(
              (p) => `
          <tr style="border-bottom:1px solid #f8fafc;">
            <td style="padding:10px;font-weight:600;color:#1e293b;">${p.province}</td>
            <td style="padding:10px;text-align:right;color:#374151;">${p.weeklyLhsValidated}</td>
            <td style="padding:10px;text-align:right;color:#374151;">${p.weeklyCocromsEncoded}</td>
            <td style="padding:10px;text-align:right;color:#374151;">${p.lhsValidatedPct}%</td>
            <td style="padding:10px;text-align:right;color:#374151;">${p.cocromsEncodedPct}%</td>
            <td style="padding:10px;text-align:right;">${p.vsCommitment >= 0 ? `<span style="color:#16a34a;font-weight:600;">+${p.vsCommitment}</span>` : `<span style="color:#ef4444;font-weight:600;">${p.vsCommitment}</span>`}</td>
          </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </td></tr>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Weekly Progress Digest</title>
</head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:14px;color:#1e293b;">
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr><td align="center" style="padding:32px 16px;">
    <table width="620" cellpadding="0" cellspacing="0" border="0" style="max-width:620px;width:100%;">

      <!-- Header -->
      <tr><td style="background:#14532d;padding:28px 32px 24px;border-radius:12px 12px 0 0;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="font-size:11px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:rgba(255,255,255,0.75);">DAR · Region V · Bicol</td>
            <td align="right" style="font-size:11px;color:rgba(255,255,255,0.85);background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.2);border-radius:99px;padding:4px 12px;white-space:nowrap;">Week of ${fmtShort(weekStart)} – ${fmtShort(weekEnd)}</td>
          </tr>
          <tr><td colspan="2" style="padding-top:20px;font-size:22px;font-weight:700;color:white;">Weekly Progress Digest</td></tr>
          <tr><td colspan="2" style="font-size:13px;color:rgba(255,255,255,0.65);">COCROM Validation, Encoding &amp; Distribution Summary</td></tr>
          ${provinceChip}
        </table>
      </td></tr>

      <!-- Body -->
      <tr><td style="background:white;padding:28px 32px;border-radius:0 0 12px 12px;">
        <p style="font-size:14px;color:#374151;margin:0 0 20px;line-height:1.6;">
          Good day, <strong style="color:#0f172a;">${displayName}</strong>. Here is the progress update${variant === "provincial" && data.scope.province ? ` for <strong style="color:#0f172a;">${data.scope.province}</strong>` : ""} for the week of <strong style="color:#0f172a;">${weekRange}</strong>.
        </p>

        <!-- Section 1 -->
        <div style="font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#94a3b8;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #f1f5f9;">
          This Week's Activity${variant === "provincial" && data.scope.province ? ` — ${data.scope.province}` : ""}
        </div>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
          <tr>
            <td width="48%" style="padding-right:8px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-left:3px solid #16a34a;border-radius:10px;padding:16px 18px;">
                <tr><td style="font-size:11px;color:#64748b;padding-bottom:6px;">LHs Validated</td></tr>
                <tr><td style="font-size:28px;font-weight:700;color:#0f172a;line-height:1;">${data.weeklyLhsValidated.toLocaleString()} <span style="font-size:13px;font-weight:500;color:#64748b;">LHs</span></td></tr>
                <tr><td style="font-size:11px;color:#94a3b8;padding-top:4px;">Records updated &amp; validated this week</td></tr>
              </table>
            </td>
            <td width="48%" style="padding-left:8px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-left:3px solid #2563eb;border-radius:10px;padding:16px 18px;">
                <tr><td style="font-size:11px;color:#64748b;padding-bottom:6px;">COCROMs Encoded</td></tr>
                <tr><td style="font-size:28px;font-weight:700;color:#0f172a;line-height:1;">${data.weeklyCocromsEncoded.toLocaleString()} <span style="font-size:13px;font-weight:500;color:#64748b;">COCROMs</span></td></tr>
                <tr><td style="font-size:11px;color:#94a3b8;padding-top:4px;">Records updated &amp; encoded this week</td></tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- Section 2 -->
        <div style="font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#94a3b8;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #f1f5f9;">
          Cumulative Progress${variant === "provincial" && data.scope.province ? ` — ${data.scope.province}` : ""}
        </div>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;border-collapse:collapse;">
          <thead>
            <tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0;">
              <th style="text-align:left;padding:8px 10px;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8;">Metric</th>
              <th style="text-align:right;padding:8px 10px;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8;">Completed</th>
              <th style="text-align:right;padding:8px 10px;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8;">Target / Eligible</th>
              <th style="text-align:right;padding:8px 10px;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8;">Balance</th>
              <th style="text-align:right;padding:8px 10px;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8;">Progress</th>
            </tr>
          </thead>
          <tbody>
            ${cumulativeRows}
          </tbody>
        </table>

        <!-- Provincial breakdown (regional only) -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          ${provincialBreakdown}
        </table>
      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:18px 32px;text-align:center;border-radius:0 0 12px 12px;">
        <p style="font-size:11px;color:#64748b;margin:0 0 4px;"><strong>Unclassified ARRs Data Management System</strong></p>
        <p style="font-size:11px;color:#94a3b8;margin:0 0 4px;">This report was generated automatically. For questions, contact your system administrator.</p>
        <p style="font-size:11px;color:#94a3b8;margin:0;">© ${fmtYear(weekEnd)} Department of Agrarian Reform · Region V · Bicol</p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ── Send one email ────────────────────────────────────────────────────────────

export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const transport = createTransport();
    await transport.sendMail({
      from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
      to,
      subject,
      html,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
```

- [ ] **Step 2: Verify compiles**

```bash
npx tsc --noEmit
```

Expected: No errors in `lib/email.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/email.ts
git commit -m "feat: add email HTML template and SMTP send function"
```

---

## Task 5: API routes — recipients CRUD

**Files:**
- Create: `app/api/admin/digest/recipients/route.ts`
- Create: `app/api/admin/digest/recipients/[id]/route.ts`

All routes require `super_admin`. Use `rawDb` for all DigestRecipient queries.

- [ ] **Step 1: Create `app/api/admin/digest/recipients/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { rawDb } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";
import type { DigestRecipient } from "@/lib/digest";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const user  = token ? await verifySessionToken(token) : null;
  if (!user || user.role !== "super_admin")
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const rows = rawDb
    .prepare(`SELECT * FROM "DigestRecipient" ORDER BY level, province, name`)
    .all() as DigestRecipient[];

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const user  = token ? await verifySessionToken(token) : null;
  if (!user || user.role !== "super_admin")
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const body = await req.json() as {
    name: string; nickname?: string; email: string; role: string; level: string; province?: string;
  };

  const { name, nickname, email, role, level, province } = body;

  if (!name?.trim() || !email?.trim() || !role?.trim())
    return NextResponse.json({ error: "name, email, and role are required." }, { status: 400 });
  if (!["regional", "provincial"].includes(level))
    return NextResponse.json({ error: "level must be 'regional' or 'provincial'." }, { status: 400 });
  if (level === "provincial" && !province?.trim())
    return NextResponse.json({ error: "province is required for provincial recipients." }, { status: 400 });

  try {
    const result = rawDb
      .prepare(`INSERT INTO "DigestRecipient" (name, nickname, email, role, level, province) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(name.trim(), nickname?.trim() || null, email.trim().toLowerCase(), role.trim(), level, province?.trim() ?? null);

    const row = rawDb
      .prepare(`SELECT * FROM "DigestRecipient" WHERE id = ?`)
      .get(result.lastInsertRowid) as DigestRecipient;

    return NextResponse.json(row, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("UNIQUE constraint")) {
      return NextResponse.json({ error: "A recipient with this email already exists." }, { status: 409 });
    }
    throw err;
  }
}
```

- [ ] **Step 2: Create `app/api/admin/digest/recipients/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { rawDb } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";
import type { DigestRecipient } from "@/lib/digest";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const user  = token ? await verifySessionToken(token) : null;
  if (!user || user.role !== "super_admin")
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const { id } = await params;
  const body = await req.json() as Partial<{
    name: string; nickname: string | null; email: string; role: string; level: string; province: string | null; active: number;
  }>;

  const existing = rawDb
    .prepare(`SELECT * FROM "DigestRecipient" WHERE id = ?`)
    .get(id) as DigestRecipient | undefined;
  if (!existing)
    return NextResponse.json({ error: "Recipient not found." }, { status: 404 });

  const name     = body.name     !== undefined ? body.name.trim()                   : existing.name;
  const nickname = body.nickname !== undefined ? (body.nickname?.trim() || null)    : existing.nickname;
  const email    = body.email    !== undefined ? body.email.trim().toLowerCase()     : existing.email;
  const role     = body.role     !== undefined ? body.role.trim()                    : existing.role;
  const level    = body.level    !== undefined ? body.level                          : existing.level;
  const province = body.province !== undefined ? body.province                       : existing.province;
  const active   = body.active   !== undefined ? (body.active ? 1 : 0)              : existing.active;

  if (!["regional", "provincial"].includes(level))
    return NextResponse.json({ error: "level must be 'regional' or 'provincial'." }, { status: 400 });

  rawDb
    .prepare(`UPDATE "DigestRecipient" SET name=?, nickname=?, email=?, role=?, level=?, province=?, active=? WHERE id=?`)
    .run(name, nickname, email, role, level, province, active, id);

  const updated = rawDb
    .prepare(`SELECT * FROM "DigestRecipient" WHERE id = ?`)
    .get(id) as DigestRecipient;

  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const user  = token ? await verifySessionToken(token) : null;
  if (!user || user.role !== "super_admin")
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const { id } = await params;
  const existing = rawDb
    .prepare(`SELECT id FROM "DigestRecipient" WHERE id = ?`)
    .get(id);
  if (!existing)
    return NextResponse.json({ error: "Recipient not found." }, { status: 404 });

  rawDb.prepare(`DELETE FROM "DigestRecipient" WHERE id = ?`).run(id);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Test the endpoints**

With dev server running:

```bash
# Add a recipient
curl -s -X POST http://localhost:3000/api/admin/digest/recipients \
  -H "Content-Type: application/json" \
  -b "dar_session=<your-session-token>" \
  -d '{"name":"Test User","email":"test@example.com","role":"Regional CARPO","level":"regional"}'
```

Expected: `201` response with the new recipient row including `id`.

```bash
# List recipients
curl -s http://localhost:3000/api/admin/digest/recipients \
  -b "dar_session=<your-session-token>"
```

Expected: JSON array containing the test recipient.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/digest/
git commit -m "feat: add digest recipients CRUD API routes"
```

---

## Task 6: API routes — settings

**Files:**
- Create: `app/api/admin/digest/settings/route.ts`

- [ ] **Step 1: Create `app/api/admin/digest/settings/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { rawDb } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";

function getSetting(key: string): string {
  const row = rawDb
    .prepare(`SELECT value FROM "Setting" WHERE key = ?`)
    .get(key) as { value: string } | undefined;
  return row?.value ?? "";
}

function setSetting(key: string, value: string): void {
  rawDb
    .prepare(`INSERT OR REPLACE INTO "Setting" (key, value) VALUES (?, ?)`)
    .run(key, value);
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const user  = token ? await verifySessionToken(token) : null;
  if (!user || user.role !== "super_admin")
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const enabled    = getSetting("email_digest_enabled") === "true";
  const lastSentAt = getSetting("email_digest_last_sent_at") || null;

  return NextResponse.json({ enabled, lastSentAt });
}

export async function PUT(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const user  = token ? await verifySessionToken(token) : null;
  if (!user || user.role !== "super_admin")
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const { enabled } = await req.json() as { enabled: boolean };
  if (typeof enabled !== "boolean")
    return NextResponse.json({ error: "enabled must be a boolean." }, { status: 400 });

  setSetting("email_digest_enabled", enabled ? "true" : "false");
  return NextResponse.json({ enabled });
}
```

- [ ] **Step 2: Test the endpoint**

```bash
# Get settings
curl -s http://localhost:3000/api/admin/digest/settings \
  -b "dar_session=<your-session-token>"
```

Expected: `{"enabled":false,"lastSentAt":null}` (defaults).

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/digest/settings/route.ts
git commit -m "feat: add digest settings API route"
```

---

## Task 7: API route — preview

**Files:**
- Create: `app/api/admin/digest/preview/route.ts`

- [ ] **Step 1: Create `app/api/admin/digest/preview/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";
import { getDigestData, getWeekBounds } from "@/lib/digest";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const user  = token ? await verifySessionToken(token) : null;
  if (!user || user.role !== "super_admin")
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const { searchParams } = req.nextUrl;
  const level    = searchParams.get("level");
  const province = searchParams.get("province");

  if (!level || !["regional", "provincial"].includes(level))
    return NextResponse.json({ error: "Query param 'level' must be 'regional' or 'provincial'." }, { status: 400 });
  if (level === "provincial" && !province)
    return NextResponse.json({ error: "Query param 'province' is required when level=provincial." }, { status: 400 });

  const { weekStart, weekEnd } = getWeekBounds();
  const data = await getDigestData(
    weekStart,
    weekEnd,
    level === "provincial" ? { level: "provincial", province: province! } : { level: "regional" }
  );

  return NextResponse.json({ weekStart, weekEnd, data });
}
```

- [ ] **Step 2: Test the endpoint**

```bash
curl -s "http://localhost:3000/api/admin/digest/preview?level=regional" \
  -b "dar_session=<your-session-token>" | npx --yes json
```

Expected: JSON with `weekStart`, `weekEnd`, and `data` containing non-negative metric counts. Verify the numbers look plausible against your actual DB.

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/digest/preview/route.ts
git commit -m "feat: add digest preview API route"
```

---

## Task 8: API route — send

**Files:**
- Create: `app/api/admin/digest/send/route.ts`

- [ ] **Step 1: Create `app/api/admin/digest/send/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { rawDb } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";
import { sendWeeklyDigest, getWeekBounds } from "@/lib/digest";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const user  = token ? await verifySessionToken(token) : null;
  if (!user || user.role !== "super_admin")
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const { weekStart, weekEnd } = getWeekBounds();
  const result = await sendWeeklyDigest(weekStart, weekEnd);

  if (result.sent > 0) {
    rawDb
      .prepare(`INSERT OR REPLACE INTO "Setting" (key, value) VALUES ('email_digest_last_sent_at', ?)`)
      .run(new Date().toISOString());
  }

  return NextResponse.json(result);
}
```

- [ ] **Step 2: Add SMTP env vars to `.env`**

Open `.env` (do not commit this file) and add:

```
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_USER=your@businessemail.com
SMTP_PASS=yourpassword
SMTP_FROM=DAR Region V <your@businessemail.com>
```

Replace placeholder values with the actual Hostinger credentials.

- [ ] **Step 3: Test manual send (with at least one active recipient in DB)**

```bash
curl -s -X POST http://localhost:3000/api/admin/digest/send \
  -b "dar_session=<your-session-token>"
```

Expected: `{"sent":1,"failed":0,"recipients":["recipient@example.com"]}` (or similar). Check the recipient's inbox to verify email arrives.

- [ ] **Step 4: Commit (do NOT commit .env)**

```bash
git add app/api/admin/digest/send/route.ts
git commit -m "feat: add digest manual send API route"
```

---

## Task 9: Scheduler — scheduleWeeklyDigest in instrumentation.node.ts

**Files:**
- Modify: `instrumentation.node.ts`

Mirrors the existing `scheduleDailyBackup` pattern: catch-up on startup, then setTimeout → setInterval every 7 days.

- [ ] **Step 1: Add `scheduleWeeklyDigest` function and call it from `registerNode`**

In `instrumentation.node.ts`, add the following at the bottom of the file (after `scheduleDailyBackup`), then add the call `scheduleWeeklyDigest(dbPath)` at the end of `registerNode()` (after the `scheduleDailyBackup(dbPath)` call):

```typescript
function scheduleWeeklyDigest(dbPath: string) {
  function msUntilNextMondayPht(): number {
    const phtOffset = 8 * 3_600_000;
    const nowPht    = new Date(Date.now() + phtOffset);
    const day       = nowPht.getUTCDay(); // 0=Sun
    const daysToMon = day === 1 ? 7 : (8 - day) % 7 || 7;

    const nextMon = new Date(nowPht);
    nextMon.setUTCDate(nowPht.getUTCDate() + daysToMon);
    nextMon.setUTCHours(8, 0, 0, 0); // 8:00 AM PHT (stored as UTC fake-time)
    // Convert back to real UTC
    return nextMon.getTime() - phtOffset - Date.now();
  }

  function getRawSetting(key: string): string {
    try {
      const db  = new Database(dbPath);
      const row = db.prepare(`SELECT value FROM "Setting" WHERE key = ?`).get(key) as { value: string } | undefined;
      db.close();
      return row?.value ?? "";
    } catch {
      return "";
    }
  }

  function setRawSetting(key: string, value: string): void {
    try {
      const db = new Database(dbPath);
      db.prepare(`INSERT OR REPLACE INTO "Setting" (key, value) VALUES (?, ?)`).run(key, value);
      db.close();
    } catch (err) {
      console.error("[digest] Failed to write setting:", err);
    }
  }

  async function runDigest() {
    const enabled = getRawSetting("email_digest_enabled");
    if (enabled !== "true") {
      console.log("[digest] Auto-send is off — skipping scheduled digest.");
      return;
    }
    try {
      const { sendWeeklyDigest, getWeekBounds } = await import("@/lib/digest");
      const { weekStart, weekEnd } = getWeekBounds();
      const result = await sendWeeklyDigest(weekStart, weekEnd);
      console.log(`[digest] Weekly digest sent: ${result.sent} sent, ${result.failed} failed.`);
      if (result.sent > 0) {
        setRawSetting("email_digest_last_sent_at", new Date().toISOString());
      }
    } catch (err) {
      console.error("[digest] Scheduled digest failed:", err);
    }
  }

  async function catchUpIfMissed() {
    const enabled = getRawSetting("email_digest_enabled");
    if (enabled !== "true") return;

    const lastSentAt = getRawSetting("email_digest_last_sent_at");

    // Compute most recent Monday 8:00 AM PHT before now
    const phtOffset = 8 * 3_600_000;
    const nowPht    = new Date(Date.now() + phtOffset);
    const day       = nowPht.getUTCDay();
    const daysBack  = day === 0 ? 6 : day - 1;
    const thisMon   = new Date(nowPht);
    thisMon.setUTCDate(nowPht.getUTCDate() - daysBack);
    thisMon.setUTCHours(8, 0, 0, 0);
    const lastMon8amUtc = new Date(thisMon.getTime() - phtOffset);

    // It's before Monday 8 AM PHT this week — no catch-up needed
    if (Date.now() < lastMon8amUtc.getTime()) return;

    const lastSent = lastSentAt ? new Date(lastSentAt).getTime() : 0;
    if (lastSent < lastMon8amUtc.getTime()) {
      console.log("[digest] Catch-up: missed weekly digest — sending now.");
      await runDigest();
    }
  }

  catchUpIfMissed();

  const delay = msUntilNextMondayPht();
  const hh = Math.floor(delay / 3_600_000);
  const mm = Math.floor((delay % 3_600_000) / 60_000);
  console.log(`[digest] Next weekly digest scheduled in ${hh}h ${mm}m (Monday 8:00 AM PHT)`);

  setTimeout(() => {
    runDigest();
    setInterval(runDigest, 7 * 24 * 60 * 60 * 1000);
  }, delay);
}
```

- [ ] **Step 2: Add the call inside `registerNode()`**

In `registerNode()`, after the existing `scheduleDailyBackup(dbPath)` call, add:

```typescript
  scheduleWeeklyDigest(dbPath);
```

- [ ] **Step 3: Verify startup log**

Restart the dev server:

```bash
npm run dev
```

Expected console output includes a line like:
```
[digest] Next weekly digest scheduled in 3h 45m (Monday 8:00 AM PHT)
```
(or a catch-up message if `email_digest_enabled` is `"true"` and last sent was before this Monday 8 AM)

- [ ] **Step 4: Commit**

```bash
git add instrumentation.node.ts
git commit -m "feat: add weekly digest scheduler with catch-up logic"
```

---

## Task 10: proxy.ts — add /digest to ADMIN_PAGES

**Files:**
- Modify: `proxy.ts`

- [ ] **Step 1: Add `/digest` to `ADMIN_PAGES`**

In `proxy.ts`, find the line:
```typescript
const ADMIN_PAGES   = ["/flags", "/audit", "/users"];
```

Change it to:
```typescript
const ADMIN_PAGES   = ["/flags", "/audit", "/users", "/digest"];
```

- [ ] **Step 2: Verify redirect works**

Log out (or use a non-super_admin session) and navigate to `http://localhost:3000/digest`. Expected: redirect to `/` (or `/login` if not authenticated).

- [ ] **Step 3: Commit**

```bash
git add proxy.ts
git commit -m "feat: add /digest to super_admin protected pages"
```

---

## Task 11: Admin UI — app/digest/page.tsx

**Files:**
- Create: `app/digest/page.tsx`

Two-card layout: (1) Digest Settings — toggle, status, last-sent, Send Now; (2) Recipients — table with Add/Edit/Delete.

- [ ] **Step 1: Create `app/digest/page.tsx`**

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import type { DigestRecipient } from "@/lib/digest";

interface Settings {
  enabled: boolean;
  lastSentAt: string | null;
}

interface SendResult {
  sent: number;
  failed: number;
  recipients: string[];
}

const ROLE_OPTIONS = [
  { label: "ARDO",     level: "regional" },
  { label: "CARPO",    level: "regional" },
  { label: "CARPO",    level: "provincial" },
  { label: "PARPO II", level: "provincial" },
];

// Deduplicated labels for the dropdown display
const ROLE_DROPDOWN = [
  { label: "ARDO",     level: "regional"    },
  { label: "CARPO",    level: "regional",   display: "CARPO (Regional)" },
  { label: "CARPO",    level: "provincial", display: "CARPO (Provincial)" },
  { label: "PARPO II", level: "provincial"  },
];

const PROVINCE_OPTIONS = [
  "Albay", "Camarines Norte", "Camarines Sur I", "Camarines Sur II",
  "Catanduanes", "Masbate", "Sorsogon",
];

function fmtDate(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DigestPage() {
  const [settings, setSettings]     = useState<Settings>({ enabled: false, lastSentAt: null });
  const [recipients, setRecipients] = useState<DigestRecipient[]>([]);
  const [sending, setSending]       = useState(false);
  const [sendResult, setSendResult] = useState<SendResult | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Add form state
  const [showAddForm, setShowAddForm]         = useState(false);
  const [addName, setAddName]                 = useState("");
  const [addNickname, setAddNickname]         = useState("");
  const [addEmail, setAddEmail]               = useState("");
  const [addRoleIdx, setAddRoleIdx]           = useState(0);
  const [addProvince, setAddProvince]         = useState(PROVINCE_OPTIONS[0]);
  const [addSaving, setAddSaving]             = useState(false);
  const [addError, setAddError]               = useState("");

  const selectedRoleOption = ROLE_DROPDOWN[addRoleIdx] ?? ROLE_DROPDOWN[0];
  const needsProvince = selectedRoleOption.level === "provincial";

  const loadSettings = useCallback(async () => {
    const res = await fetch("/api/admin/digest/settings");
    if (res.ok) setSettings(await res.json());
  }, []);

  const loadRecipients = useCallback(async () => {
    const res = await fetch("/api/admin/digest/recipients");
    if (res.ok) setRecipients(await res.json());
  }, []);

  useEffect(() => {
    loadSettings();
    loadRecipients();
  }, [loadSettings, loadRecipients]);

  async function handleToggleEnabled() {
    const next = !settings.enabled;
    const res  = await fetch("/api/admin/digest/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: next }),
    });
    if (res.ok) setSettings((s) => ({ ...s, enabled: next }));
  }

  async function handleSendNow() {
    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch("/api/admin/digest/send", { method: "POST" });
      const data = await res.json();
      setSendResult(data);
      await loadSettings(); // refresh lastSentAt
    } finally {
      setSending(false);
    }
  }

  async function handleToggleActive(r: DigestRecipient) {
    setTogglingId(r.id);
    await fetch(`/api/admin/digest/recipients/${r.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: r.active ? 0 : 1 }),
    });
    await loadRecipients();
    setTogglingId(null);
  }

  async function handleDelete(id: number) {
    if (!confirm("Remove this recipient?")) return;
    setDeletingId(id);
    await fetch(`/api/admin/digest/recipients/${id}`, { method: "DELETE" });
    await loadRecipients();
    setDeletingId(null);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError("");
    setAddSaving(true);
    const res = await fetch("/api/admin/digest/recipients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: addName,
        nickname: addNickname || undefined,
        email: addEmail,
        role: selectedRoleOption.label,
        level: selectedRoleOption.level,
        province: needsProvince ? addProvince : undefined,
      }),
    });
    if (res.ok) {
      setAddName(""); setAddNickname(""); setAddEmail(""); setAddRoleIdx(0);
      setShowAddForm(false);
      await loadRecipients();
    } else {
      const data = await res.json();
      setAddError(data.error ?? "Failed to add recipient.");
    }
    setAddSaving(false);
  }

  const activeCount = recipients.filter((r) => r.active).length;

  const roleBadgeColor: Record<string, string> = {
    "ARDO":     "bg-blue-100 text-blue-800",
    "CARPO":    "bg-amber-100 text-amber-800",
    "PARPO II": "bg-purple-100 text-purple-800",
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Weekly Digest</h1>
        <p className="text-sm text-gray-500 mt-1">
          Configure and send the weekly COCROM progress email to regional and provincial recipients.
        </p>
      </div>

      {/* Card 1 — Settings */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Digest Settings</h2>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700">Automatic weekly digest</p>
            <p className="text-xs text-gray-400">Sends every Monday at 8:00 AM Philippine Time</p>
          </div>
          <button
            onClick={handleToggleEnabled}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              settings.enabled ? "bg-green-600" : "bg-gray-300"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                settings.enabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        <div className="flex items-center gap-3 text-sm">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
            settings.enabled ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"
          }`}>
            {settings.enabled ? "Auto-send on · Next: Monday 8:00 AM" : "Auto-send off"}
          </span>
        </div>

        <div className="text-sm text-gray-500">
          Last sent: <span className="font-medium text-gray-700">{fmtDate(settings.lastSentAt)}</span>
        </div>

        <div className="pt-2 border-t border-gray-100 flex items-center justify-between gap-4">
          <p className="text-xs text-gray-400">
            Covers the previous full week (Mon – Sun PHT). {activeCount} active recipient{activeCount !== 1 ? "s" : ""}.
          </p>
          <button
            onClick={handleSendNow}
            disabled={sending || activeCount === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? (
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            )}
            {sending ? "Sending…" : "Send Now"}
          </button>
        </div>

        {sendResult && (
          <div className={`rounded-lg px-4 py-3 text-sm ${
            sendResult.failed === 0 ? "bg-green-50 text-green-800 border border-green-200" : "bg-amber-50 text-amber-800 border border-amber-200"
          }`}>
            {sendResult.sent > 0
              ? `✓ Sent to ${sendResult.sent} recipient${sendResult.sent !== 1 ? "s" : ""}.`
              : "No emails sent."}
            {sendResult.failed > 0 && ` ${sendResult.failed} failed — check server logs.`}
          </div>
        )}
      </div>

      {/* Card 2 — Recipients */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Recipients</h2>
          <button
            onClick={() => setShowAddForm((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add Recipient
          </button>
        </div>

        {showAddForm && (
          <form onSubmit={handleAdd} className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Full Name</label>
                <input
                  required value={addName} onChange={(e) => setAddName(e.target.value)}
                  placeholder="Full name"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Nickname <span className="text-gray-400 font-normal">(used in greeting)</span>
                </label>
                <input
                  value={addNickname} onChange={(e) => setAddNickname(e.target.value)}
                  placeholder="e.g. RD Rod"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                <input
                  required type="email" value={addEmail} onChange={(e) => setAddEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
                <select
                  value={addRoleIdx} onChange={(e) => setAddRoleIdx(Number(e.target.value))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                >
                  {ROLE_DROPDOWN.map((r, i) => (
                    <option key={i} value={i}>{r.display ?? r.label}</option>
                  ))}
                </select>
              </div>
              {needsProvince && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Province</label>
                  <select
                    value={addProvince} onChange={(e) => setAddProvince(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                  >
                    {PROVINCE_OPTIONS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            {addError && <p className="text-xs text-red-600">{addError}</p>}
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => { setShowAddForm(false); setAddError(""); }}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button type="submit" disabled={addSaving}
                className="rounded-lg bg-green-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50">
                {addSaving ? "Adding…" : "Add Recipient"}
              </button>
            </div>
          </form>
        )}

        {recipients.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No recipients yet. Add one above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nickname</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Scope</th>
                  <th className="text-center py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Active</th>
                  <th className="py-2 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {recipients.map((r) => (
                  <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="py-2.5 px-3 font-medium text-gray-800">{r.name}</td>
                    <td className="py-2.5 px-3 text-gray-500">{r.nickname ?? <span className="text-gray-300 italic text-xs">—</span>}</td>
                    <td className="py-2.5 px-3 text-gray-500">{r.email}</td>
                    <td className="py-2.5 px-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        roleBadgeColor[r.role] ?? "bg-gray-100 text-gray-700"
                      }`}>
                        {r.role}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-gray-600">
                      {r.level === "regional" ? "Regional" : r.province ?? "—"}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <button
                        onClick={() => handleToggleActive(r)}
                        disabled={togglingId === r.id}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${
                          r.active ? "bg-green-600" : "bg-gray-300"
                        }`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                          r.active ? "translate-x-4.5" : "translate-x-0.5"
                        }`} />
                      </button>
                    </td>
                    <td className="py-2.5 px-3">
                      <button
                        onClick={() => handleDelete(r.id)}
                        disabled={deletingId === r.id}
                        className="text-gray-400 hover:text-red-600 disabled:opacity-40"
                        title="Remove recipient"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Navigate to the page and smoke-test**

With dev server running, go to `http://localhost:3000/digest` (logged in as super_admin).

Verify:
- Settings card shows toggle (off by default) and "Never" for last sent
- Recipients card shows "No recipients yet"
- Add Recipient form appears when button is clicked
- Province dropdown appears only when CARPO or PARPO II is selected
- Adding a recipient shows it in the table
- Active toggle works
- Delete removes the row
- "Send Now" button is disabled when 0 active recipients

- [ ] **Step 3: Test full send flow**

1. Add at least one recipient with a real email address you can check
2. Confirm SMTP env vars are set in `.env`
3. Click "Send Now"
4. Verify the email arrives, subject line is correct, and content looks right

- [ ] **Step 4: Commit**

```bash
git add app/digest/page.tsx
git commit -m "feat: add digest admin page with settings and recipients management"
```

---

## Self-Review

### Spec coverage check

| Spec requirement | Task |
|---|---|
| `DigestRecipient` table | Task 2 |
| `email_digest_enabled` + `email_digest_last_sent_at` Settings | Task 2 |
| Regional email variant (with provincial breakdown) | Task 4, Task 3 |
| Provincial email variant (province chip, filtered data) | Task 4, Task 3 |
| Section 1 — weekly LHs Validated + COCROMs Encoded | Task 3 |
| Section 2 — cumulative 3 metrics with progress bars | Task 3, Task 4 |
| Nodemailer SMTP + Hostinger env vars | Task 1, Task 8 |
| Recipients CRUD API | Task 5 |
| Settings GET/PUT API | Task 6 |
| Preview API | Task 7 |
| Manual send API + writes last_sent_at | Task 8 |
| Scheduler: Monday 8 AM PHT, setInterval 7d | Task 9 |
| Scheduler: catch-up on startup | Task 9 |
| `scheduleWeeklyDigest` skips if disabled | Task 9 |
| Manual send also writes last_sent_at | Task 8 |
| `/digest` added to ADMIN_PAGES | Task 10 |
| Admin UI: toggle, status pill, last sent, Send Now | Task 11 |
| Admin UI: recipients table, Add/Edit/Delete, Active toggle | Task 11 |
| Province dropdown hides for regional roles | Task 11 |
| Per-recipient failures don't block others | Task 3 (`sendWeeklyDigest` catches per-send) |
| Returns `{ sent, failed, recipients }` | Task 8 |
| `last_sent_at` only updated if ≥1 sent | Task 8 |

All spec requirements are covered.

### Type consistency check

- `DigestRecipient` defined in `lib/digest.ts` and imported in `app/digest/page.tsx` ✓
- `DigestData`, `DigestScope`, `CumulativeMetric` used consistently across `lib/digest.ts` and `lib/email.ts` ✓
- `buildEmailHtml(variant, recipient, data, weekStart, weekEnd)` signature matches the call in `sendWeeklyDigest` ✓
- `getWeekBounds()` returns `{ weekStart: Date, weekEnd: Date }` used in preview route, send route, and scheduler ✓
