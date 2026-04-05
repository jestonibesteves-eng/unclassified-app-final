import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionUser = token ? await verifySessionToken(token) : null;
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const province = searchParams.get("province") ?? "";

  // Scope to province if provided, or if user is provincial/municipal
  const scopedProvince =
    sessionUser.office_level === "regional"
      ? province
      : sessionUser.province ?? province;

  const rows = await prisma.landholding.findMany({
    where: {
      municipality: { not: null },
      ...(scopedProvince ? { province_edited: scopedProvince } : {}),
    },
    select: { municipality: true },
    distinct: ["municipality"],
    orderBy: { municipality: "asc" },
  });

  const municipalities = rows.map((r) => r.municipality as string);
  return NextResponse.json({ municipalities });
}
