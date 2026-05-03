import nodemailer from "nodemailer";
import type { DigestData, DigestRecipient } from "@/lib/digest";

// ── Transport ─────────────────────────────────────────────────────────────────

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST!,
    port: parseInt(process.env.SMTP_PORT ?? "465"),
    secure: true,
    auth: {
      user: process.env.SMTP_USER!,
      pass: process.env.SMTP_PASS!,
    },
  });
}

// ── Date helpers ──────────────────────────────────────────────────────────────

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function phtDate(utc: Date): Date {
  return new Date(utc.getTime() + 8 * 3_600_000);
}

function fmtShort(utc: Date): string {
  const d = phtDate(utc);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function fmtYear(utc: Date): string {
  return String(phtDate(utc).getUTCFullYear());
}

// ── Subject line ──────────────────────────────────────────────────────────────

export function buildSubjectLine(
  variant: "regional" | "provincial",
  province: string | undefined,
  weekStart: Date,
  weekEnd: Date
): string {
  const range = `${fmtShort(weekStart)} – ${fmtShort(weekEnd)}, ${fmtYear(weekEnd)}`;
  if (variant === "provincial" && province) {
    return `📊 DAR Region V — Weekly Progress Digest · ${province} · ${range}`;
  }
  return `📊 DAR Region V — Weekly Progress Digest · ${range}`;
}

// ── Progress bar (table-safe inline HTML) ─────────────────────────────────────

function progressBar(pct: number, color = "#16a34a"): string {
  const clamped = Math.min(100, Math.max(0, pct));
  return `<table cellpadding="0" cellspacing="0" border="0" style="display:inline-table;vertical-align:middle;">
      <tr>
        <td style="width:80px;height:6px;background:#e2e8f0;border-radius:99px;overflow:hidden;padding:0;">
          <div style="width:${clamped}%;height:6px;background:${color};border-radius:99px;"></div>
        </td>
        <td style="padding-left:8px;font-size:11px;font-weight:600;color:#374151;white-space:nowrap;">${clamped}%</td>
      </tr>
    </table>`;
}

function balanceCell(balance: number): string {
  if (balance >= 0) {
    return `<span style="color:#16a34a;font-weight:600;font-size:12px;">+${balance.toLocaleString()} ahead</span>`;
  }
  return `<span style="color:#ef4444;font-weight:600;font-size:12px;">${balance.toLocaleString()} remaining</span>`;
}

// ── Deadline Countdown badge (static snapshot at send time, shown in header) ───

function buildCountdownBadge(targetDate: string, now: Date): string {
  const deadlineMs = new Date(`${targetDate}T00:00:00+08:00`).getTime();
  const msLeft = Math.max(0, deadlineMs - now.getTime());
  const days  = Math.floor(msLeft / 86400000);
  const weeks = Math.ceil(days / 7);

  const [y, m, d] = targetDate.split("-").map(Number);
  const dateLabel = new Date(y, m - 1, d).toLocaleDateString("en-PH", {
    year: "numeric", month: "long", day: "numeric",
  });

  return `<span style="display:inline-block;background:rgba(251,191,36,0.13);border:1px solid rgba(251,191,36,0.32);border-radius:8px;padding:8px 14px;font-size:11px;font-weight:600;color:rgba(251,191,36,0.92);white-space:nowrap;font-family:Arial,Helvetica,sans-serif;text-align:right;line-height:1.5;">${days} days (${weeks} wks) before<br>${dateLabel}</span>`;
}

// ── Email HTML ────────────────────────────────────────────────────────────────

export function buildEmailHtml(
  variant: "regional" | "provincial",
  recipient: DigestRecipient,
  data: DigestData,
  weekStart: Date,
  weekEnd: Date,
  targetDate: string = "2026-06-15"
): string {
  const weekRange   = `${fmtShort(weekStart)} – ${fmtShort(weekEnd)}, ${fmtYear(weekEnd)}`;
  const displayName = `${recipient.role} ${recipient.nickname?.trim() || recipient.name}`;

  const provinceChip =
    variant === "provincial" && data.scope.province
      ? `<tr><td style="padding-top:12px;">
           <span style="display:inline-block;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.2);border-radius:6px;padding:5px 12px;font-size:12px;color:rgba(255,255,255,0.9);font-weight:600;">
             📍 Province of ${data.scope.province}
           </span>
         </td></tr>`
      : "";

  const { cumLhsValidated: lhv, cumCocromsEncoded: enc, cumCocromsForDistribution: dist } = data;

  const cumulativeRows = `
    <tr style="border-bottom:1px solid #f8fafc;">
      <td style="padding:12px 10px;font-size:13px;font-weight:500;color:#1e293b;">LHs Fully Validated</td>
      <td style="padding:12px 10px;font-size:13px;font-weight:700;color:#0f172a;text-align:right;">${lhv.completed.toLocaleString()}</td>
      <td style="padding:12px 10px;font-size:12px;color:#64748b;text-align:right;">${lhv.target.toLocaleString()} total LHs</td>
      <td style="padding:12px 10px;text-align:right;">${balanceCell(lhv.balance)}</td>
      <td style="padding:12px 10px;text-align:right;">${progressBar(lhv.pct)}</td>
    </tr>
    <tr style="border-bottom:1px solid #f8fafc;">
      <td style="padding:12px 10px;font-size:13px;font-weight:500;color:#1e293b;">COCROMs Encoded</td>
      <td style="padding:12px 10px;font-size:13px;font-weight:700;color:#0f172a;text-align:right;">${enc.completed.toLocaleString()}</td>
      <td style="padding:12px 10px;font-size:12px;color:#64748b;text-align:right;">${enc.target.toLocaleString()} eligible</td>
      <td style="padding:12px 10px;text-align:right;">${balanceCell(enc.balance)}</td>
      <td style="padding:12px 10px;text-align:right;">${progressBar(enc.pct)}</td>
    </tr>
    <tr>
      <td style="padding:12px 10px;font-size:13px;font-weight:500;color:#1e293b;">COCROMs Available for Distribution</td>
      <td style="padding:12px 10px;font-size:13px;font-weight:700;color:#0f172a;text-align:right;">${dist.completed.toLocaleString()}</td>
      <td style="padding:12px 10px;font-size:12px;color:#64748b;text-align:right;">${dist.target.toLocaleString()} committed</td>
      <td style="padding:12px 10px;text-align:right;">${balanceCell(dist.balance)}</td>
      <td style="padding:12px 10px;text-align:right;">${progressBar(dist.pct, "#f59e0b")}</td>
    </tr>`;

  const provincialBreakdown =
    variant === "regional" && data.provinces && data.provinces.length > 0
      ? `<tr><td colspan="5" style="padding:24px 0 0;">
          <div style="font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#94a3b8;padding-bottom:6px;border-bottom:1px solid #f1f5f9;">Provincial Breakdown</div>
        </td></tr>
        <tr><td colspan="5" style="padding:10px 0 0;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-size:12px;">
            <thead>
              <tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0;">
                <th style="text-align:left;padding:7px 10px;font-size:10px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:#94a3b8;">Province</th>
                <th style="text-align:right;padding:7px 10px;font-size:10px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:#94a3b8;">Validated (wk)</th>
                <th style="text-align:right;padding:7px 10px;font-size:10px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:#94a3b8;">Encoded (wk)</th>
                <th style="text-align:right;padding:7px 10px;font-size:10px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:#94a3b8;">LHs Val. %</th>
                <th style="text-align:right;padding:7px 10px;font-size:10px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:#94a3b8;">COCROMs Enc. %</th>
                <th style="text-align:right;padding:7px 10px;font-size:10px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:#94a3b8;">vs. Commitment</th>
              </tr>
            </thead>
            <tbody>
              ${data.provinces.map((p) => `
              <tr style="border-bottom:1px solid #f8fafc;">
                <td style="padding:10px;font-weight:600;color:#1e293b;">${p.province}</td>
                <td style="padding:10px;text-align:right;color:#374151;">${p.weeklyLhsValidated}</td>
                <td style="padding:10px;text-align:right;color:#374151;">${p.weeklyCocromsEncoded}</td>
                <td style="padding:10px;text-align:right;color:#374151;">${p.lhsValidatedPct}%</td>
                <td style="padding:10px;text-align:right;color:#374151;">${p.cocromsEncodedPct}%</td>
                <td style="padding:10px;text-align:right;">${p.vsCommitment >= 0
                  ? `<span style="color:#16a34a;font-weight:600;">+${p.vsCommitment}</span>`
                  : `<span style="color:#ef4444;font-weight:600;">${p.vsCommitment}</span>`}</td>
              </tr>`).join("")}
            </tbody>
          </table>
        </td></tr>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Weekly Progress Digest</title>
</head>
<body style="margin:0;padding:0;background:#eef2f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;color:#1e293b;">
<table width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr><td align="center" style="padding:36px 16px;">
    <table width="620" cellpadding="0" cellspacing="0" border="0" style="max-width:620px;width:100%;">

      <!-- Top accent bar -->
      <tr><td style="background:#22c55e;height:4px;border-radius:4px 4px 0 0;padding:0;line-height:0;font-size:0;">&nbsp;</td></tr>

      <!-- Header -->
      <tr><td style="background:#14532d;padding:26px 32px 28px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="font-size:10px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:rgba(255,255,255,0.5);">DAR · Region V · Bicol</td>
            <td align="right">
              <span style="display:inline-block;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.18);border-radius:99px;padding:5px 14px;font-size:11px;color:rgba(255,255,255,0.85);font-weight:500;white-space:nowrap;">Week of ${fmtShort(weekStart)} – ${fmtShort(weekEnd)}</span>
            </td>
          </tr>
          <tr>
            <td style="padding-top:18px;" valign="bottom">
              <div style="font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;line-height:1.15;">Weekly Progress Digest</div>
              <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:5px;letter-spacing:0.01em;">COCROM Validation, Encoding &amp; Distribution Summary</div>
            </td>
            <td style="padding-top:18px;padding-left:20px;" valign="bottom" align="right">
              ${buildCountdownBadge(targetDate, weekEnd)}
            </td>
          </tr>
          ${provinceChip}
        </table>
      </td></tr>

      <!-- Body -->
      <tr><td style="background:#ffffff;padding:30px 32px 28px;">

        <!-- Greeting -->
        <p style="font-size:15px;color:#374151;margin:0 0 26px;line-height:1.7;">
          Good day, <strong style="color:#0f172a;">${displayName}</strong>. Here is the progress update${variant === "provincial" && data.scope.province ? ` for <strong style="color:#0f172a;">${data.scope.province}</strong>` : ""} for the week of <strong style="color:#0f172a;">${weekRange}</strong>.
        </p>

        <!-- Section label: This Week -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:14px;">
          <tr>
            <td style="font-size:10px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:#94a3b8;padding-bottom:8px;border-bottom:2px solid #f1f5f9;">
              This Week's Activity${variant === "provincial" && data.scope.province ? ` — ${data.scope.province}` : ""}
            </td>
          </tr>
        </table>

        <!-- Activity cards -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:30px;">
          <tr>
            <td width="49%" style="padding-right:8px;vertical-align:top;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-left:4px solid #16a34a;border-radius:10px;">
                <tr><td style="padding:18px 20px;">
                  <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#6b7280;margin-bottom:10px;">LHs Validated</div>
                  <div style="font-size:34px;font-weight:800;color:#1d4ed8;line-height:1;letter-spacing:-0.02em;">+${data.weeklyLhsValidated.toLocaleString()}&nbsp;<span style="font-size:15px;font-weight:600;color:#3b82f6;letter-spacing:0;">LHs</span></div>
                  <div style="font-size:11px;color:#9ca3af;margin-top:9px;">Updated &amp; validated this week</div>
                </td></tr>
              </table>
            </td>
            <td width="49%" style="padding-left:8px;vertical-align:top;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eff6ff;border:1px solid #bfdbfe;border-left:4px solid #2563eb;border-radius:10px;">
                <tr><td style="padding:18px 20px;">
                  <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#6b7280;margin-bottom:10px;">COCROMs Encoded</div>
                  <div style="font-size:34px;font-weight:800;color:#1d4ed8;line-height:1;letter-spacing:-0.02em;">+${data.weeklyCocromsEncoded.toLocaleString()}&nbsp;<span style="font-size:15px;font-weight:600;color:#3b82f6;letter-spacing:0;">COCROMs</span></div>
                  <div style="font-size:11px;color:#9ca3af;margin-top:9px;">Updated &amp; encoded this week</div>
                </td></tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- Section label: Cumulative -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:14px;">
          <tr>
            <td style="font-size:10px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:#94a3b8;padding-bottom:8px;border-bottom:2px solid #f1f5f9;">
              Cumulative Progress${variant === "provincial" && data.scope.province ? ` — ${data.scope.province}` : ""}
            </td>
          </tr>
        </table>

        <!-- Cumulative table -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="text-align:left;padding:10px 12px;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#94a3b8;border-bottom:1px solid #e2e8f0;">Metric</th>
              <th style="text-align:right;padding:10px 12px;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#94a3b8;border-bottom:1px solid #e2e8f0;">Done</th>
              <th style="text-align:right;padding:10px 12px;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#94a3b8;border-bottom:1px solid #e2e8f0;">Target</th>
              <th style="text-align:right;padding:10px 12px;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#94a3b8;border-bottom:1px solid #e2e8f0;">Balance</th>
              <th style="text-align:right;padding:10px 12px;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#94a3b8;border-bottom:1px solid #e2e8f0;">Progress</th>
            </tr>
          </thead>
          <tbody>
            ${cumulativeRows}
          </tbody>
        </table>

        <!-- Provincial breakdown (regional only) -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          ${provincialBreakdown}
        </table>

      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 32px;text-align:center;border-radius:0 0 4px 4px;">
        <p style="font-size:11px;color:#475569;margin:0 0 4px;font-weight:600;letter-spacing:0.01em;">Unclassified ARRs Data Management System</p>
        <p style="font-size:11px;color:#94a3b8;margin:0 0 3px;">This report was generated automatically. For questions, contact your system administrator.</p>
        <p style="font-size:11px;color:#cbd5e1;margin:0 0 6px;">© ${fmtYear(weekEnd)} Department of Agrarian Reform · Region V · Bicol</p>
        ${recipient.unsubscribe_token
          ? `<p style="font-size:10px;color:#cbd5e1;margin:0;">To stop receiving these emails, <a href="${process.env.NEXT_PUBLIC_APP_URL}/unsubscribe?token=${recipient.unsubscribe_token}" style="color:#94a3b8;text-decoration:underline;">unsubscribe here</a>.</p>`
          : ""}
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ── Send one email ────────────────────────────────────────────────────────────

export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const transport = createTransport();
    const info = await transport.sendMail({
      from: process.env.SMTP_FROM
        ? `DAR Unclassified ARR Data Management System <${process.env.SMTP_FROM}>`
        : process.env.SMTP_USER,
      to,
      subject,
      html,
    });
    console.log(`[email] Sent to ${to} — messageId: ${info.messageId} response: ${info.response}`);
    return { ok: true };
  } catch (err) {
    console.error(`[email] Failed to send to ${to}:`, err);
    return { ok: false, error: String(err) };
  }
}
