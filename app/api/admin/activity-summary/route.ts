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

  // Only DARPO (provincial/municipal) users
  const darpoUsers = await prisma.user.findMany({
    where: { office_level: { in: ["provincial", "municipal"] } },
    select: { username: true, province: true },
  });
  const darpoUsernames = darpoUsers.map((u) => u.username);

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
      const periodWhere = { ...baseWhere, created_at: { gte: since } };

      const [
        totalPeriod,
        total24h,
        byAction,
        byField,
        latestLog,
        recentLogs,
        distinctLHsRaw,
        distinctUsersRaw,
      ] = await Promise.all([
        prisma.auditLog.count({ where: periodWhere }),
        prisma.auditLog.count({ where: { ...baseWhere, created_at: { gte: since24h } } }),
        prisma.auditLog.groupBy({
          by: ["action"],
          where: periodWhere,
          _count: { action: true },
          orderBy: { _count: { action: "desc" } },
        }),
        // Top 4 fields changed
        prisma.auditLog.groupBy({
          by: ["field_changed"],
          where: { ...periodWhere, field_changed: { not: null } },
          _count: { field_changed: true },
          orderBy: { _count: { field_changed: "desc" } },
          take: 4,
        }),
        prisma.auditLog.findFirst({
          where: baseWhere,
          orderBy: { created_at: "desc" },
          select: { created_at: true, action: true, field_changed: true },
        }),
        prisma.auditLog.findMany({
          where: periodWhere,
          orderBy: { created_at: "desc" },
          take: 6,
          select: { created_at: true, action: true, field_changed: true, new_value: true },
        }),
        // Distinct landholdings touched
        prisma.auditLog.groupBy({
          by: ["seqno_darro"],
          where: periodWhere,
        }),
        // Distinct active users (count only, no names)
        prisma.auditLog.groupBy({
          by: ["changed_by"],
          where: periodWhere,
        }),
      ]);

      return {
        province: province!,
        totalPeriod,
        total24h,
        byAction: byAction.map((r) => ({ action: r.action, count: r._count.action })),
        topFields: byField.map((r) => ({ field: r.field_changed!, count: r._count.field_changed })),
        lastActivity: latestLog?.created_at ?? null,
        lastAction: latestLog?.action ?? null,
        recentLogs,
        uniqueLandholdings: distinctLHsRaw.length,
        activeUserCount: distinctUsersRaw.length,
      };
    })
  );

  // Regional users — aggregated individually, not by province
  const regionalUsers = await prisma.user.findMany({
    where: { office_level: "regional", is_active: true },
    select: { username: true },
  });

  const regional = await Promise.all(
    regionalUsers.map(async ({ username }) => {
      const baseWhere = { changed_by: username };
      const periodWhere = { ...baseWhere, created_at: { gte: since } };

      const [
        totalPeriod,
        total24h,
        byAction,
        byField,
        latestLog,
        recentLogs,
        distinctLHsRaw,
      ] = await Promise.all([
        prisma.auditLog.count({ where: periodWhere }),
        prisma.auditLog.count({ where: { ...baseWhere, created_at: { gte: since24h } } }),
        prisma.auditLog.groupBy({
          by: ["action"],
          where: periodWhere,
          _count: { action: true },
          orderBy: { _count: { action: "desc" } },
        }),
        prisma.auditLog.groupBy({
          by: ["field_changed"],
          where: { ...periodWhere, field_changed: { not: null } },
          _count: { field_changed: true },
          orderBy: { _count: { field_changed: "desc" } },
          take: 4,
        }),
        prisma.auditLog.findFirst({
          where: baseWhere,
          orderBy: { created_at: "desc" },
          select: { created_at: true, action: true, field_changed: true },
        }),
        prisma.auditLog.findMany({
          where: periodWhere,
          orderBy: { created_at: "desc" },
          take: 6,
          select: { created_at: true, action: true, field_changed: true, new_value: true },
        }),
        prisma.auditLog.groupBy({ by: ["seqno_darro"], where: periodWhere }),
      ]);

      return {
        username,
        totalPeriod,
        total24h,
        byAction: byAction.map((r) => ({ action: r.action, count: r._count.action })),
        topFields: byField.map((r) => ({ field: r.field_changed!, count: r._count.field_changed })),
        lastActivity: latestLog?.created_at ?? null,
        recentLogs,
        uniqueLandholdings: distinctLHsRaw.length,
      };
    })
  );

  return NextResponse.json({ provinces: results, regional, days });
}
