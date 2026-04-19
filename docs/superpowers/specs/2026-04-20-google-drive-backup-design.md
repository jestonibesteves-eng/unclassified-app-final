# Google Drive Backup Integration — Design Spec

**Date:** 2026-04-20
**Status:** Approved

## Overview

After every backup (auto and manual), upload the `.db` file to a configured Google Drive folder using a service account. Track upload success/failure in a `.gdrive` sidecar file next to each backup. Show Drive upload status in the Backup Management UI.

The feature is fully opt-in: if the required env vars are absent, no upload is attempted and the UI is unchanged.

---

## Architecture

### Files Changed

| File | Change |
|------|--------|
| `lib/google-drive.ts` *(new)* | Isolated upload module — auth, upload, result type |
| `lib/backup.ts` | Call upload after `db.backup()`, write/read sidecar, update types |
| `instrumentation.node.ts` | Call upload after auto-backup's inline `runBackup()` |
| `app/api/admin/backup/route.ts` | Return `driveUpload` in POST response |
| `app/admin/backup/page.tsx` | Drive status column in the backup table |

---

## Data Model

### `DriveUploadResult` (from `lib/google-drive.ts`)

```ts
type DriveUploadResult =
  | { driveFileId: string; uploadedAt: string }   // success
  | { error: string; failedAt: string }            // failure
  | null;                                          // Drive not configured
```

### Updated `BackupEntry` (in `lib/backup.ts`)

```ts
type BackupEntry = {
  filename: string;
  sizeBytes: number;
  createdAt: string;
  label: "auto" | "manual" | "unknown";
  driveUpload?: DriveUploadResult;  // undefined = no sidecar (Drive wasn't configured)
};
```

### Sidecar Files

Each backup may have a companion file: `<filename>.gdrive` (e.g., `dev_2026-04-20_02-00_auto.db.gdrive`).

Contents are the JSON-serialised `DriveUploadResult`. Written after every upload attempt. Deleted alongside the backup when the backup is deleted.

---

## `lib/google-drive.ts`

**Env vars:**
- `GOOGLE_SERVICE_ACCOUNT_KEY` — path to a service account JSON key file, **or** the JSON string itself (for hosts where injecting files is harder than env vars)
- `GOOGLE_DRIVE_BACKUP_FOLDER_ID` — ID of the target Drive folder (shared with the service account)

**Interface:**
```ts
export async function uploadBackupToDrive(
  filePath: string,
  filename: string
): Promise<DriveUploadResult>
```

- Uses `googleapis` npm package
- Uploads with `mimeType: 'application/octet-stream'`
- Returns `null` if env vars are not set (Drive not configured)
- Never throws — all errors are caught and returned as `{ error, failedAt }`

---

## `lib/backup.ts` Changes

### `createBackup()` return type

```ts
export async function createBackup(
  label: "auto" | "manual"
): Promise<{ filename: string; driveUpload: DriveUploadResult }>
```

### Flow

1. Create local `.db` file (existing logic)
2. Call `uploadBackupToDrive(dest, filename)`
3. Write `<filename>.gdrive` sidecar with result
4. Return `{ filename, driveUpload }`

### New helpers (internal)

```ts
function writeDriveSidecar(filename: string, result: DriveUploadResult): void
function readDriveSidecar(filename: string): DriveUploadResult
```

### `listBackups()` — reads sidecar for each backup, attaches `driveUpload`

### `deleteBackup()` — also deletes `.gdrive` sidecar if it exists

---

## `instrumentation.node.ts` Changes

The inline `runBackup()` function calls `uploadBackupToDrive()` after `db.backup()` and writes the sidecar. A Drive failure is logged but never prevents the local backup from completing.

---

## `app/api/admin/backup/route.ts` Changes

`POST` response updated:
```ts
{ filename: string; driveUpload: DriveUploadResult }
```

---

## UI (`app/admin/backup/page.tsx`)

### Drive column

Added between **Type** and **Actions**. Only rendered if at least one backup in the list has a non-undefined `driveUpload` field (i.e., Drive was configured at some point).

### States

| State | Display |
|-------|---------|
| Drive not configured (`null`) | — (gray dash) |
| Uploaded | Green Drive icon + "Uploaded" |
| Failed | Red "Failed" badge; hover tooltip shows error message |
| No sidecar (`undefined`) | — (gray dash) |

### Manual backup flow

After "Create Backup Now" succeeds, the returned `driveUpload` is reflected immediately in the newly fetched backup list — no extra polling needed.

---

## Environment Setup (operator instructions)

1. Create a Google Cloud project and enable the Drive API
2. Create a service account and download the JSON key
3. Share the target Drive folder with the service account email
4. Set env vars:
   ```
   GOOGLE_SERVICE_ACCOUNT_KEY=/path/to/key.json   # or paste JSON string
   GOOGLE_DRIVE_BACKUP_FOLDER_ID=<folder-id>
   ```

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| Drive env vars missing | Upload skipped, `null` returned, no sidecar written |
| Upload fails (network, auth) | Error caught, `{ error, failedAt }` sidecar written, local backup unaffected |
| Sidecar unreadable/corrupt | Treated as `undefined` (no status shown) |
| Auto-backup Drive failure | Logged to console, backup scheduler continues normally |

---

## Out of Scope

- Restoring directly from Google Drive (restore still uses local files only)
- Deleting Drive copies when local backups are deleted
- Listing or syncing existing backups retroactively
- OAuth user-login flow (service account only)
