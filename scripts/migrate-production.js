/**
 * Production Migration Script
 * Applies all schema changes safely to an existing database.
 * Safe to run multiple times — each step checks before applying.
 *
 * Usage:
 *   node scripts/migrate-production.js <path-to-db>
 *   node scripts/migrate-production.js ../databases/dev.db
 *
 * Or via DATABASE_URL env var (same format as the app):
 *   DATABASE_URL=file:../databases/dev.db node scripts/migrate-production.js
 */

const Database = require("better-sqlite3");
const path = require("path");

/* ── Resolve DB path ── */
let dbPath;
if (process.argv[2]) {
  dbPath = process.argv[2];
} else if (process.env.DATABASE_URL) {
  dbPath = process.env.DATABASE_URL.replace(/^file:/, "");
} else {
  console.error("ERROR: Provide the database path as an argument or set DATABASE_URL.");
  console.error("  Example: node scripts/migrate-production.js ../databases/dev.db");
  process.exit(1);
}

dbPath = path.resolve(dbPath);
console.log(`\nDatabase: ${dbPath}\n`);

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 10000");

/* ── Helpers ── */
function columns(table) {
  return db.prepare(`PRAGMA table_info("${table}")`).all().map((c) => c.name);
}

function hasColumn(table, col) {
  return columns(table).includes(col);
}

function step(label, fn) {
  process.stdout.write(`  ${label} ... `);
  try {
    const result = fn();
    console.log(result ?? "OK");
  } catch (err) {
    console.log(`FAILED\n    ${err.message}`);
    process.exit(1);
  }
}

/* ══════════════════════════════════════════════════════════════
   Migration 1 — Rename arb_no → arb_id  (20260409000000)
   ══════════════════════════════════════════════════════════════ */
console.log("Migration 1: Rename Arb.arb_no → arb_id");
step("Check / apply", () => {
  const cols = columns("Arb");
  if (cols.includes("arb_id")) return "already done — skipped";
  if (!cols.includes("arb_no")) return "arb_no not found — skipped";
  db.prepare(`ALTER TABLE "Arb" RENAME COLUMN "arb_no" TO "arb_id"`).run();
});

/* ══════════════════════════════════════════════════════════════
   Migration 2 — Add ARB distribution fields  (20260409100000)
   ══════════════════════════════════════════════════════════════ */
console.log("\nMigration 2: Add ARB distribution fields");
const arbFields = [
  ["allocated_condoned_amount", "TEXT"],
  ["eligibility",               "TEXT"],
  ["eligibility_reason",        "TEXT"],
  ["date_encoded",              "TEXT"],
  ["date_distributed",          "TEXT"],
];
for (const [col, type] of arbFields) {
  step(`Arb.${col}`, () => {
    if (hasColumn("Arb", col)) return "already exists — skipped";
    db.prepare(`ALTER TABLE "Arb" ADD COLUMN "${col}" ${type}`).run();
  });
}

/* ══════════════════════════════════════════════════════════════
   Migration 3 — Add confirmation flags  (20260410000000)
   ══════════════════════════════════════════════════════════════ */
console.log("\nMigration 3: Add confirmation flags");
const flagFields = [
  ["amendarea_validated_confirmed", "BOOLEAN NOT NULL DEFAULT 0"],
  ["condoned_amount_confirmed",     "BOOLEAN NOT NULL DEFAULT 0"],
];
for (const [col, def] of flagFields) {
  step(`Landholding.${col}`, () => {
    if (hasColumn("Landholding", col)) return "already exists — skipped";
    db.prepare(`ALTER TABLE "Landholding" ADD COLUMN "${col}" ${def}`).run();
  });
}

/* ══════════════════════════════════════════════════════════════
   Migration 4 — Add cloa_status  (20260410100000)
   ══════════════════════════════════════════════════════════════ */
console.log("\nMigration 4: Add cloa_status");
step("Landholding.cloa_status", () => {
  if (hasColumn("Landholding", "cloa_status")) return "already exists — skipped";
  db.prepare(`ALTER TABLE "Landholding" ADD COLUMN "cloa_status" TEXT`).run();
});

/* ══════════════════════════════════════════════════════════════
   Migration 5 — Add asp_status  (20260410110000)
   ══════════════════════════════════════════════════════════════ */
console.log("\nMigration 5: Add asp_status");
step("Landholding.asp_status", () => {
  if (hasColumn("Landholding", "asp_status")) return "already exists — skipped";
  db.prepare(`ALTER TABLE "Landholding" ADD COLUMN "asp_status" TEXT`).run();
});

/* ══════════════════════════════════════════════════════════════
   Migration 6 — Add non_eligibility_reason  (20260410120000)
   ══════════════════════════════════════════════════════════════ */
console.log("\nMigration 6: Add non_eligibility_reason");
step("Landholding.non_eligibility_reason", () => {
  if (hasColumn("Landholding", "non_eligibility_reason")) return "already exists — skipped";
  db.prepare(`ALTER TABLE "Landholding" ADD COLUMN "non_eligibility_reason" TEXT`).run();
});

/* ══════════════════════════════════════════════════════════════
   Migration 7 — Backfill amendarea_validated  (20260410130000)
   ══════════════════════════════════════════════════════════════ */
console.log("\nMigration 7: Backfill amendarea_validated from amendarea");
step("UPDATE Landholding", () => {
  const result = db
    .prepare(`UPDATE "Landholding" SET amendarea_validated = amendarea WHERE amendarea_validated IS NULL AND amendarea IS NOT NULL`)
    .run();
  return result.changes > 0 ? `${result.changes} rows updated` : "nothing to update — skipped";
});

/* ── Done ── */
db.close();
console.log("\nAll migrations complete.\n");
