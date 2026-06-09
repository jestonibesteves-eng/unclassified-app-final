"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { BulkEntry, BulkProgressResponse } from "@/app/api/progress/bulk/route";
import { daysToDeadline } from "@/lib/gauge-utils";

const PROVINCES = [
  "ALBAY", "CAMARINES NORTE", "CAMARINES SUR - I",
  "CAMARINES SUR - II", "CATANDUANES", "MASBATE", "SORSOGON",
];

const PROVINCE_DISPLAY: Record<string, string> = {
  "ALBAY":              "Albay",
  "CAMARINES NORTE":    "Camarines Norte",
  "CAMARINES SUR - I":  "Camarines Sur I",
  "CAMARINES SUR - II": "Camarines Sur II",
  "CATANDUANES":        "Catanduanes",
  "MASBATE":            "Masbate",
  "SORSOGON":           "Sorsogon",
};

const EMPTY: BulkEntry = {
  committed_cocroms: 0,
  validation:   { total: 0, completed: 0, area_total: 0, area_completed: 0, amount_total: 0, amount_completed: 0 },
  encoding:     { cocrom_total: 0, cocrom_completed: 0, arb_total: 0, arb_completed: 0, area_total: 0, area_completed: 0, amount_total: 0, amount_completed: 0, lh_validated: 0, lh_not_validated: 0 },
  distribution: { cocrom_total: 0, cocrom_completed: 0, arb_total: 0, arb_completed: 0, area_total: 0, area_completed: 0, amount_total: 0, amount_completed: 0, lh_validated: 0, lh_not_validated: 0 },
};

// ── Shared style tokens ───────────────────────────────────────────────────────
const CELL_BORDER   = "1px solid #6b7280";
const SEC_BORDER_L  = "2px solid #374151";
const TH_BG_SECTION = "#1f2937";
const COMMIT_BG     = "#f5f3ff"; // violet-50 tint for Commitment columns
const COMMIT_TH_BG  = "#2e1065"; // deep violet for Commitment sub-headers

function calcPct(c: number, t: number) { return t > 0 ? (c / t) * 100 : 0; }
function pctColor(p: number) { return p >= 80 ? "#16a34a" : p >= 50 ? "#d97706" : p > 0 ? "#dc2626" : "#9ca3af"; }

// Number cell
function N({ v, area, amount, bold, sec, gray, bg }: {
  v: number; area?: boolean; amount?: boolean; bold?: boolean; sec?: boolean; gray?: boolean; bg?: string;
}) {
  const display = v > 0
    ? area
      ? v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : amount
      ? "₱ " + v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : v.toLocaleString()
    : "";
  return (
    <td style={{
      padding: "3px 7px",
      textAlign: "right",
      verticalAlign: "middle",
      fontSize: "10px",
      fontWeight: bold ? 700 : 400,
      color: bold ? "#111827" : "#374151",
      whiteSpace: "nowrap",
      background: gray ? "#f3f4f6" : (bg ?? undefined),
      borderTop: CELL_BORDER,
      borderRight: CELL_BORDER,
      borderBottom: CELL_BORDER,
      borderLeft: sec ? SEC_BORDER_L : CELL_BORDER,
    }}>
      {display || <span style={{ color: "#d1d5db", fontWeight: 400 }}>—</span>}
    </td>
  );
}

// Merged progress bar + % text
function Pct({ c, t, bold, gray, bg }: { c: number; t: number; bold?: boolean; gray?: boolean; bg?: string }) {
  if (gray) {
    return (
      <td style={{
        minWidth: "64px", padding: "3px 4px",
        border: CELL_BORDER, background: "#f3f4f6", verticalAlign: "middle",
      }} />
    );
  }
  if (t === 0) {
    return (
      <td style={{
        minWidth: "64px", padding: "3px 4px",
        border: CELL_BORDER, textAlign: "center", verticalAlign: "middle",
        background: bg ?? undefined,
      }}>
        <span style={{ color: "#d1d5db", fontSize: "9px" }}>—</span>
      </td>
    );
  }
  const p  = calcPct(c, t);
  const clr = pctColor(p);
  return (
    <td style={{
      minWidth: "64px", padding: 0,
      border: CELL_BORDER,
      position: "relative",
      overflow: "hidden",
      verticalAlign: "middle",
    }}>
      {/* bg tint layer (shown where bar doesn't reach) */}
      {bg && <div style={{ position: "absolute", inset: 0, background: bg }} />}
      {/* bar fill */}
      <div style={{
        position: "absolute", top: 0, left: 0, bottom: 0,
        width: `${Math.min(p, 100)}%`,
        background: clr, opacity: 0.85,
      }} />
      {/* text */}
      <div style={{
        position: "relative",
        textAlign: "right",
        padding: "4px 6px",
        fontSize: "10px",
        fontWeight: bold ? 800 : 700,
        color: p >= 60 ? "#fff" : clr,
        lineHeight: 1.2,
        textShadow: p >= 60 ? "0 0 3px rgba(0,0,0,0.35)" : "none",
      }}>
        {p.toFixed(0)}%
      </div>
    </td>
  );
}

