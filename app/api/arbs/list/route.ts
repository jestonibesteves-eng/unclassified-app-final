import { NextRequest, NextResponse } from "next/server";
import { prisma, rawDb } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";

export async function GET(req: NextRequest) {
  try {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionUser = token ? await verifySessionToken(token) : null;
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { searchParams } = req.nextUrl;
  const search = searchParams.get("search") ?? "";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const match = searchParams.get("match") ?? ""; // "matched" | "mismatched" | ""
  const amountMatch = searchParams.get("amountMatch") ?? ""; // "matched" | "mismatched" | ""
  const provinceParam = searchParams.get("province") ?? ""; // regional filter only
  const limit = 30;

  const scopedProvince =
    sessionUser.office_level === "regional"
      ? (provinceParam || null)   // regional: use selected province filter, or no scope
      : sessionUser.province ?? null;
  const scopedMunicipality =
    sessionUser.office_level === "municipal" ? sessionUser.municipality ?? null : null;

  // Use rawDb (better-sqlite3) to get distinct seqnos with ARBs.
  // Avoids the Prisma+adapter JOIN-based pagination bug where `arbs: { some: {} }`
  // with skip/take causes OFFSET to count joined ARB rows instead of Landholding rows.
  const arbSeqnos = (() => {
    let sql = `SELECT DISTINCT a.seqno_darro FROM "Arb" a JOIN "Landholding" l ON l.seqno_darro = a.seqno_darro`;
    const conds: string[] = [];
    const params: unknown[] = [];
    if (scopedProvince)     { conds.push(`l.province_edited = ?`);                                         params.push(scopedProvince); }
    if (scopedMunicipality) { conds.push(`l.municipality LIKE ?`);                                         params.push(`%${scopedMunicipality}%`); }
    if (search)             { conds.push(`(l.seqno_darro LIKE ? OR l.landowner LIKE ? OR l.clno LIKE ?)`); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    if (conds.length)       sql += ` WHERE ${conds.join(" AND ")}`;
    return (rawDb.prepare(sql).all(...params) as { seqno_darro: string }[]).map((r) => r.seqno_darro);
  })();

  const where: Prisma.LandholdingWhereInput = {
    seqno_darro: { in: arbSeqnos },
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

  // Shared WHERE conditions for raw SQL match/amount queries — avoids full table scans
  const rawFilterParts: Prisma.Sql[] = [];
  if (scopedProvince) rawFilterParts.push(Prisma.sql`l.province_edited = ${scopedProvince}`);
  if (scopedMunicipality) rawFilterParts.push(Prisma.sql`l.municipality LIKE ${"%" + scopedMunicipality + "%"}`);
  if (search) rawFilterParts.push(Prisma.sql`(l.seqno_darro LIKE ${"%" + search + "%"} OR l.landowner LIKE ${"%" + search + "%"} OR l.clno LIKE ${"%" + search + "%"})`);
  const rawFilterWhere = rawFilterParts.length > 0
    ? Prisma.sql`WHERE ${Prisma.join(rawFilterParts, " AND ")}`
    : Prisma.sql``;

  // For match filtering, use raw SQL to compare SUM(area_allocated) vs amendarea_validated
  let matchSeqnos: string[] | null = null;
  if (match === "matched" || match === "mismatched") {
    const rows = await prisma.$queryRaw<{ seqno_darro: string; total: number; validated: number | null }[]>`
      SELECT l.seqno_darro,
             COALESCE(SUM(CASE WHEN a.area_allocated LIKE '%*' THEN 0 ELSE CAST(a.area_allocated AS REAL) END), 0) AS total,
             COALESCE(l.amendarea_validated, l.amendarea) AS validated
      FROM Landholding l
      JOIN Arb a ON a.seqno_darro = l.seqno_darro
      ${rawFilterWhere}
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

  // For amount match filtering: compare SUM(numeric allocated_condoned_amount) vs condoned_amount/net_of_reval_no_neg
  let amountSeqnos: string[] | null = null;
  if (amountMatch === "matched" || amountMatch === "mismatched") {
    const rows = await prisma.$queryRaw<{ seqno_darro: string; total: number | null; validated: number | null }[]>`
      SELECT l.seqno_darro,
             SUM(CAST(REPLACE(a.allocated_condoned_amount, ',', '') AS REAL)) AS total,
             COALESCE(l.condoned_amount, l.net_of_reval_no_neg) AS validated
      FROM Landholding l
      JOIN Arb a ON a.seqno_darro = l.seqno_darro
      ${rawFilterWhere}
      GROUP BY l.seqno_darro
    `;
    amountSeqnos = rows
      .filter((r) => {
        if (r.validated == null) return false;
        const total = Number(r.total ?? 0);
        const validated = Number(r.validated);
        const isMatch = parseFloat(total.toFixed(2)) === parseFloat(validated.toFixed(2));
        return amountMatch === "matched" ? isMatch : !isMatch;
      })
      .map((r) => r.seqno_darro);

    const existing = where.seqno_darro;
    if (existing && typeof existing === "object" && "in" in existing) {
      const prev = (existing as { in: string[] }).in;
      where.seqno_darro = { in: prev.filter((s) => amountSeqnos!.includes(s)) };
    } else {
      where.seqno_darro = { in: amountSeqnos };
    }
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
    const seqnoList = matchSeqnos.map((s) => Prisma.sql`${s}`);
    if (seqnoList.length === 0) {
      statsConditions.push(Prisma.sql`1 = 0`);
    } else {
      statsConditions.push(Prisma.sql`l.seqno_darro IN (${Prisma.join(seqnoList, ",")})`);
    }
  }
  if (amountSeqnos !== null) {
    const seqnoList = amountSeqnos.map((s) => Prisma.sql`${s}`);
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
        condoned_amount: true,
        net_of_reval_no_neg: true,
        status: true,
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

  // Per-landholding eligibility counts for the current page (raw SQL to avoid stale client type issues)
  const pageSeqnos = landholdings.map((l) => l.seqno_darro);
  const eligibleMap: Record<string, number> = {};
  if (pageSeqnos.length > 0) {
    const seqnoList = pageSeqnos.map((s) => Prisma.sql`${s}`);
    const eligibilityCounts = await prisma.$queryRaw<{ seqno_darro: string; cnt: number }[]>`
      SELECT seqno_darro, COUNT(*) as cnt
      FROM Arb
      WHERE seqno_darro IN (${Prisma.join(seqnoList, ",")})
      AND eligibility = 'Eligible'
      GROUP BY seqno_darro
    `;
    for (const r of eligibilityCounts) {
      eligibleMap[r.seqno_darro] = Number(r.cnt);
    }
  }

  const landholdignsWithEligibility = landholdings.map((l) => ({
    ...l,
    eligibleArbCount: eligibleMap[l.seqno_darro] ?? 0,
  }));

  return NextResponse.json({
    landholdings: landholdignsWithEligibility, total, page, limit,
    serviceCount: Number(stats.serviceCount ?? 0),
    distinctCount: Number(stats.distinctCount ?? 0),
    nonCarpableCount: Number(stats.nonCarpableCount ?? 0),
  });
  } catch (err) {
    console.error("[arbs/list] ERROR:", err);
    return NextResponse.json({ error: "An internal error occurred. Please try again." }, { status: 500 });
  }
}
