# Email Opt-Out for Weekly Digest — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let digest email recipients opt out by clicking an unsubscribe link in the email footer, with no login required.

**Architecture:** Each `DigestRecipient` row gets a unique UUID token stored in the DB. The email footer includes a link to `/unsubscribe?token=<uuid>` — a public Next.js server component that sets `active = 0`, logs the event, and emails an alert to `DIGEST_ADMIN_EMAIL`. The proxy middleware is updated to let `/unsubscribe` through without a session.

**Tech Stack:** Next.js 16 (App Router, async server components), better-sqlite3 (`rawDb`), nodemailer (`sendEmail`), Tailwind CSS v4.

---

## File Map

| File | Action | What changes |
|---|---|---|
| `lib/db.ts` | Modify | Add `unsubscribe_token` column migration; bump `SCHEMA_VERSION` to 6 |
| `lib/digest.ts` | Modify | Add `unsubscribe_token: string \| null` to `DigestRecipient` type |
| `app/api/admin/digest/recipients/route.ts` | Modify | Generate `crypto.randomUUID()` on `POST` insert |
| `lib/email.ts` | Modify | Add unsubscribe link to `buildEmailHtml()` footer |
| `proxy.ts` | Modify | Allow `/unsubscribe` as a public route (no session required) |
| `app/unsubscribe/page.tsx` | Create | Public server component — handles DB update, logging, alert email, confirmation UI |

---

## Task 1: Add `unsubscribe_token` column and update type

**Files:**
- Modify: `lib/db.ts`
- Modify: `lib/digest.ts`

- [ ] **Step 1: Bump `SCHEMA_VERSION` and add history entry in `lib/db.ts`**

Replace the existing version block (lines 10–17):

```ts
export const SCHEMA_VERSION = 6;
export const SCHEMA_HISTORY: { version: number; description: string }[] = [
  { version: 1, description: "AuditLog — added source column" },
  { version: 2, description: "Setting table" },
  { version: 3, description: "CommitmentTarget table" },
  { version: 4, description: "DigestRecipient table and email digest settings" },
  { version: 5, description: "recompute_last_ran_at setting" },
  { version: 6, description: "DigestRecipient — unsubscribe_token column" },
];
```

- [ ] **Step 2: Add migration block in `runMigrations()` in `lib/db.ts`**

Add this block after the existing `try/catch` block that creates `DigestRecipient` (after line ~81, before the closing brace of `runMigrations`):

```ts
  try {
    const cols = db.prepare(`PRAGMA table_info("DigestRecipient")`).all() as Array<{ name: string }>;
    if (cols.length > 0 && !cols.find((c) => c.name === "unsubscribe_token")) {
      db.prepare(`ALTER TABLE "DigestRecipient" ADD COLUMN "unsubscribe_token" TEXT UNIQUE`).run();
      const rows = db.prepare(`SELECT id FROM "DigestRecipient"`).all() as { id: number }[];
      const stmt = db.prepare(`UPDATE "DigestRecipient" SET unsubscribe_token = ? WHERE id = ?`);
      for (const row of rows) {
        stmt.run(crypto.randomUUID(), row.id);
      }
    }
  } catch {
    // Migration errors must not crash the server
  }
```

- [ ] **Step 3: Add `unsubscribe_token` to `DigestRecipient` in `lib/digest.ts`**

In the `DigestRecipient` interface (lines 6–16), add `unsubscribe_token` after `active`:

```ts
export interface DigestRecipient {
  id: number;
  name: string;
  nickname: string | null;
  email: string;
  role: string;
  level: "regional" | "provincial";
  province: string | null;
  active: number;
  unsubscribe_token: string | null;
  created_at: string;
}
```

- [ ] **Step 4: Verify types compile**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Start the dev server and verify the migration runs**

```bash
npm run dev
```

