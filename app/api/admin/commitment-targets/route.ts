import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionUser = token ? await verifySessionToken(token) : null;
  if (!sessionUser || !["super_admin", "admin"].includes(sessionUser.role))
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const region = req.nextUrl.searchParams.get("region") ?? "V";

  const [existing, provinceRows] = await Promise.all([
    prisma.commitmentTarget.findMany({ where: { region }, orderBy: { province: "asc" } }),
    prisma.landholding.groupBy({
      by: ["province_edited"],
      where: { province_edited: { not: null } },
      orderBy: { province_edited: "asc" },
    }),
  ]);

  const provinces   = provinceRows.map((r) => r.province_edited as string);
  const existingMap = new Map(existing.filter((t) => t.province !== null).map((t) => [t.province!, t]));
  const regionRow   = existing.find((t) => t.province === null);

  const targets = provinces.map((province) => {
    const t = existingMap.get(province);
    return { id: t?.id ?? null, province, committed: t?.committed ?? 0 };
  });

  return NextResponse.json({
    region,
    targets,
    regionTotal: {
      id:          regionRow?.id          ?? null,
      committed:   regionRow?.committed   ?? 0,
      target_date: regionRow?.target_date ?? "2026-06-15",
    },
  });
}

export async function PUT(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionUser = token ? await verifySessionToken(token) : null;
  if (!sessionUser || sessionUser.role !== "super_admin")
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const { region, province, committed, target_date } = await req.json() as {
    region: string; province: string | null; committed: number; target_date?: string;
  };

  if (!region)
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  if (typeof committed !== "number" || committed < 0 || !Number.isInteger(committed))
    return NextResponse.json({ error: "Committed must be a non-negative integer." }, { status: 400 });
  if (target_date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(target_date))
    return NextResponse.json({ error: "target_date must be YYYY-MM-DD." }, { status: 400 });

  const existing = await prisma.commitmentTarget.findFirst({
    where: { region, province: province ?? null },
  });

  const data: { committed: number; target_date?: string } = { committed };
  if (target_date !== undefined) data.target_date = target_date;

  const result = existing
    ? await prisma.commitmentTarget.update({ where: { id: existing.id }, data })
    : await prisma.commitmentTarget.create({ data: { region, province: province ?? null, ...data } });

  return NextResponse.json(result);
}