// Province / R-V TOTAL data row
function DataRow({ label, entry, isTotalRow = false }: {
  label: string; entry: BulkEntry; isTotalRow?: boolean;
}) {
  const { validation: v, encoding: e, distribution: d, committed_cocroms: cc } = entry;
  const available = d.cocrom_total - d.cocrom_completed;
  const rowBg     = isTotalRow ? "#f0fdf4" : undefined;
  const labelStyle: React.CSSProperties = {
    padding: "4px 8px",
    fontSize: isTotalRow ? "11px" : "10px",
    fontWeight: isTotalRow ? 800 : 600,
    color: isTotalRow ? "#14532d" : "#1f2937",
    whiteSpace: "nowrap",
    background: rowBg ?? "#fff",
    border: CELL_BORDER,
    borderTop: isTotalRow ? "2px solid #16a34a" : CELL_BORDER,
    borderRight: SEC_BORDER_L,
    verticalAlign: "middle",
    position: "sticky",
    left: 0,
    zIndex: 1,
  };
  return (
    <tr style={{ background: rowBg }}>
      <td style={labelStyle}>{label}</td>
      <N v={v.total}            bold={isTotalRow} sec />
      <N v={v.completed}        bold={isTotalRow} />
      <Pct c={v.completed}      t={v.total}            bold={isTotalRow} />
      <N v={e.cocrom_total}     bold={isTotalRow} sec />
      <N v={e.cocrom_completed} bold={isTotalRow} />
      <Pct c={e.cocrom_completed} t={e.cocrom_total}   bold={isTotalRow} />
      <N v={d.cocrom_total}     bold={isTotalRow} sec />
      <N v={d.cocrom_completed} bold={isTotalRow} />
      <Pct c={d.cocrom_completed} t={d.cocrom_total}   bold={isTotalRow} />
      <N v={cc}                 bold={isTotalRow} sec bg={COMMIT_BG} />
      <N v={available}          bold={isTotalRow}     bg={COMMIT_BG} />
      <Pct c={available}        t={cc}  bold={isTotalRow} bg={COMMIT_BG} />
    </tr>
  );
}

// Other Indicators row — only Val + Enc + Dist, Commitment cells are gray
function OtherRow({ label, valT, valC, encT, encC, distT, distC, area, amount }: {
  label: string;
  valT: number;  valC: number;
  encT: number;  encC: number;
  distT: number; distC: number;
  area?: boolean; amount?: boolean;
}) {
  const labelStyle: React.CSSProperties = {
    padding: "4px 8px", fontSize: "10px", fontWeight: 600, color: "#1f2937",
    whiteSpace: "nowrap", background: "#fff", border: CELL_BORDER, borderRight: SEC_BORDER_L,
    verticalAlign: "middle", position: "sticky", left: 0, zIndex: 1,
  };
  return (
    <tr>
      <td style={labelStyle}>{label}</td>
      <N v={valT}  area={area} amount={amount} sec />
      <N v={valC}  area={area} amount={amount} />
      <Pct c={valC}  t={valT} />
      <N v={encT}  area={area} amount={amount} sec />
      <N v={encC}  area={area} amount={amount} />
      <Pct c={encC}  t={encT} />
      <N v={distT} area={area} amount={amount} sec />
      <N v={distC} area={area} amount={amount} />
      <Pct c={distC} t={distT} />
      {/* Commitment columns — not applicable, no borders */}
      <td style={{ borderLeft: SEC_BORDER_L, background: "#f3f4f6" }} />
      <td style={{ background: "#f3f4f6" }} />
      <td style={{ background: "#f3f4f6" }} />
    </tr>
  );
}