Open the app in a browser, navigate to `/digest`, and check that existing recipients still appear (DB didn't crash). Stop the server.

- [ ] **Step 6: Commit**

```bash
git add lib/db.ts lib/digest.ts
git commit -m "feat: add unsubscribe_token column to DigestRecipient"
```

---

## Task 2: Generate token on new recipient insert

**Files:**
- Modify: `app/api/admin/digest/recipients/route.ts`

- [ ] **Step 1: Generate a token in the POST handler**

Replace the `INSERT` statement and its run call in the `POST` handler (lines ~38–41) with:

```ts
  try {
    const unsubscribe_token = crypto.randomUUID();
    const result = rawDb
      .prepare(`INSERT INTO "DigestRecipient" (name, nickname, email, role, level, province, unsubscribe_token) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(name.trim(), nickname?.trim() || null, email.trim().toLowerCase(), role.trim(), level, province?.trim() ?? null, unsubscribe_token);
```

Leave the rest of the `try` block (the `SELECT` returning the new row, and the `return`) unchanged.

- [ ] **Step 2: Verify types compile**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Manual test**

Start the dev server. In `/digest`, add a new recipient. Open the SQLite DB file in any SQLite viewer (or use the sqlite3 CLI: `sqlite3 dev.db "SELECT id, email, unsubscribe_token FROM DigestRecipient ORDER BY id DESC LIMIT 1;"`) and confirm the new row has a non-null UUID in `unsubscribe_token`.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/digest/recipients/route.ts
git commit -m "feat: generate unsubscribe_token on recipient insert"
```

---

## Task 3: Add unsubscribe link to email footer

**Files:**
- Modify: `lib/email.ts`

- [ ] **Step 1: Add the link to the footer in `buildEmailHtml()`**

In `lib/email.ts`, the footer section (lines ~257–261) currently ends with:

```html
<p style="font-size:11px;color:#cbd5e1;margin:0;">© ${fmtYear(weekEnd)} Department of Agrarian Reform · Region V · Bicol</p>
```

Replace the entire footer `<tr>` block (lines ~256–262) with:

```ts
      <!-- Footer -->
      <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 32px;text-align:center;border-radius:0 0 4px 4px;">
        <p style="font-size:11px;color:#475569;margin:0 0 4px;font-weight:600;letter-spacing:0.01em;">Unclassified ARRs Data Management System</p>
        <p style="font-size:11px;color:#94a3b8;margin:0 0 3px;">This report was generated automatically. For questions, contact your system administrator.</p>
        <p style="font-size:11px;color:#cbd5e1;margin:0 0 6px;">© ${fmtYear(weekEnd)} Department of Agrarian Reform · Region V · Bicol</p>
        ${recipient.unsubscribe_token
          ? `<p style="font-size:10px;color:#cbd5e1;margin:0;">To stop receiving these emails, <a href="${process.env.NEXT_PUBLIC_APP_URL}/unsubscribe?token=${recipient.unsubscribe_token}" style="color:#94a3b8;">unsubscribe here</a>.</p>`
          : ""}
      </td></tr>
```

Note: The template literal is already inside a template literal in `buildEmailHtml`, so use a nested `${}` expression for the conditional as shown above. Make sure the outer string delimiters are consistent with the rest of the function.

- [ ] **Step 2: Verify types compile**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Manual test**

In `/digest`, click "Send Now" (or use the preview route). Open the received email and confirm the footer contains the unsubscribe link. Also confirm that the link URL includes the token.

- [ ] **Step 4: Commit**

```bash
git add lib/email.ts
git commit -m "feat: add unsubscribe link to digest email footer"
```

---

## Task 4: Allow `/unsubscribe` as a public route

**Files:**
- Modify: `proxy.ts`

- [ ] **Step 1: Add `/unsubscribe` to the always-allow condition**

In `proxy.ts`, line 67, the existing condition is:

```ts
  if (pathname.startsWith("/api/auth") || pathname === "/login" || pathname.startsWith("/view/")) {
    return noindex(NextResponse.next());
  }
```

Replace it with:

```ts
  if (
    pathname.startsWith("/api/auth") ||
    pathname === "/login" ||
    pathname.startsWith("/view/") ||
    pathname.startsWith("/unsubscribe")
  ) {
    return noindex(NextResponse.next());
  }
```

- [ ] **Step 2: Verify types compile**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add proxy.ts
git commit -m "feat: allow /unsubscribe as a public route"
```

---

## Task 5: Build the unsubscribe page

**Files:**
- Create: `app/unsubscribe/page.tsx`

- [ ] **Step 1: Create the file**

Create `app/unsubscribe/page.tsx` with the following content:

```tsx
import { rawDb } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import type { DigestRecipient } from "@/lib/digest";

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return <Result invalid />;
  }

  const recipient = rawDb
    .prepare(`SELECT * FROM "DigestRecipient" WHERE unsubscribe_token = ?`)
    .get(token) as DigestRecipient | undefined;

  if (!recipient || !recipient.active) {
    return <Result invalid />;
  }

  rawDb
    .prepare(`UPDATE "DigestRecipient" SET active = 0 WHERE id = ?`)
    .run(recipient.id);

  console.log(`[digest] Recipient ${recipient.email} unsubscribed via link`);

  const adminEmail = process.env.DIGEST_ADMIN_EMAIL;
  if (adminEmail) {
    const now = new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" });
    const result = await sendEmail(
      adminEmail,
      `Digest unsubscribe: ${recipient.name}`,
      `<p style="font-family:sans-serif;font-size:14px;color:#374151;">
        <strong>${recipient.name}</strong> (${recipient.email}) has unsubscribed from the weekly digest.<br>
        Time: ${now} (PHT)<br><br>
        Re-activate them from the
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/digest">Digest Settings</a> page.
      </p>`
    );
    if (!result.ok) {
      console.error(`[digest] Failed to send unsubscribe alert: ${result.error}`);
    }
  } else {
    console.warn("[digest] DIGEST_ADMIN_EMAIL not set; skipping unsubscribe alert email");
  }

  return <Result invalid={false} />;
}

