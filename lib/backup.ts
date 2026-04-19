import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { uploadBackupToDrive, type DriveUploadResult } from "@/lib/google-drive";

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
  driveUpload?: { driveFileId: string; uploadedAt: string } | { error: string; failedAt: string };
};

function writeDriveSidecar(
  filename: string,
  result: { driveFileId: string; uploadedAt: string } | { error: string; failedAt: string }
): void {
  try {
    const sidecarPath = path.join(getBackupDir(), `${filename}.gdrive`);
    fs.writeFileSync(sidecarPath, JSON.stringify(result));
  } catch (err) {
    console.warn("[backup] Failed to write Drive sidecar:", err);
  }
}

function readDriveSidecar(
  filename: string
): BackupEntry["driveUpload"] {
  const sidecarPath = path.join(getBackupDir(), `${filename}.gdrive`);
  if (!fs.existsSync(sidecarPath)) return undefined;
  try {
    const parsed = JSON.parse(fs.readFileSync(sidecarPath, "utf-8"));
    if (parsed && typeof parsed === "object") {
      if ("driveFileId" in parsed && "uploadedAt" in parsed) return parsed as { driveFileId: string; uploadedAt: string };
      if ("error" in parsed && "failedAt" in parsed) return parsed as { error: string; failedAt: string };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

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

/** Deletes a backup file. Throws if filename is invalid or file not found. */
export function deleteBackup(filename: string): void {
  if (!/^[\w\-.]+\.db$/.test(filename)) throw new Error("Invalid filename.");
  const fullPath = path.join(getBackupDir(), filename);
  if (!fs.existsSync(fullPath)) throw new Error("Backup not found.");
  fs.unlinkSync(fullPath);
  const sidecarPath = path.join(getBackupDir(), `${filename}.gdrive`);
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
