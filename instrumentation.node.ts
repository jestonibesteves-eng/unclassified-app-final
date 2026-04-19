import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { createBackup } from "@/lib/backup";

export function registerNode() {
  const url    = process.env.DATABASE_URL ?? "file:./dev.db";
  const raw    = url.replace(/^file:/, "");
  const dbPath = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
  const dbDir  = path.dirname(dbPath);

  // ── 1. Ensure the database directory exists ───────────────────────────────
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    console.log(`[startup] Created database directory: ${dbDir}`);
  }

  // ── 2. Apply any staged restore BEFORE opening the database ──────────────
  const pendingDb   = path.join(dbDir, "dev.db.pending-restore");
  const pendingMeta = path.join(dbDir, "dev.db.pending-restore-meta");
  if (fs.existsSync(pendingDb)) {
    try {
      fs.copyFileSync(pendingDb, dbPath);
      fs.unlinkSync(pendingDb);
      if (fs.existsSync(pendingMeta)) fs.unlinkSync(pendingMeta);
      console.log("[restore] Pending restore applied — database replaced successfully.");
    } catch (err) {
      console.error("[restore] Failed to apply pending restore:", err);
    }
  }

  // ── 3. Ensure WAL mode ────────────────────────────────────────────────────
  try {
    const db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.close();
  } catch {
    // WAL mode may already be set; non-fatal.
  }

  // ── 4. Catch up on any missed auto-backup, then schedule daily at 2:00 AM ─
  scheduleDailyBackup(dbPath);
}

function scheduleDailyBackup(dbPath: string) {
  function msUntilNextTwoAM(): number {
    const now  = new Date();
    const next = new Date(now);
    next.setHours(2, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next.getTime() - now.getTime();
  }

  async function runBackup() {
    try {
      const { filename, driveUpload } = await createBackup("auto");
      console.log(`[backup] Daily backup created: ${filename}`);
      if (driveUpload !== null && driveUpload !== undefined) {
        if ("driveFileId" in driveUpload) {
          console.log(`[backup] Uploaded to Google Drive: ${driveUpload.driveFileId}`);
        } else {
          console.error(`[backup] Google Drive upload failed: ${driveUpload.error}`);
        }
      }
    } catch (err) {
      console.error("[backup] Daily backup failed:", err);
    }
  }

  // ── Missed-backup catch-up ──────────────────────────────────────────────────
  // If the server restarted after 2:00 AM and no auto backup exists for today,
  // run one immediately so a restart never silently skips a day's backup.
  async function catchUpIfMissed() {
    try {
      const now = new Date();
      // Only catch up if it's already past 2:00 AM today
      if (now.getHours() < 2) return;

      const backupDir = process.env.BACKUP_DIR || path.join(path.dirname(dbPath), "backups");
      if (!fs.existsSync(backupDir)) return; // no backup dir yet — nothing to catch up

      const pad = (n: number) => String(n).padStart(2, "0");
      const todayPrefix = `dev_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_`;

      const hasTodayBackup = fs.readdirSync(backupDir).some(
        (f) => f.startsWith(todayPrefix) && f.endsWith("_auto.db")
      );

      if (!hasTodayBackup) {
        console.log("[backup] No auto-backup found for today — running catch-up backup now.");
        await runBackup();
      }
    } catch (err) {
      console.error("[backup] Catch-up check failed:", err);
    }
  }

  catchUpIfMissed();

  const delay = msUntilNextTwoAM();
  const hh = Math.floor(delay / 3600000);
  const mm = Math.floor((delay % 3600000) / 60000);
  console.log(`[backup] Next auto-backup scheduled in ${hh}h ${mm}m (at 2:00 AM)`);

  setTimeout(() => {
    runBackup();
    setInterval(runBackup, 24 * 60 * 60 * 1000);
  }, delay);
}