function Result({ invalid }: { invalid: boolean }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg overflow-hidden">
        <div className="bg-[#14532d] px-8 py-5">
          <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-emerald-400/80">
            DAR · Region V · Bicol
          </p>
          <p className="text-sm font-bold text-white mt-1">Unclassified ARRs Data Management System</p>
        </div>
        <div className="px-8 py-8 text-center">
          {invalid ? (
            <>
              <p className="text-sm font-semibold text-gray-700 mb-1">Link invalid or already used</p>
              <p className="text-xs text-gray-400">
                This unsubscribe link is not recognized or has already been processed.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-gray-700 mb-1">You&apos;ve been unsubscribed.</p>
              <p className="text-xs text-gray-400">
                You will no longer receive weekly digest emails. Contact your system administrator to re-subscribe.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Manual test — valid token**

1. Grab a token from the DB:
   ```bash
   sqlite3 dev.db "SELECT email, unsubscribe_token FROM DigestRecipient WHERE active = 1 LIMIT 1;"
   ```
2. Start the dev server (`npm run dev`).
3. Visit `http://localhost:3000/unsubscribe?token=<the-token>` in a browser **without** being logged in (use a private/incognito window).
4. Confirm the confirmation page renders ("You've been unsubscribed.").
5. Confirm the recipient is now inactive:
   ```bash
   sqlite3 dev.db "SELECT email, active FROM DigestRecipient ORDER BY id DESC LIMIT 3;"
   ```
6. Check the dev server console for the `[digest] Recipient ... unsubscribed via link` log line.
7. If `DIGEST_ADMIN_EMAIL` is set in `.env`, check that the alert email arrived.

- [ ] **Step 4: Manual test — invalid token**

Visit `http://localhost:3000/unsubscribe?token=not-a-real-token` and confirm the neutral message ("Link invalid or already used") renders. Confirm the DB is unchanged.

- [ ] **Step 5: Manual test — already inactive**

Visit the same valid-token URL from Step 3 again. Confirm the neutral message renders (idempotent — `active` is already 0 so no second write occurs).

- [ ] **Step 6: Commit**

```bash
git add app/unsubscribe/page.tsx
git commit -m "feat: add self-service unsubscribe page for digest recipients"
```

---

## Environment Variables Checklist

Before deploying, ensure these are set in `.env` (dev) and the production environment:

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Yes | e.g. `https://your-app.example.com` — no trailing slash. Used to build unsubscribe links. |
| `DIGEST_ADMIN_EMAIL` | Recommended | Alert email recipient. If unset, unsubscribes still work but no alert is sent. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Yes (already set) | Used by the existing `sendEmail()` helper for the alert. |
