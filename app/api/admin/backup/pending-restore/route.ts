import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";
import { cancelPendingRestore } from "@/lib/backup";

async function getAdmin(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const user = token ? await verifySessionToken(token) : null;
  if (!user || user.role !== "super_admin") return null;
  return user;
}

/** DELETE /api/admin/backup/pending-restore — cancel a staged restore */
export async function DELETE(req: NextRequest) {
  if (!(await getAdmin(req)))
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  try {
    cancelPendingRestore();
    return NextResponse.json({ cancelled: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Cancel failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
