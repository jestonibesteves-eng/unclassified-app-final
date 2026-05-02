import { NextRequest, NextResponse } from "next/server";
import { rawDb } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";

function getSetting(key: string): string {
  const row = rawDb
    .prepare(`SELECT value FROM "Setting" WHERE key = ?`)
    .get(key) as { value: string } | undefined;
  return row?.value ?? "";
}

function setSetting(key: string, value: string): void {
  rawDb
    .prepare(`INSERT OR REPLACE INTO "Setting" (key, value) VALUES (?, ?)`)
    .run(key, value);
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const user  = token ? await verifySessionToken(token) : null;
  if (!user || user.role !== "super_admin")
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const enabled    = getSetting("email_digest_enabled") === "true";
  const lastSentAt = getSetting("email_digest_last_sent_at") || null;
  const sendUntil  = getSetting("email_digest_send_until") || null;

  return NextResponse.json({ enabled, lastSentAt, sendUntil });
}

export async function PUT(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const user  = token ? await verifySessionToken(token) : null;
  if (!user || user.role !== "super_admin")
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const body = await req.json() as { enabled?: boolean; sendUntil?: string | null };

  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean")
      return NextResponse.json({ error: "enabled must be a boolean." }, { status: 400 });
    setSetting("email_digest_enabled", body.enabled ? "true" : "false");
  }

  if ("sendUntil" in body) {
    setSetting("email_digest_send_until", body.sendUntil ?? "");
  }

  const enabled   = getSetting("email_digest_enabled") === "true";
  const sendUntil = getSetting("email_digest_send_until") || null;
  return NextResponse.json({ enabled, sendUntil });
}
