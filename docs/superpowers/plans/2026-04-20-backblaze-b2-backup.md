# Backblaze B2 Backup Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Google Drive backup integration with Backblaze B2, using the S3-compatible API.

**Architecture:** New `lib/backblaze.ts` module replaces `lib/google-drive.ts`. `lib/backup.ts` is updated to call the B2 uploader and use `.b2` sidecar files instead of `.gdrive`. All references to `driveUpload`/`driveFileId` are renamed to `b2Upload`/`b2FileKey` throughout the app.

**Tech Stack:** `@aws-sdk/client-s3` (S3-compatible B2 API), Next.js 16, TypeScript, Node.js `fs`.

---

## File Structure

| File | Change |
|------|--------|
| `lib/backblaze.ts` | New — B2 upload module, `B2UploadResult` type, `uploadBackupToB2()` |
| `lib/google-drive.ts` | Deleted |
| `lib/backup.ts` | Import B2 instead of Drive; rename all Drive→B2 types, helpers, fields |
| `instrumentation.node.ts` | Rename `driveUpload`→`b2Upload`, `driveFileId`→`b2FileKey`, update log strings |
| `app/api/admin/backup/route.ts` | Rename `driveUpload`→`b2Upload` |
| `app/admin/backup/page.tsx` | Rename all Drive→B2 references, column header "Drive"→"B2" |

---

### Task 1: Install package and create `lib/backblaze.ts`

**Files:**
- Create: `lib/backblaze.ts`

No test runner exists. Verification: `npx tsc --noEmit` exits 0.

- [ ] **Step 1: Install `@aws-sdk/client-s3`**

```bash
npm install @aws-sdk/client-s3
```

Expected: package added to `node_modules`, `package.json` updated.

- [ ] **Step 2: Create `lib/backblaze.ts`**

```typescript
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";

export type B2UploadResult =
  | { b2FileKey: string; uploadedAt: string }
  | { error: string; failedAt: string }
  | null; // null = B2 not configured (env vars absent)

/**
 * Uploads a backup file to Backblaze B2 via the S3-compatible API.
 * Returns null if B2_KEY_ID, B2_APP_KEY, B2_BUCKET_NAME, or B2_ENDPOINT
 * env vars are not set (B2 not configured).
 * Never throws — errors are returned as { error, failedAt }.
 *
 * Required env vars:
 *   B2_KEY_ID        — Application Key ID from the B2 console
 *   B2_APP_KEY       — Application Key secret
 *   B2_BUCKET_NAME   — Name of the target B2 bucket
 *   B2_ENDPOINT      — e.g. https://s3.us-west-004.backblazeb2.com
 */
export async function uploadBackupToB2(
  filePath: string,
  filename: string
): Promise<B2UploadResult> {
  const keyId    = process.env.B2_KEY_ID;
  const appKey   = process.env.B2_APP_KEY;
  const bucket   = process.env.B2_BUCKET_NAME;
  const endpoint = process.env.B2_ENDPOINT;

  if (!keyId || !appKey || !bucket || !endpoint) return null;

  try {
    const client = new S3Client({
      endpoint,
      region: "auto",
      credentials: {
        accessKeyId: keyId,
        secretAccessKey: appKey,
      },
    });

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: filename,
        Body: fs.createReadStream(filePath),
        ContentType: "application/octet-stream",
      })
    );

    return { b2FileKey: filename, uploadedAt: new Date().toISOString() };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { error, failedAt: new Date().toISOString() };
  }
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no output, exit code 0.

- [ ] **Step 4: Commit**

```bash
git add lib/backblaze.ts package.json package-lock.json
git commit -m "feat: add Backblaze B2 upload module with S3-compatible API"
```

---

### Task 2: Update `lib/backup.ts`

**Files:**
- Modify: `lib/backup.ts`

Replace all Drive references with B2 equivalents. The logic is identical — only names and sidecar extension change.

- [ ] **Step 1: Replace the entire contents of `lib/backup.ts`**

```typescript
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { uploadBackupToB2, type B2UploadResult } from "@/lib/backblaze";

