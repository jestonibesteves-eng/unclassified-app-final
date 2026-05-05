import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { uploadBackupToB2, type B2UploadResult } from "@/lib/backblaze";
import { SCHEMA_VERSION } from "@/lib/db";

// Resolved at call-time so env vars set after module load are respected.

/** Absolute path to the live database file. */
function getDbPath(): string {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  const raw = url.replace(/^file:/, "");
  // If relative, resolve against cwd (same behaviour as better-sqlite3).
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

/**
 * Where backups are stored.
 * Precedence: BACKUP_DIR env var → sibling "backups/" folder next to dev.db.
 * Using a sibling folder keeps backups near the database regardless of where
 * the Node.js app is deployed (e.g. Hostinger with DB outside the app folder).
 */
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
  schemaVersion?: number;
  b2Upload?: { b2FileKey: string; uploadedAt: string } | { error: string; failedAt: string };
};

function writeMetaSidecar(filename: string): void {
  try {
    const sidecarPath = path.join(getBackupDir(), `${filename}.meta`);
    fs.writeFileSync(sidecarPath, JSON.stringify({ schemaVersion: SCHEMA_VERSION }));
  } catch (err) {
    console.warn("[backup] Failed to write meta sidecar:", err);
  }
}

function readMetaSidecar(filename: string): number | undefined {
  const sidecarPath = path.join(getBackupDir(), `${filename}.meta`);
  if (!fs.existsSync(sidecarPath)) return undefined;
  try {
    const parsed = JSON.parse(fs.readFileSync(sidecarPath, "utf-8"));
    return typeof parsed?.schemaVersion === "number" ? parsed.schemaVersion : undefined;
  } catch {
    return undefined;
  }
}

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
  const phtOffset = 8 * 3_600_000;
  const nowPht = new Date(Date.now() + phtOffset);
  const pad = (n: number) => String(n).padStart(2, "0");
  const ts = `${nowPht.getUTCFullYear()}-${pad(nowPht.getUTCMonth() + 1)}-${pad(nowPht.getUTCDate())}_${pad(nowPht.getUTCHours())}-${pad(nowPht.getUTCMinutes())}`;
  const filename = `dev_${ts}_${label}.db`;
  const dest = path.join(getBackupDir(), filename);

  const db = new Database(getDbPath());
  try {
    await db.backup(dest);
  } finally {
    db.close();
  }

  writeMetaSidecar(filename);

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
        schemaVersion: readMetaSidecar(filename),
      };
      const b2Upload = readB2Sidecar(filename);
      if (b2Upload !== undefined) entry.b2Upload = b2Upload;
      return entry;
    })
    .sort((a, b) => b.filename.localeCompare(a.filename));
}

/** Deletes a backup file. Throws if filename is invalid or file not found. */
export function deleteBackup(filename: string): void {
  if (!/^[\w\-.]+\.db$/.test(filename)) throw new Error("Invalid filename.");
  const fullPath = path.join(getBackupDir(), filename);
  if (!fs.existsSync(fullPath)) throw new Error("Backup not found.");
  fs.unlinkSync(fullPath);
  const sidecarPath = path.join(getBackupDir(), `${filename}.b2`);
  if (fs.existsSync(sidecarPath)) fs.unlinkSync(sidecarPath);
}

/** Returns the absolute path to a backup file for streaming. */
export function getBackupPath(filename: string): string {
  if (!/^[\w\-.]+\.db$/.test(filename)) throw new Error("Invalid filename.");
  const fullPath = path.join(getBackupDir(), filename);
  if (!fs.existsSync(fullPath)) throw new Error("Backup not found.");
  return fullPath;
}

/* ─── Staged restore ─────────────────────────────────────────────────────────
   Pending-restore files are placed in the same directory as the live database
   so they survive app redeployments and are always findable on startup,
   regardless of where the DB lives relative to the Node.js app folder.
────────────────────────────────────────────────────────────────────────────── */

function getPendingDbPath(): string {
  return path.join(path.dirname(getDbPath()), "dev.db.pending-restore");
}

function getPendingMetaPath(): string {
  return path.join(path.dirname(getDbPath()), "dev.db.pending-restore-meta");
}

export type PendingRestore = { filename: string; stagedAt: string };

/** Copy a backup into the staging slot. Overwrites any existing staged restore. */
export function stagePendingRestore(filename: string): void {
  const src = getBackupPath(filename); // validates filename & existence
  fs.copyFileSync(src, getPendingDbPath());
  fs.writeFileSync(
    getPendingMetaPath(),
    JSON.stringify({ filename, stagedAt: new Date().toISOString() })
  );
}

/** Remove the staged restore (cancel). No-op if nothing is staged. */
export function cancelPendingRestore(): void {
  if (fs.existsSync(getPendingDbPath()))   fs.unlinkSync(getPendingDbPath());
  if (fs.existsSync(getPendingMetaPath())) fs.unlinkSync(getPendingMetaPath());
}

/** Returns metadata about the currently staged restore, or null. */
export function getPendingRestore(): PendingRestore | null {
  const metaPath = getPendingMetaPath();
  if (!fs.existsSync(metaPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaPath, "utf-8")) as PendingRestore;
  } catch {
    return null;
  }
}
