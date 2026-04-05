import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { createSessionToken, SESSION_COOKIE } from "@/lib/session";

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();

  if (!username || !password) {
    return NextResponse.json({ error: "Missing credentials." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !user.is_active) {
    return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
  }

  const token = await createSessionToken({
    id: String(user.id),
    username: user.username,
    full_name: user.full_name,
    role: user.role,
    office_level: user.office_level,
    province: user.province,
    municipality: user.municipality,
    must_change_password: user.must_change_password,
  });

  const res = NextResponse.json({ ok: true, must_change_password: user.must_change_password });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 8,
    path: "/",
  });
  return res;
}
