import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionUser = token ? await verifySessionToken(token) : null;
  if (!sessionUser || !["super_admin", "admin"].includes(sessionUser.role))
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const { searchParams } = req.nextUrl;
  const page      = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit     = parseInt(searchParams.get("limit") ?? "50");
  const search    = searchParams.get("search") ?? "";
  const action    = searchParams.get("action") ?? "";
  const user      = searchParams.get("user") ?? "";
  const from      = searchParams.get("from") ?? "";
  const to        = searchParams.get("to") ?? "";
  const province  = searchParams.get("province") ?? "";
  const isExport  = searchParams.get("export") === "1";

  const isProvincialAdmin = sessionUser.role === "admin" && sessionUser.office_level !== "regional";
  const isRegional        = sessionUser.office_level === "regional";
  const scopedProvince    = isProvincialAdmin ? (sessionUser.province ?? null) : null;

  // For provincial admins, restrict to entries by users in their province
  let allowedUsernames: string[] | null = null;
  if (isProvincialAdmin && scopedProvince) {
    const provinceUsers = await prisma.user.findMany({
      where: { province: scopedProvince },
      select: { username: true },
    });
    allowedUsernames = [
      sessionUser.username,
      ...provinceUsers.map((u) => u.username).filter((u) => u !== sessionUser.username),
    ];
  }

  const AND: object[] = [];

  // Jurisdiction scoping
  if (scopedProvince)    AND.push({ landholding: { province_edited: scopedProvince } });
  if (allowedUsernames)  AND.push({ changed_by: { in: allowedUsernames } });

  // Filters
  if (search)  AND.push({ seqno_darro: { contains: search.toUpperCase() } });
  if (action)  AND.push({ action });
  if (user)    AND.push({ changed_by: { contains: user } });
  if (from)    AND.push({ created_at: { gte: new Date(from) } });
  if (to)      AND.push({ created_at: { lte: new Date(to + "T23:59:59.999Z") } });

  // Province filter — only available to regional admins
  if (isRegional && province) AND.push({ landholding: { province_edited: province } });

  const where = AND.length ? { AND } : {};

  const select = {
    id: true,
    seqno_darro: true,
    action: true,
    field_changed: true,
    old_value: true,
    new_value: true,
    changed_by: true,
    source: true,
    created_at: true,
    landholding: {
      select: { landowner: true, province_edited: true },
    },
  };

  const orderBy = { created_at: "desc" as const };

  if (isExport) {
    const logs = await prisma.auditLog.findMany({ where, orderBy, select });
    return NextResponse.json({ logs });
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy, skip: (page - 1) * limit, take: limit, select }),
    prisma.auditLog.count({ where }),
  ]);

  return NextResponse.json({
    logs,
    total,
    page,
    limit,
    meta: {
      role: sessionUser.role,
      office_level: sessionUser.office_level,
      province: sessionUser.province ?? null,
    },
  });
}
