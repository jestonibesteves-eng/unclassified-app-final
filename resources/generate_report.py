"""Generate security audit PDF report for unclassified-app."""

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from datetime import date

OUTPUT = "security-audit-report.pdf"

# ── Colour palette ──────────────────────────────────────────────────────────
C_BG        = colors.HexColor("#0f172a")   # dark navy (header bg)
C_ACCENT    = colors.HexColor("#3b82f6")   # blue accent
C_RED       = colors.HexColor("#ef4444")
C_ORANGE    = colors.HexColor("#f97316")
C_YELLOW    = colors.HexColor("#eab308")
C_GREEN     = colors.HexColor("#22c55e")
C_GRAY      = colors.HexColor("#64748b")
C_LIGHT     = colors.HexColor("#f1f5f9")
C_WHITE     = colors.white
C_TEXT      = colors.HexColor("#1e293b")
C_MUTED     = colors.HexColor("#94a3b8")
C_BORDER    = colors.HexColor("#e2e8f0")
C_CODE_BG   = colors.HexColor("#f8fafc")

SEV_COLORS = {
    "Critical": C_RED,
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

# ── Styles ───────────────────────────────────────────────────────────────────
styles = getSampleStyleSheet()

def S(name, **kw):
    return ParagraphStyle(name, **kw)

STYLE_BODY = S("body", fontName="Helvetica", fontSize=9.5, leading=14,
               textColor=C_TEXT, spaceAfter=4)
STYLE_SMALL = S("small", fontName="Helvetica", fontSize=8.5, leading=12,
                textColor=C_GRAY)
STYLE_LABEL = S("label", fontName="Helvetica-Bold", fontSize=8, leading=11,
                textColor=C_GRAY, spaceAfter=2)
STYLE_H2 = S("h2", fontName="Helvetica-Bold", fontSize=13, leading=18,
             textColor=C_TEXT, spaceBefore=18, spaceAfter=6)
STYLE_H3 = S("h3", fontName="Helvetica-Bold", fontSize=10.5, leading=14,
             textColor=C_TEXT, spaceBefore=10, spaceAfter=4)
STYLE_CODE = S("code", fontName="Courier", fontSize=8, leading=12,
               textColor=colors.HexColor("#334155"),
               backColor=C_CODE_BG, leftIndent=8, rightIndent=8,
               spaceBefore=4, spaceAfter=4)
STYLE_BULLET = S("bullet", fontName="Helvetica", fontSize=9.5, leading=14,
                 textColor=C_TEXT, leftIndent=14, spaceAfter=3,
                 bulletIndent=4)

def P(text, style=STYLE_BODY):
    return Paragraph(text, style)

def sp(h=6):
    return Spacer(1, h)

def rule(color=C_BORDER, thickness=0.5):
    return HRFlowable(width="100%", thickness=thickness, color=color,
                      spaceAfter=6, spaceBefore=6)

def sev_badge(severity):
    col = SEV_COLORS.get(severity, C_GRAY)
    return (
        f'<font color="white"><b> {severity} </b></font>',
        col,
    )

# ── Finding blocks ───────────────────────────────────────────────────────────

FINDINGS = [
    {
        "id": "F-001",
        "title": "Hardcoded Fallback JWT Signing Secret",
        "severity": "High",
        "location": "lib/session.ts:3-5",
        "why_risk": (
            "The JWT signing secret falls back to the hardcoded string "
            "<b>\"dar-region5-fallback-secret\"</b> when <b>AUTH_SECRET</b> is absent "
            "from the environment. Anyone with access to the source code can use this "
            "known value to forge a session token for any user — including "
            "<b>super_admin</b> — which grants full system access: all records, user "
            "management, and admin operations."
        ),
        "evidence": 'const SECRET = new TextEncoder().encode(\n  process.env.AUTH_SECRET ?? "dar-region5-fallback-secret"\n);',
        "fix": (
            "Remove the fallback entirely. If <b>AUTH_SECRET</b> is missing at startup, "
            "throw an error and refuse to start — fail loudly rather than silently "
            "degrade to a known-insecure secret."
        ),
        "fix_code": 'const secret = process.env.AUTH_SECRET;\nif (!secret) throw new Error("AUTH_SECRET environment variable is required");\nconst SECRET = new TextEncoder().encode(secret);',
    },
    {
        "id": "F-002",
        "title": "Weak AUTH_SECRET Entropy",
        "severity": "Medium",
        "location": ".env:4",
        "why_risk": (
            "The current secret is a human-readable phrase "
            "<b>\"dar-region5-unclassified-arrs-secret-2025\"</b> — a predictable "
            "structure based on agency, region, system name, and year. HS256 security "
            "is directly proportional to the secret's entropy. This value is guessable "
            "by anyone with contextual knowledge of the system. If brute-forced, all "
            "issued tokens can be forged without needing to log in."
        ),
        "evidence": 'AUTH_SECRET="dar-region5-unclassified-arrs-secret-2025"',
        "fix": (
            "Replace with a cryptographically random value of at least 64 bytes. "
            "Generate one with:"
        ),
        "fix_code": "openssl rand -base64 64",
    },
    {
        "id": "F-003",
        "title": "Raw Exception Message Returned to Client (2 Routes)",
        "severity": "Medium",
        "location": "app/api/records/[seqno]/route.ts:161 · app/api/arbs/list/route.ts:184",
        "why_risk": (
            "Both routes return <b>String(e)</b> directly in the JSON response body "
            "on a 500 error. SQLite and Prisma exceptions include internal details such "
            "as table names, column names, and constraint names. For example: "
            "<i>\"SqliteError: UNIQUE constraint failed: Landholding.seqno_darro\"</i>. "
            "An attacker can deliberately trigger errors to enumerate the database "
            "schema without needing direct database access."
        ),
        "evidence": "// Both routes:\nreturn NextResponse.json({ error: String(e) }, { status: 500 });",
        "fix": (
            "Return a generic message to the client. The detailed error is already "
            "logged server-side (console.error) and does not need to be exposed."
        ),
        "fix_code": 'return NextResponse.json(\n  { error: "An internal error occurred. Please try again." },\n  { status: 500 }\n);',
    },
    {
        "id": "F-004",
        "title": "Logout Does Not Invalidate JWT Server-Side",
        "severity": "Medium",
        "location": "app/api/auth/logout/route.ts:4-8",
        "why_risk": (
            "The logout route only instructs the browser to delete its cookie. The "
            "<b>dar_session</b> JWT itself is stateless and has no revocation mechanism. "
            "A captured cookie (from XSS, a shared device, or network interception) "
            "remains cryptographically valid for up to <b>8 hours</b> after the user "
            "logs out. For a government records system, this is an unacceptably long "
            "post-logout attack window."
        ),
        "evidence": "export async function POST() {\n  const res = NextResponse.json({ ok: true });\n  res.cookies.delete(SESSION_COOKIE); // only clears browser cookie\n  return res;\n}",
        "fix": (
            "Reduce the JWT lifetime from 8 hours to 1 hour. This is the pragmatic "
            "fix for a stateless JWT system — it significantly limits the post-logout "
            "damage window without requiring a server-side revocation store. Change "
            "the expiry in <b>lib/session.ts</b> and the cookie <b>maxAge</b> in "
            "both login and change-password routes."
        ),
        "fix_code": '// lib/session.ts — change:\n.setExpirationTime("1h")\n\n// login/route.ts + change-password/route.ts — change:\nmaxAge: 60 * 60 * 1,  // was 60 * 60 * 8',
    },
    {
        "id": "F-005",
        "title": "No Login Rate Limiting or Account Lockout",
        "severity": "Medium",
        "location": "app/api/auth/login/route.ts:6-43",
        "why_risk": (
            "The login endpoint performs bcrypt password verification on every request "
            "with no rate limiting, no IP lockout, and no CAPTCHA. bcrypt cost factor "
            "12 provides approximately 200ms per attempt on modern hardware — but with "
            "concurrent requests an attacker can still attempt hundreds of guesses per "
            "minute against any known username. For a government system containing "
            "sensitive agrarian reform records, unrestricted brute force is an "
            "unacceptable risk."
        ),
        "evidence": "// Entire login handler — no rate limiting logic present\nexport async function POST(req: NextRequest) {\n  const { username, password } = await req.json();\n  // ... bcrypt.compare called on every request, no limit\n}",
        "fix": (
            "Add an in-memory per-IP rate limiter that locks out an IP for 15 minutes "
            "after 10 consecutive failed attempts. A lightweight Map-based approach "
            "works for a single-server deployment without requiring Redis."
        ),
        "fix_code": (
            "const loginAttempts = new Map<string, { count: number; resetAt: number }>();\n"
            "\n"
            "function checkRateLimit(ip: string): boolean {\n"
            "  const now = Date.now();\n"
            "  const entry = loginAttempts.get(ip);\n"
            "  if (entry && now < entry.resetAt && entry.count >= 10) return false;\n"
            "  if (!entry || now >= entry.resetAt)\n"
            "    loginAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });\n"
            "  else entry.count++;\n"
            "  return true;\n"
            "}"
        ),
    },
    {
        "id": "F-006",
        "title": "xlsx Prototype Pollution via User-Uploaded Files",
        "severity": "High",
        "location": "app/api/arbs/upload/route.ts:99 · package.json:29",
        "why_risk": (
            "The ARB upload route passes user-supplied bytes directly to "
            "<b>XLSX.read(buffer, { type: \"buffer\" })</b>. The pinned version "
            "<b>xlsx 0.18.5</b> is affected by <b>GHSA-4r6h-8v6p-xvw6</b> — a "
            "Prototype Pollution vulnerability where a crafted Excel file can mutate "
            "<b>Object.prototype</b> during parsing. This corrupts all subsequent "
            "object property lookups in the Node.js process, potentially enabling "
            "privilege escalation (injected role properties) or application-wide "
            "denial of service. The SheetJS community edition is no longer receiving "
            "security patches for this class of issue."
        ),
        "evidence": "// app/api/arbs/upload/route.ts:99\nconst wb = XLSX.read(buffer, { type: \"buffer\" });\n// buffer comes directly from user-uploaded file with no sanitization",
        "fix": (
            "Replace <b>xlsx</b> with <b>exceljs</b> for the upload parse path. "
            "exceljs is actively maintained and has no known Prototype Pollution CVEs. "
            "The export routes (records/export, arbs/export) use xlsx for writing only "
            "and can be migrated in a follow-up pass."
        ),
        "fix_code": "npm remove xlsx\nnpm install exceljs",
    },
    {
        "id": "F-007",
        "title": "Next.js DoS via Server Components (GHSA-q4gf-8mx6-v5v3)",
        "severity": "Low",
        "location": "package.json:25 — next: 16.2.1",
        "why_risk": (
            "Next.js 16.2.1 is affected by <b>GHSA-q4gf-8mx6-v5v3</b>, a Denial of "
            "Service condition triggered by crafted requests to Server Component "
            "endpoints. This application uses the App Router and Server Components. "
            "Because the app requires authentication (unauthenticated requests are "
            "blocked at the proxy), the practical risk is limited to insider DoS. "
            "However, upgrading is the correct remediation and brings additional "
            "bug fixes."
        ),
        "evidence": '// package.json:25\n"next": "16.2.1"  // affected by GHSA-q4gf-8mx6-v5v3',
        "fix": (
            "Upgrade Next.js to the latest 16.x patch release. Review the changelog "
            "for any breaking changes before applying."
        ),
        "fix_code": "npm install next@latest",
    },
    {
        "id": "F-008",
        "title": "NextAuth auth.config.ts is Dead Code",
        "severity": "Info",
        "location": "auth.config.ts · auth.ts · app/api/auth/[...nextauth]/route.ts",
        "why_risk": (
            "The application runs two parallel authentication setups: a custom JWT "
            "session (<b>lib/session.ts</b>, active) and NextAuth Credentials provider "
            "(<b>auth.ts</b> / <b>auth.config.ts</b>, inactive). The proxy "
            "(<b>proxy.ts</b>) only calls the custom <b>verifySessionToken()</b> and "
            "never invokes NextAuth's <b>auth()</b>. A full search of the "
            "<b>app/</b> directory confirmed no route calls <b>auth()</b>. The "
            "<b>authorized()</b> callback in <b>auth.config.ts</b> duplicates the "
            "auth logic already in <b>proxy.ts</b> but is never reached. This dead "
            "code creates confusion about which system is authoritative and risks a "
            "future maintainer accidentally enabling the wrong one."
        ),
        "evidence": "// proxy.ts — imports only from custom session, never from auth.ts:\nimport { verifySessionToken, SESSION_COOKIE } from \"@/lib/session\";\n// auth() from NextAuth is never called anywhere in the codebase",
        "fix": (
            "Remove <b>auth.config.ts</b>, <b>auth.ts</b>, and "
            "<b>app/api/auth/[...nextauth]/route.ts</b> if NextAuth is not actively "
            "used. Verify there are no remaining imports before deleting. If NextAuth "
            "is planned for future OAuth integration, add a comment to "
            "<b>proxy.ts</b> documenting that the custom JWT is the active auth path."
        ),
        "fix_code": "# Verify no imports remain, then:\ndel auth.config.ts\ndel auth.ts\ndel app/api/auth/[...nextauth]/route.ts",
    },
    {
        "id": "F-009",
        "title": "No Content-Security-Policy or Hardening Headers",
        "severity": "Info",
        "location": "next.config.ts (no headers() config present)",
        "why_risk": (
            "No Content-Security-Policy, X-Content-Type-Options, or X-Frame-Options "
            "headers are configured. No active XSS vector was found in this audit "
            "(React's JSX escaping is intact, no dangerouslySetInnerHTML usage), so "
            "this is a defense-in-depth gap rather than an active vulnerability. "
            "However, absent a CSP, any future XSS introduced via a dependency or "
            "code change would have maximum impact — no browser-enforced script "
            "restrictions to limit it."
        ),
        "evidence": "// next.config.ts — no headers() export:\nconst nextConfig: NextConfig = {\n  allowedDevOrigins: [\"192.168.1.101\"],\n  // no headers() config\n};",
        "fix": (
            "Add HTTP security headers in <b>next.config.ts</b>. A starter set "
            "appropriate for an internal app with no CDN dependencies:"
        ),
        "fix_code": (
            "headers: async () => [{\n"
            "  source: \"/(.*)\",\n"
            "  headers: [\n"
            "    { key: \"X-Content-Type-Options\", value: \"nosniff\" },\n"
            "    { key: \"X-Frame-Options\",        value: \"DENY\" },\n"
            "    { key: \"Referrer-Policy\",         value: \"strict-origin-when-cross-origin\" },\n"
            "    { key: \"Content-Security-Policy\",\n"
            "      value: \"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:\" },\n"
            "  ],\n"
            "}],"
        ),
    },
]

# ── Document builder ─────────────────────────────────────────────────────────

def build_pdf():
    doc = SimpleDocTemplate(
        OUTPUT,
        pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=2.5*cm, bottomMargin=2.5*cm,
        title="Security Audit Report — unclassified-app",
        author="Security Audit (Claude Code)",
    )

    W = A4[0] - 4*cm   # usable width

    story = []

    # ── Cover header ─────────────────────────────────────────────────────────
    cover_data = [[
        Paragraph(
            '<font color="white"><b>SECURITY AUDIT REPORT</b></font>',
            ParagraphStyle("ch", fontName="Helvetica-Bold", fontSize=18,
                           textColor=C_WHITE, leading=22)
        )
    ]]
    cover = Table(cover_data, colWidths=[W])
    cover.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), C_BG),
        ("TOPPADDING",    (0,0), (-1,-1), 18),
        ("BOTTOMPADDING", (0,0), (-1,-1), 18),
        ("LEFTPADDING",   (0,0), (-1,-1), 16),
    ]))
    story.append(cover)
    story.append(sp(6))

    # Sub-header row
    meta_data = [[
        P("<b>Project:</b>  unclassified-app — DAR Region V Landholding Records", STYLE_SMALL),
        P(f"<b>Date:</b>  {date.today().strftime('%B %d, %Y')}", STYLE_SMALL),
    ]]
    meta = Table(meta_data, colWidths=[W*0.65, W*0.35])
    meta.setStyle(TableStyle([
        ("ALIGN", (1,0), (1,0), "RIGHT"),
        ("TOPPADDING", (0,0), (-1,-1), 0),
        ("BOTTOMPADDING", (0,0), (-1,-1), 0),
    ]))
    story.append(meta)
    story.append(sp(4))
    story.append(rule(C_ACCENT, 1.5))
    story.append(sp(4))

    # ── Executive summary ────────────────────────────────────────────────────
    story.append(P("<b>Executive Summary</b>", STYLE_H2))
    story.append(P(
        "A full-stack security audit was performed on the <b>unclassified-app</b> "
        "Next.js 16.2.1 application — an internal DAR Region V landholding records "
        "management system. The audit covered all 27 API routes, the authentication "
        "layer, session management, file upload handling, and dependency CVEs. "
        "No test suite existed prior to this audit.",
        STYLE_BODY
    ))
    story.append(sp(8))

    # Summary table
    sev_summary = [
        ["Severity", "Count", "Status"],
        ["High",     "2",     "Open"],
        ["Medium",   "3",     "Open"],
        ["Low",      "1",     "Open"],
        ["Info",     "2",     "Open"],
        ["TOTAL",    "9",     ""],
    ]
    sev_cols = [W*0.45, W*0.25, W*0.30]
    sev_table = Table(sev_summary, colWidths=sev_cols)
    sev_table.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), C_BG),
        ("TEXTCOLOR",  (0,0), (-1,0), C_WHITE),
        ("FONTNAME",   (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE",   (0,0), (-1,-1), 9),
        ("ALIGN",      (1,0), (-1,-1), "CENTER"),
        ("ROWBACKGROUNDS", (0,1), (-1,-2),
         [SEV_BG["High"], SEV_BG["Medium"], SEV_BG["Low"], SEV_BG["Info"]]),
        ("BACKGROUND", (0,-1), (-1,-1), C_LIGHT),
        ("FONTNAME",   (0,-1), (-1,-1), "Helvetica-Bold"),
        ("GRID", (0,0), (-1,-1), 0.4, C_BORDER),
        ("TOPPADDING",    (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ("LEFTPADDING",   (0,0), (-1,-1), 10),
    ]))
    story.append(sev_table)
    story.append(sp(10))

    story.append(P(
        "<b>Top-line takeaway:</b> The two highest-risk issues — a hardcoded fallback "
        "JWT secret and an unpatched Prototype Pollution vulnerability in the xlsx "
        "file-upload parser — can both be resolved with targeted code changes. "
        "Three medium-severity session and authentication hardening items round out "
        "the priority fixes.",
        STYLE_BODY
    ))
    story.append(sp(10))
    story.append(rule(C_BORDER))

    # ── Scope ────────────────────────────────────────────────────────────────
    story.append(P("<b>Scope</b>", STYLE_H2))
    scope_items = [
        "<b>In scope:</b> Next.js 16.2.1 App Router, 27 API routes, custom JWT "
        "session layer (lib/session.ts), NextAuth Credentials provider, Prisma ORM + "
        "better-sqlite3, ARB Excel/CSV upload handler, all page-level proxy rules, "
        "dependency CVE scan (npm audit), .env secrets review.",
        "<b>Out of scope:</b> Hosting environment (server/OS configuration not "
        "reviewed), Vercel/cloud infra settings, third-party SaaS internals, client "
        "browser extensions, physical security, network perimeter.",
    ]
    for item in scope_items:
        story.append(P(f"&#8226;  {item}", STYLE_BULLET))
    story.append(sp(10))
    story.append(rule(C_BORDER))

    # ── Findings ─────────────────────────────────────────────────────────────
    story.append(P("<b>Findings</b>", STYLE_H2))

    for f in FINDINGS:
        sev = f["severity"]
        sev_col = SEV_COLORS.get(sev, C_GRAY)
        sev_bg  = SEV_BG.get(sev, C_LIGHT)

        # Finding header bar
        hdr_data = [[
            Paragraph(
                f'<font color="white"><b>{f["id"]}</b></font>',
                ParagraphStyle("fid", fontName="Helvetica-Bold", fontSize=9,
                               textColor=C_WHITE)
            ),
            Paragraph(
                f'<b>{f["title"]}</b>',
                ParagraphStyle("ftitle", fontName="Helvetica-Bold", fontSize=10,
                               textColor=C_WHITE)
            ),
            Paragraph(
                f'<font color="white"><b>{sev}</b></font>',
                ParagraphStyle("fsev", fontName="Helvetica-Bold", fontSize=9,
                               textColor=C_WHITE, alignment=TA_RIGHT)
            ),
        ]]
        hdr = Table(hdr_data, colWidths=[W*0.10, W*0.67, W*0.23])
        hdr.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,-1), sev_col),
            ("TOPPADDING",    (0,0), (-1,-1), 8),
            ("BOTTOMPADDING", (0,0), (-1,-1), 8),
            ("LEFTPADDING",   (0,0), (-1,-1), 10),
            ("RIGHTPADDING",  (-1,0), (-1,-1), 10),
            ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ]))

        # Location row
        loc_data = [[
            Paragraph('<b>Location</b>', STYLE_LABEL),
            Paragraph(f['location'],
                      ParagraphStyle("loc", fontName="Courier", fontSize=8,
                                     textColor=colors.HexColor("#475569"))),
        ]]
        loc = Table(loc_data, colWidths=[W*0.15, W*0.85])
        loc.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,-1), sev_bg),
            ("TOPPADDING",    (0,0), (-1,-1), 5),
            ("BOTTOMPADDING", (0,0), (-1,-1), 5),
            ("LEFTPADDING",   (0,0), (-1,-1), 10),
            ("VALIGN", (0,0), (-1,-1), "TOP"),
        ]))

        # Why it was a risk
        why_body = [
            [Paragraph('<b>Why it is a risk</b>', STYLE_LABEL)],
            [Paragraph(f['why_risk'], STYLE_BODY)],
        ]
        why = Table(why_body, colWidths=[W])
        why.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,-1), C_WHITE),
            ("TOPPADDING",    (0,0), (-1,-1), 5),
            ("BOTTOMPADDING", (0,0), (-1,-1), 5),
            ("LEFTPADDING",   (0,0), (-1,-1), 10),
            ("RIGHTPADDING",  (0,0), (-1,-1), 10),
            ("LINEBELOW", (0,-1), (-1,-1), 0.3, C_BORDER),
        ]))

        # Evidence
        ev_body = [
            [Paragraph('<b>Evidence</b>', STYLE_LABEL)],
            [Paragraph(
                f['evidence'].replace('\n', '<br/>').replace(' ', '&nbsp;'),
                STYLE_CODE
            )],
        ]
        ev = Table(ev_body, colWidths=[W])
        ev.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,-1), C_WHITE),
            ("TOPPADDING",    (0,0), (-1,-1), 5),
            ("BOTTOMPADDING", (0,0), (-1,-1), 5),
            ("LEFTPADDING",   (0,0), (-1,-1), 10),
            ("RIGHTPADDING",  (0,0), (-1,-1), 10),
            ("LINEBELOW", (0,-1), (-1,-1), 0.3, C_BORDER),
        ]))

        # Fix
        fix_rows = [
            [Paragraph('<b>Proposed fix</b>', STYLE_LABEL)],
            [Paragraph(f['fix'], STYLE_BODY)],
            [Paragraph(
                f['fix_code'].replace('\n', '<br/>').replace(' ', '&nbsp;'),
                STYLE_CODE
            )],
        ]
        fix = Table(fix_rows, colWidths=[W])
        fix.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,-1), C_WHITE),
            ("TOPPADDING",    (0,0), (-1,-1), 5),
            ("BOTTOMPADDING", (0,0), (-1,-1), 5),
            ("LEFTPADDING",   (0,0), (-1,-1), 10),
            ("RIGHTPADDING",  (0,0), (-1,-1), 10),
        ]))

        outer = Table(
            [[hdr], [loc], [why], [ev], [fix]],
            colWidths=[W]
        )
        outer.setStyle(TableStyle([
            ("BOX",    (0,0), (-1,-1), 0.6, sev_col),
            ("TOPPADDING",    (0,0), (-1,-1), 0),
            ("BOTTOMPADDING", (0,0), (-1,-1), 0),
            ("LEFTPADDING",   (0,0), (-1,-1), 0),
            ("RIGHTPADDING",  (0,0), (-1,-1), 0),
        ]))

        story.append(KeepTogether([outer, sp(4)]))
        story.append(sp(10))

    # ── Cleared threats ──────────────────────────────────────────────────────
    story.append(rule(C_BORDER))
    story.append(P("<b>Cleared Threats</b>", STYLE_H2))
    story.append(P(
        "The following threat categories were investigated and found not to apply "
        "to this codebase:",
        STYLE_BODY
    ))
    story.append(sp(6))

    cleared = [
        ["Threat", "Reason"],
        ["SQL Injection (dynamic SET clause)",
         "Column names come from a developer-defined object, not user input. Values use ? parameterization."],
        ["SQL Injection ($queryRaw)",
         "Tagged template literal — Prisma parameterizes automatically. No user input in query body."],
        ["Command Injection",
         "No child_process.exec, execSync, spawn, or eval calls in any API route."],
        ["CSRF",
         "Cookie is SameSite: lax. All mutation routes require Content-Type: application/json — plain cross-origin form posts cannot set this header."],
        ["SSRF",
         "No user-supplied URLs are fetched at runtime. No webhook, avatar, or import URL features."],
        ["XSS (stored/reflected)",
         "React JSX escapes all output. No dangerouslySetInnerHTML usage found. No server-side HTML string construction with user input."],
        ["Deserialization RCE",
         "No pickle, yaml.load, eval(JSON.parse(...)), or equivalent patterns. req.json() is safe."],
        ["Secret leakage to client bundle",
         "No NEXT_PUBLIC_ prefixed env vars found. AUTH_SECRET is server-side only."],
        ["Prototype Pollution (defu/hono)",
         "Affected packages are transitive dev-only dependencies (via @prisma/dev). Not in the runtime bundle."],
    ]
    ct = Table(cleared, colWidths=[W*0.38, W*0.62])
    ct.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), C_BG),
        ("TEXTCOLOR",  (0,0), (-1,0), C_WHITE),
        ("FONTNAME",   (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE",   (0,0), (-1,-1), 8.5),
        ("FONTNAME",   (0,1), (0,-1), "Helvetica-Oblique"),
        ("GRID", (0,0), (-1,-1), 0.3, C_BORDER),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [C_WHITE, C_LIGHT]),
        ("TOPPADDING",    (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ("LEFTPADDING",   (0,0), (-1,-1), 8),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
    ]))
    story.append(ct)
    story.append(sp(12))

    # ── Recommendations ───────────────────────────────────────────────────────
    story.append(rule(C_BORDER))
    story.append(P("<b>Recommendations for Next Audit</b>", STYLE_H2))
    recs = [
        "Adopt a SAST tool in CI (e.g., Semgrep with the security ruleset) to catch issues before they reach code review.",
        "Add a test suite (vitest recommended for this stack) — this audit could not write pen tests because no runner exists.",
        "Rotate AUTH_SECRET on a defined schedule (e.g., annually, or immediately after any suspected compromise).",
        "Consider a server-side session store (Redis or DB table) to enable true JWT revocation on logout.",
        "Review the ARB upload file size limit — add an explicit limit in the route handler rather than relying on Next.js defaults.",
        "Evaluate migrating the remaining xlsx write paths (records/export, arbs/export) to exceljs after the upload parser is migrated.",
    ]
    for rec in recs:
        story.append(P(f"&#8226;  {rec}", STYLE_BULLET))

    story.append(sp(16))
    story.append(rule(C_MUTED, 0.3))
    story.append(sp(4))
    story.append(P(
        f"Report generated {date.today().strftime('%B %d, %Y')} &nbsp;&#8226;&nbsp; "
        "unclassified-app security audit &nbsp;&#8226;&nbsp; "
        "Claude Code / security-audit skill",
        ParagraphStyle("footer", fontName="Helvetica", fontSize=7.5,
                       textColor=C_MUTED, alignment=TA_CENTER)
    ))

    doc.build(story)
    print(f"PDF written to: {OUTPUT}")


if __name__ == "__main__":
    build_pdf()
