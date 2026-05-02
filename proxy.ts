import { NextRequest, NextResponse } from "next/server";
import { jwtVerify, SignJWT } from "jose";

const SESSION_COOKIE = "dar_session";
const SESSION_EXP_COOKIE = "dar_session_exp"; // non-httpOnly, readable by JS
const SESSION_DURATION_S = 60 * 60; // 1 hour in seconds

/* ── Route permission rules ── */
const ADMIN_PAGES   = ["/flags", "/audit", "/users", "/digest"];
const EDITOR_PAGES  = ["/batch"];

type SessionUser = {
  role: string;
  must_change_password: boolean;
};

function getSecret(): Uint8Array {
  return new TextEncoder().encode(process.env.AUTH_SECRET ?? "");
}

async function getSessionUser(token: string): Promise<{ user: SessionUser; payload: Record<string, unknown> } | null> {
  try {
    const secret = process.env.AUTH_SECRET;
    if (!secret) return null;
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    const user = (payload as { user: SessionUser }).user ?? null;
    if (!user) return null;
    return { user, payload: payload as Record<string, unknown> };
  } catch {
    return null;
  }
}

function isAdminRole(role: string)  { return ["super_admin", "admin"].includes(role); }
function isEditorRole(role: string) { return ["super_admin", "admin", "editor"].includes(role); }

function noindex(res: NextResponse): NextResponse {
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

function setSessionCookies(res: NextResponse, token: string): void {
  const expUnix = Math.floor(Date.now() / 1000) + SESSION_DURATION_S;

  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_DURATION_S,
    path: "/",
  });

  // Readable by JS so the expiry warning banner can show a countdown.
  res.cookies.set(SESSION_EXP_COOKIE, String(expUnix), {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_DURATION_S,
    path: "/",
  });
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always allow static assets and public auth routes
  if (pathname.startsWith("/api/auth") || pathname === "/login" || pathname.startsWith("/view/")) {
    return noindex(NextResponse.next());
  }

  // Allow dashboard API routes with a public token — the route handler validates it
  if (
    (pathname.startsWith("/api/dashboard/") || pathname.startsWith("/api/progress")) &&
    req.nextUrl.searchParams.has("token")
  ) {
    return noindex(NextResponse.next());
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await getSessionUser(token) : null;

  // Not authenticated → redirect to login
  if (!session) {
    return noindex(NextResponse.redirect(new URL("/login", req.url)));
  }

  const { user } = session;

  // Must change password → redirect
  if (user.must_change_password && pathname !== "/change-password") {
    return noindex(NextResponse.redirect(new URL("/change-password", req.url)));
  }

  // Admin-only pages
  if (ADMIN_PAGES.some((p) => pathname.startsWith(p)) && !isAdminRole(user.role)) {
    return noindex(NextResponse.redirect(new URL("/", req.url)));
  }

  // Editor+ pages
  if (EDITOR_PAGES.some((p) => pathname.startsWith(p)) && !isEditorRole(user.role)) {
    return noindex(NextResponse.redirect(new URL("/", req.url)));
  }

  // Admin-only API routes
  if ((pathname.startsWith("/api/flags") || pathname.startsWith("/api/audit")) && !isAdminRole(user.role)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  // ── Sliding session: reissue a fresh token on every authenticated request ──
  const newToken = await new SignJWT({ user: session.payload.user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_S}s`)
    .sign(getSecret());

  const res = noindex(NextResponse.next());
  setSessionCookies(res, newToken);
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.svg|.*\\.png).*)"],
};
