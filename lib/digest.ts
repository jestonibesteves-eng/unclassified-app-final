import { rawDb, prisma } from "@/lib/db";
import { buildEmailHtml, buildSubjectLine, sendEmail } from "@/lib/email";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DigestRecipient {
  id: number;
  name: string;
  nickname: string | null;
  email: string;
  role: string;
  level: "regional" | "provincial";
  province: string | null;
  active: number;
  created_at: string;
}

export interface DigestScope {
  level: "regional" | "provincial";
  province?: string;
}

export interface CumulativeMetric {
  completed: number;
  target: number;
  balance: number;
  pct: number;
}

export interface DigestData {
  scope: DigestScope;
  weeklyLhsValidated: number;
  weeklyCocromsEncoded: number;
  cumLhsValidated: CumulativeMetric;
  cumCocromsEncoded: CumulativeMetric;
  cumCocromsForDistribution: CumulativeMetric;
  provinces?: ProvinceSummary[];
}

export interface ProvinceSummary {
  province: string;
  weeklyLhsValidated: number;
  weeklyCocromsEncoded: number;
  lhsValidatedPct: number;
  cocromsEncodedPct: number;
  vsCommitment: number;
}

// ── Week bounds ───────────────────────────────────────────────────────────────

export function getWeekBounds(now: Date = new Date()): { weekStart: Date; weekEnd: Date } {
  // Shift now into PHT by adding 8 h so UTC day/hour arithmetic gives PHT values
  const phtNow = new Date(now.getTime() + 8 * 3_600_000);
  const day = phtNow.getUTCDay(); // 0 = Sun
  const daysBack = day === 0 ? 6 : day - 1; // days since last Monday (PHT)

  const thisMondayPht = new Date(phtNow);
  thisMondayPht.setUTCDate(phtNow.getUTCDate() - daysBack);
  thisMondayPht.setUTCHours(0, 0, 0, 0); // Mon 00:00:00.000 PHT (as fake-UTC)

  // Previous week: [Mon 00:00, Sun 23:59:59.999] PHT
  const weekStartPht = new Date(thisMondayPht.getTime() - 7 * 86_400_000);
  const weekEndPht   = new Date(thisMondayPht.getTime() - 1);

  // Convert back to real UTC (subtract the 8-hour shift)
  return {
    weekStart: new Date(weekStartPht.getTime() - 8 * 3_600_000),
    weekEnd:   new Date(weekEndPht.getTime()   - 8 * 3_600_000),
  };
}

// ── Active recipients ─────────────────────────────────────────────────────────

export function getActiveRecipients(): DigestRecipient[] {
  return rawDb
    .prepare(`SELECT * FROM "DigestRecipient" WHERE active = 1 ORDER BY level, province, name`)
    .all() as DigestRecipient[];
}

// ── Digest data queries ───────────────────────────────────────────────────────

const VALIDATED_STATUSES = `'For Encoding','Fully Encoded','Partially Encoded','Fully Distributed','Partially Distributed','Not Eligible for Encoding'`;
const ENCODED_STATUSES   = `'Fully Encoded','Partially Encoded','Fully Distributed','Partially Distributed'`;

function toSqliteDt(d: Date): string {
  return d.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
}

