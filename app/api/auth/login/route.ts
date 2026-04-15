import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { createSessionToken, SESSION_COOKIE } from "@/lib/session";

// ── Login rate limiter ────────────────────────────────────────────────────────
// Tracks failed attempts per IP. Resets after WINDOW_MS. Lockout is applied
// once ATTEMPT_LIMIT failures accumulate within the window.
// Note: in-memory — resets on server restart, and shared-IP offices (NAT)
// count as one IP. Raise ATTEMPT_LIMIT if that becomes an issue.
const ATTEMPT_LIMIT = 10;
const WINDOW_MS     = 15 * 60 * 1000; // 15 minutes

const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

function isRateLimited(ip: string): boolean {
  const now  = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now >= entry.resetAt) return false;
  return entry.count >= ATTEMPT_LIMIT;
}

function recordFailure(ip: string): void {
  const now   = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now >= entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    entry.count++;
  }
}

function clearAttempts(ip: string): void {
  loginAttempts.delete(ip);
}
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many failed login attempts. Please try again in 15 minutes." },
      { status: 429 }
    );
  }

  const { username, password } = await req.json();

  if (!username || !password) {
    return NextResponse.json({ error: "Missing credentials." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !user.is_active) {
    recordFailure(ip);
    return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    recordFailure(ip);
    return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
  }

  clearAttempts(ip);

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

  const SESSION_DURATION_S = 60 * 60;
  const expUnix = Math.floor(Date.now() / 1000) + SESSION_DURATION_S;

  const res = NextResponse.json({ ok: true, must_change_password: user.must_change_password });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_DURATION_S,
    path: "/",
  });
  res.cookies.set("dar_session_exp", String(expUnix), {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_DURATION_S,
    path: "/",
  });
  return res;
}
