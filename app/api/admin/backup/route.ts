export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";
import { createBackup, listBackups, getPendingRestore } from "@/lib/backup";
import { SCHEMA_VERSION, SCHEMA_HISTORY } from "@/lib/db";

async function getAdmin(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const user = token ? await verifySessionToken(token) : null;
  if (!user || user.role !== "super_admin") return null;
  return user;
}

/** GET /api/admin/backup — list all backups */
export async function GET(req: NextRequest) {
  if (!(await getAdmin(req)))
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const backups = listBackups();
  const pendingRestore = getPendingRestore();
  return NextResponse.json({ backups, pendingRestore, currentSchemaVersion: SCHEMA_VERSION, schemaHistory: SCHEMA_HISTORY });
}

/** POST /api/admin/backup — create a manual backup */
export async function POST(req: NextRequest) {
  if (!(await getAdmin(req)))
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  try {
    const { filename, b2Upload } = await createBackup("manual");
    return NextResponse.json({ filename, b2Upload });
  } catch (err) {
    console.error("[backup] Manual backup failed:", err);
    return NextResponse.json({ error: "Backup failed." }, { status: 500 });
  }
}
