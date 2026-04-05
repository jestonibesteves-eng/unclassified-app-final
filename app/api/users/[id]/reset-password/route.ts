import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";

const ADMIN_ROLES = ["super_admin", "admin"];
type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionUser = token ? await verifySessionToken(token) : null;
  if (!sessionUser || !ADMIN_ROLES.includes(sessionUser.role))
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  const { new_password } = await req.json();

  if (!new_password || new_password.length < 8)
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });

  const target = await prisma.user.findUnique({ where: { id: parseInt(id) } });
  if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });

  if (target.role === "super_admin" && sessionUser.role !== "super_admin")
    return NextResponse.json({ error: "Insufficient permissions." }, { status: 403 });

  if (sessionUser.office_level !== "regional" && target.office_level === "regional")
    return NextResponse.json({ error: "You cannot reset passwords for regional-level accounts." }, { status: 403 });

  if (sessionUser.office_level !== "regional" && target.province && target.province !== sessionUser.province)
    return NextResponse.json({ error: "You can only reset passwords for users within your province." }, { status: 403 });

  const password_hash = await bcrypt.hash(new_password, 12);
  await prisma.user.update({
    where: { id: parseInt(id) },
    data: { password_hash, must_change_password: true },
  });

  return NextResponse.json({ ok: true });
}