export function ExecutiveSummaryModal({
  open, onClose, targetDate, publicToken,
}: {
  open: boolean;
  onClose: () => void;
  targetDate: string;
  publicToken?: string;
}) {
  const [data, setData]             = useState<BulkProgressResponse | null>(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const captureRef          = useRef<HTMLDivElement>(null);
  const modalContainerRef   = useRef<HTMLDivElement>(null); // max-h overflow-hidden
  const scrollBodyRef       = useRef<HTMLDivElement>(null); // overflow-auto flex-1

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || data) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (publicToken) params.set("token", publicToken);
    fetch(`/api/progress/bulk${params.toString() ? "?" + params.toString() : ""}`)
      .then(async (r) => {
        const text = await r.text();
        let json: unknown;
        try { json = JSON.parse(text); } catch { throw new Error(`Server error (${r.status})`); }
        if (!r.ok) throw new Error((json as { error?: string })?.error ?? `HTTP ${r.status}`);
        return json as BulkProgressResponse;
      })
      .then((json) => { setData(json); setLoading(false); })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load data.");
        setLoading(false);
      });
  }, [open, publicToken, data]);

  async function handleExport() {
    if (!captureRef.current) return;
    setExportError(null);

    // Collect every ancestor and descendant that has overflow or max-height constraints,
    // then temporarily strip them so the capture covers the full content with no scroll bars.
    type Saved = { node: HTMLElement; overflow: string; overflowX: string; overflowY: string; maxHeight: string };
    const saved: Saved[] = [];

    function unlockOverflow(node: HTMLElement) {
      const cs = window.getComputedStyle(node);
      if (
        ["hidden", "auto", "scroll"].includes(cs.overflow)  ||
        ["hidden", "auto", "scroll"].includes(cs.overflowX) ||
        cs.maxHeight !== "none"
      ) {
        saved.push({
          node,
          overflow:  node.style.overflow,
          overflowX: node.style.overflowX,
          overflowY: node.style.overflowY,
          maxHeight: node.style.maxHeight,
        });
        node.style.overflow  = "visible";
        node.style.overflowX = "visible";
        node.style.overflowY = "visible";
        node.style.maxHeight = "none";
      }
    }

    // Walk every ancestor up to <body>
    let ancestor = captureRef.current.parentElement;
    while (ancestor && ancestor !== document.body) {
      unlockOverflow(ancestor as HTMLElement);
      ancestor = ancestor.parentElement;
    }

    // Walk every descendant inside the capture area
    captureRef.current.querySelectorAll<HTMLElement>("*").forEach(unlockOverflow);

    // Also signal React state so the inner table wrapper renders overflow:visible
    setIsExporting(true);
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

    try {
      const { toPng } = await import("html-to-image");
      const el  = captureRef.current;
      // scrollWidth includes left padding but drops right padding when content
      // overflows, so read the computed value and add it back explicitly.
      const rightPad = parseFloat(window.getComputedStyle(el).paddingRight) || 0;
      const url = await toPng(el, {
        pixelRatio: 3,
        backgroundColor: "#ffffff",
        width:  el.scrollWidth + rightPad,
        height: el.scrollHeight,
      });
      const a = document.createElement("a");
      a.href = url;
      a.download = `executive-summary-${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
    } catch {
      setExportError("Export failed. Please try again.");
    } finally {
      // Restore every saved overflow/max-height
      saved.forEach(({ node, overflow, overflowX, overflowY, maxHeight }) => {
        node.style.overflow  = overflow;
        node.style.overflowX = overflowX;
        node.style.overflowY = overflowY;
        node.style.maxHeight = maxHeight;
      });
      setIsExporting(false);
    }
  }

  if (!open) return null;

  const deadline    = new Date(`${targetDate}T00:00:00+08:00`);
  const daysLeft    = Math.max(1, daysToDeadline(deadline));
  const todayStr    = new Date().toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" });
  const deadlineStr = deadline.toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" });
  const commitHdr   = deadline.toLocaleDateString("en-US", { month: "long", day: "numeric" }).toUpperCase();

  const reg          = data?.region ?? EMPTY;
  const valRemaining = reg.validation.total - reg.validation.completed;
  const encRemaining = reg.encoding.cocrom_total - reg.encoding.cocrom_completed;
  const regionAvail  = reg.distribution.cocrom_total - reg.distribution.cocrom_completed;
  const commitNeeded = Math.max(0, reg.committed_cocroms - regionAvail);

  const valDaily    = valRemaining  > 0 ? Math.ceil(valRemaining  / daysLeft) : 0;
  const encDaily    = encRemaining  > 0 ? Math.ceil(encRemaining  / daysLeft) : 0;
  const commitDaily = commitNeeded  > 0 ? Math.ceil(commitNeeded  / daysLeft) : 0;

  // ── Table header cell styles ─────────────────────────────────────────────
  const thProvince: React.CSSProperties = {
    padding: "6px 8px",
    fontSize: "10px", fontWeight: 700,
    textTransform: "uppercase", letterSpacing: "0.05em",
    color: "#e5e7eb",
    background: TH_BG_SECTION,
    border: CELL_BORDER,
    borderRight: SEC_BORDER_L,
    verticalAlign: "middle",
    textAlign: "center",
    minWidth: "110px",
    position: "sticky",
    left: 0,
    zIndex: 3,
  };
  const thSectionBase = (color: string): React.CSSProperties => ({
    padding: "6px 4px",
    fontSize: "10px", fontWeight: 800,
    textTransform: "uppercase", letterSpacing: "0.1em",
    textAlign: "center",
    background: TH_BG_SECTION,
    color,
    border: CELL_BORDER,
    borderLeft: SEC_BORDER_L,
  });
  const thSubBase = (secStart?: boolean, customBg?: string): React.CSSProperties => ({
    padding: "5px 6px",
    fontSize: "8.5px", fontWeight: 600,
    textTransform: "uppercase", letterSpacing: "0.05em",
    color: "#d1d5db",
    background: customBg ?? "#374151",
    textAlign: "center",
    border: CELL_BORDER,
    borderLeft: secStart ? SEC_BORDER_L : CELL_BORDER,
    lineHeight: 1.4,
  });

  // ── Note cell ────────────────────────────────────────────────────────────
  const noteCell = (secStart?: boolean): React.CSSProperties => ({
    padding: "6px 8px",
    fontSize: "9px",
    fontStyle: "italic",
    color: "#6b7280",
    verticalAlign: "top",
    lineHeight: 1.6,
    border: CELL_BORDER,
    borderLeft: secStart ? SEC_BORDER_L : CELL_BORDER,
    background: "#f9fafb",
  });

  // ── Section label row style ───────────────────────────────────────────────
  const oiHeaderCell: React.CSSProperties = {
    padding: "5px 8px",
    fontSize: "10px", fontWeight: 700,
    color: "#374151",
    background: "#f3f4f6",
    border: CELL_BORDER,
    borderTop: "2px solid #6b7280",
  };
  const oiSubHeaderCell: React.CSSProperties = {
    padding: "3px 8px",
    fontSize: "9px",
    color: "#9ca3af",
    background: "#f9fafb",
    border: CELL_BORDER,
  };

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div ref={modalContainerRef}
           className="bg-white rounded-2xl shadow-2xl w-full max-h-[96vh] overflow-hidden flex flex-col"
           style={{ maxWidth: "1120px" }}>

        {/* Modal header */}
        <div className="bg-green-900 px-5 py-3.5 flex items-center justify-between rounded-t-2xl shrink-0">
          <div>
            <h2 className="text-sm font-bold text-green-200 uppercase tracking-[0.1em]">Executive Summary</h2>
            <p className="text-[11px] text-green-500 mt-0.5">
              Validation, COCROM Encoding and Distribution · Region V
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!publicToken && (
              <button
                onClick={handleExport}
                disabled={loading || !!error}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-700 text-white text-[10px] font-semibold hover:bg-green-600 disabled:opacity-50 transition-colors"
              >
                <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 12l-4-4h2.5V2h3v6H12L8 12z"/>
                  <rect x="2" y="13" width="12" height="1.5" rx="0.75"/>
                </svg>
                Export
              </button>
            )}
            <button
              onClick={onClose}
              className="text-green-400 hover:text-white text-xl leading-none w-7 h-7 flex items-center justify-center rounded-lg hover:bg-green-800 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div ref={scrollBodyRef} className="overflow-auto flex-1">
          {error ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 px-5">
              <p className="text-red-500 text-sm">{error}</p>
              <button onClick={() => { setError(null); setData(null); }}
                      className="px-4 py-2 rounded-lg bg-green-700 text-white text-sm hover:bg-green-800">
                Retry
              </button>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-green-700 border-t-transparent" />
            </div>
          ) : (
            <div ref={captureRef} style={{ background: "#fff", padding: "20px 24px" }}>

              {/* Document title block */}
              <div className="mb-5">
                <h1 style={{
                  fontSize: "20px", fontWeight: 800,
                  textAlign: "center", textTransform: "uppercase",
                  letterSpacing: "0.15em", color: "#111827",
                  marginBottom: "12px",
                }}>
                  Executive Summary
                </h1>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px" }}>
                  <div>
                    <p style={{ fontSize: "14px", fontWeight: 700, color: "#1f2937", lineHeight: 1.4 }}>
                      Progress Update on the Validation, COCROM Encoding and Distribution of Unclassified ARRs
                    </p>
                    <p style={{ fontSize: "11px", color: "#6b7280", marginTop: "3px" }}>as of {todayStr}</p>
                  </div>
                  <div style={{ flexShrink: 0, textAlign: "right" }}>
                    <p style={{ fontSize: "11px", fontWeight: 700, color: "#7c3aed" }}>
                      No. of Days Remaining until {deadlineStr}:
                    </p>
                    <p style={{ fontSize: "22px", fontWeight: 800, color: "#7c3aed", lineHeight: 1.1, textAlign: "right" }}>
                      {daysLeft}
                    </p>
                  </div>
                </div>
              </div>

              {/* Single unified matrix table */}
              <div style={{ overflowX: isExporting ? "visible" : "auto" }}>
                <table style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  minWidth: "980px",
                }}>
                  <thead>
                    {/* Section group headers */}
                    <tr>
                      <th rowSpan={2} style={thProvince}>Province</th>
                      <th colSpan={3} style={thSectionBase("#86efac")}>Validation</th>
                      <th colSpan={3} style={thSectionBase("#7dd3fc")}>Encoding</th>
                      <th colSpan={3} style={thSectionBase("#fcd34d")}>Distribution</th>
                      <th colSpan={3} style={thSectionBase("#c4b5fd")}>
                        Commitment ({commitHdr} Dist.)
                      </th>
                    </tr>
                    {/* Sub-column headers */}
                    <tr>
                      <th style={thSubBase(true)}>
                        Target<br/><span style={{ fontWeight: 400, color: "#9ca3af" }}>(No. of LHs)</span>
                      </th>
                      <th style={thSubBase()}>
                        Accomplishment<br/><span style={{ fontWeight: 400, color: "#9ca3af" }}>(LHs Validated)</span>
                      </th>
                      <th style={thSubBase()}>%</th>

                      <th style={thSubBase(true)}>
                        Target<br/><span style={{ fontWeight: 400, color: "#9ca3af" }}>(No. of Eligible COCROMs)</span>
                      </th>
                      <th style={thSubBase()}>
                        Accomplishment<br/><span style={{ fontWeight: 400, color: "#9ca3af" }}>(No. of COCROMs Encoded)</span>
                      </th>
                      <th style={thSubBase()}>%</th>

                      <th style={thSubBase(true)}>
                        Target<br/><span style={{ fontWeight: 400, color: "#9ca3af" }}>(No. of Encoded COCROMs)</span>
                      </th>
                      <th style={thSubBase()}>
                        Accomplishment<br/><span style={{ fontWeight: 400, color: "#9ca3af" }}>(No. of Distributed COCROMs)</span>
                      </th>
                      <th style={thSubBase()}>%</th>

                      <th style={thSubBase(true, COMMIT_TH_BG)}>
                        No. of COCROMs<br/><span style={{ fontWeight: 400, color: "#a78bfa" }}>Committed for Distribution</span>
                      </th>
                      <th style={thSubBase(false, COMMIT_TH_BG)}>
                        No. of Available<br/><span style={{ fontWeight: 400, color: "#a78bfa" }}>(Encoded) COCROMs</span>
                      </th>
                      <th style={thSubBase(false, COMMIT_TH_BG)}>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Province rows */}
                    {PROVINCES.map((prov) => (
                      <DataRow
                        key={prov}
                        label={PROVINCE_DISPLAY[prov] ?? prov}
                        entry={data?.provinces[prov] ?? EMPTY}
                      />
                    ))}
                    {/* R-V TOTAL */}
                    <DataRow label="R-V TOTAL" entry={reg} isTotalRow />

                    {/* ── Notes row ── */}
                    <tr style={{ background: "#f9fafb" }}>
                      <td style={{ ...noteCell(), borderRight: SEC_BORDER_L, background: "#f9fafb", position: "sticky", left: 0, zIndex: 1 }} />
                      <td colSpan={3} style={noteCell(true)}>
                        {valDaily > 0 ? (
                          <>Needs <strong style={{ color: "#111827", fontStyle: "normal" }}>{valDaily.toLocaleString()}</strong> LHs{" "}
                            <strong style={{ color: "#374151", fontStyle: "normal" }}>validated daily</strong> to reach target by {deadlineStr}.
                          </>
                        ) : <span style={{ color: "#059669", fontStyle: "normal", fontWeight: 600 }}>✓ Validation target reached.</span>}
                      </td>
                      <td colSpan={3} style={noteCell(true)}>
                        {encDaily > 0 ? (
                          <>Needs <strong style={{ color: "#111827", fontStyle: "normal" }}>{encDaily.toLocaleString()}</strong> COCROMs{" "}
                            <strong style={{ color: "#374151", fontStyle: "normal" }}>encoded daily</strong> to reach target by {deadlineStr}.
                          </>
                        ) : <span style={{ color: "#059669", fontStyle: "normal", fontWeight: 600 }}>✓ Encoding target reached.</span>}
                      </td>
                      <td colSpan={3} style={noteCell(true)} />
                      <td colSpan={3} style={{ ...noteCell(true), background: COMMIT_BG }}>
                        {commitDaily > 0 ? (
                          <>Needs <strong style={{ color: "#111827", fontStyle: "normal" }}>{commitDaily.toLocaleString()}</strong> COCROMs{" "}
                            <strong style={{ color: "#374151", fontStyle: "normal" }}>encoded daily</strong> to reach commitment by {deadlineStr}.
                          </>
                        ) : <span style={{ color: "#059669", fontStyle: "normal", fontWeight: 600 }}>✓ Commitment target reached.</span>}
                      </td>
                    </tr>

                    {/* ── Other Indicators header ── */}
                    <tr>
                      <td colSpan={13} style={oiHeaderCell}>
                        Other Indicators{" "}
                        <span style={{ fontWeight: 400, fontSize: "9px", color: "#9ca3af" }}>(Regional Total only)</span>
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={13} style={oiSubHeaderCell}>Equivalents</td>
                    </tr>

                    {/* ── Other Indicators data rows ── */}
                    <OtherRow
                      label="Area (has.)"
                      valT={reg.validation.area_total}    valC={reg.validation.area_completed}
                      encT={reg.encoding.area_total}      encC={reg.encoding.area_completed}
                      distT={reg.distribution.area_total} distC={reg.distribution.area_completed}
                      area
                    />
                    <OtherRow
                      label="No. of ARBs"
                      valT={0}                            valC={0}
                      encT={reg.encoding.arb_total}       encC={reg.encoding.arb_completed}
                      distT={reg.distribution.arb_total}  distC={reg.distribution.arb_completed}
                    />
                    <OtherRow
                      label="Condoned Amount"
                      valT={reg.validation.amount_total}    valC={reg.validation.amount_completed}
                      encT={reg.encoding.amount_total}      encC={reg.encoding.amount_completed}
                      distT={reg.distribution.amount_total} distC={reg.distribution.amount_completed}
                      amount
                    />
                  </tbody>
                </table>
              </div>

              {exportError && (
                <p style={{ marginTop: "8px", fontSize: "11px", color: "#dc2626", textAlign: "right" }}>
                  {exportError}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-5 py-3 flex items-center justify-end shrink-0 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
