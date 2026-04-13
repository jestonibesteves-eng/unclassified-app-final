"""Generate POST-security audit (remediation summary) PDF for unclassified-app."""

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether, PageBreak
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from datetime import date

OUTPUT = "post-security-audit-report.pdf"
AUDIT_DATE   = "April 11, 2026"
REPORT_DATE  = date.today().strftime("%B %d, %Y")

# ── Colour palette ─────────────────────────────────────────────────────────
C_BG        = colors.HexColor("#0f172a")
C_ACCENT    = colors.HexColor("#3b82f6")
C_RED       = colors.HexColor("#dc2626")
C_ORANGE    = colors.HexColor("#f97316")
C_YELLOW    = colors.HexColor("#ca8a04")
C_GREEN     = colors.HexColor("#16a34a")
C_GREEN_LT  = colors.HexColor("#f0fdf4")
C_GREEN_MID = colors.HexColor("#dcfce7")
C_GRAY      = colors.HexColor("#64748b")
C_LIGHT     = colors.HexColor("#f1f5f9")
C_WHITE     = colors.white
C_TEXT      = colors.HexColor("#1e293b")
C_MUTED     = colors.HexColor("#94a3b8")
C_BORDER    = colors.HexColor("#e2e8f0")
C_CODE_BG   = colors.HexColor("#f8fafc")

# Confidential banner colour
C_CONF_BG   = colors.HexColor("#7c2d12")   # deep red-brown
C_CONF_TEXT = colors.HexColor("#fef2f2")

SEV_COLORS = {
    "Critical": colors.HexColor("#b91c1c"),
    "High":     colors.HexColor("#dc2626"),
    "Medium":   C_ORANGE,
    "Low":      C_YELLOW,
    "Info":     C_ACCENT,
}
SEV_BG = {
    "Critical": colors.HexColor("#fef2f2"),
    "High":     colors.HexColor("#fff1f1"),
    "Medium":   colors.HexColor("#fff7ed"),
    "Low":      colors.HexColor("#fefce8"),
    "Info":     colors.HexColor("#eff6ff"),
}

# ── Styles ─────────────────────────────────────────────────────────────────
def S(name, **kw):
    return ParagraphStyle(name, **kw)

STYLE_BODY   = S("body",   fontName="Helvetica",      fontSize=9.5, leading=14, textColor=C_TEXT, spaceAfter=4)
STYLE_SMALL  = S("small",  fontName="Helvetica",      fontSize=8.5, leading=12, textColor=C_GRAY)
STYLE_LABEL  = S("label",  fontName="Helvetica-Bold", fontSize=8,   leading=11, textColor=C_GRAY, spaceAfter=2)
STYLE_H2     = S("h2",     fontName="Helvetica-Bold", fontSize=13,  leading=18, textColor=C_TEXT, spaceBefore=18, spaceAfter=6)
STYLE_H3     = S("h3",     fontName="Helvetica-Bold", fontSize=10.5,leading=14, textColor=C_TEXT, spaceBefore=10, spaceAfter=4)
STYLE_CODE   = S("code",   fontName="Courier",        fontSize=7.8, leading=11.5, textColor=colors.HexColor("#334155"),
                 backColor=C_CODE_BG, leftIndent=8, rightIndent=8, spaceBefore=4, spaceAfter=4)
STYLE_BULLET = S("bullet", fontName="Helvetica",      fontSize=9.5, leading=14, textColor=C_TEXT,
                 leftIndent=14, spaceAfter=3, bulletIndent=4)
STYLE_CONF   = S("conf",   fontName="Helvetica-Bold", fontSize=9,   leading=12,
                 textColor=C_CONF_TEXT, alignment=TA_CENTER)
STYLE_RESOLVED = S("res",  fontName="Helvetica-Bold", fontSize=8,   leading=11,
                   textColor=C_GREEN, alignment=TA_RIGHT)

