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
      is_active: true, must_change_password: true, created_at: true, created_by: true,
    },
    orderBy: { created_at: "asc" },
  });

  // Resolve creator names
  const creatorIds = [...new Set(users.map((u) => u.created_by).filter((id): id is number => id != null))];
  const creators = creatorIds.length
    ? await prisma.user.findMany({ where: { id: { in: creatorIds } }, select: { id: true, username: true, full_name: true } })
    : [];
  const creatorMap = Object.fromEntries(creators.map((c) => [c.id, c]));

  const usersWithCreator = users.map((u) => ({
    ...u,
    created_by_user: u.created_by != null ? (creatorMap[u.created_by] ?? null) : null,
  }));

  return NextResponse.json({ users: usersWithCreator });
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

  // super_admin must always be regional level
  if (role === "super_admin" && office_level !== "regional")
    return NextResponse.json({ error: "Super admin accounts must be at the regional office level." }, { status: 400 });

  // admin accounts cannot be at the municipal level
  if (role === "admin" && office_level === "municipal")
    return NextResponse.json({ error: "Admin accounts cannot be at the municipal office level." }, { status: 400 });

  // Only 1 active super_admin allowed
  if (role === "super_admin") {
    const existing = await prisma.user.findFirst({ where: { role: "super_admin", is_active: true } });
    if (existing)
      return NextResponse.json({ error: "A super admin account already exists. Only one is allowed." }, { status: 409 });
  }

  // Non-regional admins can only create provincial/municipal users within their own province
  if (sessionUser.office_level !== "regional") {
    if (office_level === "regional")
      return NextResponse.json({ error: "You cannot create regional-level accounts." }, { status: 403 });
    if (province && province !== sessionUser.province)
      return NextResponse.json({ error: "You can only create users within your province." }, { status: 403 });
  }

  // Provincial admins can only create editor/viewer accounts
  if (sessionUser.office_level === "provincial" && sessionUser.role === "admin") {
    if (!["editor", "viewer"].includes(role))
      return NextResponse.json({ error: "Provincial admins can only create editor or viewer accounts." }, { status: 403 });
  }

  // Only 1 active admin allowed per province at provincial level
  if (role === "admin" && office_level === "provincial" && province) {
    const existingAdmin = await prisma.user.findFirst({
      where: { role: "admin", office_level: "provincial", province, is_active: true },
    });
    if (existingAdmin)
      return NextResponse.json(
        { error: `An admin account already exists for ${province}. Only one provincial admin per province is allowed.` },
        { status: 409 }
      );
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
