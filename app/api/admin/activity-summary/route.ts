import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionUser = token ? await verifySessionToken(token) : null;
  if (!sessionUser || sessionUser.role !== "super_admin")
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const { searchParams } = req.nextUrl;
  const days = Math.min(90, Math.max(1, parseInt(searchParams.get("days") ?? "7")));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Only track provincial/municipal users (DARPOs), not regional/super_admin
  const darpoUsers = await prisma.user.findMany({
    where: { office_level: { in: ["provincial", "municipal"] } },
    select: { username: true, province: true },
  });
  const darpoUsernames = darpoUsers.map((u) => u.username);

  // All distinct provinces
  const provinces = await prisma.landholding.findMany({
    where: { province_edited: { not: null } },
    select: { province_edited: true },
    distinct: ["province_edited"],
    orderBy: { province_edited: "asc" },
  });

  const results = await Promise.all(
    provinces.map(async ({ province_edited: province }) => {
      const baseWhere = {
        landholding: { province_edited: province! },
        changed_by: { in: darpoUsernames },
      };

      const [totalPeriod, total24h, byAction, latestLog, recentLogs] = await Promise.all([
        prisma.auditLog.count({ where: { ...baseWhere, created_at: { gte: since } } }),
        prisma.auditLog.count({ where: { ...baseWhere, created_at: { gte: since24h } } }),
        prisma.auditLog.groupBy({
          by: ["action"],
          where: { ...baseWhere, created_at: { gte: since } },
          _count: { action: true },
          orderBy: { _count: { action: "desc" } },
        }),
        prisma.auditLog.findFirst({
          where: baseWhere,
          orderBy: { created_at: "desc" },
          select: { created_at: true, action: true, field_changed: true },
        }),
        // Last 5 entries for the timeline strip (no username)
        prisma.auditLog.findMany({
          where: { ...baseWhere, created_at: { gte: since } },
          orderBy: { created_at: "desc" },
          take: 5,
          select: { created_at: true, action: true, field_changed: true },
        }),
      ]);

      return {
        province: province!,
        totalPeriod,
        total24h,
        byAction: byAction.map((r) => ({ action: r.action, count: r._count.action })),
        lastActivity: latestLog?.created_at ?? null,
        lastAction: latestLog?.action ?? null,
        recentLogs,
      };
    })
  );

  return NextResponse.json({ provinces: results, days });
}
