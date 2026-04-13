import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import Database from "better-sqlite3";

type GlobalDb = { prisma: PrismaClient; rawDb: Database.Database };
const g = globalThis as unknown as GlobalDb;

function getDbUrl() {
  return process.env.DATABASE_URL ?? "file:./dev.db";
}

function createPrismaClient() {
  const adapter = new PrismaBetterSqlite3({ url: getDbUrl() });
  return new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);
}

function runMigrations(db: Database.Database) {
  try {
    const cols = db.prepare(`PRAGMA table_info("AuditLog")`).all() as Array<{ name: string }>;
    // Only attempt ALTER TABLE if the table exists and the column is missing
    if (cols.length > 0 && !cols.find((c) => c.name === "source")) {
      db.prepare(`ALTER TABLE "AuditLog" ADD COLUMN "source" TEXT`).run();
    }
  } catch {
    // Migration errors must not crash the server — column may already exist or table not ready yet
  }
}

function createRawDb() {
  const db = new Database(getDbUrl().replace(/^file:/, ""));
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
