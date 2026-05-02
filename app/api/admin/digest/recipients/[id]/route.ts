import { NextRequest, NextResponse } from "next/server";
import { rawDb } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";
import type { DigestRecipient } from "@/lib/digest";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const user  = token ? await verifySessionToken(token) : null;
  if (!user || user.role !== "super_admin")
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const { id } = await params;
  const body = await req.json() as Partial<{
    name: string; nickname: string | null; email: string; role: string;
    level: string; province: string | null; active: number;
  }>;

  const existing = rawDb
    .prepare(`SELECT * FROM "DigestRecipient" WHERE id = ?`)
    .get(id) as DigestRecipient | undefined;
  if (!existing)
    return NextResponse.json({ error: "Recipient not found." }, { status: 404 });

  const name     = body.name     !== undefined ? body.name.trim()                : existing.name;
  const nickname = body.nickname !== undefined ? (body.nickname?.trim() || null) : existing.nickname;
  const email    = body.email    !== undefined ? body.email.trim().toLowerCase() : existing.email;
  const role     = body.role     !== undefined ? body.role.trim()                : existing.role;
  const level    = body.level    !== undefined ? body.level                      : existing.level;
  const province = body.province !== undefined ? body.province                   : existing.province;
  const active   = body.active   !== undefined ? (body.active ? 1 : 0)          : existing.active;

  if (!["regional", "provincial"].includes(level))
    return NextResponse.json({ error: "level must be 'regional' or 'provincial'." }, { status: 400 });

  rawDb
    .prepare(`UPDATE "DigestRecipient" SET name=?, nickname=?, email=?, role=?, level=?, province=?, active=? WHERE id=?`)
    .run(name, nickname, email, role, level, province, active, id);

  const updated = rawDb
    .prepare(`SELECT * FROM "DigestRecipient" WHERE id = ?`)
    .get(id) as DigestRecipient;

  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const user  = token ? await verifySessionToken(token) : null;
  if (!user || user.role !== "super_admin")
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const { id } = await params;
  const existing = rawDb
    .prepare(`SELECT id FROM "DigestRecipient" WHERE id = ?`)
    .get(id);
  if (!existing)
    return NextResponse.json({ error: "Recipient not found." }, { status: 404 });

  rawDb.prepare(`DELETE FROM "DigestRecipient" WHERE id = ?`).run(id);
  return NextResponse.json({ ok: true });
}
