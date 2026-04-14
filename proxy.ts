import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "dar_session";

/* ── Route permission rules ── */
const ADMIN_PAGES   = ["/flags", "/audit", "/users"];
const EDITOR_PAGES  = ["/batch"];

type SessionUser = {
  role: string;
  must_change_password: boolean;
};

async function getSessionUser(token: string): Promise<SessionUser | null> {
  try {
    const secret = process.env.AUTH_SECRET;
    if (!secret) return null;
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    return (payload as { user: SessionUser }).user ?? null;
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

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always allow static assets and public auth routes
  if (pathname.startsWith("/api/auth") || pathname === "/login") {
    return noindex(NextResponse.next());
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const user = token ? await getSessionUser(token) : null;

  // Not authenticated → redirect to login
  if (!user) {
    return noindex(NextResponse.redirect(new URL("/login", req.url)));
  }

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

  return noindex(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.svg|.*\\.png).*)"],
};
