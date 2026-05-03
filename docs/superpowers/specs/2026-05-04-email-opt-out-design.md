# Weekly Digest Email Opt-Out — Design Spec

**Date:** 2026-05-04
**System:** Unclassified ARRs Data Management System
**Status:** Approved

---

## Overview

Self-service opt-out for the weekly digest email. Each recipient gets a unique unsubscribe token. The email footer includes an unsubscribe link. Clicking it marks the recipient inactive, logs the event, and sends an alert to the configured admin email. No login is required.

---

## Data Model

### Schema change: `DigestRecipient`

```sql
ALTER TABLE "DigestRecipient" ADD COLUMN "unsubscribe_token" TEXT UNIQUE;
```

Added via `runMigrations()` in `lib/db.ts` using the existing `rawDb` migration pattern.

After adding the column, a one-time `UPDATE` populates tokens for all existing rows:

```ts
rawDb.prepare(`UPDATE "DigestRecipient" SET unsubscribe_token = ? WHERE id = ? AND unsubscribe_token IS NULL`)
```

Called in a loop over all rows, generating a `crypto.randomUUID()` per row.

New inserts in `POST /api/admin/digest/recipients` also generate a token at creation time.

### Existing fields used

- `active INTEGER` — already present; flipped to `0` on unsubscribe. No new column needed.

### New environment variable

| Variable | Description |
|---|---|
| `DIGEST_ADMIN_EMAIL` | Email address that receives unsubscribe alerts. If unset, alert is skipped and a warning is logged. |
| `NEXT_PUBLIC_APP_URL` | Base URL of the app (e.g. `https://your-app.example.com`). Used to build the unsubscribe link in the email footer. Must not have a trailing slash. |

---

## Unsubscribe Flow

### 1. Email footer link (`lib/email.ts`)

The footer of every digest email gains an unsubscribe line:

> "To stop receiving these emails, [unsubscribe here]."

Link format:

```
{process.env.NEXT_PUBLIC_APP_URL}/unsubscribe?token={recipient.unsubscribe_token}
```

### 2. Unsubscribe page (`app/unsubscribe/page.tsx`)

- Public route — no authentication required.
- Reads `token` from the query string.
- Looks up the matching `DigestRecipient`.
- **If token is invalid or recipient not found:** shows a neutral message — *"This link is invalid or has already been used."*
- **If recipient is already inactive:** same neutral message — no side effect.
- **If recipient is active:** sets `active = 0`, then:
  1. Writes a server log: `console.log('[digest] Recipient <email> unsubscribed via link')`
  2. Sends an alert email to `DIGEST_ADMIN_EMAIL` (subject: `"Digest unsubscribe: {name}"`, body naming who unsubscribed and the timestamp).
  3. Renders confirmation: *"You've been unsubscribed. Contact your system administrator to re-subscribe."*

The unsubscribe logic runs server-side before the confirmation renders.

### 3. Admin alert email

- Sent via the existing `sendEmail()` helper in `lib/email.ts`.
- If `DIGEST_ADMIN_EMAIL` is not set: skip the email, log a warning. The unsubscribe still completes.
- If the alert send fails: log the error to console. The unsubscribe still completes — recipient is always opted out regardless.

---

## Admin UI Changes (`app/digest/page.tsx`)

No new controls needed. The existing active toggle already re-activates a recipient. The `unsubscribe_token` is preserved on re-activation so the old link still functions.

Inactive recipients (whether admin-toggled or self-opted-out) show as inactive in the recipients table. No UI distinction is made between the two causes — the admin re-activates either way via the existing active toggle.

---

## New Files

| File | Purpose |
|---|---|
| `app/unsubscribe/page.tsx` | Public confirmation page; handles DB write and notifications server-side |

## Modified Files

| File | Change |
|---|---|
| `lib/db.ts` | Add `unsubscribe_token` column migration + one-time token backfill |
| `lib/digest.ts` | Include `unsubscribe_token` in `DigestRecipient` type |
| `lib/email.ts` | Add unsubscribe link to email footer |
| `app/api/admin/digest/recipients/route.ts` | Generate `unsubscribe_token` on `POST` insert |

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Invalid or unknown token | Neutral message; no DB write |
| Already inactive recipient | Neutral message; no DB write |
| `DIGEST_ADMIN_EMAIL` not set | Skip alert email, log warning; unsubscribe still completes |
| Alert email send failure | Log error to console; unsubscribe still completes |
| Re-activation by admin | Flip `active = 1` via existing toggle; token preserved |
