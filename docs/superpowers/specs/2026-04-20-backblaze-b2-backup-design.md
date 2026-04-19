# Backblaze B2 Backup Integration — Design Spec

**Date:** 2026-04-20
**Status:** Approved

## Overview

Replace the Google Drive backup integration (blocked by service account quota restrictions on personal Gmail accounts) with Backblaze B2. After every backup (auto and manual), upload the `.db` file to a configured B2 bucket using the S3-compatible API. Track upload success/failure in a `.b2` sidecar file next to each backup. Show B2 upload status in the Backup Management UI.

The feature is fully opt-in: if the required env vars are absent, no upload is attempted and the UI is unchanged.

---

## Architecture

### Files Changed

| File | Change |
|------|--------|
| `lib/backblaze.ts` *(new)* | B2 upload module — S3 client, upload, result type |
| `lib/google-drive.ts` | Deleted |
| `lib/backup.ts` | Swap all Drive references to B2: imports, types, sidecar helpers, field names |
| `instrumentation.node.ts` | Update log messages from Drive → B2 |
| `app/api/admin/backup/route.ts` | Return `b2Upload` instead of `driveUpload` |
| `app/admin/backup/page.tsx` | Column "Drive" → "B2", field `driveUpload` → `b2Upload`, type `driveFileId` → `b2FileKey` |

---

## Data Model

### `B2UploadResult` (from `lib/backblaze.ts`)

```typescript
export type B2UploadResult =
  | { b2FileKey: string; uploadedAt: string }  // success
  | { error: string; failedAt: string }         // failure
  | null;                                       // B2 not configured (env vars absent)
```

### Updated `BackupEntry` (in `lib/backup.ts`)

```typescript
type BackupEntry = {
  filename: string;
  sizeBytes: number;
  createdAt: string;
  label: "auto" | "manual" | "unknown";
  b2Upload?: { b2FileKey: string; uploadedAt: string } | { error: string; failedAt: string };
};
```

### Sidecar Files

Each backup may have a companion file: `<filename>.b2` (e.g., `dev_2026-04-20_02-00_auto.db.b2`).

Contents are the JSON-serialised `B2UploadResult`. Written after every upload attempt. Deleted alongside the backup when the backup is deleted.

Old `.gdrive` sidecar files are ignored — those backups will show "—" in the UI.

---

## `lib/backblaze.ts`

### Env Vars

| Var | Description |
|-----|-------------|
| `B2_KEY_ID` | Application Key ID from the B2 console |
| `B2_APP_KEY` | Application Key secret |
| `B2_BUCKET_NAME` | Name of the target B2 bucket |
| `B2_ENDPOINT` | S3-compatible endpoint, e.g. `https://s3.us-west-004.backblazeb2.com` |

Returns `null` if any of these are absent (B2 not configured).

### Interface

```typescript
export async function uploadBackupToB2(
  filePath: string,
  filename: string
): Promise<B2UploadResult>
```

### Implementation

Uses `@aws-sdk/client-s3` pointed at B2's S3-compatible endpoint:

```typescript
const client = new S3Client({
  endpoint: process.env.B2_ENDPOINT,
  region: "auto",
  credentials: {
    accessKeyId: process.env.B2_KEY_ID!,
    secretAccessKey: process.env.B2_APP_KEY!,
  },
});

await client.send(new PutObjectCommand({
  Bucket: process.env.B2_BUCKET_NAME!,
  Key: filename,
  Body: fs.createReadStream(filePath),
  ContentType: "application/octet-stream",
}));

return { b2FileKey: filename, uploadedAt: new Date().toISOString() };
```

- Never throws — all errors caught and returned as `{ error, failedAt }`

---

## `lib/backup.ts` Changes

- Remove `google-drive` import, add `backblaze` import
- Rename `DriveUploadResult` → `B2UploadResult` throughout
- Rename `driveUpload` field → `b2Upload` in `BackupEntry`
- Rename `writeDriveSidecar` → `writeB2Sidecar`, writes `.b2` files
- Rename `readDriveSidecar` → `readB2Sidecar`, reads `.b2` files
- `deleteBackup` deletes `.b2` sidecar (not `.gdrive`)
- `createBackup` returns `{ filename, b2Upload: B2UploadResult }`

---

## `instrumentation.node.ts` Changes

Update log messages:
- `"Uploaded to Google Drive"` → `"Uploaded to Backblaze B2"`
- `"Google Drive upload failed"` → `"Backblaze B2 upload failed"`

---

## `app/api/admin/backup/route.ts` Changes

POST response updated:
```typescript
const { filename, b2Upload } = await createBackup("manual");
return NextResponse.json({ filename, b2Upload });
```

---

## UI (`app/admin/backup/page.tsx`)

### Changes

- `BackupEntry` type: `b2Upload?` replacing `driveUpload?`
- `hasB2Column` replacing `hasDriveColumn`
- Column header: "B2" (was "Drive")
- Success badge: `"b2FileKey" in b.b2Upload` check (was `"driveFileId"`)
- Success badge label: "Uploaded" (unchanged)
- Failed badge: unchanged
- `colSpan` logic unchanged (still 6 cols when B2 column shown, 5 when not)

---

## npm

Install `@aws-sdk/client-s3`:
```bash
npm install @aws-sdk/client-s3
```

---

## Operator Setup

1. Go to [backblaze.com](https://www.backblaze.com), create a free account
2. Create a bucket (set to **Private**)
3. Go to **App Keys** → create an Application Key with **Read and Write** access to that bucket
4. Note the **keyID**, **applicationKey**, **bucket name**, and **endpoint** (shown in bucket settings as "Endpoint")
5. Set env vars in Hostinger:
   ```
   B2_KEY_ID=<keyID>
   B2_APP_KEY=<applicationKey>
   B2_BUCKET_NAME=<bucket name>
   B2_ENDPOINT=https://s3.<region>.backblazeb2.com
   ```
6. Remove old Google Drive env vars: `GOOGLE_SERVICE_ACCOUNT_KEY`, `GOOGLE_DRIVE_BACKUP_FOLDER_ID`

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| B2 env vars missing | Upload skipped, `null` returned, no sidecar written |
| Upload fails (network, auth, bucket) | Error caught, `{ error, failedAt }` sidecar written, local backup unaffected |
| Sidecar unreadable/corrupt | Treated as `undefined` (no status shown) |
| Auto-backup B2 failure | Logged to console, scheduler continues normally |

---

## Out of Scope

- Restoring directly from B2 (restore still uses local files only)
- Deleting B2 copies when local backups are deleted
- Listing or syncing existing backups retroactively
