# Google Drive Backup Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After every backup (auto and manual), upload the `.db` file to a configured Google Drive folder and show upload status in the Backup Management UI.

**Architecture:** A new `lib/google-drive.ts` module handles all Drive auth and upload logic. `lib/backup.ts` calls it after every local backup and writes a `.gdrive` sidecar file recording success or failure. `instrumentation.node.ts` does the same for the nightly auto-backup. The UI renders a Drive status column when any sidecar is present.

**Tech Stack:** `googleapis` npm package (service account auth), Next.js 16 API routes, React 19, TypeScript, better-sqlite3.

---

### Task 1: Install googleapis

**Files:**
- Modify: `package.json` (via npm)

- [ ] **Step 1: Install the package**

```bash
npm install googleapis
```

- [ ] **Step 2: Verify it was added**

```bash
grep '"googleapis"' package.json
```

Expected output:
```
"googleapis": "^144.0.0",
```
(exact version may differ)

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install googleapis for Google Drive backup upload"
```

---

### Task 2: Create `lib/google-drive.ts`

**Files:**
- Create: `lib/google-drive.ts`

- [ ] **Step 1: Create the file**

```typescript
import { google } from "googleapis";
import fs from "fs";
import path from "path";

export type DriveUploadResult =
  | { driveFileId: string; uploadedAt: string }
  | { error: string; failedAt: string }
  | null; // null = Drive not configured (env vars absent)

/**
 * Uploads a backup file to Google Drive.
 * Returns null if GOOGLE_SERVICE_ACCOUNT_KEY or GOOGLE_DRIVE_BACKUP_FOLDER_ID
 * env vars are not set (Drive not configured).
 * Never throws — errors are returned as { error, failedAt }.
 *
 * GOOGLE_SERVICE_ACCOUNT_KEY accepts either:
 *   - An absolute or relative path to the service account JSON key file
 *   - The raw JSON string of the service account key
 */
export async function uploadBackupToDrive(
  filePath: string,
  filename: string
): Promise<DriveUploadResult> {
  const keyRaw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const folderId = process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID;

  if (!keyRaw || !folderId) return null;

  try {
    let credentials: object;
    if (keyRaw.trim().startsWith("{")) {
      credentials = JSON.parse(keyRaw);
    } else {
      const absPath = path.isAbsolute(keyRaw)
        ? keyRaw
        : path.resolve(process.cwd(), keyRaw);
      credentials = JSON.parse(fs.readFileSync(absPath, "utf-8"));
    }

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/drive.file"],
    });

    const drive = google.drive({ version: "v3", auth });

    const response = await drive.files.create({
      requestBody: {
        name: filename,
        parents: [folderId],
      },
      media: {
        mimeType: "application/octet-stream",
        body: fs.createReadStream(filePath),
      },
      fields: "id",
    });

    const driveFileId = response.data.id;
    if (!driveFileId) throw new Error("Drive did not return a file ID.");

    return { driveFileId, uploadedAt: new Date().toISOString() };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { error, failedAt: new Date().toISOString() };
  }
}
```

- [ ] **Step 2: Verify it returns null when env vars are absent**

```bash
npx tsx -e "
import('./lib/google-drive.js').then(m =>
  m.uploadBackupToDrive('/tmp/test.db', 'test.db').then(r => {
    console.log('result:', r);
    if (r !== null) { console.error('FAIL: expected null'); process.exit(1); }
    console.log('PASS');
  })
);
"
```

Expected output:
```
result: null
PASS
```

- [ ] **Step 3: Commit**

```bash
git add lib/google-drive.ts
git commit -m "feat: add Google Drive upload module"
```

---

### Task 3: Update `lib/backup.ts`

**Files:**
- Modify: `lib/backup.ts`

This task updates the `BackupEntry` type, adds sidecar helpers, and threads Drive upload through `createBackup()`, `listBackups()`, and `deleteBackup()`.

- [ ] **Step 1: Add the import and update `BackupEntry`**

At the top of `lib/backup.ts`, add the import after the existing imports:

```typescript
import { uploadBackupToDrive, type DriveUploadResult } from "@/lib/google-drive";
```

Replace the existing `BackupEntry` type:

```typescript
export type BackupEntry = {
  filename: string;
  sizeBytes: number;
  createdAt: string;
  label: "auto" | "manual" | "unknown";
  driveUpload?: { driveFileId: string; uploadedAt: string } | { error: string; failedAt: string };
};
```

- [ ] **Step 2: Add sidecar helpers after `ensureBackupDir()`**

Insert these two functions after the `ensureBackupDir()` function (around line 29):

```typescript
function writeDriveSidecar(
  filename: string,
  result: { driveFileId: string; uploadedAt: string } | { error: string; failedAt: string }
): void {
  const sidecarPath = path.join(getBackupDir(), `${filename}.gdrive`);
  fs.writeFileSync(sidecarPath, JSON.stringify(result));
}

