# Final Edition Weekly Digest — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Final Edition" special treatment to the last weekly digest sent before the June 30 Regional Title & COCROM Distribution event.

**Architecture:** `isFinalEdition()` is a pure helper in `lib/email.ts` that determines whether a send qualifies as final (auto-detect via date gap, or manual override). `sendWeeklyDigest()` in `lib/digest.ts` reads the override setting, calls `isFinalEdition()`, and passes `isFinal` into `buildSubjectLine()` and `buildEmailHtml()`. The admin page exposes a "Send as Final Edition" checkbox that writes the override setting and auto-resets after a successful send.

**Tech Stack:** Next.js App Router, TypeScript, SQLite via `better-sqlite3` (`rawDb`), Nodemailer, Tailwind CSS.

## Global Constraints

- All email HTML must use table-based layouts and inline styles only — no `<div>` for structure, no external CSS, no CSS animations.
- `rgba()` colors are acceptable in inline styles for modern email clients.
- The `isFinal` parameter is always optional with a default of `false` — existing call sites need no changes.
- Setting key for the override: `email_digest_final_edition_override` (string `"true"` / `"false"`).
- The override resets to `"false"` after any successful send (sent > 0) where `finalOverride` was `true`.
- No new npm packages.

---

### Task 1: `lib/email.ts` — Add `isFinalEdition()` and update `buildSubjectLine()`

**Files:**
- Modify: `lib/email.ts`

**Interfaces:**
- Produces:
  - `export function isFinalEdition(weekEnd: Date, targetDate: string, override?: boolean): boolean`
  - `buildSubjectLine(variant, province, weekStart, weekEnd, isFinal?: boolean): string` — new optional 5th param

- [ ] **Step 1: Add `isFinalEdition` helper after `buildCountdownBadge` in `lib/email.ts`**

Insert this block after the closing `}` of `buildCountdownBadge`:

```ts
export function isFinalEdition(weekEnd: Date, targetDate: string, override = false): boolean {
  if (override) return true;
  const deadlineMs = new Date(`${targetDate}T00:00:00+08:00`).getTime();
  const daysDiff   = (deadlineMs - weekEnd.getTime()) / 86_400_000;
  return daysDiff >= 0 && daysDiff <= 2;
}
```

- [ ] **Step 2: Update `buildSubjectLine` to accept `isFinal` and return Final Edition subjects**

Replace the entire `buildSubjectLine` function:

```ts
export function buildSubjectLine(
  variant: "regional" | "provincial",
  province: string | undefined,
  weekStart: Date,
  weekEnd: Date,
  isFinal = false
): string {
  const range = `${fmtShort(weekStart)} – ${fmtShort(weekEnd)}, ${fmtYear(weekEnd)}`;
  if (isFinal) {
    if (variant === "provincial" && province) {
      return `🎉 DAR Region V — Final Progress Digest · Eve of Distribution · ${province} · ${range}`;
    }
    return `🎉 DAR Region V — Final Progress Digest · Eve of Distribution · ${range}`;
  }
  if (variant === "provincial" && province) {
    return `📊 DAR Region V — Weekly Progress Digest · ${province} · ${range}`;
  }
  return `📊 DAR Region V — Weekly Progress Digest · ${range}`;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```
