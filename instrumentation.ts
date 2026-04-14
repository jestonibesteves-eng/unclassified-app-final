export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const fs   = (await import("fs")).default;
    const path = (await import("path")).default;

    const url    = process.env.DATABASE_URL ?? "file:./dev.db";
    const raw    = url.replace(/^file:/, "");
    const dbPath = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
    const dbDir  = path.dirname(dbPath);

    // ── 1. Apply any staged restore BEFORE opening the database ──────────────
    // Pending-restore files live next to the database so they survive
    // redeployments and work whether the DB is inside or outside the app folder.
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

    // ── 2. Ensure WAL mode ────────────────────────────────────────────────────
    const Database = (await import("better-sqlite3")).default;
    try {
      const db = new Database(dbPath);
      db.pragma("journal_mode = WAL");
      db.close();
    } catch {
      // WAL mode may already be set; non-fatal.
    }

    // ── 3. Schedule daily auto-backup at 2:00 AM ─────────────────────────────
    scheduleDailyBackup();
  }
}

function scheduleDailyBackup() {
  function msUntilNextTwoAM(): number {
    const now  = new Date();
    const next = new Date(now);
    next.setHours(2, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next.getTime() - now.getTime();
  }

  async function runBackup() {
    try {
      const { createBackup } = await import("./lib/backup");
      const filename = await createBackup("auto");
      console.log(`[backup] Daily backup created: ${filename}`);
    } catch (err) {
      console.error("[backup] Daily backup failed:", err);
    }
  }

  const delay = msUntilNextTwoAM();
  const hh = Math.floor(delay / 3600000);
  const mm = Math.floor((delay % 3600000) / 60000);
  console.log(`[backup] First auto-backup scheduled in ${hh}h ${mm}m (at 2:00 AM)`);

  setTimeout(() => {
    runBackup();
    setInterval(runBackup, 24 * 60 * 60 * 1000);
  }, delay);
}
