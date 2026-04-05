import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";
import { randomBytes } from "crypto";

function generatePassword(): string {
  // 4 segments of 3 chars separated by hyphens → easy to read and transcribe
  return Array.from({ length: 4 }, () => randomBytes(2).toString("hex").slice(0, 3)).join("-");
}

const ADMIN_ROLES = ["super_admin", "admin"];

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionUser = token ? await verifySessionToken(token) : null;
  if (!sessionUser || !ADMIN_ROLES.includes(sessionUser.role))
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const isRegional = sessionUser.office_level === "regional";
  const users = await prisma.user.findMany({
    where: isRegional ? undefined : {
      office_level: { not: "regional" },
      province: sessionUser.province,
    },
    select: {
      id: true, username: true, full_name: true, role: true,
      office_level: true, province: true, municipality: true,
      is_active: true, must_change_password: true, created_at: true,
    },
    orderBy: { created_at: "asc" },
  });

  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionUser = token ? await verifySessionToken(token) : null;
  if (!sessionUser || !ADMIN_ROLES.includes(sessionUser.role))
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = await req.json();
  const { username, full_name, role, office_level, province, municipality, password: rawPassword } = body;

  if (!username || !full_name || !role || !office_level)
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });

  const wasGenerated = !rawPassword?.trim();
  const password = wasGenerated ? generatePassword() : rawPassword.trim();

  if (password.length < 8)
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing)
    return NextResponse.json({ error: "Username already exists." }, { status: 409 });

  // Only super_admin can create other super_admins
  if (role === "super_admin" && sessionUser.role !== "super_admin")
    return NextResponse.json({ error: "Insufficient permissions to assign this role." }, { status: 403 });

  // Non-regional admins can only create provincial/municipal users within their own province
  if (sessionUser.office_level !== "regional") {
    if (office_level === "regional")
      return NextResponse.json({ error: "You cannot create regional-level accounts." }, { status: 403 });
    if (province && province !== sessionUser.province)
      return NextResponse.json({ error: "You can only create users within your province." }, { status: 403 });
  }

  const password_hash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      username, full_name, role, office_level,
      province: province || null,
      municipality: municipality || null,
      password_hash,
      must_change_password: true,
      created_by: sessionUser.id ? parseInt(sessionUser.id) : null,
    },
    select: {
      id: true, username: true, full_name: true, role: true,
      office_level: true, province: true, municipality: true,
      is_active: true, must_change_password: true, created_at: true,
    },
  });

  return NextResponse.json({ user, ...(wasGenerated && { generated_password: password }) }, { status: 201 });
}
