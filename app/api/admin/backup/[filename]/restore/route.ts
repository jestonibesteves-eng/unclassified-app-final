export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";
import { stagePendingRestore } from "@/lib/backup";

async function getAdmin(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const user = token ? await verifySessionToken(token) : null;
  if (!user || user.role !== "super_admin") return null;
  return user;
}

/** POST /api/admin/backup/[filename]/restore — stage a restore */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  if (!(await getAdmin(req)))
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const { filename } = await params;
  try {
    stagePendingRestore(filename);
    return NextResponse.json({ staged: filename });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Stage failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
