import { NextRequest, NextResponse } from "next/server";
import { rawDb } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";
import type { DigestRecipient } from "@/lib/digest";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const user  = token ? await verifySessionToken(token) : null;
  if (!user || user.role !== "super_admin")
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const rows = rawDb
    .prepare(`SELECT * FROM "DigestRecipient" ORDER BY level, province, name`)
    .all() as DigestRecipient[];

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const user  = token ? await verifySessionToken(token) : null;
  if (!user || user.role !== "super_admin")
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const body = await req.json() as {
    name: string; nickname?: string; email: string; role: string; level: string; province?: string;
  };

  const { name, nickname, email, role, level, province } = body;

  if (!name?.trim() || !email?.trim() || !role?.trim())
    return NextResponse.json({ error: "name, email, and role are required." }, { status: 400 });
  if (!["regional", "provincial"].includes(level))
    return NextResponse.json({ error: "level must be 'regional' or 'provincial'." }, { status: 400 });
  if (level === "provincial" && !province?.trim())
    return NextResponse.json({ error: "province is required for provincial recipients." }, { status: 400 });

  try {
    const unsubscribe_token = crypto.randomUUID();
    const result = rawDb
      .prepare(`INSERT INTO "DigestRecipient" (name, nickname, email, role, level, province, unsubscribe_token) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(name.trim(), nickname?.trim() || null, email.trim().toLowerCase(), role.trim(), level, province?.trim() ?? null, unsubscribe_token);

    const row = rawDb
      .prepare(`SELECT * FROM "DigestRecipient" WHERE id = ?`)
      .get(result.lastInsertRowid) as DigestRecipient;

    return NextResponse.json(row, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("UNIQUE constraint")) {
      return NextResponse.json({ error: "A recipient with this email already exists." }, { status: 409 });
    }
    throw err;
  }
}
