import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { verifySessionToken, createSessionToken, SESSION_COOKIE } from "@/lib/session";

// ── Per-user rate limiter: 5 attempts per 15 minutes ─────────────────────────
const ATTEMPT_LIMIT = 5;
const WINDOW_MS     = 15 * 60 * 1000;
const changePwAttempts = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(userId: string): boolean {
  const now   = Date.now();
  const entry = changePwAttempts.get(userId);
  if (!entry || now >= entry.resetAt) return false;
  return entry.count >= ATTEMPT_LIMIT;
}

function recordFailure(userId: string): void {
  const now   = Date.now();
  const entry = changePwAttempts.get(userId);
  if (!entry || now >= entry.resetAt) {
    changePwAttempts.set(userId, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    entry.count++;
  }
}

function clearAttempts(userId: string): void {
  changePwAttempts.delete(userId);
}
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionUser = token ? await verifySessionToken(token) : null;
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  if (isRateLimited(sessionUser.id)) {
    return NextResponse.json({ error: "Too many attempts. Please wait 15 minutes." }, { status: 429 });
  }

  const { current_password, new_password } = await req.json();
  if (!current_password || !new_password) return NextResponse.json({ error: "Missing fields." }, { status: 400 });
  if (new_password.length < 8) return NextResponse.json({ error: "New password must be at least 8 characters." }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { username: sessionUser.username } });
  if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const valid = await bcrypt.compare(current_password, user.password_hash);
  if (!valid) {
    recordFailure(sessionUser.id);
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
  }

  clearAttempts(sessionUser.id);
  const newHash = await bcrypt.hash(new_password, 12);
  await prisma.user.update({ where: { id: user.id }, data: { password_hash: newHash, must_change_password: false } });

  // Reissue session token with must_change_password: false
  const newToken = await createSessionToken({ ...sessionUser, must_change_password: false });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, newToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60,
    path: "/",
  });
  return res;
}
