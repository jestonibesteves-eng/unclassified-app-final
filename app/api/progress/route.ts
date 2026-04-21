import { NextRequest, NextResponse } from "next/server";
import { rawDb } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";

// ── SQL helpers ────────────────────────────────────────────────────────────
const ENC_DATE =
  `date(substr(a.date_encoded,7,4)||'-'||substr(a.date_encoded,1,2)||'-'||substr(a.date_encoded,4,2))`;

const AREA_CLEAN   = `TRIM(REPLACE(COALESCE(a.area_allocated,''),',',''))`;
const AMOUNT_CLEAN = `TRIM(REPLACE(COALESCE(a.allocated_condoned_amount,''),',',''))`;
const IS_CLEAN     = (col: string) =>
  `(${col} GLOB '[0-9]*' AND ${col} NOT GLOB '*[^0-9.]*')`;

const ENC_STATUSES =
  `l.status IN ('Partially Encoded','Fully Encoded','Partially Distributed','Fully Distributed')`;

function safeProv(s: string) { return s.replace(/'/g, "''"); }

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    const sessionUser = token ? await verifySessionToken(token) : null;
    if (!sessionUser) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    // Province scope for non-regional users
    const prov = sessionUser.office_level !== "regional" && sessionUser.province
      ? sessionUser.province : null;
    const lhWhere  = prov ? `AND l.province_edited = '${safeProv(prov)}'` : "";
    const lhWhere2 = prov ? `AND province_edited   = '${safeProv(prov)}'` : "";

    // ── Validation ──────────────────────────────────────────────────────
    const valTotal = (rawDb.prepare(
      `SELECT COUNT(*) as n FROM "Landholding" WHERE 1=1 ${lhWhere2}`
    ).get() as { n: number }).n;

    const valCompleted = (rawDb.prepare(`
      SELECT COUNT(*) as n
      FROM "Landholding" l
      LEFT JOIN (
        SELECT a.seqno_darro,
               SUM(CASE WHEN ${IS_CLEAN(AREA_CLEAN)} THEN CAST(${AREA_CLEAN} AS REAL) ELSE 0 END) AS total_area
        FROM "Arb" a
        WHERE a.carpable = 'CARPABLE'
        GROUP BY a.seqno_darro
      ) arb_totals ON arb_totals.seqno_darro = l.seqno_darro
      WHERE (
        (l.amendarea_validated_confirmed = 1
          AND l.condoned_amount_confirmed = 1
          AND ABS(COALESCE(l.amendarea_validated, l.amendarea, 0) - COALESCE(arb_totals.total_area, 0)) < 0.01)
        OR l.status = 'Not Eligible for Encoding'
      )
      ${lhWhere2}
    `).get() as { n: number }).n;

    // ── Encoding ────────────────────────────────────────────────────────
    const encAgg = rawDb.prepare(`
      SELECT
        COUNT(*) as cocrom_total,
        SUM(CASE WHEN a.date_encoded IS NOT NULL THEN 1 ELSE 0 END) as cocrom_completed,
        COUNT(DISTINCT a.arb_name) as arb_total,
        COUNT(DISTINCT CASE WHEN a.date_encoded IS NOT NULL THEN a.arb_name ELSE NULL END) as arb_completed,
        SUM(CASE WHEN ${IS_CLEAN(AREA_CLEAN)}
            THEN CAST(${AREA_CLEAN} AS REAL) ELSE 0 END) as area_total,
        SUM(CASE WHEN a.date_encoded IS NOT NULL AND ${IS_CLEAN(AREA_CLEAN)}
            THEN CAST(${AREA_CLEAN} AS REAL) ELSE 0 END) as area_completed,
        SUM(CASE WHEN ${IS_CLEAN(AMOUNT_CLEAN)}
            THEN CAST(${AMOUNT_CLEAN} AS REAL) ELSE 0 END) as amount_total,
        SUM(CASE WHEN a.date_encoded IS NOT NULL AND ${IS_CLEAN(AMOUNT_CLEAN)}
            THEN CAST(${AMOUNT_CLEAN} AS REAL) ELSE 0 END) as amount_completed
      FROM "Arb" a
      JOIN "Landholding" l ON a.seqno_darro = l.seqno_darro
      WHERE a.carpable = 'CARPABLE' AND a.eligibility = 'Eligible'
        AND ${ENC_STATUSES}
        ${lhWhere}
    `).get() as {
      cocrom_total: number; cocrom_completed: number;
      arb_total: number;   arb_completed: number;
      area_total: number;  area_completed: number;
      amount_total: number; amount_completed: number;
    } | undefined;

    // ── Distribution ────────────────────────────────────────────────────
    const distTotal = (rawDb.prepare(`
      SELECT COUNT(*) as n FROM "Arb" a
      JOIN "Landholding" l ON a.seqno_darro = l.seqno_darro
      WHERE a.carpable = 'CARPABLE' AND a.eligibility = 'Eligible' ${lhWhere}
    `).get() as { n: number }).n;

    const distCompleted = (rawDb.prepare(`
      SELECT COUNT(*) as n FROM "Arb" a
      JOIN "Landholding" l ON a.seqno_darro = l.seqno_darro
      WHERE a.carpable = 'CARPABLE' AND a.eligibility = 'Eligible'
        AND a.date_distributed IS NOT NULL ${lhWhere}
    `).get() as { n: number }).n;

    return NextResponse.json({
      validation: {
        total:     valTotal,
        completed: valCompleted,
      },
      encoding: {
        cocrom_total:     encAgg?.cocrom_total     ?? 0,
        cocrom_completed: encAgg?.cocrom_completed ?? 0,
        arb_total:        encAgg?.arb_total        ?? 0,
        arb_completed:    encAgg?.arb_completed    ?? 0,
        area_total:       encAgg?.area_total       ?? 0,
        area_completed:   encAgg?.area_completed   ?? 0,
        amount_total:     encAgg?.amount_total     ?? 0,
        amount_completed: encAgg?.amount_completed ?? 0,
      },
      distribution: {
        total:     distTotal,
        completed: distCompleted,
      },
    });

  } catch (err) {
    console.error("[/api/progress]", err);
    return NextResponse.json({ error: "Failed to load progress data." }, { status: 500 });
  }
}
