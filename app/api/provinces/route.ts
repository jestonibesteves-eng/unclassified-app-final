import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const rows = await prisma.landholding.findMany({
    where: { province_edited: { not: null } },
    select: { province_edited: true },
    distinct: ["province_edited"],
    orderBy: { province_edited: "asc" },
  });

  const provinces = rows.map((r) => r.province_edited as string);
  return NextResponse.json({ provinces });
}
