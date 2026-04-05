import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { verifySessionToken, createSessionToken, SESSION_COOKIE } from "@/lib/session";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionUser = token ? await verifySessionToken(token) : null;
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { current_password, new_password } = await req.json();
  if (!current_password || !new_password) return NextResponse.json({ error: "Missing fields." }, { status: 400 });
  if (new_password.length < 8) return NextResponse.json({ error: "New password must be at least 8 characters." }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { username: sessionUser.username } });
  if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const valid = await bcrypt.compare(current_password, user.password_hash);
  if (!valid) return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });

  const newHash = await bcrypt.hash(new_password, 12);
  await prisma.user.update({ where: { id: user.id }, data: { password_hash: newHash, must_change_password: false } });

  // Reissue session token with must_change_password: false
  const newToken = await createSessionToken({ ...sessionUser, must_change_password: false });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, newToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 8,
    path: "/",
  });
  return res;
}
