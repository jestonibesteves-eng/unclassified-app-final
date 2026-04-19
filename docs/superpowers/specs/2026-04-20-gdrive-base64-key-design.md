# Google Drive Service Account Key — Base64 Encoding Fix

**Date:** 2026-04-20
**Status:** Approved

## Problem

`GOOGLE_SERVICE_ACCOUNT_KEY` is stored as raw JSON in Hostinger's env var panel. The service account JSON contains a PEM private key with `\n` escape sequences. Hostinger's panel (or its underlying `.env` file generation) transforms these sequences in ways we cannot reliably predict or fix after the fact. Two regex-based approaches to re-escape the value at parse time both failed in production.

## Solution

Accept the service account JSON as a **base64-encoded string** in the env var. Base64 uses only `A-Za-z0-9+/=` — no quotes, no backslashes, no newlines — so there is nothing for the hosting panel to mangle.

## Scope

Single file change: `lib/google-drive.ts`.

No other files change. The existing `BackupEntry` type, sidecar format, UI, and API routes are unaffected.

## Detection Logic

The env var value is interpreted in this priority order:

| Condition | Action |
|-----------|--------|
| Starts with `{` | Raw JSON (used as-is — local dev path) |
| Base64-decodes to a string starting with `{` | Use the decoded JSON |
| Neither of the above | Treat as a file path and read the file |

The newline-fix regex introduced in the previous fix is removed — it is no longer needed since base64-encoded values contain no special characters.

## `lib/google-drive.ts` — Parsing Block

Replace the existing `raw` assignment and newline-fix regex with:

```typescript
const trimmed = keyRaw.trim();
let raw: string;
if (trimmed.startsWith("{")) {
  raw = trimmed;
} else {
  let decoded: string | null = null;
  try {
    const candidate = Buffer.from(trimmed, "base64").toString("utf-8");
    if (candidate.trim().startsWith("{")) decoded = candidate;
  } catch { }

  if (decoded) {
    raw = decoded;
  } else {
    raw = fs.readFileSync(
      path.isAbsolute(trimmed) ? trimmed : path.resolve(process.cwd(), trimmed),
      "utf-8"
    );
  }
}
credentials = JSON.parse(raw);
```

## Operator Setup (One-Time)

After deploying the code change, update `GOOGLE_SERVICE_ACCOUNT_KEY` in Hostinger:

**Windows PowerShell:**
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\service-account.json"))
```

**Mac / Linux:**
```bash
base64 -w0 service-account.json
```

Paste the resulting string (no line breaks) as the new value of `GOOGLE_SERVICE_ACCOUNT_KEY`. The folder ID env var (`GOOGLE_DRIVE_BACKUP_FOLDER_ID`) is unchanged.

## Backward Compatibility

- Raw JSON strings (starting with `{`) still work — local dev is unaffected.
- File paths still work as a final fallback.
- No changes to sidecar files, backup logic, or the UI.

## Out of Scope

- Changes to `GOOGLE_DRIVE_BACKUP_FOLDER_ID` handling.
- Any UI changes.
- Retry logic for failed Drive uploads.