function getDbPath(): string {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  const raw = url.replace(/^file:/, "");
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

function getBackupDir(): string {
  if (process.env.BACKUP_DIR) return process.env.BACKUP_DIR;
  return path.join(path.dirname(getDbPath()), "backups");
}

function ensureBackupDir(): void {
  const dir = getBackupDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export type BackupEntry = {
  filename: string;
  sizeBytes: number;
  createdAt: string;
  label: "auto" | "manual" | "unknown";
  b2Upload?: { b2FileKey: string; uploadedAt: string } | { error: string; failedAt: string };
};

function writeB2Sidecar(
  filename: string,
  result: { b2FileKey: string; uploadedAt: string } | { error: string; failedAt: string }
): void {
  try {
    const sidecarPath = path.join(getBackupDir(), `${filename}.b2`);
    fs.writeFileSync(sidecarPath, JSON.stringify(result));
  } catch (err) {
    console.warn("[backup] Failed to write B2 sidecar:", err);
  }
}

function readB2Sidecar(filename: string): BackupEntry["b2Upload"] {
  const sidecarPath = path.join(getBackupDir(), `${filename}.b2`);
  if (!fs.existsSync(sidecarPath)) return undefined;
  try {
    const parsed = JSON.parse(fs.readFileSync(sidecarPath, "utf-8"));
    if (parsed && typeof parsed === "object") {
      if ("b2FileKey" in parsed && "uploadedAt" in parsed)
        return parsed as { b2FileKey: string; uploadedAt: string };
      if ("error" in parsed && "failedAt" in parsed)
        return parsed as { error: string; failedAt: string };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export async function createBackup(label: "auto" | "manual" = "manual"): Promise<{
  filename: string;
  b2Upload: B2UploadResult;
}> {
  ensureBackupDir();
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
  const filename = `dev_${ts}_${label}.db`;
  const dest = path.join(getBackupDir(), filename);

  const db = new Database(getDbPath());
  try {
    await db.backup(dest);
  } finally {
    db.close();
  }

  const b2Upload = await uploadBackupToB2(dest, filename);
  if (b2Upload !== null) {
    writeB2Sidecar(filename, b2Upload);
  }

  return { filename, b2Upload };
}

export function listBackups(): BackupEntry[] {
  ensureBackupDir();
  return fs
    .readdirSync(getBackupDir())
    .filter((f) => f.endsWith(".db"))
    .map((filename) => {
      const fullPath = path.join(getBackupDir(), filename);
      const stat = fs.statSync(fullPath);
      const match = filename.match(/^dev_[\d\-_]+_(auto|manual)\.db$/);
      const label = (match?.[1] as "auto" | "manual") ?? "unknown";
      const entry: BackupEntry = {
        filename,
        sizeBytes: stat.size,
        createdAt: stat.mtime.toISOString(),
        label,
      };
      const b2Upload = readB2Sidecar(filename);
      if (b2Upload !== undefined) entry.b2Upload = b2Upload;
      return entry;
    })
    .sort((a, b) => b.filename.localeCompare(a.filename));
}

export function deleteBackup(filename: string): void {
  if (!/^[\w\-.]+\.db$/.test(filename)) throw new Error("Invalid filename.");
  const fullPath = path.join(getBackupDir(), filename);
  if (!fs.existsSync(fullPath)) throw new Error("Backup not found.");
  fs.unlinkSync(fullPath);
  const sidecarPath = path.join(getBackupDir(), `${filename}.b2`);
  if (fs.existsSync(sidecarPath)) fs.unlinkSync(sidecarPath);
}

export function getBackupPath(filename: string): string {
  if (!/^[\w\-.]+\.db$/.test(filename)) throw new Error("Invalid filename.");
  const fullPath = path.join(getBackupDir(), filename);
  if (!fs.existsSync(fullPath)) throw new Error("Backup not found.");
  return fullPath;
}

function getPendingDbPath(): string {
  return path.join(path.dirname(getDbPath()), "dev.db.pending-restore");
}

function getPendingMetaPath(): string {
  return path.join(path.dirname(getDbPath()), "dev.db.pending-restore-meta");
}

export type PendingRestore = { filename: string; stagedAt: string };

export function stagePendingRestore(filename: string): void {
  const src = getBackupPath(filename);
  fs.copyFileSync(src, getPendingDbPath());
  fs.writeFileSync(
    getPendingMetaPath(),
    JSON.stringify({ filename, stagedAt: new Date().toISOString() })
  );
}

export function cancelPendingRestore(): void {
  if (fs.existsSync(getPendingDbPath()))   fs.unlinkSync(getPendingDbPath());
  if (fs.existsSync(getPendingMetaPath())) fs.unlinkSync(getPendingMetaPath());
}

export function getPendingRestore(): PendingRestore | null {
  const metaPath = getPendingMetaPath();
  if (!fs.existsSync(metaPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaPath, "utf-8")) as PendingRestore;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add lib/backup.ts
git commit -m "feat: update backup.ts to use Backblaze B2 uploader and .b2 sidecars"
```

---

### Task 3: Update `instrumentation.node.ts`, `app/api/admin/backup/route.ts`, and delete `lib/google-drive.ts`

**Files:**
- Modify: `instrumentation.node.ts`
- Modify: `app/api/admin/backup/route.ts`
- Delete: `lib/google-drive.ts`

- [ ] **Step 1: Update `runBackup()` in `instrumentation.node.ts`**

Replace the existing `runBackup` function (the one with `driveUpload` references):

```typescript
  async function runBackup() {
    try {
      const { filename, b2Upload } = await createBackup("auto");
      console.log(`[backup] Daily backup created: ${filename}`);
      if (b2Upload !== null && b2Upload !== undefined) {
        if ("b2FileKey" in b2Upload) {
          console.log(`[backup] Uploaded to Backblaze B2: ${b2Upload.b2FileKey}`);
        } else {
          console.error(`[backup] Backblaze B2 upload failed: ${b2Upload.error}`);
        }
      }
    } catch (err) {
      console.error("[backup] Daily backup failed:", err);
    }
  }
```

- [ ] **Step 2: Update `app/api/admin/backup/route.ts`**

Replace the POST handler body:

```typescript
/** POST /api/admin/backup — create a manual backup */
export async function POST(req: NextRequest) {
  if (!(await getAdmin(req)))
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  try {
    const { filename, b2Upload } = await createBackup("manual");
    return NextResponse.json({ filename, b2Upload });
  } catch (err) {
    console.error("[backup] Manual backup failed:", err);
    return NextResponse.json({ error: "Backup failed." }, { status: 500 });
  }
}
```

- [ ] **Step 3: Delete `lib/google-drive.ts`**

```bash
git rm lib/google-drive.ts
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: no output, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add instrumentation.node.ts app/api/admin/backup/route.ts
git commit -m "feat: update instrumentation and backup route to use B2, remove google-drive module"
```

---

### Task 4: Update `app/admin/backup/page.tsx`

**Files:**
- Modify: `app/admin/backup/page.tsx`

Make six exact string replacements in order. Use the Edit tool for each.

- [ ] **Step 1: Replace `BackupEntry.driveUpload` field**

Find:
```typescript
  driveUpload?: { driveFileId: string; uploadedAt: string } | { error: string; failedAt: string };
```
Replace with:
```typescript
  b2Upload?: { b2FileKey: string; uploadedAt: string } | { error: string; failedAt: string };
```

- [ ] **Step 2: Replace `hasDriveColumn` useMemo**

Find:
```typescript
  const hasDriveColumn = useMemo(
    () => backups.some((b) => b.driveUpload !== undefined),
    [backups]
  );
```
Replace with:
```typescript
  const hasB2Column = useMemo(
    () => backups.some((b) => b.b2Upload !== undefined),
    [backups]
  );
```

- [ ] **Step 3: Replace all remaining `hasDriveColumn` with `hasB2Column` (use replace_all: true)**

Find: `hasDriveColumn`
Replace with: `hasB2Column`
(Covers the 4 remaining occurrences: `<th>` conditional, two `colSpan` ternaries, `<td>` conditional.)

- [ ] **Step 4: Replace column header text**

Find:
```tsx
                  <th className="px-4 py-2.5 font-semibold tracking-wide">Drive</th>
```
Replace with:
```tsx
                  <th className="px-4 py-2.5 font-semibold tracking-wide">B2</th>
```

- [ ] **Step 5: Replace `driveUpload` and `driveFileId` references in the status cell (use replace_all: true)**

First pass — find: `b.driveUpload` → replace with: `b.b2Upload`
Second pass — find: `"driveFileId" in b.b2Upload` → replace with: `"b2FileKey" in b.b2Upload`

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit
```

Expected: no output, exit code 0.

- [ ] **Step 7: Commit and push**

```bash
git add app/admin/backup/page.tsx
git commit -m "feat: rename Drive→B2 in backup UI column"
git push
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: no output, exit code 0.

- [ ] **Step 6: Commit and push**

```bash
git add app/admin/backup/page.tsx
git commit -m "feat: rename Drive→B2 in backup UI column"
git push
```

---

## Post-Deploy: Set env vars on Hostinger

After deploying, set these four env vars and remove the old Google Drive ones:

| Add | Remove |
|-----|--------|
| `B2_KEY_ID` | `GOOGLE_SERVICE_ACCOUNT_KEY` |
| `B2_APP_KEY` | `GOOGLE_DRIVE_BACKUP_FOLDER_ID` |
| `B2_BUCKET_NAME` | |
| `B2_ENDPOINT` | |

`B2_ENDPOINT` format: `https://s3.<region>.backblazeb2.com` — the region is shown in your B2 bucket settings under "Endpoint".

## Verification

1. Redeploy Hostinger
2. Go to `/admin/backup`
3. Click "Create Backup Now"
4. New backup row shows green **Uploaded** badge in the B2 column
