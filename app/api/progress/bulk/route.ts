import { NextRequest, NextResponse } from "next/server";
import { rawDb } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";

const TOKEN_KEY   = "public_dashboard_token";
const CACHE_TTL   = 10_000; // 10 seconds

type CacheEntry = { data: unknown; expiresAt: number };
const g = globalThis as unknown as { _bulkCache?: Map<string, CacheEntry> };
if (!g._bulkCache) g._bulkCache = new Map();
const cache = g._bulkCache;

// ── SQL helpers (same as /api/progress) ────────────────────────────────────
const AREA_CLEAN   = `TRIM(REPLACE(COALESCE(a.area_allocated,''),',',''))`;
const AMOUNT_CLEAN = `TRIM(REPLACE(COALESCE(a.allocated_condoned_amount,''),',',''))`;
const IS_CLEAN     = (col: string) =>
  `(${col} GLOB '[0-9]*' AND ${col} NOT GLOB '*[^0-9.]*')`;

const LH_AREA    = `TRIM(REPLACE(COALESCE(l.amendarea,''),',',''))`;
const LH_AREA_V  = `TRIM(REPLACE(COALESCE(l.amendarea_validated,''),',',''))`;
const LH_AMOUNT  = `TRIM(REPLACE(COALESCE(l.condoned_amount,''),',',''))`;
const LH_REVAL   = `TRIM(REPLACE(COALESCE(l.net_of_reval_no_neg,''),',',''))`;
const IS_CLEAN_L = (c: string) => `(${c} GLOB '[0-9]*' AND ${c} NOT GLOB '*[^0-9.]*')`;

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

export type BulkEntry = {
  committed_cocroms: number;
  validation: {
    total: number; completed: number;
    area_total: number; area_completed: number;
    amount_total: number; amount_completed: number;
  };
  encoding: {
    cocrom_total: number; cocrom_completed: number;
    arb_total: number;   arb_completed: number;
    area_total: number;  area_completed: number;
    amount_total: number; amount_completed: number;
    lh_validated: number; lh_not_validated: number;
  };
  distribution: {
    cocrom_total: number; cocrom_completed: number;
    arb_total: number;   arb_completed: number;
    area_total: number;  area_completed: number;
    amount_total: number; amount_completed: number;
    lh_validated: number; lh_not_validated: number;
  };
};

export type BulkProgressResponse = {
  region: BulkEntry;
  provinces: Record<string, BulkEntry>;
};

const PROVINCES = [
  "ALBAY", "CAMARINES NORTE", "CAMARINES SUR - I",
  "CAMARINES SUR - II", "CATANDUANES", "MASBATE", "SORSOGON",
];

function emptyEntry(): BulkEntry {
  return {
    committed_cocroms: 0,
    validation:   { total: 0, completed: 0, area_total: 0, area_completed: 0, amount_total: 0, amount_completed: 0 },
    encoding:     { cocrom_total: 0, cocrom_completed: 0, arb_total: 0, arb_completed: 0, area_total: 0, area_completed: 0, amount_total: 0, amount_completed: 0, lh_validated: 0, lh_not_validated: 0 },
    distribution: { cocrom_total: 0, cocrom_completed: 0, arb_total: 0, arb_completed: 0, area_total: 0, area_completed: 0, amount_total: 0, amount_completed: 0, lh_validated: 0, lh_not_validated: 0 },
  };
}

