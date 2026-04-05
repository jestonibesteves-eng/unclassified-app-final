import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";

/* ── Route permission rules ── */
const ADMIN_PAGES   = ["/flags", "/audit", "/users"];
const EDITOR_PAGES  = ["/batch"];

function isAdminRole(role: string)  { return ["super_admin", "admin"].includes(role); }
function isEditorRole(role: string) { return ["super_admin", "admin", "editor"].includes(role); }

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always allow static assets and public auth routes
  if (pathname.startsWith("/api/auth") || pathname === "/login" || pathname === "/change-password") {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const user = token ? await verifySessionToken(token) : null;

  // Not authenticated → redirect to login
  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Already logged in, trying to visit login → redirect home
  if (pathname === "/login") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Must change password → redirect
  if (user.must_change_password && pathname !== "/change-password") {
    return NextResponse.redirect(new URL("/change-password", req.url));
  }

  // Admin-only pages
  if (ADMIN_PAGES.some((p) => pathname.startsWith(p)) && !isAdminRole(user.role)) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Editor+ pages
  if (EDITOR_PAGES.some((p) => pathname.startsWith(p)) && !isEditorRole(user.role)) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Admin-only API routes
  if ((pathname.startsWith("/api/flags") || pathname.startsWith("/api/audit")) && !isAdminRole(user.role)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.svg|.*\\.png).*)"],
};
