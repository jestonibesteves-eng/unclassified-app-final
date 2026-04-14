export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";
import { deleteBackup, getBackupPath } from "@/lib/backup";
import fs from "fs";

async function getAdmin(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const user = token ? await verifySessionToken(token) : null;
  if (!user || user.role !== "super_admin") return null;
  return user;
}

/** GET /api/admin/backup/[filename] — download a backup file */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  if (!(await getAdmin(req)))
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const { filename } = await params;
  try {
    const fullPath = getBackupPath(filename);
    const buffer = fs.readFileSync(fullPath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Backup not found." }, { status: 404 });
  }
}

/** DELETE /api/admin/backup/[filename] — delete a backup file */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  if (!(await getAdmin(req)))
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const { filename } = await params;
  try {
    deleteBackup(filename);
    return NextResponse.json({ deleted: filename });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Delete failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
