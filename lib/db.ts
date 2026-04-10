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

function createRawDb() {
  const db = new Database(getDbUrl().replace(/^file:/, ""));
  db.pragma("busy_timeout = 10000");
  return db;
}

export const prisma = g.prisma ?? createPrismaClient();
export const rawDb = g.rawDb ?? createRawDb();

if (process.env.NODE_ENV !== "production") {
  g.prisma = prisma;
  g.rawDb = rawDb;
}