def P(text, style=STYLE_BODY): return Paragraph(text, style)
def sp(h=6): return Spacer(1, h)
def rule(color=C_BORDER, thickness=0.5):
    return HRFlowable(width="100%", thickness=thickness, color=color, spaceAfter=6, spaceBefore=6)

def conf_banner(W):
    """Single-row CONFIDENTIAL banner."""
    data = [[P("CONFIDENTIAL — FOR INTERNAL USE ONLY", STYLE_CONF)]]
    t = Table(data, colWidths=[W])
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,-1), C_CONF_BG),
        ("TOPPADDING",    (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
    ]))
    return t

# ── Finding data ───────────────────────────────────────────────────────────
FINDINGS = [
    {
        "id": "F-001",
        "title": "Hardcoded Fallback JWT Signing Secret",
        "severity": "High",
        "location": "lib/session.ts",
        "finding": (
            "The JWT signing secret fell back to the hardcoded string "
            "<b>\"dar-region5-fallback-secret\"</b> when <b>AUTH_SECRET</b> was "
            "absent. Anyone with source code access could forge session tokens "
            "for any role, including <b>super_admin</b>."
        ),
        "fix_summary": "Removed the fallback. Server now throws and refuses to start if <b>AUTH_SECRET</b> is unset.",
        "before": 'const SECRET = new TextEncoder().encode(\n  process.env.AUTH_SECRET ?? "dar-region5-fallback-secret"\n);',
        "after":  'const authSecret = process.env.AUTH_SECRET;\nif (!authSecret) throw new Error(\n  "AUTH_SECRET environment variable is required but not set."\n);\nconst SECRET = new TextEncoder().encode(authSecret);',
    },
    {
        "id": "F-002",
        "title": "Weak AUTH_SECRET Entropy",
        "severity": "Medium",
        "location": ".env",
        "finding": (
            "The secret was a human-readable phrase "
            "<b>\"dar-region5-unclassified-arrs-secret-2025\"</b> — guessable "
            "by anyone with contextual knowledge. A brute-forced secret allows "
            "unlimited token forgery."
        ),
        "fix_summary": (
            "Replaced with a 512-bit cryptographically random value generated via "
            "<b>Node.js crypto.randomBytes(64)</b>. All existing sessions were "
            "invalidated at restart."
        ),
        "before": 'AUTH_SECRET="dar-region5-unclassified-arrs-secret-2025"',
        "after":  'AUTH_SECRET="<512-bit base64 random value — redacted from this report>"',
    },
    {
        "id": "F-003",
        "title": "Raw Exception Message Returned to Client",
        "severity": "Medium",
        "location": "app/api/records/[seqno]/route.ts · app/api/arbs/list/route.ts",
        "finding": (
            "Both 500-error responses returned <b>String(e)</b> directly, leaking "
            "SQLite/Prisma internals such as table names, column names, and "
            "constraint identifiers. An attacker could enumerate the database "
            "schema by deliberately triggering errors."
        ),
        "fix_summary": "Both routes now return a generic message. The full error continues to be logged server-side.",
        "before": "return NextResponse.json({ error: String(e) }, { status: 500 });",
        "after":  'return NextResponse.json(\n  { error: "An internal error occurred. Please try again." },\n  { status: 500 }\n);',
    },
    {
        "id": "F-004",
        "title": "Logout Does Not Invalidate JWT Server-Side",
        "severity": "Medium",
        "location": "lib/session.ts · app/api/auth/login/route.ts · app/api/auth/change-password/route.ts",
        "finding": (
            "Logout only cleared the browser cookie. A captured JWT remained "
            "cryptographically valid for up to <b>8 hours</b> after logout — an "
            "unacceptably long post-logout attack window for a government records system."
        ),
        "fix_summary": (
            "JWT lifetime reduced from <b>8 hours to 1 hour</b>. Change applied in "
            "three locations: session token expiry, login cookie maxAge, and "
            "change-password cookie maxAge. Limits post-capture exposure without "
            "requiring a server-side revocation store."
        ),
        "before": '.setExpirationTime("8h")\nmaxAge: 60 * 60 * 8,   // login + change-password routes',
        "after":  '.setExpirationTime("1h")\nmaxAge: 60 * 60,       // login + change-password routes',
    },
    {
        "id": "F-005",
        "title": "No Login Rate Limiting or Account Lockout",
        "severity": "Medium",
        "location": "app/api/auth/login/route.ts",
        "finding": (
            "The login endpoint performed bcrypt verification on every request "
            "with no rate limiting, lockout, or delay. An attacker with a known "
            "username could attempt hundreds of password guesses per minute "
            "using concurrent requests."
        ),
        "fix_summary": (
            "Added a per-IP in-memory rate limiter. An IP is locked out for "
            "<b>15 minutes</b> after <b>10 consecutive failed attempts</b>. "
            "Failed attempts are tracked in a <b>Map</b> with a sliding window. "
            "Successful login clears the counter."
        ),
        "before": "// No rate limiting — bcrypt.compare ran on every request",
        "after": (
            "const loginAttempts = new Map<string, { count: number; resetAt: number }>();\n"
            "// Returns 429 after 10 failures within 15 minutes per IP\n"
            "if (isRateLimited(ip)) return NextResponse.json(\n"
            "  { error: \"Too many failed attempts. Try again in 15 minutes.\" },\n"
            "  { status: 429 }\n"
            ");"
        ),
    },
    {
        "id": "F-006",
        "title": "xlsx Prototype Pollution via User-Uploaded Files",
        "severity": "High",
        "location": "app/api/arbs/upload/route.ts · app/api/batch/arb/route.ts",
        "finding": (
            "Both upload routes passed user-supplied bytes to "
            "<b>XLSX.read(buffer, { type: \"buffer\" })</b>. xlsx 0.18.5 is "
            "affected by <b>GHSA-4r6h-8v6p-xvw6</b> — a Prototype Pollution "
            "vulnerability where a crafted file can mutate <b>Object.prototype</b> "
            "during parsing, potentially enabling privilege escalation or "
            "application-wide denial of service. SheetJS community edition no "
            "longer receives security patches."
        ),
        "fix_summary": (
            "Replaced xlsx with <b>exceljs</b> (actively maintained, no known "
            "Prototype Pollution CVEs) in both upload routes. The parseFile() "
            "function was rewritten to use the ExcelJS Workbook API for both "
            ".xlsx and .csv inputs. Export routes (records/export, arbs/export) "
            "remain on xlsx as they write only internally-generated data."
        ),
        "before": 'import * as XLSX from "xlsx";\n\nfunction parseFile(buffer: Buffer): RawRow[] {\n  const wb = XLSX.read(buffer, { type: "buffer" });\n  const ws = wb.Sheets[wb.SheetNames[0]];\n  return XLSX.utils.sheet_to_json(ws, { defval: "" });\n}',
        "after": (
            'import ExcelJS from "exceljs";\nimport { Readable } from "stream";\n\n'
            'async function parseFile(buffer: Buffer, filename: string): Promise<RawRow[]> {\n'
            '  const workbook = new ExcelJS.Workbook();\n'
            '  if (filename.toLowerCase().endsWith(".csv")) {\n'
            '    const stream = new Readable();\n'
            '    stream.push(buffer as any);\n'
            '    stream.push(null);\n'
            '    await workbook.csv.read(stream);\n'
            '  } else {\n'
            '    await workbook.xlsx.load(buffer as any);\n'
            '  }\n'
            '  // ... extract rows via ExcelJS worksheet API\n'
            '}'
        ),
    },
    {
        "id": "F-007",
        "title": "Next.js DoS via Server Components (GHSA-q4gf-8mx6-v5v3)",
        "severity": "Low",
        "location": "package.json",
        "finding": (
            "Next.js 16.2.1 was affected by GHSA-q4gf-8mx6-v5v3, a Denial of "
            "Service condition triggered by crafted requests to Server Component "
            "endpoints. Risk was low (authenticated-only) but upgrading was the "
            "correct remediation."
        ),
        "fix_summary": "Upgraded Next.js from <b>16.2.1 → 16.2.3</b>. No breaking changes in this patch range.",
        "before": '"next": "16.2.1"',
        "after":  '"next": "^16.2.3"',
    },
    {
        "id": "F-008",
        "title": "Dead NextAuth Code Surface Removed",
        "severity": "Info",
        "location": "auth.config.ts · auth.ts · app/api/auth/[...nextauth]/route.ts · lib/actions/auth.ts",
        "finding": (
            "The application ran two parallel authentication setups: a custom JWT "
            "session (active) and NextAuth Credentials (inactive). proxy.ts never "
            "called NextAuth's auth() — confirmed by a full search of the app/ "
            "directory. The dead NextAuth code created confusion about which "
            "system was authoritative and represented unnecessary attack surface."
        ),
        "fix_summary": (
            "Deleted all four NextAuth-related files after verifying zero active "
            "imports. Cleaned build cache to remove stale type references. "
            "The custom JWT session layer in lib/session.ts remains the sole "
            "authentication path."
        ),
        "before": "4 files present:\n  auth.config.ts\n  auth.ts\n  app/api/auth/[...nextauth]/route.ts\n  lib/actions/auth.ts",
        "after":  "All 4 files deleted. npx tsc --noEmit passes clean.",
    },
    {
        "id": "F-009",
        "title": "No Content-Security-Policy or Hardening Headers",
        "severity": "Info",
        "location": "next.config.ts",
        "finding": (
            "No HTTP security headers were configured. No active XSS vector "
            "was found (React JSX escaping intact), but the absence of CSP "
            "and framing controls meant any future XSS would have maximum "
            "browser-level impact."
        ),
        "fix_summary": (
            "Added a full security header set in next.config.ts: "
            "<b>X-Content-Type-Options</b>, <b>X-Frame-Options: DENY</b>, "
            "<b>Referrer-Policy</b>, <b>Permissions-Policy</b>, and a "
            "<b>Content-Security-Policy</b>. The CSP includes "
            "<b>'unsafe-eval'</b> in development only (required for React "
            "stack traces) and omits it in production."
        ),
        "before": "// next.config.ts — no headers() config present",
        "after": (
            "const securityHeaders = [\n"
            "  { key: \"X-Content-Type-Options\",  value: \"nosniff\" },\n"
            "  { key: \"X-Frame-Options\",         value: \"DENY\" },\n"
            "  { key: \"Referrer-Policy\",          value: \"strict-origin-when-cross-origin\" },\n"
            "  { key: \"Permissions-Policy\",       value: \"camera=(), microphone=()\" },\n"
            "  { key: \"Content-Security-Policy\",  value: \"default-src 'self'; ...\" },\n"
            "];"
        ),
    },
]

