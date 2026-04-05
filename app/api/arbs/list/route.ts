import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionUser = token ? await verifySessionToken(token) : null;
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { searchParams } = req.nextUrl;
  const search = searchParams.get("search") ?? "";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const match = searchParams.get("match") ?? ""; // "matched" | "mismatched" | ""
  const limit = 30;

  const scopedProvince =
    sessionUser.office_level === "regional" ? null : sessionUser.province ?? null;
  const scopedMunicipality =
    sessionUser.office_level === "municipal" ? sessionUser.municipality ?? null : null;

  const where: Prisma.LandholdingWhereInput = {
    arbs: { some: {} },
    ...(scopedProvince ? { province_edited: scopedProvince } : {}),
    ...(scopedMunicipality ? { municipality: { contains: scopedMunicipality } } : {}),
    ...(search
      ? {
          OR: [
            { seqno_darro: { contains: search } },
            { landowner: { contains: search } },
            { clno: { contains: search } },
          ],
        }
      : {}),
  };

  // For match filtering, use raw SQL to compare SUM(area_allocated) vs amendarea_validated
  let matchSeqnos: string[] | null = null;
  if (match === "matched" || match === "mismatched") {
    const rows = await prisma.$queryRaw<{ seqno_darro: string; total: number; validated: number | null }[]>`
      SELECT l.seqno_darro,
             COALESCE(SUM(CASE WHEN a.area_allocated LIKE '%*' THEN 0 ELSE CAST(a.area_allocated AS REAL) END), 0) AS total,
             COALESCE(l.amendarea_validated, l.amendarea) AS validated
      FROM Landholding l
      JOIN Arb a ON a.seqno_darro = l.seqno_darro
      GROUP BY l.seqno_darro
    `;
    matchSeqnos = rows
      .filter((r) => {
        if (r.validated == null) return false;
        const isMatch = parseFloat(Number(r.total).toFixed(4)) === parseFloat(Number(r.validated).toFixed(4));
        return match === "matched" ? isMatch : !isMatch;
      })
      .map((r) => r.seqno_darro);

    where.seqno_darro = { in: matchSeqnos };
  }

  // Build raw SQL conditions for stats — mirrors the Prisma `where` filter
  const statsConditions: Prisma.Sql[] = [];
  if (scopedProvince) {
    statsConditions.push(Prisma.sql`l.province_edited = ${scopedProvince}`);
  }
  if (scopedMunicipality) {
    statsConditions.push(Prisma.sql`l.municipality LIKE ${"%" + scopedMunicipality + "%"}`);
  }
  if (search) {
    statsConditions.push(Prisma.sql`(l.seqno_darro LIKE ${"%" + search + "%"} OR l.landowner LIKE ${"%" + search + "%"} OR l.clno LIKE ${"%" + search + "%"})`);
  }
  if (matchSeqnos !== null) {
    // SQLite doesn't support large IN lists well, but this is already filtered above
    const seqnoList = matchSeqnos.map((s) => Prisma.sql`${s}`);
    if (seqnoList.length === 0) {
      statsConditions.push(Prisma.sql`1 = 0`);
    } else {
      statsConditions.push(Prisma.sql`l.seqno_darro IN (${Prisma.join(seqnoList, ",")})`);
    }
  }

  const statsWhereClause = statsConditions.length > 0
    ? Prisma.sql`JOIN Landholding l ON l.seqno_darro = a.seqno_darro WHERE ${Prisma.join(statsConditions, " AND ")}`
    : Prisma.sql`JOIN Landholding l ON l.seqno_darro = a.seqno_darro`;

  const [landholdings, total, statsRows] = await Promise.all([
    prisma.landholding.findMany({
      where,
      select: {
        seqno_darro: true,
        landowner: true,
        province_edited: true,
        clno: true,
        amendarea_validated: true,
        amendarea: true,
        _count: { select: { arbs: true } },
      },
      orderBy: { seqno_darro: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.landholding.count({ where }),
    prisma.$queryRaw<{ serviceCount: number; nonCarpableCount: number; distinctCount: number }[]>`
      SELECT
        SUM(CASE WHEN a.carpable = 'CARPABLE' THEN 1 ELSE 0 END) AS serviceCount,
        SUM(CASE WHEN a.carpable != 'CARPABLE' THEN 1 ELSE 0 END) AS nonCarpableCount,
        COUNT(DISTINCT CASE WHEN a.carpable = 'CARPABLE' THEN a.arb_name END) AS distinctCount
      FROM Arb a
      ${statsWhereClause}
    `,
  ]);

  const stats = statsRows[0] ?? { serviceCount: 0, nonCarpableCount: 0, distinctCount: 0 };

  return NextResponse.json({
    landholdings, total, page, limit,
    serviceCount: Number(stats.serviceCount ?? 0),
    distinctCount: Number(stats.distinctCount ?? 0),
    nonCarpableCount: Number(stats.nonCarpableCount ?? 0),
  });
}
