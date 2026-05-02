import { NextRequest, NextResponse } from "next/server";
import { rawDb } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";
import { sendWeeklyDigest, getWeekBounds } from "@/lib/digest";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const user  = token ? await verifySessionToken(token) : null;
  if (!user || user.role !== "super_admin")
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const { weekStart, weekEnd } = getWeekBounds();
  const result = await sendWeeklyDigest(weekStart, weekEnd);

  if (result.sent > 0) {
    rawDb
      .prepare(`INSERT OR REPLACE INTO "Setting" (key, value) VALUES ('email_digest_last_sent_at', ?)`)
      .run(new Date().toISOString());
  }

  return NextResponse.json(result);
}
