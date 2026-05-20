#!/usr/bin/env python3
"""
Generate USER_MANUAL.pdf from USER_MANUAL.md
DAR Bicol Region -- Unclassified ARRs Data Management System
"""

import re
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable, KeepTogether
)
from reportlab.platypus.flowables import Flowable
from reportlab.lib.enums import TA_LEFT, TA_CENTER

# ---------------------------------------------------------------------------
# Colors
# ---------------------------------------------------------------------------
GREEN_DARK   = colors.HexColor("#14532d")
GREEN_MED    = colors.HexColor("#166534")
GREEN_LIGHT  = colors.HexColor("#dcfce7")
GREEN_ACCENT = colors.HexColor("#4ade80")
GREEN_H3_BG  = colors.HexColor("#f0fdf4")
GRAY_TEXT    = colors.HexColor("#374151")
GRAY_LIGHT   = colors.HexColor("#f9fafb")
GRAY_BORDER  = colors.HexColor("#e5e7eb")
NOTE_BG      = colors.HexColor("#fefce8")
NOTE_BORDER  = colors.HexColor("#fbbf24")
WHITE        = colors.white

PAGE_W, PAGE_H = A4
MARGIN = 2.0 * cm

# ---------------------------------------------------------------------------
# Styles
# ---------------------------------------------------------------------------
def make_styles():
    s = {}

    s["body"] = ParagraphStyle(
        "body", fontName="Helvetica", fontSize=10, leading=15,
        textColor=GRAY_TEXT, spaceAfter=4,
    )
    s["body_bold_lead"] = ParagraphStyle(
        "body_bold_lead", parent=s["body"], spaceAfter=2,
    )
    s["bullet"] = ParagraphStyle(
        "bullet", parent=s["body"], leftIndent=18, spaceAfter=3,
    )
    s["numbered"] = ParagraphStyle(
        "numbered", parent=s["body"], leftIndent=22, spaceAfter=4,
    )
    s["note_inner"] = ParagraphStyle(
        "note_inner", fontName="Helvetica", fontSize=9.5, leading=14,
        textColor=colors.HexColor("#78350f"),
    )
    s["table_hdr"] = ParagraphStyle(
        "table_hdr", fontName="Helvetica-Bold", fontSize=9,
        leading=12, textColor=WHITE, alignment=TA_LEFT,
    )
    s["table_cell"] = ParagraphStyle(
        "table_cell", fontName="Helvetica", fontSize=9,
        leading=13, textColor=GRAY_TEXT, alignment=TA_LEFT,
    )
    s["toc_main"] = ParagraphStyle(
        "toc_main", fontName="Helvetica", fontSize=10.5,
        leading=20, textColor=GRAY_TEXT,
    )
    s["toc_sub"] = ParagraphStyle(
        "toc_sub", fontName="Helvetica", fontSize=9.5,
        leading=17, textColor=colors.HexColor("#6b7280"), leftIndent=20,
    )
    s["italic_footer"] = ParagraphStyle(
        "italic_footer", fontName="Helvetica-Oblique", fontSize=9,
        textColor=colors.HexColor("#9ca3af"), alignment=TA_CENTER,
    )
    return s

# ---------------------------------------------------------------------------
# Custom Flowables
# ---------------------------------------------------------------------------
class SectionHeading(Flowable):
    """Green banner heading for H2 sections."""
    HEIGHT = 30

    def __init__(self, text):
        super().__init__()
        self.text = text
        self._avail_w = 0

    def wrap(self, aw, ah):
        self._avail_w = aw
        return aw, self.HEIGHT

    def draw(self):
        c = self.canv
        c.setFillColor(GREEN_DARK)
        c.roundRect(0, 0, self._avail_w, self.HEIGHT, 5, fill=1, stroke=0)
        c.setFillColor(WHITE)
        c.setFont("Helvetica-Bold", 12)
        c.drawString(12, 9, self.text)


class SubsectionHeading(Flowable):
    """Left-accented heading for H3 subsections."""
    HEIGHT = 24

    def __init__(self, text):
        super().__init__()
        self.text = text
        self._avail_w = 0

    def wrap(self, aw, ah):
        self._avail_w = aw
        return aw, self.HEIGHT

    def draw(self):
        c = self.canv
        c.setFillColor(GREEN_H3_BG)
        c.rect(0, 0, self._avail_w, self.HEIGHT, fill=1, stroke=0)
        c.setFillColor(GREEN_ACCENT)
        c.rect(0, 0, 4, self.HEIGHT, fill=1, stroke=0)
        c.setFillColor(GREEN_DARK)
        c.setFont("Helvetica-Bold", 10.5)
        c.drawString(14, 7, self.text)


