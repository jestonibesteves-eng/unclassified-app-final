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

    const rawPeriod = req.nextUrl.searchParams.get("period") ?? "week";
    const period = (["day", "week", "month"].includes(rawPeriod) ? rawPeriod : "week") as
      "day" | "week" | "month";

    // Province scope for non-regional users
    const prov = sessionUser.office_level !== "regional" && sessionUser.province
      ? sessionUser.province : null;
    const lhWhere  = prov ? `AND l.province_edited = '${safeProv(prov)}'` : "";
    const lhWhere2 = prov ? `AND province_edited   = '${safeProv(prov)}'` : "";

    // Period bucketing helpers
    const auditFmt =
      period === "day"  ? "date(al.created_at)"
      : period === "week" ? "strftime('%Y-%W',al.created_at)"
      :                     "strftime('%Y-%m',al.created_at)";
    const encFmt =
      period === "day"  ? ENC_DATE
      : period === "week" ? `strftime('%Y-%W',${ENC_DATE})`
      :                     `strftime('%Y-%m',${ENC_DATE})`;
    const lookback =
      period === "day" ? "-30 days" : period === "week" ? "-84 days" : "-365 days";

    // ── Validation ──────────────────────────────────────────────────────
    const valTotal = (rawDb.prepare(
      `SELECT COUNT(*) as n FROM "Landholding" WHERE 1=1 ${lhWhere2}`
    ).get() as { n: number }).n;

    const valCompleted = (rawDb.prepare(`
      SELECT COUNT(*) as n FROM "Landholding" l
      WHERE (
        l.amendarea_validated_confirmed = 1
        AND l.condoned_amount_confirmed = 1
        AND ABS(
          COALESCE(l.amendarea_validated, l.amendarea, 0) -
          COALESCE((
            SELECT SUM(CASE
              WHEN ${IS_CLEAN(AREA_CLEAN)} THEN CAST(${AREA_CLEAN} AS REAL)
              ELSE 0 END)
            FROM "Arb" a WHERE a.seqno_darro = l.seqno_darro AND a.carpable = 'CARPABLE'
          ), 0)
        ) < 0.01
      )
      OR l.status = 'Not Eligible for Encoding'
      ${lhWhere2}
    `).get() as { n: number }).n;

    const valSeries = rawDb.prepare(`
      SELECT ${auditFmt} as d, COUNT(DISTINCT al.seqno_darro) as n
      FROM "AuditLog" al
      JOIN "Landholding" l ON al.seqno_darro = l.seqno_darro
      WHERE (
        (al.field_changed IN ('condoned_amount_confirmed','amendarea_validated_confirmed')
          AND al.new_value = '1')
        OR (al.field_changed = 'status' AND al.new_value = 'Not Eligible for Encoding')
      )
      AND al.created_at >= date('now','${lookback}')
      ${lhWhere}
      GROUP BY ${auditFmt}
      ORDER BY d ASC
    `).all() as { d: string; n: number }[];

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

    const encSeries = rawDb.prepare(`
      SELECT
        ${encFmt} as d,
        COUNT(*) as cocrom,
        COUNT(DISTINCT a.arb_name) as arb,
        SUM(CASE WHEN ${IS_CLEAN(AREA_CLEAN)}
            THEN CAST(${AREA_CLEAN} AS REAL) ELSE 0 END) as area,
        SUM(CASE WHEN ${IS_CLEAN(AMOUNT_CLEAN)}
            THEN CAST(${AMOUNT_CLEAN} AS REAL) ELSE 0 END) as amount
      FROM "Arb" a
      JOIN "Landholding" l ON a.seqno_darro = l.seqno_darro
      WHERE a.carpable = 'CARPABLE' AND a.eligibility = 'Eligible'
        AND ${ENC_STATUSES}
        AND a.date_encoded IS NOT NULL
        AND ${ENC_DATE} >= date('now','${lookback}')
        ${lhWhere}
      GROUP BY ${encFmt}
      ORDER BY d ASC
    `).all() as { d: string; cocrom: number; arb: number; area: number; amount: number }[];

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

    const distSeries = rawDb.prepare(`
      SELECT ${auditFmt} as d, COUNT(*) as n
      FROM "AuditLog" al
      JOIN "Landholding" l ON al.seqno_darro = l.seqno_darro
      WHERE al.field_changed = 'date_distributed'
        AND al.new_value IS NOT NULL AND al.new_value != ''
        AND al.created_at >= date('now','${lookback}')
        ${lhWhere}
      GROUP BY ${auditFmt}
      ORDER BY d ASC
    `).all() as { d: string; n: number }[];

    return NextResponse.json({
      period,
      validation: {
        total:     valTotal,
        completed: valCompleted,
        series:    valSeries.map((r) => ({ date: r.d, count: r.n })),
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
        series: encSeries.map((r) => ({
          date: r.d, cocrom: r.cocrom, arb: r.arb, area: r.area, amount: r.amount,
        })),
      },
      distribution: {
        total:     distTotal,
        completed: distCompleted,
        series:    distSeries.map((r) => ({ date: r.d, count: r.n })),
      },
    });

  } catch (err) {
    console.error("[/api/progress]", err);
    return NextResponse.json({ error: "Failed to load progress data." }, { status: 500 });
  }
}