export async function GET(req: NextRequest) {
  try {
    // Auth: session OR public token
    const publicToken = req.nextUrl.searchParams.get("token");
    let isAuthed = false;
    if (publicToken) {
      const setting = rawDb.prepare(`SELECT value FROM "Setting" WHERE key = ?`).get(TOKEN_KEY) as { value: string } | undefined;
      if (setting?.value === publicToken) isAuthed = true;
    }
    if (!isAuthed) {
      const sessionCookie = req.cookies.get(SESSION_COOKIE)?.value;
      const sessionUser   = sessionCookie ? await verifySessionToken(sessionCookie) : null;
      if (!sessionUser) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
      // Only regional users can see the full province breakdown
      if (sessionUser.office_level !== "regional") {
        return NextResponse.json({ error: "Regional access required." }, { status: 403 });
      }
      isAuthed = true;
    }

    // ── Cache check ───────────────────────────────────────────────────────
    const cacheKey = publicToken ?? "__session__";
    const cached   = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json(cached.data);
    }

    // ── Build result map ──────────────────────────────────────────────────
    const result: Record<string, BulkEntry> = {};
    for (const p of [...PROVINCES, "__REGION__"]) result[p] = emptyEntry();

    // ── Validation total (grouped by province) ────────────────────────────
    const valTotals = rawDb.prepare(
      `SELECT province_edited, COUNT(*) as n FROM "Landholding" GROUP BY province_edited`
    ).all() as { province_edited: string | null; n: number }[];
    let regionValTotal = 0;
    for (const row of valTotals) {
      const p = row.province_edited?.toUpperCase().trim() ?? "";
      if (result[p]) result[p].validation.total = row.n;
      regionValTotal += row.n;
    }
    result["__REGION__"].validation.total = regionValTotal;

    // ── Validation completed (grouped by province) ────────────────────────
    const valCompleted = rawDb.prepare(`
      SELECT l.province_edited, COUNT(*) as n
      FROM "Landholding" l
      LEFT JOIN (
        SELECT a.seqno_darro,
               SUM(CASE WHEN ${IS_CLEAN(AREA_CLEAN)} THEN CAST(${AREA_CLEAN} AS REAL) ELSE 0 END) AS total_area
        FROM "Arb" a WHERE a.carpable = 'CARPABLE'
        GROUP BY a.seqno_darro
      ) arb_totals ON arb_totals.seqno_darro = l.seqno_darro
      WHERE ${VAL_COND}
      GROUP BY l.province_edited
    `).all() as { province_edited: string | null; n: number }[];
    let regionValCompleted = 0;
    for (const row of valCompleted) {
      const p = row.province_edited?.toUpperCase().trim() ?? "";
      if (result[p]) result[p].validation.completed = row.n;
      regionValCompleted += row.n;
    }
    result["__REGION__"].validation.completed = regionValCompleted;

    // ── Validation area/amount metrics (grouped by province) ──────────────
    const valMetrics = rawDb.prepare(`
      SELECT
        l.province_edited,
        SUM(CASE WHEN ${IS_CLEAN_L(LH_AREA_V)} THEN CAST(${LH_AREA_V} AS REAL)
                 WHEN ${IS_CLEAN_L(LH_AREA)}   THEN CAST(${LH_AREA}   AS REAL)
                 ELSE 0 END) as area_total,
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
        SUM(CASE WHEN ${IS_CLEAN_L(LH_AMOUNT)} THEN CAST(${LH_AMOUNT} AS REAL)
                 WHEN ${IS_CLEAN_L(LH_REVAL)}  THEN CAST(${LH_REVAL}  AS REAL)
                 ELSE 0 END) as amount_total,
        SUM(CASE WHEN ${VAL_COND} THEN
          CASE WHEN ${IS_CLEAN_L(LH_AMOUNT)} THEN CAST(${LH_AMOUNT} AS REAL)
               WHEN ${IS_CLEAN_L(LH_REVAL)}  THEN CAST(${LH_REVAL}  AS REAL)
               ELSE 0 END
        ELSE 0 END) as amount_completed
      FROM "Landholding" l
      LEFT JOIN (
        SELECT a.seqno_darro,
               SUM(CASE WHEN ${IS_CLEAN(AREA_CLEAN)} THEN CAST(${AREA_CLEAN} AS REAL) ELSE 0 END) AS total_area
        FROM "Arb" a WHERE a.carpable = 'CARPABLE'
        GROUP BY a.seqno_darro
      ) arb_totals ON arb_totals.seqno_darro = l.seqno_darro
      GROUP BY l.province_edited
    `).all() as { province_edited: string | null; area_total: number; area_completed: number; amount_total: number; amount_completed: number }[];
    let rAreaTotal = 0, rAreaCompleted = 0, rAmountTotal = 0, rAmountCompleted = 0;
    for (const row of valMetrics) {
      const p = row.province_edited?.toUpperCase().trim() ?? "";
      if (result[p]) {
        result[p].validation.area_total      = row.area_total;
        result[p].validation.area_completed  = row.area_completed;
        result[p].validation.amount_total    = row.amount_total;
        result[p].validation.amount_completed = row.amount_completed;
      }
      rAreaTotal      += row.area_total;
      rAreaCompleted  += row.area_completed;
      rAmountTotal    += row.amount_total;
      rAmountCompleted += row.amount_completed;
    }
    result["__REGION__"].validation.area_total      = rAreaTotal;
    result["__REGION__"].validation.area_completed  = rAreaCompleted;
    result["__REGION__"].validation.amount_total    = rAmountTotal;
    result["__REGION__"].validation.amount_completed = rAmountCompleted;

    // ── Encoding agg (grouped by province) ───────────────────────────────
    const encAgg = rawDb.prepare(`
      SELECT
        l.province_edited,
        COUNT(*) as cocrom_total,
        SUM(CASE WHEN a.date_encoded IS NOT NULL THEN 1 ELSE 0 END) as cocrom_completed,
        COUNT(DISTINCT a.arb_name) as arb_total,
        COUNT(DISTINCT CASE WHEN a.date_encoded IS NOT NULL THEN a.arb_name ELSE NULL END) as arb_completed,
        SUM(CASE WHEN ${IS_CLEAN(AREA_CLEAN)} THEN CAST(${AREA_CLEAN} AS REAL) ELSE 0 END) as area_total,
        SUM(CASE WHEN a.date_encoded IS NOT NULL AND ${IS_CLEAN(AREA_CLEAN)} THEN CAST(${AREA_CLEAN} AS REAL) ELSE 0 END) as area_completed,
        SUM(CASE WHEN ${IS_CLEAN(AMOUNT_CLEAN)} THEN CAST(${AMOUNT_CLEAN} AS REAL) ELSE 0 END) as amount_total,
        SUM(CASE WHEN a.date_encoded IS NOT NULL AND ${IS_CLEAN(AMOUNT_CLEAN)} THEN CAST(${AMOUNT_CLEAN} AS REAL) ELSE 0 END) as amount_completed
      FROM "Arb" a
      JOIN "Landholding" l ON a.seqno_darro = l.seqno_darro
      WHERE a.carpable = 'CARPABLE' AND a.eligibility = 'Eligible'
      GROUP BY l.province_edited
    `).all() as { province_edited: string | null; cocrom_total: number; cocrom_completed: number; arb_total: number; arb_completed: number; area_total: number; area_completed: number; amount_total: number; amount_completed: number }[];
    let rEnc = { cocrom_total: 0, cocrom_completed: 0, arb_total: 0, arb_completed: 0, area_total: 0, area_completed: 0, amount_total: 0, amount_completed: 0 };
    for (const row of encAgg) {
      const p = row.province_edited?.toUpperCase().trim() ?? "";
      if (result[p]) {
        result[p].encoding.cocrom_total      = row.cocrom_total;
        result[p].encoding.cocrom_completed  = row.cocrom_completed;
        result[p].encoding.arb_total         = row.arb_total;
        result[p].encoding.arb_completed     = row.arb_completed;
        result[p].encoding.area_total        = row.area_total;
        result[p].encoding.area_completed    = row.area_completed;
        result[p].encoding.amount_total      = row.amount_total;
        result[p].encoding.amount_completed  = row.amount_completed;
      }
      rEnc.cocrom_total     += row.cocrom_total;
      rEnc.cocrom_completed += row.cocrom_completed;
      rEnc.arb_total        += row.arb_total;
      rEnc.arb_completed    += row.arb_completed;
      rEnc.area_total       += row.area_total;
      rEnc.area_completed   += row.area_completed;
      rEnc.amount_total     += row.amount_total;
      rEnc.amount_completed += row.amount_completed;
    }
    Object.assign(result["__REGION__"].encoding, rEnc);

    // ── Encoding LH breakdown (grouped by province) ───────────────────────
    const encLh = rawDb.prepare(`
      SELECT
        l.province_edited,
        COUNT(CASE WHEN l.amendarea_validated_confirmed = 1 AND l.condoned_amount_confirmed = 1 THEN 1 END) as lh_validated,
        COUNT(CASE WHEN NOT (l.amendarea_validated_confirmed = 1 AND l.condoned_amount_confirmed = 1) THEN 1 END) as lh_not_validated
      FROM (
        SELECT DISTINCT a.seqno_darro
        FROM "Arb" a
        WHERE a.carpable = 'CARPABLE' AND a.eligibility = 'Eligible' AND a.date_encoded IS NOT NULL
      ) enc
      JOIN "Landholding" l ON l.seqno_darro = enc.seqno_darro
      GROUP BY l.province_edited
    `).all() as { province_edited: string | null; lh_validated: number; lh_not_validated: number }[];
    let rEncLhV = 0, rEncLhN = 0;
    for (const row of encLh) {
      const p = row.province_edited?.toUpperCase().trim() ?? "";
      if (result[p]) {
        result[p].encoding.lh_validated     = row.lh_validated;
        result[p].encoding.lh_not_validated = row.lh_not_validated;
      }
      rEncLhV += row.lh_validated;
      rEncLhN += row.lh_not_validated;
    }
    result["__REGION__"].encoding.lh_validated     = rEncLhV;
    result["__REGION__"].encoding.lh_not_validated = rEncLhN;

    // ── Distribution agg (grouped by province) ───────────────────────────
    const distAgg = rawDb.prepare(`
      SELECT
        l.province_edited,
        COUNT(*) as cocrom_total,
        SUM(CASE WHEN a.date_distributed IS NOT NULL THEN 1 ELSE 0 END) as cocrom_completed,
        COUNT(DISTINCT a.arb_name) as arb_total,
        COUNT(DISTINCT CASE WHEN a.date_distributed IS NOT NULL THEN a.arb_name END) as arb_completed,
        SUM(CASE WHEN ${IS_CLEAN(AREA_CLEAN)} THEN CAST(${AREA_CLEAN} AS REAL) ELSE 0 END) as area_total,
        SUM(CASE WHEN a.date_distributed IS NOT NULL AND ${IS_CLEAN(AREA_CLEAN)} THEN CAST(${AREA_CLEAN} AS REAL) ELSE 0 END) as area_completed,
        SUM(CASE WHEN ${IS_CLEAN(AMOUNT_CLEAN)} THEN CAST(${AMOUNT_CLEAN} AS REAL) ELSE 0 END) as amount_total,
        SUM(CASE WHEN a.date_distributed IS NOT NULL AND ${IS_CLEAN(AMOUNT_CLEAN)} THEN CAST(${AMOUNT_CLEAN} AS REAL) ELSE 0 END) as amount_completed
      FROM "Arb" a
      JOIN "Landholding" l ON a.seqno_darro = l.seqno_darro
      WHERE a.carpable = 'CARPABLE' AND a.eligibility = 'Eligible' AND a.date_encoded IS NOT NULL
      GROUP BY l.province_edited
    `).all() as { province_edited: string | null; cocrom_total: number; cocrom_completed: number; arb_total: number; arb_completed: number; area_total: number; area_completed: number; amount_total: number; amount_completed: number }[];
    let rDist = { cocrom_total: 0, cocrom_completed: 0, arb_total: 0, arb_completed: 0, area_total: 0, area_completed: 0, amount_total: 0, amount_completed: 0 };
    for (const row of distAgg) {
      const p = row.province_edited?.toUpperCase().trim() ?? "";
      if (result[p]) {
        result[p].distribution.cocrom_total      = row.cocrom_total;
        result[p].distribution.cocrom_completed  = row.cocrom_completed;
        result[p].distribution.arb_total         = row.arb_total;
        result[p].distribution.arb_completed     = row.arb_completed;
        result[p].distribution.area_total        = row.area_total;
        result[p].distribution.area_completed    = row.area_completed;
        result[p].distribution.amount_total      = row.amount_total;
        result[p].distribution.amount_completed  = row.amount_completed;
      }
      rDist.cocrom_total     += row.cocrom_total;
      rDist.cocrom_completed += row.cocrom_completed;
      rDist.arb_total        += row.arb_total;
      rDist.arb_completed    += row.arb_completed;
      rDist.area_total       += row.area_total;
      rDist.area_completed   += row.area_completed;
      rDist.amount_total     += row.amount_total;
      rDist.amount_completed += row.amount_completed;
    }
    Object.assign(result["__REGION__"].distribution, rDist);

    // ── Distribution LH breakdown (grouped by province) ───────────────────
    const distLh = rawDb.prepare(`
      SELECT
        l.province_edited,
        COUNT(CASE WHEN l.amendarea_validated_confirmed = 1 AND l.condoned_amount_confirmed = 1 THEN 1 END) as lh_validated,
        COUNT(CASE WHEN NOT (l.amendarea_validated_confirmed = 1 AND l.condoned_amount_confirmed = 1) THEN 1 END) as lh_not_validated
      FROM (
        SELECT DISTINCT a.seqno_darro
        FROM "Arb" a
        WHERE a.carpable = 'CARPABLE' AND a.eligibility = 'Eligible' AND a.date_distributed IS NOT NULL
      ) dist
      JOIN "Landholding" l ON l.seqno_darro = dist.seqno_darro
      GROUP BY l.province_edited
    `).all() as { province_edited: string | null; lh_validated: number; lh_not_validated: number }[];
    let rDistLhV = 0, rDistLhN = 0;
    for (const row of distLh) {
      const p = row.province_edited?.toUpperCase().trim() ?? "";
      if (result[p]) {
        result[p].distribution.lh_validated     = row.lh_validated;
        result[p].distribution.lh_not_validated = row.lh_not_validated;
      }
      rDistLhV += row.lh_validated;
      rDistLhN += row.lh_not_validated;
    }
    result["__REGION__"].distribution.lh_validated     = rDistLhV;
    result["__REGION__"].distribution.lh_not_validated = rDistLhN;

    // ── CommitmentTarget per province ─────────────────────────────────────
    const commitRows = rawDb.prepare(
      `SELECT province, committed FROM "CommitmentTarget" WHERE region = 'V'`
    ).all() as { province: string | null; committed: number }[];
    for (const row of commitRows) {
      if (row.province === null) {
        result["__REGION__"].committed_cocroms = row.committed;
      } else {
        const p = row.province.toUpperCase().trim();
        if (result[p]) result[p].committed_cocroms = row.committed;
      }
    }

    // ── Assemble response ─────────────────────────────────────────────────
    const provinces: Record<string, BulkEntry> = {};
    for (const p of PROVINCES) provinces[p] = result[p];

    const payload: BulkProgressResponse = { region: result["__REGION__"], provinces };
    cache.set(cacheKey, { data: payload, expiresAt: Date.now() + CACHE_TTL });
    return NextResponse.json(payload);

  } catch (err) {
    console.error("[/api/progress/bulk]", err);
    return NextResponse.json({ error: "Failed to load bulk progress data." }, { status: 500 });
  }
}
