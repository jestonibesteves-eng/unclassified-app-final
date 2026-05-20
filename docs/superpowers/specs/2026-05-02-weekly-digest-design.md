# Weekly Progress Digest — Design Spec

**Date:** 2026-05-02  
**System:** Unclassified ARRs Data Management System  
**Status:** Approved

---

## Overview

A weekly email digest that reports COCROM validation, encoding, and distribution progress to regional and provincial stakeholders. Emails are personalized by recipient scope (regional vs. provincial). Default mode is manual; automatic Monday 8:00 AM sends are opt-in via an admin toggle.

---

## Data Model

### New table: `DigestRecipient`

Added via `runMigrations()` using the existing `rawDb` migration pattern (same as `CommitmentTarget`).

```sql
CREATE TABLE IF NOT EXISTS "DigestRecipient" (
  "id"         INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "name"       TEXT NOT NULL,
  "nickname"   TEXT,            -- informal name used in email greeting; falls back to name if NULL
  "email"      TEXT NOT NULL UNIQUE,
  "role"       TEXT NOT NULL,   -- "ARDO" | "CARPO" | "PARPO II"
  "level"      TEXT NOT NULL,   -- "regional" | "provincial"
  "province"   TEXT,            -- NULL for regional recipients
  "active"     INTEGER NOT NULL DEFAULT 1,
  "created_at" TEXT NOT NULL DEFAULT (datetime('now'))
)
```

- Multiple recipients per role are supported (no uniqueness on role).
- ARDO and regional CARPO → `level = "regional"`, `province = NULL`.
- Provincial CARPO and PARPO II → `level = "provincial"`, `province = <province name>`.
- Email greeting uses `nickname` if set, otherwise `name`.
- Multiple CARPOs or PARPO IIs for the same province are allowed.

### New keys in existing `Setting` table

| Key | Default | Description |
|---|---|---|
| `email_digest_enabled` | `"false"` | `"true"` enables automatic Monday 8:00 AM sends |
| `email_digest_last_sent_at` | `""` | ISO timestamp of last send (auto or manual); used for catch-up detection |

---

## Email Content

### Week definition

The digest always covers the **previous full week: Monday 00:00:00 – Sunday 23:59:59 (Philippine Time, UTC+8)**. When sent automatically on Monday 8:00 AM, this is the 7-day window that just closed.

### Two email variants

**Regional email** — sent to recipients where `level = "regional"` (ARDO, regional CARPO):
- Greeting: "Good day, {nickname ?? name}."
- Section 1: This Week's Activity (regional totals)
- Section 2: Cumulative Progress (regional totals)
- Provincial breakdown table (all 7 provinces)

**Provincial email** — sent to recipients where `level = "provincial"` (provincial CARPO, PARPO II):
- Greeting: "Good day, {nickname ?? name}. Here is the progress update for {province}…"
- Province chip in header identifying their scope
- Section 1: This Week's Activity (province only)
- Section 2: Cumulative Progress (province only)
- No breakdown table

### Section 1 — This Week's Activity

Counts Landholdingswhere `updated_at` falls within the previous week's window.

| Metric | Definition |
|---|---|
| LHs Validated | Landholdings updated this week whose current status is a validated state |
| COCROMs Encoded | Landholdings (COCROMs) updated this week whose current status is an encoded state |

### Section 2 — Cumulative Progress

| Metric | Completed | Target / Eligible | Balance | Progress |
|---|---|---|---|---|
| LHs Fully Validated | Count of fully validated LHs | Total LHs in database | Remaining | % |
| COCROMs Encoded | Count of encoded COCROMs | Eligible COCROMs (CARPABLE + Eligible ARBs) | Remaining | % |
| COCROMs for Distribution | Count available for distribution | `CommitmentTarget.committed` for the scope | Balance to commitment | % of commitment |

### Email design

- **Subject (regional):** `📊 DAR Region V — Weekly Progress Digest · {Mon} – {Sun}, {YYYY}`
- **Subject (provincial):** `📊 DAR Region V — Weekly Progress Digest · {Province} · {Mon} – {Sun}, {YYYY}`
- DAR green header (`#14532d`) with week badge and province chip (provincial only)
- Two stat cards for Section 1 (green left border = validated, blue = encoded)
- Progress bars with percentage in Section 2
- Balance shown in red (behind) or green (ahead of target)
- Footer: "Unclassified ARRs Data Management System"