class NoteBox(Flowable):
    """Yellow note/blockquote box."""
    PADDING = 10
    LEFT_BAR = 4

    def __init__(self, html_text, styles):
        super().__init__()
        self._text = html_text
        self._styles = styles
        self._para = None
        self._avail_w = 0

    def _make_para(self, w):
        inner_w = w - self.LEFT_BAR - self.PADDING * 2
        self._para = Paragraph(self._text, self._styles["note_inner"])
        pw, ph = self._para.wrap(inner_w, 9999)
        return ph

    def wrap(self, aw, ah):
        self._avail_w = aw
        ph = self._make_para(aw)
        self.height = ph + self.PADDING * 2
        return aw, self.height

    def draw(self):
        c = self.canv
        c.setFillColor(NOTE_BG)
        c.roundRect(0, 0, self._avail_w, self.height, 4, fill=1, stroke=0)
        c.setFillColor(NOTE_BORDER)
        c.rect(0, 0, self.LEFT_BAR, self.height, fill=1, stroke=0)
        self._para.drawOn(c, self.LEFT_BAR + self.PADDING, self.PADDING)


# ---------------------------------------------------------------------------
# Inline text processing
# ---------------------------------------------------------------------------
_SPECIAL = [("&", "&amp;"), ("<", "&lt;"), (">", "&gt;")]
_NE_CHAR = "\u2260"  # ≠

def process_inline(text: str) -> str:
    for ch, esc in _SPECIAL:
        text = text.replace(ch, esc)
    # ≠ not in Helvetica glyphs -- replace with text
    text = text.replace(_NE_CHAR, "does not equal")
    # Bold **text**
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    # Inline code `text`
    text = re.sub(
        r"`([^`]+)`",
        r'<font name="Courier" size="9" color="#065f46">\1</font>',
        text,
    )
    # Links [label](href) -- show label only
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    # Arrow notation
    text = text.replace(" --> ", " \u2192 ")
    return text


# ---------------------------------------------------------------------------
# Markdown parser
# ---------------------------------------------------------------------------
_TABLE_SEP_RE = re.compile(r"^\|[-| :]+\|$")
_NUMBERED_RE  = re.compile(r"^(\d+)\.\s+(.*)")


