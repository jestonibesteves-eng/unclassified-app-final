export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const Database = (await import("better-sqlite3")).default;
    const url = process.env.DATABASE_URL ?? "file:./dev.db";
    const dbPath = url.replace(/^file:/, "");
    try {
      const db = new Database(dbPath);
      db.pragma("journal_mode = WAL");
      db.close();
    } catch {
      // WAL mode may already be set; non-fatal.
    }
  }
}