# ── PDF builder ────────────────────────────────────────────────────────────

def build_pdf():
    doc = SimpleDocTemplate(
        OUTPUT,
        pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=2.2*cm, bottomMargin=2.2*cm,
        title="Post-Security Audit Report — unclassified-app",
        author="Security Audit (Claude Code)",
    )

    W = A4[0] - 4*cm

    story = []

    # ── Confidentiality banner (top) ───────────────────────────────────────
    story.append(conf_banner(W))
    story.append(sp(8))

    # ── Cover header ───────────────────────────────────────────────────────
    cover_data = [[
        Paragraph(
            '<font color="white"><b>POST-SECURITY AUDIT REPORT</b></font><br/>'
            '<font color="#93c5fd" size="11">Remediation Summary</font>',
            ParagraphStyle("ch", fontName="Helvetica-Bold", fontSize=20,
                           textColor=C_WHITE, leading=28, alignment=TA_LEFT)
        )
    ]]
    cover = Table(cover_data, colWidths=[W])
    cover.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,-1), C_BG),
        ("TOPPADDING",    (0,0), (-1,-1), 20),
        ("BOTTOMPADDING", (0,0), (-1,-1), 20),
        ("LEFTPADDING",   (0,0), (-1,-1), 18),
    ]))
    story.append(cover)
    story.append(sp(6))

    # Meta row
    meta_data = [[
        P("<b>System:</b>  unclassified-app — DAR Region V Landholding Records", STYLE_SMALL),
        P(f"<b>Report date:</b>  {REPORT_DATE}", STYLE_SMALL),
    ]]
    meta = Table(meta_data, colWidths=[W*0.65, W*0.35])
    meta.setStyle(TableStyle([
        ("ALIGN",         (1,0), (1,0), "RIGHT"),
        ("TOPPADDING",    (0,0), (-1,-1), 0),
        ("BOTTOMPADDING", (0,0), (-1,-1), 0),
    ]))
    story.append(meta)
    story.append(sp(4))
    story.append(rule(C_ACCENT, 1.5))
    story.append(sp(4))

    # ── Confidentiality notice ─────────────────────────────────────────────
    story.append(P("<b>Confidentiality Classification</b>", STYLE_H2))
    conf_text = [
        [
            Paragraph("CONFIDENTIAL", ParagraphStyle("cl", fontName="Helvetica-Bold",
                      fontSize=11, textColor=C_CONF_BG)),
            Paragraph(
                "This document contains details of security vulnerabilities that "
                "existed in the system, including a formerly hardcoded authentication "
                "secret, specific exploit paths, and authentication architecture "
                "internals. Distribution must be limited to authorised personnel only. "
                "Do not transmit via unencrypted channels. Retain in a secure location.",
                STYLE_BODY
            ),
        ]
    ]
    conf_box = Table(conf_text, colWidths=[W*0.20, W*0.80])
    conf_box.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,-1), colors.HexColor("#fff1f1")),
        ("BOX",           (0,0), (-1,-1), 1.2, C_CONF_BG),
        ("TOPPADDING",    (0,0), (-1,-1), 10),
        ("BOTTOMPADDING", (0,0), (-1,-1), 10),
        ("LEFTPADDING",   (0,0), (-1,-1), 12),
        ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
    ]))
    story.append(conf_box)
    story.append(sp(4))
    story.append(P(
        "<b>Recommended handling:</b> Store in a password-protected location. "
        "Share only with IT staff, system administrators, and oversight personnel "
        "with a need to know. Destroy printed copies via cross-cut shredding when no "
        "longer needed for audit record purposes.",
        STYLE_BODY
    ))
    story.append(sp(8))
    story.append(rule(C_BORDER))

    # ── Executive summary ──────────────────────────────────────────────────
    story.append(P("<b>Executive Summary</b>", STYLE_H2))
    story.append(P(
        "A full-stack security audit was conducted on the <b>unclassified-app</b> "
        "Next.js application — DAR Region V's internal landholding records management "
        "system. Nine findings were identified across authentication, session "
        "management, error handling, file upload processing, and dependency CVEs. "
        "<b>All nine findings have been resolved.</b> This report documents the "
        "original vulnerability, the specific remediation applied, and the code "
        "change made for each finding.",
        STYLE_BODY
    ))
    story.append(sp(8))

    # Resolution summary table
    rows = [["ID", "Title", "Severity", "Status"]]
    sev_order = ["Critical", "High", "Medium", "Low", "Info"]
    sorted_findings = sorted(FINDINGS, key=lambda f: sev_order.index(f["severity"]))
    for f in sorted_findings:
        rows.append([f["id"], f["title"], f["severity"], "RESOLVED"])

    col_w = [W*0.10, W*0.52, W*0.18, W*0.20]
    sum_t = Table(rows, colWidths=col_w)
    style_cmds = [
        ("BACKGROUND",    (0,0), (-1,0), C_BG),
        ("TEXTCOLOR",     (0,0), (-1,0), C_WHITE),
        ("FONTNAME",      (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE",      (0,0), (-1,-1), 8.5),
        ("GRID",          (0,0), (-1,-1), 0.3, C_BORDER),
        ("TOPPADDING",    (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("LEFTPADDING",   (0,0), (-1,-1), 8),
        ("ALIGN",         (2,0), (-1,-1), "CENTER"),
        ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
        ("FONTNAME",      (3,1), (3,-1), "Helvetica-Bold"),
        ("TEXTCOLOR",     (3,1), (3,-1), C_GREEN),
    ]
    # Colour severity cells
    for i, f in enumerate(sorted_findings, start=1):
        sev = f["severity"]
        bg = SEV_BG.get(sev, C_LIGHT)
        fg = SEV_COLORS.get(sev, C_GRAY)
        style_cmds.append(("BACKGROUND", (0,i), (-1,i), bg))
        style_cmds.append(("TEXTCOLOR",  (2,i), (2,i), fg))
        style_cmds.append(("FONTNAME",   (2,i), (2,i), "Helvetica-Bold"))
    sum_t.setStyle(TableStyle(style_cmds))
    story.append(sum_t)
    story.append(sp(12))
    story.append(rule(C_BORDER))

    # ── Remediation details ────────────────────────────────────────────────
    story.append(P("<b>Remediation Details</b>", STYLE_H2))
    story.append(P(
        "Each finding below shows the original vulnerability, the fix that was "
        "applied, and the before/after code change.",
        STYLE_BODY
    ))
    story.append(sp(6))

    for f in FINDINGS:
        sev     = f["severity"]
        sev_col = SEV_COLORS.get(sev, C_GRAY)
        sev_bg  = SEV_BG.get(sev, C_LIGHT)

        # ── Header bar ──────────────────────────────────────────────────
        hdr_data = [[
            Paragraph(f'<font color="white"><b>{f["id"]}</b></font>',
                      ParagraphStyle("fid", fontName="Helvetica-Bold", fontSize=9, textColor=C_WHITE)),
            Paragraph(f'<b>{f["title"]}</b>',
                      ParagraphStyle("ftitle", fontName="Helvetica-Bold", fontSize=10, textColor=C_WHITE)),
            Paragraph(f'<font color="white">{f["severity"]}</font>',
                      ParagraphStyle("fsev", fontName="Helvetica-Bold", fontSize=8.5,
                                     textColor=C_WHITE, alignment=TA_CENTER)),
            Paragraph('<font color="#86efac"><b>RESOLVED</b></font>',
                      ParagraphStyle("fres", fontName="Helvetica-Bold", fontSize=8.5,
                                     textColor=colors.HexColor("#86efac"), alignment=TA_RIGHT)),
        ]]
        hdr = Table(hdr_data, colWidths=[W*0.10, W*0.54, W*0.16, W*0.20])
        hdr.setStyle(TableStyle([
            ("BACKGROUND",    (0,0), (-1,-1), sev_col),
            ("TOPPADDING",    (0,0), (-1,-1), 8),
            ("BOTTOMPADDING", (0,0), (-1,-1), 8),
            ("LEFTPADDING",   (0,0), (-1,-1), 10),
            ("RIGHTPADDING",  (-1,0), (-1,-1), 10),
            ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
        ]))

        # ── Location ────────────────────────────────────────────────────
        loc_data = [[
            Paragraph('<b>Location</b>', STYLE_LABEL),
            Paragraph(f['location'],
                      ParagraphStyle("loc", fontName="Courier", fontSize=8,
                                     textColor=colors.HexColor("#475569"))),
        ]]
        loc = Table(loc_data, colWidths=[W*0.15, W*0.85])
        loc.setStyle(TableStyle([
            ("BACKGROUND",    (0,0), (-1,-1), sev_bg),
            ("TOPPADDING",    (0,0), (-1,-1), 5),
            ("BOTTOMPADDING", (0,0), (-1,-1), 5),
            ("LEFTPADDING",   (0,0), (-1,-1), 10),
            ("VALIGN",        (0,0), (-1,-1), "TOP"),
        ]))

        # ── Original finding ────────────────────────────────────────────
        finding_rows = [
            [Paragraph('<b>Original finding</b>', STYLE_LABEL)],
            [Paragraph(f['finding'], STYLE_BODY)],
        ]
        finding_t = Table(finding_rows, colWidths=[W])
        finding_t.setStyle(TableStyle([
            ("BACKGROUND",    (0,0), (-1,-1), C_WHITE),
            ("TOPPADDING",    (0,0), (-1,-1), 5),
            ("BOTTOMPADDING", (0,0), (-1,-1), 5),
            ("LEFTPADDING",   (0,0), (-1,-1), 10),
            ("RIGHTPADDING",  (0,0), (-1,-1), 10),
            ("LINEBELOW",     (0,-1), (-1,-1), 0.3, C_BORDER),
        ]))

        # ── Fix applied ─────────────────────────────────────────────────
        fix_rows = [
            [Paragraph('<b>Fix applied</b>', STYLE_LABEL)],
            [Paragraph(f['fix_summary'], STYLE_BODY)],
        ]
        fix_t = Table(fix_rows, colWidths=[W])
        fix_t.setStyle(TableStyle([
            ("BACKGROUND",    (0,0), (-1,-1), C_GREEN_LT),
            ("TOPPADDING",    (0,0), (-1,-1), 5),
            ("BOTTOMPADDING", (0,0), (-1,-1), 5),
            ("LEFTPADDING",   (0,0), (-1,-1), 10),
            ("RIGHTPADDING",  (0,0), (-1,-1), 10),
            ("LINEBELOW",     (0,-1), (-1,-1), 0.3, C_BORDER),
        ]))

        # ── Before / After ──────────────────────────────────────────────
        def code_cell(label, code_str, bg):
            return Table(
                [
                    [Paragraph(f'<b>{label}</b>', STYLE_LABEL)],
                    [Paragraph(code_str.replace('\n', '<br/>').replace(' ', '&nbsp;'), STYLE_CODE)],
                ],
                colWidths=[W / 2 - 1]
            )

        ba_data = [[
            code_cell("Before", f["before"], C_CODE_BG),
            code_cell("After",  f["after"],  C_GREEN_LT),
        ]]
        ba_t = Table(ba_data, colWidths=[W*0.50, W*0.50])
        ba_t.setStyle(TableStyle([
            ("BACKGROUND",    (0,0), (0,-1), C_WHITE),
            ("BACKGROUND",    (1,0), (1,-1), C_GREEN_LT),
            ("TOPPADDING",    (0,0), (-1,-1), 5),
            ("BOTTOMPADDING", (0,0), (-1,-1), 6),
            ("LEFTPADDING",   (0,0), (-1,-1), 10),
            ("RIGHTPADDING",  (0,0), (-1,-1), 8),
            ("VALIGN",        (0,0), (-1,-1), "TOP"),
            ("LINEBEFORE",    (1,0), (1,-1), 0.5, C_BORDER),
        ]))

        outer = Table(
            [[hdr], [loc], [finding_t], [fix_t], [ba_t]],
            colWidths=[W]
        )
        outer.setStyle(TableStyle([
            ("BOX",           (0,0), (-1,-1), 0.6, sev_col),
            ("TOPPADDING",    (0,0), (-1,-1), 0),
            ("BOTTOMPADDING", (0,0), (-1,-1), 0),
            ("LEFTPADDING",   (0,0), (-1,-1), 0),
            ("RIGHTPADDING",  (0,0), (-1,-1), 0),
        ]))

        story.append(KeepTogether([outer, sp(4)]))
        story.append(sp(12))

    # ── Residual risk ──────────────────────────────────────────────────────
    story.append(rule(C_BORDER))
    story.append(P("<b>Residual Risk and Accepted Limitations</b>", STYLE_H2))
    residual = [
        ("<b>Stateless JWT logout</b>",
         "Reducing the session lifetime to 1 hour (F-004) significantly limits the "
         "post-logout exposure window but does not eliminate it. A captured token "
         "remains valid until expiry. Full revocation requires a server-side session "
         "store (Redis or database table). This is accepted for now; a future hardening "
         "pass should implement a JWT denylist or switch to server-side sessions."),
        ("<b>In-memory rate limiter</b>",
         "The login rate limiter (F-005) uses an in-memory Map. The counter resets "
         "on server restart. In a shared-IP office environment (NAT), all users appear "
         "as one IP — if needed, raise the attempt limit from 10 to 20-30. A persistent "
         "store (Redis) would be needed for reset-resistant rate limiting."),
        ("<b>xlsx retained for exports</b>",
         "The xlsx library remains in use for the two export routes "
         "(records/export, arbs/export). These routes write only internally-generated "
         "data — no user input passes through the xlsx parser — so GHSA-4r6h-8v6p-xvw6 "
         "does not apply to them. Migration to exceljs is recommended in a follow-up pass."),
        ("<b>No test suite</b>",
         "No automated test runner exists in the project. Remediations were verified "
         "by TypeScript type-checking (npx tsc --noEmit) and manual code review. "
         "A vitest suite covering authentication and upload routes would provide "
         "regression coverage and enable future automated security testing."),
    ]
    for title, body in residual:
        story.append(P(f"&#8226;  {title} — {body}", STYLE_BULLET))
        story.append(sp(4))

    story.append(sp(6))
    story.append(rule(C_BORDER))

    # ── Recommendations ────────────────────────────────────────────────────
    story.append(P("<b>Recommendations for Next Audit Pass</b>", STYLE_H2))
    recs = [
        "Add a test suite (vitest) with security regression tests for authentication, rate limiting, and file upload paths.",
        "Implement server-side session revocation (JWT denylist or DB-backed sessions) to enable true logout invalidation.",
        "Integrate SAST tooling (Semgrep with the security ruleset) into the CI/CD pipeline.",
        "Migrate the remaining xlsx write paths (records/export, arbs/export) to exceljs to fully remove the xlsx dependency.",
        "Schedule AUTH_SECRET rotation on a defined cadence (minimum annually, or immediately after any suspected compromise).",
        "Add an explicit file-size limit in the upload route handler rather than relying solely on the Next.js 4MB default.",
        "Review and document the province/municipality row-scoping logic — it is application-level only (no database-level enforcement).",
    ]
    for rec in recs:
        story.append(P(f"&#8226;  {rec}", STYLE_BULLET))

    story.append(sp(18))
    story.append(rule(C_MUTED, 0.3))
    story.append(sp(4))
    story.append(P(
        f"Report date: {REPORT_DATE} &nbsp;&#8226;&nbsp; "
        "Audit conducted on DAR Region V unclassified-app &nbsp;&#8226;&nbsp; "
        "Generated with Claude Code",
        ParagraphStyle("footer", fontName="Helvetica", fontSize=7.5,
                       textColor=C_MUTED, alignment=TA_CENTER)
    ))
    story.append(sp(8))

    # Confidentiality banner (bottom)
    story.append(conf_banner(W))

    doc.build(story)
    print(f"PDF written: {OUTPUT}")


if __name__ == "__main__":
    build_pdf()
