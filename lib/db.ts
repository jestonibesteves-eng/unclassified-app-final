import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

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
