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

  // ── 5. Schedule weekly email digest (Monday 7:00 AM PHT) ─────────────────
  scheduleWeeklyDigest(dbPath);

  // ── 6. Schedule nightly status recompute at 1:00 AM ──────────────────────
  scheduleNightlyRecompute();
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

function scheduleWeeklyDigest(dbPath: string) {
  function msUntilNextMondayPht(): number {
    const phtOffset = 8 * 3_600_000;
    const nowPht    = new Date(Date.now() + phtOffset);
    const day       = nowPht.getUTCDay(); // 0=Sun, 1=Mon

    let daysToMon: number;
    if (day === 1) {
      // It's Monday — only skip to next week if 7:00 AM has already passed today
      const mon7am = new Date(nowPht);
      mon7am.setUTCHours(7, 0, 0, 0);
      daysToMon = nowPht.getTime() < mon7am.getTime() ? 0 : 7;
    } else {
      daysToMon = (8 - day) % 7 || 7;
    }

    const nextMon = new Date(nowPht);
    nextMon.setUTCDate(nowPht.getUTCDate() + daysToMon);
    nextMon.setUTCHours(7, 0, 0, 0); // 7:00 AM PHT (as fake-UTC)
    return nextMon.getTime() - phtOffset - Date.now();
  }

  function getRawSetting(key: string): string {
    try {
      const db  = new Database(dbPath);
      const row = db.prepare(`SELECT value FROM "Setting" WHERE key = ?`).get(key) as { value: string } | undefined;
      db.close();
      return row?.value ?? "";
    } catch {
      return "";
    }
  }

  function setRawSetting(key: string, value: string): void {
    try {
      const db = new Database(dbPath);
      db.prepare(`INSERT OR REPLACE INTO "Setting" (key, value) VALUES (?, ?)`).run(key, value);
      db.close();
    } catch (err) {
      console.error("[digest] Failed to write setting:", err);
    }
  }

  async function runDigest() {
    const enabled = getRawSetting("email_digest_enabled");
    if (enabled !== "true") {
      console.log("[digest] Auto-send is off — skipping scheduled digest.");
      return;
    }
    const sendUntil = getRawSetting("email_digest_send_until");
    if (sendUntil) {
      const phtNow = new Date(Date.now() + 8 * 3_600_000);
      const phtToday = phtNow.toISOString().slice(0, 10);
      if (phtToday > sendUntil) {
        console.log(`[digest] Past send-until date (${sendUntil}) — disabling auto-send.`);
        setRawSetting("email_digest_enabled", "false");
        return;
      }
    }
    try {
      const { sendWeeklyDigest, getWeekBounds } = await import("@/lib/digest");
      const { weekStart, weekEnd } = getWeekBounds();
      const result = await sendWeeklyDigest(weekStart, weekEnd);
      console.log(`[digest] Weekly digest sent: ${result.sent} sent, ${result.failed} failed.`);
      if (result.sent > 0) {
        setRawSetting("email_digest_last_sent_at", new Date().toISOString());
      }
    } catch (err) {
      console.error("[digest] Scheduled digest failed:", err);
    }
  }

  async function catchUpIfMissed() {
    const enabled = getRawSetting("email_digest_enabled");
    if (enabled !== "true") return;

    const lastSentAt = getRawSetting("email_digest_last_sent_at");

    const phtOffset = 8 * 3_600_000;
    const nowPht    = new Date(Date.now() + phtOffset);
    const day       = nowPht.getUTCDay();
    const daysBack  = day === 0 ? 6 : day - 1;
    const thisMon   = new Date(nowPht);
    thisMon.setUTCDate(nowPht.getUTCDate() - daysBack);
    thisMon.setUTCHours(7, 0, 0, 0);
    const lastMon8amUtc = new Date(thisMon.getTime() - phtOffset);

    if (Date.now() < lastMon8amUtc.getTime()) return;

    const lastSent = lastSentAt ? new Date(lastSentAt).getTime() : 0;
    if (lastSent < lastMon8amUtc.getTime()) {
      console.log("[digest] Catch-up: missed weekly digest — sending now.");
      await runDigest();
    }
  }

  catchUpIfMissed();

  const delay = msUntilNextMondayPht();
  const hh = Math.floor(delay / 3_600_000);
  const mm = Math.floor((delay % 3_600_000) / 60_000);
  console.log(`[digest] Next weekly digest scheduled in ${hh}h ${mm}m (Monday 7:00 AM PHT)`);

  setTimeout(() => {
    runDigest();
    setInterval(runDigest, 7 * 24 * 60 * 60 * 1000);
  }, delay);
}

function scheduleNightlyRecompute() {
  function msUntilNextOneAM(): number {
    const now  = new Date();
    const next = new Date(now);
    next.setHours(1, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next.getTime() - now.getTime();
  }

  async function runRecompute() {
    try {
      const { prisma, rawDb } = await import("@/lib/db");
      const { computeAndUpdateStatus } = await import("@/lib/computeStatus");
      const seqnos = await prisma.arb.findMany({
        distinct: ["seqno_darro"],
        select: { seqno_darro: true },
      });
      for (const { seqno_darro } of seqnos) {
        await computeAndUpdateStatus(seqno_darro);
      }
      rawDb.prepare(`INSERT OR REPLACE INTO "Setting" (key, value) VALUES ('recompute_last_ran_at', ?)`).run(new Date().toISOString());
      console.log(`[recompute] Nightly recompute done — ${seqnos.length} landholding(s) processed.`);
    } catch (err) {
      console.error("[recompute] Nightly recompute failed:", err);
    }
  }

  const delay = msUntilNextOneAM();
  const hh = Math.floor(delay / 3_600_000);
  const mm = Math.floor((delay % 3_600_000) / 60_000);
  console.log(`[recompute] Next nightly recompute scheduled in ${hh}h ${mm}m (at 1:00 AM)`);

  setTimeout(() => {
    runRecompute();
    setInterval(runRecompute, 24 * 60 * 60 * 1000);
  }, delay);
}
