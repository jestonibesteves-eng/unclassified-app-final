import { NextRequest, NextResponse } from "next/server";
import { rawDb } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";

const TOKEN_KEY = "public_dashboard_token";

// ── SQL helpers ────────────────────────────────────────────────────────────
const ENC_DATE =
  `date(substr(a.date_encoded,7,4)||'-'||substr(a.date_encoded,1,2)||'-'||substr(a.date_encoded,4,2))`;

const AREA_CLEAN   = `TRIM(REPLACE(COALESCE(a.area_allocated,''),',',''))`;
const AMOUNT_CLEAN = `TRIM(REPLACE(COALESCE(a.allocated_condoned_amount,''),',',''))`;
const IS_CLEAN     = (col: string) =>
  `(${col} GLOB '[0-9]*' AND ${col} NOT GLOB '*[^0-9.]*')`;


function safeProv(s: string) { return s.replace(/'/g, "''"); }

export async function GET(req: NextRequest) {
  try {
    // Allow access via session OR a valid public token query param
    const publicToken = req.nextUrl.searchParams.get("token");
    let isPublic = false;
    if (publicToken) {
      const setting = rawDb.prepare(`SELECT value FROM "Setting" WHERE key = ?`).get(TOKEN_KEY) as { value: string } | undefined;
      if (setting?.value === publicToken) isPublic = true;
    }

    const sessionCookie = req.cookies.get(SESSION_COOKIE)?.value;
    const sessionUser   = sessionCookie ? await verifySessionToken(sessionCookie) : null;
    if (!sessionUser && !isPublic) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    // Province scope: public view = no restriction (regional);
    // non-regional session users are locked to their province
    const isRegional = isPublic || sessionUser?.office_level === "regional";
    let lhWhere  = "";
    let lhWhere2 = "";

    if (!isRegional && sessionUser?.province) {
      const p = safeProv(sessionUser.province);
      lhWhere  = `AND l.province_edited = '${p}'`;
      lhWhere2 = `AND province_edited   = '${p}'`;
    } else if (isRegional) {
      const raw = req.nextUrl.searchParams.get("provinces") ?? "";
      const provs = raw.split(",").map((s) => s.trim()).filter(Boolean);
      if (provs.length > 0) {
        const list = provs.map((p) => `'${safeProv(p)}'`).join(",");
        lhWhere  = `AND l.province_edited IN (${list})`;
        lhWhere2 = `AND province_edited   IN (${list})`;
      }
    }

    // ── Validation ──────────────────────────────────────────────────────
    const valTotal = (rawDb.prepare(
      `SELECT COUNT(*) as n FROM "Landholding" WHERE 1=1 ${lhWhere2}`
    ).get() as { n: number }).n;

    // Matches the same logic as dashboard-stats.ts validatedRowResult:
    // count = (Not Eligible for Encoding LHs) + (confirmed LHs where amendarea_validated
    // is non-null AND matches CARPABLE ARB area within 0.01)
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
        l.status = 'Not Eligible for Encoding'
        OR (
          l.amendarea_validated_confirmed = 1
          AND l.condoned_amount_confirmed = 1
          AND l.amendarea_validated IS NOT NULL
          AND l.status != 'Not Eligible for Encoding'
          AND ABS(l.amendarea_validated - COALESCE(arb_totals.total_area, 0)) < 0.01
        )
      )
      ${lhWhere2}
    `).get() as { n: number }).n;

    // Landholding-level area + amount breakdowns for Validation.
    // Mirrors dashboard-stats.ts exactly:
    //   area_total   = hybrid (amendarea_validated if set, else amendarea)  → totalValidatedArea
    //   area_completed = area for validated LHs using the same ARB-match condition → validatedArea
    //   amount_total   = condoned_amount ?? net_of_reval_no_neg              → totalCondoned
    //   amount_completed = condoned for validated LHs                        → validatedCondoned
    const LH_AREA    = `TRIM(REPLACE(COALESCE(l.amendarea,''),',',''))`;
    const LH_AREA_V  = `TRIM(REPLACE(COALESCE(l.amendarea_validated,''),',',''))`;
    const LH_AMOUNT  = `TRIM(REPLACE(COALESCE(l.condoned_amount,''),',',''))`;
    const LH_REVAL   = `TRIM(REPLACE(COALESCE(l.net_of_reval_no_neg,''),',',''))`;
    const IS_CLEAN_L = (c: string) => `(${c} GLOB '[0-9]*' AND ${c} NOT GLOB '*[^0-9.]*')`;

    // Reusable condition: same definition of "validated LH" as valCompleted above
    const VAL_COND = `(
      l.status = 'Not Eligible for Encoding'
      OR (
        l.amendarea_validated_confirmed = 1
        AND l.condoned_amount_confirmed = 1
        AND l.amendarea_validated IS NOT NULL
        AND l.status != 'Not Eligible for Encoding'
        AND ABS(l.amendarea_validated - COALESCE(arb_totals.total_area, 0)) < 0.01
      )
    )`;

    const valLhMetrics = rawDb.prepare(`
      SELECT
        -- area_total: hybrid — amendarea_validated if available, else amendarea
        SUM(CASE WHEN ${IS_CLEAN_L(LH_AREA_V)} THEN CAST(${LH_AREA_V} AS REAL)
                 WHEN ${IS_CLEAN_L(LH_AREA)}   THEN CAST(${LH_AREA}   AS REAL)
                 ELSE 0 END) as area_total,

        -- area_completed: Not Eligible uses validated??original; confirmed uses validated
        SUM(CASE
          WHEN l.status = 'Not Eligible for Encoding' THEN
            CASE WHEN ${IS_CLEAN_L(LH_AREA_V)} THEN CAST(${LH_AREA_V} AS REAL)
                 WHEN ${IS_CLEAN_L(LH_AREA)}   THEN CAST(${LH_AREA}   AS REAL)
                 ELSE 0 END
          WHEN l.amendarea_validated_confirmed = 1
               AND l.condoned_amount_confirmed = 1
               AND l.amendarea_validated IS NOT NULL
               AND l.status != 'Not Eligible for Encoding'
               AND ABS(l.amendarea_validated - COALESCE(arb_totals.total_area, 0)) < 0.01
            THEN CASE WHEN ${IS_CLEAN_L(LH_AREA_V)} THEN CAST(${LH_AREA_V} AS REAL) ELSE 0 END
          ELSE 0
        END) as area_completed,

        -- amount_total: condoned_amount ?? net_of_reval_no_neg
        SUM(CASE WHEN ${IS_CLEAN_L(LH_AMOUNT)} THEN CAST(${LH_AMOUNT} AS REAL)
                 WHEN ${IS_CLEAN_L(LH_REVAL)}  THEN CAST(${LH_REVAL}  AS REAL)
                 ELSE 0 END) as amount_total,

        -- amount_completed: condoned (with reval fallback) for validated LHs
        SUM(CASE WHEN ${VAL_COND} THEN
          CASE WHEN ${IS_CLEAN_L(LH_AMOUNT)} THEN CAST(${LH_AMOUNT} AS REAL)
               WHEN ${IS_CLEAN_L(LH_REVAL)}  THEN CAST(${LH_REVAL}  AS REAL)
               ELSE 0 END
        ELSE 0 END) as amount_completed
      FROM "Landholding" l
      LEFT JOIN (
        SELECT a.seqno_darro,
               SUM(CASE WHEN ${IS_CLEAN(AREA_CLEAN)} THEN CAST(${AREA_CLEAN} AS REAL) ELSE 0 END) AS total_area
        FROM "Arb" a
        WHERE a.carpable = 'CARPABLE'
        GROUP BY a.seqno_darro
      ) arb_totals ON arb_totals.seqno_darro = l.seqno_darro
      WHERE 1=1 ${lhWhere2}
    `).get() as {
      area_total: number; area_completed: number;
      amount_total: number; amount_completed: number;
    } | undefined;

    // ── Encoding ────────────────────────────────────────────────────────
    // Encoding agg — total = ALL eligible COCROMs (no status filter); encoded = date_encoded IS NOT NULL
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
        ${lhWhere}
    `).get() as {
      cocrom_total: number; cocrom_completed: number;
      arb_total: number;   arb_completed: number;
      area_total: number;  area_completed: number;
      amount_total: number; amount_completed: number;
    } | undefined;

    // Landholdings that have ≥1 encoded eligible COCROM, split by validation status
    const encLhBreakdown = rawDb.prepare(`
      SELECT
        COUNT(CASE WHEN l.amendarea_validated_confirmed = 1
                    AND l.condoned_amount_confirmed = 1 THEN 1 END) as lh_validated,
        COUNT(CASE WHEN NOT (l.amendarea_validated_confirmed = 1
                    AND l.condoned_amount_confirmed = 1) THEN 1 END) as lh_not_validated
      FROM (
        SELECT DISTINCT a.seqno_darro
        FROM "Arb" a
        WHERE a.carpable = 'CARPABLE' AND a.eligibility = 'Eligible'
          AND a.date_encoded IS NOT NULL
      ) enc
      JOIN "Landholding" l ON l.seqno_darro = enc.seqno_darro
      WHERE 1=1 ${lhWhere2}
    `).get() as { lh_validated: number; lh_not_validated: number } | undefined;

    // ── Distribution ────────────────────────────────────────────────────
    // Denominator = encoded COCROMs; completed = distributed
    const distAgg = rawDb.prepare(`
      SELECT
        COUNT(*) as cocrom_total,
        SUM(CASE WHEN a.date_distributed IS NOT NULL THEN 1 ELSE 0 END) as cocrom_completed,
        COUNT(DISTINCT a.arb_name) as arb_total,
        COUNT(DISTINCT CASE WHEN a.date_distributed IS NOT NULL THEN a.arb_name END) as arb_completed,
        SUM(CASE WHEN ${IS_CLEAN(AREA_CLEAN)}
            THEN CAST(${AREA_CLEAN} AS REAL) ELSE 0 END) as area_total,
        SUM(CASE WHEN a.date_distributed IS NOT NULL AND ${IS_CLEAN(AREA_CLEAN)}
            THEN CAST(${AREA_CLEAN} AS REAL) ELSE 0 END) as area_completed,
        SUM(CASE WHEN ${IS_CLEAN(AMOUNT_CLEAN)}
            THEN CAST(${AMOUNT_CLEAN} AS REAL) ELSE 0 END) as amount_total,
        SUM(CASE WHEN a.date_distributed IS NOT NULL AND ${IS_CLEAN(AMOUNT_CLEAN)}
            THEN CAST(${AMOUNT_CLEAN} AS REAL) ELSE 0 END) as amount_completed
      FROM "Arb" a
      JOIN "Landholding" l ON a.seqno_darro = l.seqno_darro
      WHERE a.carpable = 'CARPABLE' AND a.eligibility = 'Eligible'
        AND a.date_encoded IS NOT NULL
        ${lhWhere}
    `).get() as {
      cocrom_total: number; cocrom_completed: number;
      arb_total: number;   arb_completed: number;
      area_total: number;  area_completed: number;
      amount_total: number; amount_completed: number;
    } | undefined;

    // Landholdings with ≥1 distributed COCROM, split by validation status
    const distLhBreakdown = rawDb.prepare(`
      SELECT
        COUNT(CASE WHEN l.amendarea_validated_confirmed = 1
                    AND l.condoned_amount_confirmed = 1 THEN 1 END) as lh_validated,
        COUNT(CASE WHEN NOT (l.amendarea_validated_confirmed = 1
                    AND l.condoned_amount_confirmed = 1) THEN 1 END) as lh_not_validated
      FROM (
        SELECT DISTINCT a.seqno_darro
        FROM "Arb" a
        WHERE a.carpable = 'CARPABLE' AND a.eligibility = 'Eligible'
          AND a.date_distributed IS NOT NULL
      ) dist
      JOIN "Landholding" l ON l.seqno_darro = dist.seqno_darro
      WHERE 1=1 ${lhWhere2}
    `).get() as { lh_validated: number; lh_not_validated: number } | undefined;

    return NextResponse.json({
      validation: {
        total:            valTotal,     // LH count — gauge + COCROM/ARB tabs
        completed:        valCompleted, // validated LH count
        area_total:       valLhMetrics?.area_total       ?? 0,
        area_completed:   valLhMetrics?.area_completed   ?? 0,
        amount_total:     valLhMetrics?.amount_total     ?? 0,
        amount_completed: valLhMetrics?.amount_completed ?? 0,
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
        lh_validated:     encLhBreakdown?.lh_validated     ?? 0,
        lh_not_validated: encLhBreakdown?.lh_not_validated ?? 0,
      },
      distribution: {
        cocrom_total:     distAgg?.cocrom_total     ?? 0,
        cocrom_completed: distAgg?.cocrom_completed ?? 0,
        arb_total:        distAgg?.arb_total        ?? 0,
        arb_completed:    distAgg?.arb_completed    ?? 0,
        area_total:       distAgg?.area_total       ?? 0,
        area_completed:   distAgg?.area_completed   ?? 0,
        amount_total:     distAgg?.amount_total     ?? 0,
        amount_completed: distAgg?.amount_completed ?? 0,
        lh_validated:     distLhBreakdown?.lh_validated     ?? 0,
        lh_not_validated: distLhBreakdown?.lh_not_validated ?? 0,
      },
    });

  } catch (err) {
    console.error("[/api/progress]", err);
    return NextResponse.json({ error: "Failed to load progress data." }, { status: 500 });
  }
}
