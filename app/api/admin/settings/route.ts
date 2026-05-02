import { NextRequest, NextResponse } from "next/server";
import { rawDb } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionUser = token ? await verifySessionToken(token) : null;
  if (!sessionUser || sessionUser.role !== "super_admin")
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const key = req.nextUrl.searchParams.get("key");
  if (!key) return NextResponse.json({ error: "Missing key." }, { status: 400 });

  const row = rawDb.prepare(`SELECT value FROM "Setting" WHERE key = ?`).get(key) as { value: string } | undefined;
  return NextResponse.json({ key, value: row?.value ?? "" });
}
