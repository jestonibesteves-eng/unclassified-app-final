import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

// ── Schema version registry ───────────────────────────────────────────────────
// Increment SCHEMA_VERSION and add an entry to SCHEMA_HISTORY each time a
// structural migration is added to runMigrations().
export const SCHEMA_VERSION = 5;
export const SCHEMA_HISTORY: { version: number; description: string }[] = [
  { version: 1, description: "AuditLog — added source column" },
  { version: 2, description: "Setting table" },
  { version: 3, description: "CommitmentTarget table" },
  { version: 4, description: "DigestRecipient table and email digest settings" },
  { version: 5, description: "recompute_last_ran_at setting" },
];

type GlobalDb = { prisma: PrismaClient; rawDb: Database.Database };
const g = globalThis as unknown as GlobalDb;

// During `next build`, Next.js evaluates module-level code to collect page
// data, but never actually invokes API route handlers. Skipping DB
// initialisation avoids EACCES errors when the DB directory is outside the
// build sandbox (e.g. Hostinger with an external DATABASE_URL path).
const IS_BUILD = process.env.NEXT_PHASE === "phase-production-build";

function getDbUrl() {
  return process.env.DATABASE_URL ?? "file:./dev.db";
}

function createPrismaClient() {
  if (IS_BUILD) return null as unknown as PrismaClient;
  const adapter = new PrismaBetterSqlite3({ url: getDbUrl() });
  return new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);
}

function runMigrations(db: Database.Database) {
  try {
    const cols = db.prepare(`PRAGMA table_info("AuditLog")`).all() as Array<{ name: string }>;
    if (cols.length > 0 && !cols.find((c) => c.name === "source")) {
      db.prepare(`ALTER TABLE "AuditLog" ADD COLUMN "source" TEXT`).run();
    }
  } catch {
    // Migration errors must not crash the server — column may already exist or table not ready yet
  }
  try {
    db.prepare(`CREATE TABLE IF NOT EXISTS "Setting" ("key" TEXT NOT NULL PRIMARY KEY, "value" TEXT NOT NULL)`).run();
  } catch {
    // Table already exists or DB not ready
  }
  try {
    db.prepare(`CREATE TABLE IF NOT EXISTS "CommitmentTarget" (
      "id"          INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "region"      TEXT NOT NULL,
      "province"    TEXT,
      "committed"   INTEGER NOT NULL DEFAULT 0,
      "target_date" TEXT NOT NULL DEFAULT '2026-06-15'
    )`).run();
  } catch {
    // Table already exists or DB not ready
  }
  try {
    db.prepare(`CREATE TABLE IF NOT EXISTS "DigestRecipient" (
      "id"         INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "name"       TEXT NOT NULL,
      "nickname"   TEXT,
      "email"      TEXT NOT NULL UNIQUE,
      "role"       TEXT NOT NULL,
      "level"      TEXT NOT NULL,
      "province"   TEXT,
      "active"     INTEGER NOT NULL DEFAULT 1,
      "created_at" TEXT NOT NULL DEFAULT (datetime('now'))
    )`).run();
    db.prepare(`INSERT OR IGNORE INTO "Setting" (key, value) VALUES ('email_digest_enabled', 'false')`).run();
    db.prepare(`INSERT OR IGNORE INTO "Setting" (key, value) VALUES ('email_digest_last_sent_at', '')`).run();
    db.prepare(`INSERT OR IGNORE INTO "Setting" (key, value) VALUES ('email_digest_send_until', '')`).run();
    db.prepare(`INSERT OR IGNORE INTO "Setting" (key, value) VALUES ('recompute_last_ran_at', '')`).run();
  } catch {
    // Table already exists or DB not ready
  }
}

function createRawDb() {
  if (IS_BUILD) return null as unknown as Database.Database;
  const raw    = getDbUrl().replace(/^file:/, "");
  const dbPath = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
  const dbDir  = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 10000");
  runMigrations(db);
  return db;
}

export const prisma = g.prisma ?? createPrismaClient();
export const rawDb = g.rawDb ?? createRawDb();

if (process.env.NODE_ENV !== "production") {
  g.prisma = prisma;
  g.rawDb = rawDb;
}