npx tsc --noEmit
```

Expected: no errors related to `lib/email.ts`.

- [ ] **Step 4: Commit**

```bash
git add lib/email.ts
git commit -m "feat: add isFinalEdition helper and Final Edition subject line"
```

---

### Task 2: `lib/email.ts` — Final Edition visual changes in `buildEmailHtml()`

**Files:**
- Modify: `lib/email.ts`

**Interfaces:**
- Consumes: `isFinalEdition(weekEnd, targetDate, override)` from Task 1
- Produces: `buildEmailHtml(..., isFinal?: boolean): string` — new optional 7th param

- [ ] **Step 1: Update `buildEmailHtml` signature to accept `isFinal`**

Change the function signature from:
```ts
export function buildEmailHtml(
  variant: "regional" | "provincial",
  recipient: DigestRecipient,
  data: DigestData,
  weekStart: Date,
  weekEnd: Date,
  targetDate: string = "2026-06-15"
): string {
```
to:
```ts
export function buildEmailHtml(
  variant: "regional" | "provincial",
  recipient: DigestRecipient,
  data: DigestData,
  weekStart: Date,
  weekEnd: Date,
  targetDate: string = "2026-06-15",
  isFinal = false
): string {
```

- [ ] **Step 2: Add Final Edition computed variables inside `buildEmailHtml`, after the existing variable declarations**

Insert after the line `const { cumLhsValidated: lhv, cumCocromsEncoded: enc, cumCocromsForDistribution: dist } = data;`:

```ts
  // Final Edition — event date formatted for display
  const [feY, feM, feD] = targetDate.split("-").map(Number);
  const eventDateFmt = `${["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"][feM - 1]} ${feD}, ${feY}`;
  const eventDateLong = new Date(feY, feM - 1, feD).toLocaleDateString("en-PH", {
    year: "numeric", month: "long", day: "numeric",
  });
```

- [ ] **Step 3: Add `accentBar`, `headerHtml`, `distBanner`, and `closingNote` conditional variables**

Insert after the `eventDateLong` line:

```ts
  const accentBar = isFinal
    ? `<tr><td style="background:#f59e0b;padding:9px 28px;text-align:center;border-radius:4px 4px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
        <span style="font-size:10px;font-weight:700;letter-spacing:0.26em;text-transform:uppercase;color:#0c3318;">FINAL EDITION</span>
        &nbsp;&nbsp;&bull;&nbsp;&nbsp;
        <span style="font-size:10px;font-weight:700;letter-spacing:0.26em;text-transform:uppercase;color:#0c3318;">${eventDateFmt}</span>
        &nbsp;&nbsp;&bull;&nbsp;&nbsp;
        <span style="font-size:10px;font-weight:700;letter-spacing:0.26em;text-transform:uppercase;color:#0c3318;">DISTRIBUTION DAY</span>
      </td></tr>`
    : `<tr><td style="background:#22c55e;height:4px;border-radius:4px 4px 0 0;padding:0;line-height:0;font-size:0;">&nbsp;</td></tr>`;

  const provinceChipFinal =
    variant === "provincial" && data.scope.province
      ? `<div style="margin-top:14px;"><span style="display:inline-block;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.16);border-radius:6px;padding:6px 13px;font-size:12px;font-weight:600;color:rgba(255,255,255,0.82);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">&#128205; Province of ${data.scope.province}</span></div>`
      : "";

  const finalHeader = `<tr><td style="background:#0f3d20;padding:0;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="width:58%;padding:24px 26px 24px 32px;vertical-align:middle;">
            <div style="font-size:9px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:rgba(255,255,255,0.36);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;margin-bottom:8px;">DAR &middot; Region V &middot; Bicol</div>
            <span style="display:inline-block;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);border-radius:99px;padding:3px 11px;font-size:10px;color:rgba(255,255,255,0.62);font-weight:500;margin-bottom:12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">${weekRange}</span>
            <div style="font-size:28px;font-weight:800;color:#ffffff;letter-spacing:-0.01em;line-height:1.08;margin:0 0 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">Weekly Progress<br>Digest</div>
            <div style="font-size:11px;color:rgba(255,255,255,0.38);letter-spacing:0.02em;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">Final Report &mdash; Regional Title &amp; COCROM Distribution</div>
            ${provinceChipFinal}
          </td>
          <td style="width:1px;padding:20px 0;background:#d97706;">&nbsp;</td>
          <td style="background:#0a2d18;padding:22px 20px;vertical-align:middle;text-align:center;">
            <div style="font-size:22px;font-weight:800;color:#fbbf24;letter-spacing:-0.01em;display:block;margin-bottom:4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">Tomorrow&#8217;s</div>
            <div style="font-size:15px;font-weight:700;color:#fbbf24;line-height:1.65;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">the big day!<br>Let&#8217;s do our best.<br>Good luck!</div>
          </td>
        </tr>
      </table>
    </td></tr>`;

  const normalHeader = `<tr><td style="background:#14532d;padding:26px 32px 28px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="font-size:10px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:rgba(255,255,255,0.5);">DAR · Region V · Bicol</td>
            <td align="right">
              <span style="display:inline-block;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.18);border-radius:99px;padding:5px 14px;font-size:11px;color:rgba(255,255,255,0.85);font-weight:500;white-space:nowrap;">Week of ${fmtShort(weekStart)} – ${fmtShort(weekEnd)}</span>
            </td>
          </tr>
          <tr>
            <td style="padding-top:18px;" valign="bottom">
              <div style="font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;line-height:1.15;">Weekly Progress Digest</div>
              <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:5px;letter-spacing:0.01em;">COCROM Validation, Encoding &amp; Distribution Summary</div>
            </td>
            <td style="padding-top:18px;padding-left:20px;" valign="bottom" align="right">
              ${buildCountdownBadge(targetDate, weekEnd)}
            </td>
          </tr>
          ${provinceChip}
        </table>
      </td></tr>`;

  const headerHtml = isFinal ? finalHeader : normalHeader;

  const distBanner = isFinal
    ? `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
        <tr><td style="background:#0f3d20;border-radius:10px;padding:20px 24px;">
          <p style="font-size:13px;color:#ffffff;margin:0;line-height:1.75;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
            Today is the last day before the Regional Title and COCROM Distribution. Below are the final numbers as we head into tomorrow&#8217;s big event. Thank you for your commitment and hard work throughout this effort &#8212; the data reflects it.
          </p>
        </td></tr>
      </table>`
    : "";

  const closingNote = isFinal
    ? `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;">
        <tr><td style="border-top:2px solid #fde68a;padding-top:20px;">
          <p style="font-size:13px;color:#374151;margin:0;line-height:1.85;font-style:italic;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
            Tomorrow, <strong style="color:#0f172a;font-style:normal;">${eventDateLong}</strong>, marks the culmination of this campaign as DAR Region V distributes COCROMs across Bicol. The numbers in this final digest are a testament to the dedication of every team involved. Well done!
          </p>
        </td></tr>
      </table>`
    : "";
```

- [ ] **Step 4: Replace the hardcoded accent bar and header in the returned HTML template**

In the returned HTML string at the bottom of `buildEmailHtml`, find and replace:

```ts
      <!-- Top accent bar -->
      <tr><td style="background:#22c55e;height:4px;border-radius:4px 4px 0 0;padding:0;line-height:0;font-size:0;">&nbsp;</td></tr>

      <!-- Header -->
      <tr><td style="background:#14532d;padding:26px 32px 28px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="font-size:10px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:rgba(255,255,255,0.5);">DAR · Region V · Bicol</td>
            <td align="right">
              <span style="display:inline-block;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.18);border-radius:99px;padding:5px 14px;font-size:11px;color:rgba(255,255,255,0.85);font-weight:500;white-space:nowrap;">Week of ${fmtShort(weekStart)} – ${fmtShort(weekEnd)}</span>
            </td>
          </tr>
          <tr>
            <td style="padding-top:18px;" valign="bottom">
              <div style="font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;line-height:1.15;">Weekly Progress Digest</div>
              <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:5px;letter-spacing:0.01em;">COCROM Validation, Encoding &amp; Distribution Summary</div>
            </td>
            <td style="padding-top:18px;padding-left:20px;" valign="bottom" align="right">
              ${buildCountdownBadge(targetDate, weekEnd)}
            </td>
          </tr>
          ${provinceChip}
        </table>
      </td></tr>
```

with:

```ts
      ${accentBar}
      ${headerHtml}
```

- [ ] **Step 5: Insert `distBanner` after the greeting paragraph, and `closingNote` before the footer**

In the returned HTML, find the greeting paragraph:
```ts
        <!-- Greeting -->
        <p style="font-size:15px;color:#374151;margin:0 0 26px;line-height:1.7;">
```

Add `${distBanner}` immediately after the closing `</p>` of the greeting:
```ts
        <!-- Greeting -->
        <p style="font-size:15px;color:#374151;margin:0 0 26px;line-height:1.7;">
          Good day, <strong style="color:#0f172a;">${displayName}</strong>. Here is the progress update${variant === "provincial" && data.scope.province ? ` for <strong style="color:#0f172a;">${data.scope.province}</strong>` : ""} for the week of <strong style="color:#0f172a;">${weekRange}</strong>.
        </p>

        ${distBanner}
```

Then find the closing `</td></tr>` of the Body section (just before `<!-- Footer -->`):
```ts
      </td></tr>

      <!-- Footer -->
```

Insert `${closingNote}` before that closing tag:
```ts
        ${closingNote}

      </td></tr>

      <!-- Footer -->
```

- [ ] **Step 6: Verify TypeScript compiles**

```
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Smoke-test the preview endpoint for both variants**

With the dev server running (`npm run dev`), open:
- `http://localhost:3000/api/admin/digest/preview?level=regional` — should return normal digest data (isFinal defaults to false)
- Confirm the HTML in the response does NOT contain "FINAL EDITION"

- [ ] **Step 8: Commit**

```bash
git add lib/email.ts
git commit -m "feat: add Final Edition visual treatment to buildEmailHtml"
```

---

### Task 3: `lib/digest.ts` — Thread `isFinal` through `sendWeeklyDigest()`

**Files:**
- Modify: `lib/digest.ts`

**Interfaces:**
- Consumes:
  - `isFinalEdition(weekEnd, targetDate, override)` from `lib/email.ts`
  - `buildSubjectLine(..., isFinal)` — new 5th param
  - `buildEmailHtml(..., isFinal)` — new 7th param
- Produces: `sendWeeklyDigest` auto-resets `email_digest_final_edition_override` to `"false"` after a successful send when override was active

- [ ] **Step 1: Add `isFinalEdition` to the import from `@/lib/email` in `lib/digest.ts`**

Change:
```ts
import { buildEmailHtml, buildSubjectLine, sendEmail } from "@/lib/email";
```
to:
```ts
import { buildEmailHtml, buildSubjectLine, sendEmail, isFinalEdition } from "@/lib/email";
```

- [ ] **Step 2: Read `finalEditionOverride` setting and compute `isFinal` at the top of `sendWeeklyDigest`**

In `sendWeeklyDigest`, after the `if (allRecipients.length === 0)` early return, insert:

```ts
  const overrideSetting = (
    rawDb
      .prepare(`SELECT value FROM "Setting" WHERE key = ?`)
      .get("email_digest_final_edition_override") as { value: string } | undefined
  )?.value;
  const finalOverride = overrideSetting === "true";
  const isFinal = isFinalEdition(weekEnd, regionalTargetDate, finalOverride);
```

Note: `regionalTargetDate` is already declared a few lines below this insertion point. Move the `const regionalTargetDate = await getTargetDate({ level: "regional" });` line to appear BEFORE this block, or reorder so `isFinal` is computed after `regionalTargetDate`. The final order should be:

```ts
  const regionalData = await getDigestData(weekStart, weekEnd, { level: "regional" });
  const regionalTargetDate = await getTargetDate({ level: "regional" });

  const overrideSetting = (
    rawDb
      .prepare(`SELECT value FROM "Setting" WHERE key = ?`)
      .get("email_digest_final_edition_override") as { value: string } | undefined
  )?.value;
  const finalOverride = overrideSetting === "true";
  const isFinal = isFinalEdition(weekEnd, regionalTargetDate, finalOverride);

  const provinces = [ ... ]; // existing code continues
```

- [ ] **Step 3: Pass `isFinal` to `buildSubjectLine` and `buildEmailHtml` in the send loop**

In the `for (const recipient of allRecipients)` loop, change:

```ts
    const subject = buildSubjectLine(
      recipient.level,
      recipient.province ?? undefined,
      weekStart,
      weekEnd
    );
    const html = buildEmailHtml(recipient.level, recipient, data, weekStart, weekEnd, targetDate);
```

to:

```ts
    const subject = buildSubjectLine(
      recipient.level,
      recipient.province ?? undefined,
      weekStart,
      weekEnd,
      isFinal
    );
    const html = buildEmailHtml(recipient.level, recipient, data, weekStart, weekEnd, targetDate, isFinal);
```

- [ ] **Step 4: Reset the override after a successful send**

After the send loop, just before the `return { sent, failed, recipients: sentRecipients };` line, add:

```ts
  if (finalOverride && sent > 0) {
    rawDb
      .prepare(`INSERT OR REPLACE INTO "Setting" (key, value) VALUES (?, ?)`)
      .run("email_digest_final_edition_override", "false");
  }
```

- [ ] **Step 5: Verify TypeScript compiles**

```
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/digest.ts
git commit -m "feat: thread isFinal through sendWeeklyDigest with override reset"
```

---

### Task 4: Settings API + Admin UI — `finalEditionOverride` setting

**Files:**
- Modify: `app/api/admin/digest/settings/route.ts`
- Modify: `app/digest/page.tsx`

**Interfaces:**
- Consumes: `email_digest_final_edition_override` Setting key (string `"true"`/`"false"`)
- Produces:
  - GET `/api/admin/digest/settings` now returns `{ enabled, lastSentAt, sendUntil, finalEditionOverride: boolean }`
  - PUT `/api/admin/digest/settings` now accepts `{ finalEditionOverride?: boolean }`

- [ ] **Step 1: Update GET in `app/api/admin/digest/settings/route.ts` to include `finalEditionOverride`**

Change:
```ts
  const enabled    = getSetting("email_digest_enabled") === "true";
  const lastSentAt = getSetting("email_digest_last_sent_at") || null;
  const sendUntil  = getSetting("email_digest_send_until") || null;

  return NextResponse.json({ enabled, lastSentAt, sendUntil });
```
to:
```ts
  const enabled              = getSetting("email_digest_enabled") === "true";
  const lastSentAt           = getSetting("email_digest_last_sent_at") || null;
  const sendUntil            = getSetting("email_digest_send_until") || null;
  const finalEditionOverride = getSetting("email_digest_final_edition_override") === "true";

  return NextResponse.json({ enabled, lastSentAt, sendUntil, finalEditionOverride });
```

- [ ] **Step 2: Update PUT in `app/api/admin/digest/settings/route.ts` to handle `finalEditionOverride`**

Change the body type and add the handler. Replace:
```ts
  const body = await req.json() as { enabled?: boolean; sendUntil?: string | null };
```
with:
```ts
  const body = await req.json() as { enabled?: boolean; sendUntil?: string | null; finalEditionOverride?: boolean };
```

And add after the existing `if ("sendUntil" in body)` block:
```ts
  if (body.finalEditionOverride !== undefined) {
    if (typeof body.finalEditionOverride !== "boolean")
      return NextResponse.json({ error: "finalEditionOverride must be a boolean." }, { status: 400 });
    setSetting("email_digest_final_edition_override", body.finalEditionOverride ? "true" : "false");
  }
```

Update the response to include `finalEditionOverride`:
```ts
  const enabled              = getSetting("email_digest_enabled") === "true";
  const sendUntil            = getSetting("email_digest_send_until") || null;
  const finalEditionOverride = getSetting("email_digest_final_edition_override") === "true";
  return NextResponse.json({ enabled, sendUntil, finalEditionOverride });
```

- [ ] **Step 3: Update the `Settings` interface in `app/digest/page.tsx`**

Change:
```ts
interface Settings {
  enabled: boolean;
  lastSentAt: string | null;
  sendUntil: string | null;
}
```
to:
```ts
interface Settings {
  enabled: boolean;
  lastSentAt: string | null;
  sendUntil: string | null;
  finalEditionOverride: boolean;
}
```

- [ ] **Step 4: Update the `useState` initial value in `app/digest/page.tsx`**

Change:
```ts
  const [settings, setSettings] = useState<Settings>({ enabled: false, lastSentAt: null, sendUntil: null });
```
to:
```ts
  const [settings, setSettings] = useState<Settings>({ enabled: false, lastSentAt: null, sendUntil: null, finalEditionOverride: false });
```

- [ ] **Step 5: Add `handleToggleFinalEdition` handler in `app/digest/page.tsx`**

Add this function after `handleSendUntilChange`:

```ts
  async function handleToggleFinalEdition() {
    const next = !settings.finalEditionOverride;
    setSettings((s) => ({ ...s, finalEditionOverride: next }));
    await fetch("/api/admin/digest/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ finalEditionOverride: next }),
    });
  }
```

- [ ] **Step 6: Add the "Send as Final Edition" checkbox to the Settings card in `app/digest/page.tsx`**

Insert after the closing `)}` of the `{settings.enabled && (...)}` block (i.e., after the send-until date picker section), before the `<div className="text-sm text-gray-500">Last sent:` div:

```tsx
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700">Send as Final Edition</p>
            <p className="text-xs text-gray-400">Override: send the next digest with the special Final Edition treatment</p>
          </div>
          <button
            onClick={handleToggleFinalEdition}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              settings.finalEditionOverride ? "bg-amber-500" : "bg-gray-300"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                settings.finalEditionOverride ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
        {settings.finalEditionOverride && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            ★ The next digest will be sent as the Final Edition. This override resets automatically after sending.
          </p>
        )}
```

- [ ] **Step 7: Verify TypeScript compiles**

```
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Manual UI verification**

With the dev server running (`npm run dev`):
1. Open `/digest` in the browser
2. Confirm the "Send as Final Edition" toggle appears in the Settings card
3. Toggle it on — confirm it turns amber and the notice appears
4. Toggle it off — confirm it returns to gray and notice disappears
5. Toggle it on again, then click "Send Now" — confirm the sent emails use the Final Edition subject line and HTML (check server logs for the subject line sent to each recipient)
6. After sending, reload the page — confirm the toggle is back to off (override reset)

- [ ] **Step 9: Commit**

```bash
git add app/api/admin/digest/settings/route.ts app/digest/page.tsx
git commit -m "feat: add Final Edition override toggle to digest settings"
```
