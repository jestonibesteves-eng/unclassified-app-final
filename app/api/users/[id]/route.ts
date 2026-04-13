import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";

const ADMIN_ROLES = ["super_admin", "admin"];
type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionUser = token ? await verifySessionToken(token) : null;
  if (!sessionUser || !ADMIN_ROLES.includes(sessionUser.role))
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { full_name, role, office_level, province, municipality, is_active } = body;

  const target = await prisma.user.findUnique({ where: { id: parseInt(id) } });
  if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });

  // Only super_admin can edit super_admins or assign the role
  if (
    (target.role === "super_admin" || role === "super_admin") &&
    sessionUser.role !== "super_admin"
  ) return NextResponse.json({ error: "Insufficient permissions." }, { status: 403 });

  // Non-regional admins cannot touch regional-level users or promote to regional
  if (sessionUser.office_level !== "regional") {
    if (target.office_level === "regional")
      return NextResponse.json({ error: "You cannot edit regional-level accounts." }, { status: 403 });
    if (office_level === "regional")
      return NextResponse.json({ error: "You cannot assign regional office level." }, { status: 403 });
    if (target.province && target.province !== sessionUser.province)
      return NextResponse.json({ error: "You can only manage users within your province." }, { status: 403 });
    if (province && province !== sessionUser.province)
      return NextResponse.json({ error: "You can only manage users within your province." }, { status: 403 });
  }

  // Provincial admins can only assign editor/viewer roles
  if (sessionUser.office_level === "provincial" && sessionUser.role === "admin") {
    const resolvedRole = role ?? target.role;
    if (!["editor", "viewer"].includes(resolvedRole))
      return NextResponse.json({ error: "Provincial admins can only assign editor or viewer roles." }, { status: 403 });
  }

  // super_admin must always be regional level
  const resolvedRole = role ?? target.role;
  const resolvedLevel = office_level ?? target.office_level;
  const resolvedProvince = province ?? target.province;

  if (resolvedRole === "super_admin" && resolvedLevel !== "regional")
    return NextResponse.json({ error: "Super admin accounts must be at the regional office level." }, { status: 400 });

  // admin accounts cannot be at the municipal level
  if (resolvedRole === "admin" && resolvedLevel === "municipal")
    return NextResponse.json({ error: "Admin accounts cannot be at the municipal office level." }, { status: 400 });

  // Only 1 active super_admin allowed
  if (resolvedRole === "super_admin") {
    const existing = await prisma.user.findFirst({
      where: { role: "super_admin", is_active: true, id: { not: target.id } },
    });
    if (existing)
      return NextResponse.json({ error: "A super admin account already exists. Only one is allowed." }, { status: 409 });
  }

  // Only 1 active admin allowed per province at provincial level
  if (resolvedRole === "admin" && resolvedLevel === "provincial" && resolvedProvince) {
    const existingAdmin = await prisma.user.findFirst({
      where: {
        role: "admin", office_level: "provincial",
        province: resolvedProvince, is_active: true,
        id: { not: target.id },
      },
    });
    if (existingAdmin)
      return NextResponse.json(
        { error: `An admin account already exists for ${resolvedProvince}. Only one provincial admin per province is allowed.` },
        { status: 409 }
      );
  }

  // Prevent self-deactivation
  if (is_active === false && String(target.id) === sessionUser.id)
    return NextResponse.json({ error: "You cannot deactivate your own account." }, { status: 400 });

  const updateData: Record<string, unknown> = {};
  if (full_name !== undefined) updateData.full_name = full_name;
  if (role !== undefined) updateData.role = role;
  if (office_level !== undefined) updateData.office_level = office_level;
  if (province !== undefined) updateData.province = province || null;
  if (municipality !== undefined) updateData.municipality = municipality || null;
  if (is_active !== undefined) updateData.is_active = is_active;

  const updated = await prisma.user.update({
    where: { id: parseInt(id) },
    data: updateData,
    select: {
      id: true, username: true, full_name: true, role: true,
      office_level: true, province: true, municipality: true,
      is_active: true, must_change_password: true, created_at: true,
    },
  });

  return NextResponse.json({ user: updated });
}