def parse_markdown(md_text: str, styles: dict) -> list:
    lines = md_text.split("\n")
    flow = []
    i = 0

    def sp(h=4):
        flow.append(Spacer(1, h))

    while i < len(lines):
        line = lines[i]
        s = line.strip()

        # ── H1 (title) -- skip, handled on cover ──────────────────────────
        if s.startswith("# ") and not s.startswith("## "):
            i += 1
            continue

        # ── H2 ────────────────────────────────────────────────────────────
        if s.startswith("## "):
            title = s[3:].strip()
            if title == "Table of Contents":
                # skip TOC block -- rendered separately
                i += 1
                while i < len(lines):
                    ls = lines[i].strip()
                    if ls.startswith("---") or ls.startswith("## "):
                        break
                    i += 1
                continue
            sp(8)
            flow.append(SectionHeading(title))
            sp(6)
            i += 1
            continue

        # ── H3 ────────────────────────────────────────────────────────────
        if s.startswith("### "):
            title = s[4:].strip()
            sp(4)
            flow.append(SubsectionHeading(title))
            sp(5)
            i += 1
            continue

        # ── Horizontal rule ───────────────────────────────────────────────
        if s == "---":
            sp(4)
            flow.append(HRFlowable(width="100%", thickness=0.5, color=GRAY_BORDER))
            sp(4)
            i += 1
            continue

        # ── Blockquote ────────────────────────────────────────────────────
        if s.startswith("> "):
            parts = [s[2:]]
            while i + 1 < len(lines) and lines[i + 1].strip().startswith("> "):
                i += 1
                parts.append(lines[i].strip()[2:])
            text = " ".join(parts)
            flow.append(NoteBox(process_inline(text), styles))
            sp(6)
            i += 1
            continue

        # ── Markdown table ────────────────────────────────────────────────
        if s.startswith("|") and i + 1 < len(lines) and lines[i + 1].strip().startswith("|---"):
            rows_raw = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                rows_raw.append(lines[i].strip())
                i += 1

            # parse rows, skip separator
            parsed_rows = []
            for row_str in rows_raw:
                if _TABLE_SEP_RE.match(row_str):
                    continue
                cells = [c.strip() for c in row_str.split("|")[1:-1]]
                parsed_rows.append(cells)

            if not parsed_rows:
                continue

            ncols = len(parsed_rows[0])
            aw = PAGE_W - 2 * MARGIN
            col_w = aw / ncols

            td = []
            for r_idx, row in enumerate(parsed_rows):
                sty = styles["table_hdr"] if r_idx == 0 else styles["table_cell"]
                td.append([Paragraph(process_inline(c), sty) for c in row])

            t = Table(td, colWidths=[col_w] * ncols, repeatRows=1)
            t.setStyle(TableStyle([
                ("BACKGROUND",    (0, 0), (-1, 0),  GREEN_DARK),
                ("TEXTCOLOR",     (0, 0), (-1, 0),  WHITE),
                ("ROWBACKGROUNDS",(0, 1), (-1, -1), [WHITE, GRAY_LIGHT]),
                ("GRID",          (0, 0), (-1, -1), 0.3, GRAY_BORDER),
                ("BOX",           (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
                ("TOPPADDING",    (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LEFTPADDING",   (0, 0), (-1, -1), 8),
                ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
                ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
            ]))
            flow.append(t)
            sp(8)
            continue

        # ── Bullet list ───────────────────────────────────────────────────
        if s.startswith("- "):
            text = s[2:]
            flow.append(Paragraph(
                f"<bullet>\u2022</bullet>{process_inline(text)}",
                styles["bullet"],
            ))
            i += 1
            continue

        # ── Numbered list ─────────────────────────────────────────────────
        m = _NUMBERED_RE.match(s)
        if m:
            flow.append(Paragraph(
                f"<b>{m.group(1)}.</b>  {process_inline(m.group(2))}",
                styles["numbered"],
            ))
            i += 1
            continue

        # ── Empty line ────────────────────────────────────────────────────
        if not s:
            sp(4)
            i += 1
            continue

        # ── Italic footer (*text*) ─────────────────────────────────────────
        if s.startswith("*") and s.endswith("*") and not s.startswith("**"):
            flow.append(Paragraph(process_inline(s[1:-1]), styles["italic_footer"]))
            i += 1
            continue

        # ── Normal paragraph ──────────────────────────────────────────────
        flow.append(Paragraph(process_inline(s), styles["body"]))
        i += 1

    return flow


# ---------------------------------------------------------------------------
# Cover page (drawn via onFirstPage callback)
# ---------------------------------------------------------------------------
def draw_cover(c, doc):
    w, h = A4

    # Top green band
    c.setFillColor(GREEN_DARK)
    c.rect(0, h - 9.5 * cm, w, 9.5 * cm, fill=1, stroke=0)

    # Subtle grid overlay
    c.saveState()
    c.setStrokeColor(GREEN_ACCENT)
    c.setLineWidth(0.25)
    c.setStrokeAlpha(0.07)
    for x in range(0, int(w) + 1, 22):
        c.line(x, h - 9.5 * cm, x, h)
    for y in range(int(h - 9.5 * cm), int(h) + 1, 22):
        c.line(0, y, w, y)
    c.restoreState()

    # Republic / agency
    c.setFillColor(colors.HexColor("#86efac"))
    c.setFont("Helvetica", 8)
    c.drawCentredString(w / 2, h - 2.6 * cm,
                        "Republic of the Philippines  \u00b7  Department of Agrarian Reform")

    c.setFillColor(colors.HexColor("#4ade80"))
    c.setFont("Helvetica-Bold", 9)
    c.drawCentredString(w / 2, h - 3.3 * cm,
                        "BICOL REGION  \u00b7  REGIONAL OFFICE NO. V")

    # Title
    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 34)
    c.drawCentredString(w / 2, h - 5.4 * cm, "USER MANUAL")

    # Subtitle
    c.setFillColor(colors.HexColor("#bbf7d0"))
    c.setFont("Helvetica", 13)
    c.drawCentredString(w / 2, h - 6.6 * cm,
                        "Unclassified ARRs Data Management System")

    # Separator line
    c.setStrokeColor(GREEN_ACCENT)
    c.setLineWidth(1.5)
    c.setStrokeAlpha(0.35)
    c.line(MARGIN + 2 * cm, h - 7.5 * cm, w - MARGIN - 2 * cm, h - 7.5 * cm)
    c.setStrokeAlpha(1.0)

    # LTID badge
    bw, bh = 5.5 * cm, 0.95 * cm
    bx, by = w / 2 - bw / 2, h - 8.8 * cm
    c.setFillColor(colors.HexColor("#dcfce7"))
    c.roundRect(bx, by, bw, bh, 5, fill=1, stroke=0)
    c.setFillColor(GREEN_DARK)
    c.setFont("Helvetica-Bold", 9)
    c.drawCentredString(w / 2, by + 0.3 * cm, "LTID Group  \u00b7  2026")

    # What this manual covers
    c.setFillColor(GRAY_TEXT)
    c.setFont("Helvetica", 10.5)
    c.drawCentredString(w / 2, h - 11.5 * cm, "This manual covers:")

    features = [
        "Logging in and setting up your account",
        "Navigating the system and the dashboard",
        "Browsing, searching, and viewing records",
        "Batch updates for landholdings and ARBs",
        "Business rules, statuses, and data validations",
        "Audit Log, User Management, and Backup",
    ]
    c.setFont("Helvetica", 10)
    c.setFillColor(colors.HexColor("#6b7280"))
    for j, feat in enumerate(features):
        c.drawCentredString(w / 2, h - 12.5 * cm - j * 0.65 * cm, f"\u2022  {feat}")

    # Bottom bar
    c.setFillColor(GRAY_LIGHT)
    c.rect(0, 0, w, 1.8 * cm, fill=1, stroke=0)
    c.setFillColor(colors.HexColor("#9ca3af"))
    c.setFont("Helvetica", 8)
    c.drawCentredString(w / 2, 0.65 * cm,
                        "For internal use only  \u00b7  DAR Bicol Region V  \u00b7  LTID Group")


# ---------------------------------------------------------------------------
# Running header / footer (all pages except cover)
# ---------------------------------------------------------------------------
def draw_header_footer(c, doc):
    w, h = A4
    c.saveState()
    # Header
    c.setStrokeColor(GRAY_BORDER)
    c.setLineWidth(0.5)
    c.line(MARGIN, h - MARGIN + 5, w - MARGIN, h - MARGIN + 5)
    c.setFont("Helvetica", 8)
    c.setFillColor(colors.HexColor("#6b7280"))
    c.drawString(MARGIN, h - MARGIN + 9,
                 "Unclassified ARRs Data Management System  \u2014  User Manual")
    c.drawRightString(w - MARGIN, h - MARGIN + 9, f"Page {doc.page}")
    # Footer
    c.line(MARGIN, MARGIN - 5, w - MARGIN, MARGIN - 5)
    c.setFillColor(colors.HexColor("#9ca3af"))
    c.drawCentredString(w / 2, MARGIN - 14,
                        "LTID Group  \u00b7  DAR Bicol Region V  \u00b7  2026")
    c.restoreState()


# ---------------------------------------------------------------------------
# Table of Contents flowables
# ---------------------------------------------------------------------------
TOC_ENTRIES = [
    (False, "1.",   "What Is This System?"),
    (False, "2.",   "Business Rules"),
    (True,  "2.1",  "ARR Statuses"),
    (True,  "2.2",  "Key Business Rules"),
    (True,  "2.3",  "Data Validation Rules"),
    (True,  "2.4",  "Priority Targets"),
    (False, "3.",   "Logging In"),
    (False, "4.",   "Navigating the System"),
    (False, "5.",   "Dashboard"),
    (False, "6.",   "Records Browser"),
    (False, "7.",   "Batch Update (LH)"),
    (True,  "7.1",  "LH Info Update"),
    (True,  "7.2",  "Area & Amount Confirmation"),
    (False, "8.",   "ARB Batch Update"),
    (True,  "8.1",  "ARB Upload & Viewer"),
    (True,  "8.2",  "ARB Info Update"),
    (False, "9.",   "Audit Log"),
    (False, "10.",  "User Management"),
    (False, "11.",  "Backup"),
    (False, "12.",  "Changing Your Password"),
    (False, "13.",  "Roles and What Each Role Can Do"),
    (False, "14.",  "Troubleshooting"),
]


def build_toc(styles) -> list:
    flow = []
    flow.append(SectionHeading("Table of Contents"))
    flow.append(Spacer(1, 14))

    for is_sub, num, title in TOC_ENTRIES:
        sty = styles["toc_sub"] if is_sub else styles["toc_main"]
        bold_num = f"<b>{num}</b>"
        flow.append(Paragraph(f"{bold_num}&nbsp;&nbsp;&nbsp;{title}", sty))

    return flow


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    import os
    base = r"C:\Users\Jestoni Esteves\claude\unclassified-app"
    md_path  = os.path.join(base, "USER_MANUAL.md")
    pdf_path = os.path.join(base, "USER_MANUAL.pdf")

    with open(md_path, encoding="utf-8") as f:
        md_text = f.read()

    styles = make_styles()

    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=A4,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=MARGIN + 0.6 * cm,
        bottomMargin=MARGIN + 0.6 * cm,
        title="User Manual — Unclassified ARRs Data Management System",
        author="LTID Group · DAR Bicol Region V",
        subject="User Manual for the Unclassified ARRs DMS",
    )

    story = []

    # Page 1: cover (drawn via onFirstPage callback; story is invisible)
    story.append(Spacer(1, 1))
    story.append(PageBreak())

    # Page 2: TOC
    story.extend(build_toc(styles))
    story.append(PageBreak())

    # Pages 3+: content
    story.extend(parse_markdown(md_text, styles))

    doc.build(
        story,
        onFirstPage=draw_cover,
        onLaterPages=draw_header_footer,
    )

    print(f"Done: {pdf_path}")


if __name__ == "__main__":
    main()
