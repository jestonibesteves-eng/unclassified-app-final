import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionUser = token ? await verifySessionToken(token) : null;
  if (!sessionUser || !["super_admin", "admin"].includes(sessionUser.role))
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const { searchParams } = req.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = parseInt(searchParams.get("limit") ?? "50");
  const search = searchParams.get("search") ?? "";
  const action = searchParams.get("action") ?? "";

  const scopedProvince =
    sessionUser.office_level === "regional" ? null : sessionUser.province ?? null;

  const where = {
    AND: [
      scopedProvince ? { landholding: { province_edited: scopedProvince } } : {},
      search ? { seqno_darro: { contains: search } } : {},
      action ? { action } : {},
    ],
  };

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        seqno_darro: true,
        action: true,
        field_changed: true,
        old_value: true,
        new_value: true,
        changed_by: true,
        created_at: true,
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return NextResponse.json({ logs, total, page, limit });
}
