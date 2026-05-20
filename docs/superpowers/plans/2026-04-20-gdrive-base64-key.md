# Google Drive Base64 Key Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken newline-fix regex in `lib/google-drive.ts` with base64 detection so Hostinger's env var mangling can no longer break JSON parsing.

**Architecture:** Single change to `lib/google-drive.ts`. The credential-loading block gains a three-way detection: raw JSON (starts with `{`) → use as-is; otherwise try base64 decode → if result starts with `{` use it; otherwise fall back to treating the value as a file path. The newline-fix regex is removed entirely.

**Tech Stack:** Node.js `Buffer` (built-in, no new dependencies), TypeScript, Next.js 16.

---

## File Structure

| File | Change |
|------|--------|
| `lib/google-drive.ts` | Replace `raw` assignment block (lines 31–46) with base64-aware detection |

---

### Task 1: Replace credential-parsing block with base64 detection

**Files:**
- Modify: `lib/google-drive.ts:31-46`

This project has no test runner. Verification is: `npx tsc --noEmit` passes, then a manual smoke test on Hostinger.

- [ ] **Step 1: Replace lines 31–46 in `lib/google-drive.ts`**

The existing block to remove:
```typescript
    try {
      let raw = keyRaw.trim().startsWith("{")
        ? keyRaw
        : fs.readFileSync(
            path.isAbsolute(keyRaw) ? keyRaw : path.resolve(process.cwd(), keyRaw),
            "utf-8"
          );
      // Some hosting panels convert \n escape sequences in env var values to actual
      // newlines, breaking JSON.parse. Fix by escaping literal newlines inside every
      // JSON string value (handles the PEM body AND the trailing \n after -----END-----).
      raw = raw.replace(/"(?:[^"\\]|\\.)*"/g, (match) =>
        match.replace(/\n/g, "\\n").replace(/\r/g, "\\r")
      );
      credentials = JSON.parse(raw);
    } catch {
      return { error: "Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY — check it is valid JSON.", failedAt: new Date().toISOString() };
    }
```

Replace with:
```typescript
    try {
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
    } catch {
      return { error: "Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY — must be raw JSON, base64-encoded JSON, or a file path.", failedAt: new Date().toISOString() };
    }
```

Also update the JSDoc comment at the top of `uploadBackupToDrive` (lines 16–18) to reflect the new accepted formats:
```typescript
 * GOOGLE_SERVICE_ACCOUNT_KEY accepts:
 *   - The raw JSON string of the service account key
 *   - The service account JSON base64-encoded (recommended for hosted environments)
 *   - An absolute or relative path to the service account JSON key file
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add lib/google-drive.ts
git commit -m "fix: accept base64-encoded service account key to bypass hosting panel env var mangling"
```

- [ ] **Step 4: Push**

```bash
git push
```

---

## Post-Deploy: Update env var on Hostinger

After deploying, the operator must re-encode the service account JSON and update the env var:

**Windows PowerShell** (run on the machine that has the `.json` key file):
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\service-account.json"))
```

**Mac / Linux:**
```bash
base64 -w0 service-account.json
```

Copy the output (a long string of letters/numbers/`+`/`/`/`=`, no spaces or newlines) and paste it as the new value of `GOOGLE_SERVICE_ACCOUNT_KEY` in Hostinger's env var panel. `GOOGLE_DRIVE_BACKUP_FOLDER_ID` is unchanged.

## Verification

1. Redeploy Hostinger with the new env var value
2. Go to `/admin/backup`
3. Click "Create Backup Now"
4. The new backup row should show a green **Uploaded** badge in the Drive column