export async function getDigestData(
  weekStart: Date,
  weekEnd: Date,
  scope: DigestScope
): Promise<DigestData> {
  const ws = toSqliteDt(weekStart);
  const we = toSqliteDt(weekEnd);

  const provFilter = scope.level === "provincial" && scope.province ? scope.province : null;

  // Section 1 — weekly activity -----------------------------------------------
  const weeklyLhsValidated = provFilter
    ? (rawDb.prepare(`SELECT COUNT(*) as c FROM "Landholding"
        WHERE updated_at >= ? AND updated_at <= ?
        AND status IN (${VALIDATED_STATUSES})
        AND province_edited = ?`).get(ws, we, provFilter) as { c: number }).c
    : (rawDb.prepare(`SELECT COUNT(*) as c FROM "Landholding"
        WHERE updated_at >= ? AND updated_at <= ?
        AND status IN (${VALIDATED_STATUSES})`).get(ws, we) as { c: number }).c;

  const weeklyCocromsEncoded = provFilter
    ? (rawDb.prepare(`SELECT COUNT(*) as c FROM "Landholding"
        WHERE updated_at >= ? AND updated_at <= ?
        AND status IN (${ENCODED_STATUSES})
        AND province_edited = ?`).get(ws, we, provFilter) as { c: number }).c
    : (rawDb.prepare(`SELECT COUNT(*) as c FROM "Landholding"
        WHERE updated_at >= ? AND updated_at <= ?
        AND status IN (${ENCODED_STATUSES})`).get(ws, we) as { c: number }).c;

  // Section 2 — cumulative LHs validated --------------------------------------
  const lhRows = provFilter
    ? rawDb.prepare(`SELECT COUNT(*) as total,
        COUNT(CASE WHEN status IN (${VALIDATED_STATUSES}) THEN 1 END) as completed
        FROM "Landholding" WHERE province_edited = ?`).get(provFilter) as { total: number; completed: number }
    : rawDb.prepare(`SELECT COUNT(*) as total,
        COUNT(CASE WHEN status IN (${VALIDATED_STATUSES}) THEN 1 END) as completed
        FROM "Landholding"`).get() as { total: number; completed: number };

  const cumLhsValidated = metric(lhRows.completed, lhRows.total);

  // Section 2 — cumulative COCROMs encoded ------------------------------------
  const encRow = provFilter
    ? rawDb.prepare(`SELECT
        COUNT(CASE WHEN a.eligibility = 'Eligible' AND l.status != 'Not Eligible for Encoding'
                        AND a.date_encoded IS NOT NULL AND a.date_encoded != '' THEN 1 END) as completed,
        COUNT(CASE WHEN a.eligibility = 'Eligible' AND l.status != 'Not Eligible for Encoding' THEN 1 END) as total
        FROM "Arb" a
        JOIN "Landholding" l ON a.seqno_darro = l.seqno_darro
        WHERE l.province_edited = ?`).get(provFilter) as { completed: number; total: number }
    : rawDb.prepare(`SELECT
        COUNT(CASE WHEN a.eligibility = 'Eligible' AND l.status != 'Not Eligible for Encoding'
                        AND a.date_encoded IS NOT NULL AND a.date_encoded != '' THEN 1 END) as completed,
        COUNT(CASE WHEN a.eligibility = 'Eligible' AND l.status != 'Not Eligible for Encoding' THEN 1 END) as total
        FROM "Arb" a
        JOIN "Landholding" l ON a.seqno_darro = l.seqno_darro`).get() as { completed: number; total: number };

  const cumCocromsEncoded = metric(encRow.completed, encRow.total);

  // Section 2 — COCROMs distributed vs commitment target ----------------------
  const distRow = provFilter
    ? rawDb.prepare(`SELECT
        COUNT(CASE WHEN a.eligibility = 'Eligible' AND l.status != 'Not Eligible for Encoding'
                        AND a.date_distributed IS NOT NULL AND a.date_distributed != '' THEN 1 END) as available
        FROM "Arb" a
        JOIN "Landholding" l ON a.seqno_darro = l.seqno_darro
        WHERE l.province_edited = ?`).get(provFilter) as { available: number }
    : rawDb.prepare(`SELECT
        COUNT(CASE WHEN a.eligibility = 'Eligible' AND l.status != 'Not Eligible for Encoding'
                        AND a.date_distributed IS NOT NULL AND a.date_distributed != '' THEN 1 END) as available
        FROM "Arb" a
        JOIN "Landholding" l ON a.seqno_darro = l.seqno_darro`).get() as { available: number };

  const commitment = await getCommitment(scope);
  const cumCocromsForDistribution = metric(distRow.available, commitment);

  // Provincial breakdown (regional emails only) --------------------------------
  let provinces: ProvinceSummary[] | undefined;
  if (scope.level === "regional") {
    const provinceNames: string[] = (
      rawDb
        .prepare(`SELECT DISTINCT province_edited FROM "Landholding" WHERE province_edited IS NOT NULL ORDER BY province_edited`)
        .all() as { province_edited: string }[]
    ).map((r) => r.province_edited);

    provinces = await Promise.all(
      provinceNames.map((province) => getProvinceSummary(ws, we, province))
    );
  }

  return {
    scope,
    weeklyLhsValidated,
    weeklyCocromsEncoded,
    cumLhsValidated,
    cumCocromsEncoded,
    cumCocromsForDistribution,
    provinces,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function metric(completed: number, target: number): CumulativeMetric {
  const balance = completed - target;
  const pct     = target > 0 ? Math.round((completed / target) * 100) : 0;
  return { completed, target, balance, pct };
}

async function getCommitment(scope: DigestScope): Promise<number> {
  if (scope.level === "provincial" && scope.province) {
    const row = await prisma.commitmentTarget.findFirst({
      where: { region: "V", province: scope.province },
    });
    return row?.committed ?? 0;
  }
  const row = await prisma.commitmentTarget.findFirst({
    where: { region: "V", province: null },
  });
  return row?.committed ?? 0;
}

async function getProvinceSummary(
  ws: string,
  we: string,
  province: string
): Promise<ProvinceSummary> {
  const wLhs = (
    rawDb.prepare(`SELECT COUNT(*) as c FROM "Landholding"
        WHERE updated_at >= ? AND updated_at <= ?
        AND status IN (${VALIDATED_STATUSES})
        AND province_edited = ?`).get(ws, we, province) as { c: number }
  ).c;

  const wEnc = (
    rawDb.prepare(`SELECT COUNT(*) as c FROM "Landholding"
        WHERE updated_at >= ? AND updated_at <= ?
        AND status IN (${ENCODED_STATUSES})
        AND province_edited = ?`).get(ws, we, province) as { c: number }
  ).c;

  const lhRow = rawDb.prepare(`SELECT COUNT(*) as total,
      COUNT(CASE WHEN status IN (${VALIDATED_STATUSES}) THEN 1 END) as completed
      FROM "Landholding" WHERE province_edited = ?`).get(province) as { total: number; completed: number };

  const encRow = rawDb.prepare(`SELECT
      COUNT(CASE WHEN a.eligibility = 'Eligible' AND l.status != 'Not Eligible for Encoding'
                      AND a.date_encoded IS NOT NULL AND a.date_encoded != '' THEN 1 END) as completed,
      COUNT(CASE WHEN a.eligibility = 'Eligible' AND l.status != 'Not Eligible for Encoding' THEN 1 END) as total
      FROM "Arb" a
      JOIN "Landholding" l ON a.seqno_darro = l.seqno_darro
      WHERE l.province_edited = ?`).get(province) as { completed: number; total: number };

  const distRow = rawDb.prepare(`SELECT
      COUNT(CASE WHEN a.eligibility = 'Eligible' AND l.status != 'Not Eligible for Encoding'
                      AND a.date_distributed IS NOT NULL AND a.date_distributed != '' THEN 1 END) as available
      FROM "Arb" a
      JOIN "Landholding" l ON a.seqno_darro = l.seqno_darro
      WHERE l.province_edited = ?`).get(province) as { available: number };

  const target  = await getCommitment({ level: "provincial", province });
  const balance = distRow.available - target;

  return {
    province,
    weeklyLhsValidated: wLhs,
    weeklyCocromsEncoded: wEnc,
    lhsValidatedPct: lhRow.total > 0 ? Math.round((lhRow.completed / lhRow.total) * 100) : 0,
    cocromsEncodedPct: encRow.total > 0 ? Math.round((encRow.completed / encRow.total) * 100) : 0,
    vsCommitment: balance,
  };
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

export async function sendWeeklyDigest(
  weekStart: Date,
  weekEnd: Date
): Promise<{ sent: number; failed: number; recipients: string[] }> {
  const allRecipients = getActiveRecipients();
  if (allRecipients.length === 0) return { sent: 0, failed: 0, recipients: [] };

  const regionalData = await getDigestData(weekStart, weekEnd, { level: "regional" });

  const provinces = [
    ...new Set(
      allRecipients
        .filter((r) => r.level === "provincial" && r.province)
        .map((r) => r.province as string)
    ),
  ];
  const provincialDataMap = new Map<string, DigestData>();
  for (const province of provinces) {
    provincialDataMap.set(
      province,
      await getDigestData(weekStart, weekEnd, { level: "provincial", province })
    );
  }

  let sent = 0;
  let failed = 0;
  const sentRecipients: string[] = [];

  for (const recipient of allRecipients) {
    const data =
      recipient.level === "regional"
        ? regionalData
        : provincialDataMap.get(recipient.province ?? "") ?? regionalData;

    const subject = buildSubjectLine(
      recipient.level,
      recipient.province ?? undefined,
      weekStart,
      weekEnd
    );
    const html = buildEmailHtml(recipient.level, recipient, data, weekStart, weekEnd);

    const result = await sendEmail(recipient.email, subject, html);
    if (result.ok) {
      sent++;
      sentRecipients.push(recipient.email);
    } else {
      failed++;
      console.error(`[digest] Failed to send to ${recipient.email}: ${result.error}`);
    }
  }

  return { sent, failed, recipients: sentRecipients };
}