---

## Architecture

### New files

| File | Purpose |
|---|---|
| `lib/email.ts` | Nodemailer transport + `sendWeeklyDigest()` function |
| `lib/digest.ts` | `getDigestData(weekStart, weekEnd, scope)` — queries all metrics |
| `app/digest/page.tsx` | Admin UI page (super_admin only) |
| `app/api/admin/digest/recipients/route.ts` | GET (list), POST (add) |
| `app/api/admin/digest/recipients/[id]/route.ts` | PUT (update), DELETE (remove) |
| `app/api/admin/digest/settings/route.ts` | GET, PUT |
| `app/api/admin/digest/send/route.ts` | POST — manual or scheduled trigger |
| `app/api/admin/digest/preview/route.ts` | GET — returns computed data without sending |

### Modified files

| File | Change |
|---|---|
| `lib/db.ts` | Add `DigestRecipient` table creation to `runMigrations()` |
| `instrumentation.node.ts` | Add `scheduleWeeklyDigest()` call alongside `scheduleDailyBackup()` |
| `proxy.ts` | Add `/digest` to `ADMIN_PAGES` |

### Environment variables (`.env`)

```
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_USER=your@businessemail.com
SMTP_PASS=yourpassword
SMTP_FROM=DAR Region V <your@businessemail.com>
```

---

## Scheduler & Catch-up Logic

`scheduleWeeklyDigest()` in `instrumentation.node.ts`:

1. **On startup:**
   - Read `email_digest_enabled` — if `"false"`, register the schedule but skip catch-up.
   - If `"true"`: compute the most recent Monday 8:00 AM (UTC+8) before `Date.now()`.
   - If `email_digest_last_sent_at` is earlier than that Monday 8:00 AM → send immediately (catch-up).

2. **Ongoing:**
   - `setTimeout` to next Monday 8:00 AM PHT, then `setInterval` every 7 days.
   - Before each fire: re-read `email_digest_enabled`. If `"false"`, skip send but keep interval alive.
   - After every successful send (auto or catch-up): write current timestamp to `email_digest_last_sent_at`.

3. **Manual send** also writes `email_digest_last_sent_at`, preventing duplicate catch-up on next restart.

---

## API Routes

All routes require an authenticated session with `role = "super_admin"`.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/admin/digest/recipients` | List all recipients |
| `POST` | `/api/admin/digest/recipients` | Add recipient `{ name, email, role, level, province? }` |
| `PUT` | `/api/admin/digest/recipients/[id]` | Update any field (including `active` toggle) |
| `DELETE` | `/api/admin/digest/recipients/[id]` | Remove recipient |
| `GET` | `/api/admin/digest/settings` | `{ enabled: boolean, lastSentAt: string \| null }` |
| `PUT` | `/api/admin/digest/settings` | `{ enabled: boolean }` |
| `POST` | `/api/admin/digest/send` | Trigger digest now; returns `{ sent: number, recipients: string[] }` |
| `GET` | `/api/admin/digest/preview` | `?level=regional` or `?province=ALBAY` — data only, no email sent |

---

## Admin UI (`/digest`)

Added to `ADMIN_PAGES` in `proxy.ts`. Accessible by super_admin only.

**Card 1 — Digest Settings:**
- Toggle: "Automatic weekly digest" (on/off), default off
- Status pill: "Auto-send off" / "Auto-send on · Next: Monday 8:00 AM"
- Last sent: timestamp or "Never"
- Send Now button with week coverage info and active recipient count
- Info note: digest always covers the previous full week

**Card 2 — Recipients:**
- Table: Name, Email, Role (color-coded badge), Scope (Regional / Province name), Active toggle, Edit / Delete actions
- "Add Recipient" reveals an inline form: Name, Email, Role (dropdown), Province (dropdown, shown when role is CARPO or PARPO II)
- Province auto-hides when Regional CARPO or ARDO is selected

---

## Error Handling

- SMTP send failures are caught per-recipient; a failed send to one recipient does not block others.
- Failed sends are logged to the server console with the recipient email and error message.
- `POST /api/admin/digest/send` returns partial success with `{ sent, failed, recipients }`.
- If no active recipients exist, send is a no-op (returns `{ sent: 0 }`).
- `email_digest_last_sent_at` is only updated if at least one email was sent successfully.