function readDriveSidecar(
  filename: string
): BackupEntry["driveUpload"] {
  const sidecarPath = path.join(getBackupDir(), `${filename}.gdrive`);
  if (!fs.existsSync(sidecarPath)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(sidecarPath, "utf-8"));
  } catch {
    return undefined;
  }
}
```

- [ ] **Step 3: Update `createBackup()` to call Drive upload and write sidecar**

Replace the existing `createBackup()` function with:

```typescript
export async function createBackup(label: "auto" | "manual" = "manual"): Promise<{
  filename: string;
  driveUpload: DriveUploadResult;
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

  const driveUpload = await uploadBackupToDrive(dest, filename);
  if (driveUpload !== null) {
    writeDriveSidecar(filename, driveUpload);
  }

  return { filename, driveUpload };
}
```

- [ ] **Step 4: Update `listBackups()` to attach sidecar data**

Replace the existing `listBackups()` function with:

```typescript
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
      const driveUpload = readDriveSidecar(filename);
      if (driveUpload !== undefined) entry.driveUpload = driveUpload;
      return entry;
    })
    .sort((a, b) => b.filename.localeCompare(a.filename));
}
```

- [ ] **Step 5: Update `deleteBackup()` to remove sidecar**

Replace the existing `deleteBackup()` function with:

```typescript
export function deleteBackup(filename: string): void {
  if (!/^[\w\-.]+\.db$/.test(filename)) throw new Error("Invalid filename.");
  const fullPath = path.join(getBackupDir(), filename);
  if (!fs.existsSync(fullPath)) throw new Error("Backup not found.");
  fs.unlinkSync(fullPath);
  const sidecarPath = path.join(getBackupDir(), `${filename}.gdrive`);
  if (fs.existsSync(sidecarPath)) fs.unlinkSync(sidecarPath);
}
```

- [ ] **Step 6: Verify TypeScript compiles with no errors**

```bash
npx tsc --noEmit
```

Expected: no output (zero errors).

- [ ] **Step 7: Commit**

```bash
git add lib/backup.ts
git commit -m "feat: add Drive upload and sidecar tracking to backup module"
```

---

### Task 4: Update `instrumentation.node.ts`

**Files:**
- Modify: `instrumentation.node.ts`

The inline `runBackup()` function in this file duplicates backup logic independently of `lib/backup.ts`. Add Drive upload and sidecar write here too.

- [ ] **Step 1: Add the import at the top of `instrumentation.node.ts`**

After the existing imports (`fs`, `path`, `Database`), add:

```typescript
import { uploadBackupToDrive } from "@/lib/google-drive";
```

- [ ] **Step 2: Update `runBackup()` inside `scheduleDailyBackup()` to upload to Drive**

Replace the existing `runBackup()` function (lines 53–75) with:

```typescript
async function runBackup() {
  try {
    const backupDir = process.env.BACKUP_DIR || path.join(path.dirname(dbPath), "backups");
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const ts  = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
    const filename = `dev_${ts}_auto.db`;
    const dest = path.join(backupDir, filename);

    const db = new Database(dbPath);
    try {
      await db.backup(dest);
    } finally {
      db.close();
    }

    console.log(`[backup] Daily backup created: ${filename}`);

    const driveResult = await uploadBackupToDrive(dest, filename);
    if (driveResult === null) {
      // Drive not configured — nothing to do.
    } else if ("driveFileId" in driveResult) {
      const sidecarPath = path.join(backupDir, `${filename}.gdrive`);
      fs.writeFileSync(sidecarPath, JSON.stringify(driveResult));
      console.log(`[backup] Uploaded to Google Drive: ${driveResult.driveFileId}`);
    } else {
      const sidecarPath = path.join(backupDir, `${filename}.gdrive`);
      fs.writeFileSync(sidecarPath, JSON.stringify(driveResult));
      console.error(`[backup] Google Drive upload failed: ${driveResult.error}`);
    }
  } catch (err) {
    console.error("[backup] Daily backup failed:", err);
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles with no errors**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add instrumentation.node.ts
git commit -m "feat: add Drive upload to nightly auto-backup scheduler"
```

---

### Task 5: Update `app/api/admin/backup/route.ts`

**Files:**
- Modify: `app/api/admin/backup/route.ts`

The `POST` handler must return `driveUpload` in the response now that `createBackup()` returns it.

- [ ] **Step 1: Update the POST handler**

Replace the existing `POST` handler:

```typescript
/** POST /api/admin/backup — create a manual backup */
export async function POST(req: NextRequest) {
  if (!(await getAdmin(req)))
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  try {
    const { filename, driveUpload } = await createBackup("manual");
    return NextResponse.json({ filename, driveUpload });
  } catch (err) {
    console.error("[backup] Manual backup failed:", err);
    return NextResponse.json({ error: "Backup failed." }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/backup/route.ts
git commit -m "feat: return driveUpload status in backup POST response"
```

---

### Task 6: Update `app/admin/backup/page.tsx`

**Files:**
- Modify: `app/admin/backup/page.tsx`

Add a Drive status column to the backup table. The column only renders when at least one backup has a `driveUpload` field (i.e., Drive was configured at some point).

- [ ] **Step 1: Update the `BackupEntry` type in the file**

Replace the existing `BackupEntry` type at the top of the file (around line 9):

```typescript
type BackupEntry = {
  filename: string;
  sizeBytes: number;
  createdAt: string;
  label: "auto" | "manual" | "unknown";
  driveUpload?: { driveFileId: string; uploadedAt: string } | { error: string; failedAt: string };
};
```

- [ ] **Step 2: Add `hasDriveColumn` derived value inside `BackupPage`**

Add this line immediately after the `backups` state is defined (around line 116, after `const [backups, setBackups] = useState<BackupEntry[]>([])`):

```typescript
const hasDriveColumn = backups.some((b) => b.driveUpload !== undefined);
```

- [ ] **Step 3: Add the Drive column header**

In the `<thead>` section, add the Drive column header between the Type and Actions `<th>` elements:

```tsx
{hasDriveColumn && (
  <th className="px-4 py-2.5 font-semibold tracking-wide">Drive</th>
)}
```

The thead should now read: Filename · Created · Size · Type · **Drive** · Actions

- [ ] **Step 4: Add the Drive status cell to each table row**

Inside the `backups.map(...)` body, add the Drive cell between the Type `<td>` and the Actions `<td>`:

```tsx
{hasDriveColumn && (
  <td className="px-4 py-2.5 whitespace-nowrap">
    {b.driveUpload === undefined ? (
      <span className="text-gray-300 text-[11px]">—</span>
    ) : "driveFileId" in b.driveUpload ? (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-green-50 text-green-700">
        <svg width="10" height="10" viewBox="0 0 87.3 78" fill="none" aria-hidden="true">
          <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L27.5 53H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
          <path d="M43.65 25L29.9 0c-1.35.8-2.5 1.9-3.3 3.3L1.2 48.5c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" fill="#00ac47"/>
          <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75L86.1 57c.8-1.4 1.2-2.95 1.2-4.5H59.8L73.55 76.8z" fill="#ea4335"/>
          <path d="M43.65 25L57.4 0H29.9z" fill="#00832d"/>
          <path d="M59.8 53H87.3L73.55 28.15 59.8 53z" fill="#2684fc"/>
          <path d="M27.5 53L13.75 77.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2L59.8 53z" fill="#ffba00"/>
        </svg>
        Uploaded
      </span>
    ) : (
      <span
        className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-red-50 text-red-600 cursor-help"
        title={b.driveUpload.error}
      >
        Failed
      </span>
    )}
  </td>
)}
```

- [ ] **Step 5: Start the dev server and verify the UI**

```bash
npm run dev
```

Open `http://localhost:3000/admin/backup` in a browser.

Expected when Drive is not configured:
- No Drive column visible
- Table looks identical to before

Expected when Drive IS configured (set `GOOGLE_DRIVE_BACKUP_FOLDER_ID` and `GOOGLE_SERVICE_ACCOUNT_KEY` in `.env.local` and create a backup):
- Drive column appears between Type and Actions
- Newly created backup shows green "Uploaded" badge or red "Failed" badge

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add app/admin/backup/page.tsx
git commit -m "feat: show Google Drive upload status in backup management UI"
```

---

### Task 7: End-to-End Verification

This task verifies the full flow works with real Drive credentials. Skip this task if you don't have a service account available — the feature is gated behind env vars and the app works normally without them.

**Prerequisites:**
1. A Google Cloud project with the Drive API enabled
2. A service account JSON key file downloaded
3. A Google Drive folder shared with the service account email (give it Editor access)
4. The folder ID — extracted from the folder's URL: `https://drive.google.com/drive/folders/<FOLDER_ID>`

- [ ] **Step 1: Set env vars in `.env.local`**

```
GOOGLE_SERVICE_ACCOUNT_KEY=/absolute/path/to/service-account-key.json
GOOGLE_DRIVE_BACKUP_FOLDER_ID=your_folder_id_here
```

- [ ] **Step 2: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 3: Create a manual backup via the UI**

Open `http://localhost:3000/admin/backup`, click **Create Backup Now**.

Expected:
- Toast shows success
- New backup row appears in the table
- Drive column shows green "Uploaded" badge

- [ ] **Step 4: Verify the file in Google Drive**

Open the shared Google Drive folder. Expected: a file named `dev_YYYY-MM-DD_HH-MM_manual.db` appears.

- [ ] **Step 5: Verify the sidecar file was written**

```bash
ls backups/*.gdrive
cat backups/dev_*_manual.db.gdrive
```

Expected output (example):
```json
{"driveFileId":"1AbCdEfGhIjKlMnOpQrStUv","uploadedAt":"2026-04-20T10:00:00.000Z"}
```

- [ ] **Step 6: Verify delete also removes the sidecar**

Delete the backup via the UI. Then:

```bash
ls backups/*.gdrive
```

Expected: the corresponding `.gdrive` file is gone.

- [ ] **Step 7: Test failure path (optional)**

Set `GOOGLE_DRIVE_BACKUP_FOLDER_ID` to a fake value (e.g., `invalid_folder_id`) and create a backup.

Expected:
- Backup still created locally
- Drive column shows red "Failed" badge
- Hovering over the badge shows the error message
- A `.gdrive` sidecar file exists containing `{ "error": "...", "failedAt": "..." }`

---

## Environment Variable Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Yes (for Drive) | Path to service account JSON key file, OR the raw JSON string |
| `GOOGLE_DRIVE_BACKUP_FOLDER_ID` | Yes (for Drive) | ID of the Google Drive folder to upload backups into |

Both must be set for Drive upload to activate. If either is absent, the feature is silently disabled and the app behaves exactly as before.
