// components/StatusBreakdownModal.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import React from "react";
import type { StatusTableRow } from "@/app/api/dashboard/status-table/route";

type Props = {
  open: boolean;
  onClose: () => void;
  selectedProvinces?: string[];
  publicToken?: string;
  hideExport?: boolean;
};

export function StatusBreakdownModal({ open, onClose, selectedProvinces, publicToken, hideExport }: Props) {
  const [rows, setRows] = useState<StatusTableRow[]>([]);
  const [grandTotal, setGrandTotal] = useState<StatusTableRow | null>(null);
  const [provinces, setProvinces] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const fetchedKey = useRef<string | null>(null);
  const captureRef = useRef<HTMLDivElement>(null);
  const exportTitleRef = useRef<HTMLDivElement>(null);

  // Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Fetch data
  useEffect(() => {
    if (!open) return;
    const key = (selectedProvinces ?? []).slice().sort().join(",") + "|" + (publicToken ?? "");
    if (fetchedKey.current === key) return;
    fetchedKey.current = key;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (selectedProvinces && selectedProvinces.length > 0) {
      params.set("provinces", selectedProvinces.join(","));
    }
    if (publicToken) params.set("token", publicToken);
    fetch(`/api/dashboard/status-table?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setRows(data.rows ?? []);
        setGrandTotal(data.grandTotal ?? null);
        setProvinces(data.provinces ?? []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("[StatusBreakdownModal]", err);
        setError(`Failed to load status data. (${err?.message ?? "unknown error"})`);
        setLoading(false);
      });
  }, [open, selectedProvinces, publicToken]);

  function exportCsv() {
    const provHeaders = provinces.flatMap((p) => [`"${p} LHs"`, `"${p} Area (has.)"`]);
    const header = ["Status", ...provHeaders, "R-V TOTAL LHs", "R-V TOTAL Area (has.)"].join(",");
    const allRows = [...rows, ...(grandTotal ? [grandTotal] : [])];
    const dataRows = allRows.map((r) => {
      const cells = provinces.flatMap((p) => [
        r.byProvince[p]?.count ?? 0,
        (r.byProvince[p]?.area ?? 0).toFixed(2),
      ]);
      return [`"${r.status.replace(/"/g, '""')}"`, ...cells, r.total.count, r.total.area.toFixed(2)].join(",");
    });
    const csv = [header, ...dataRows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `status-breakdown-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportImage() {
    if (!captureRef.current) return;
    setExportError(null);
    // Read full natural table dimensions first (before title bar is shown)
    const fullWidth = captureRef.current.scrollWidth;
    // Reveal title bar and stretch it to match full table width
    if (exportTitleRef.current) {
      exportTitleRef.current.style.minWidth = `${fullWidth}px`;
      exportTitleRef.current.classList.remove("hidden");
    }
    const fullHeight = captureRef.current.scrollHeight;
    try {
      const { toPng } = await import("html-to-image");
      const url = await toPng(captureRef.current, {
        pixelRatio: 2,
        width: fullWidth,
        height: fullHeight,
        style: { overflow: "visible" },
      });
      if (exportTitleRef.current) {
        exportTitleRef.current.classList.add("hidden");
        exportTitleRef.current.style.minWidth = "";
      }
      const a = document.createElement("a");
      a.href = url;
      a.download = `status-breakdown-${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
    } catch (err) {
      if (exportTitleRef.current) {
        exportTitleRef.current.classList.add("hidden");
        exportTitleRef.current.style.minWidth = "";
      }
      console.error("[StatusBreakdownModal exportImage]", err);
      setExportError("Failed to export image. Try Export CSV instead.");
    }
  }

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="status-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
      tabIndex={-1}
    >
      <div className="max-w-[95vw] w-fit rounded-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-green-900 px-5 py-3 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 id="status-modal-title" className="text-[10px] font-bold text-green-300 uppercase tracking-[0.13em]">
              Status Breakdown by Province
            </h2>
            <p className="text-[9px] text-green-500 font-mono mt-0.5">
              As of {new Date().toLocaleString("en-PH", {
                year: "numeric", month: "long", day: "numeric",
                hour: "2-digit", minute: "2-digit", second: "2-digit",
                timeZone: "Asia/Manila",
              })}
            </p>
          </div>
          <button onClick={onClose} className="text-green-400 hover:text-green-200 text-xl leading-none" aria-label="Close">
            ×
          </button>
        </div>

        {/* Table body */}
        <div className="flex-1 overflow-auto bg-white w-fit max-w-[95vw]">
          {loading && (
            <div className="flex items-center justify-center py-16 text-sm text-gray-400">Loading…</div>
          )}
          {error && (
            <div className="flex items-center justify-center py-16 text-sm text-red-500">{error}</div>
          )}
          {!loading && !error && (
            <div ref={captureRef} style={{ width: "fit-content" }}>
              {/* Hidden title bar — revealed only during PNG export */}
              <div ref={exportTitleRef} className="bg-green-900 px-5 py-3 hidden">
                <p className="text-[10px] font-bold text-green-300 uppercase tracking-[0.13em]">
                  Status of Unclassified ARRs (per Landholding)
                </p>
                <p className="text-[9px] text-green-500 font-mono mt-0.5">
                  As of {new Date().toLocaleString("en-PH", {
                    year: "numeric", month: "long", day: "numeric",
                    hour: "2-digit", minute: "2-digit", second: "2-digit",
                    timeZone: "Asia/Manila",
                  })}
                </p>
              </div>
              {(() => { const showTotal = provinces.length > 1; return (
              <table className="border-collapse text-left" style={{ minWidth: 600 }}>
                  <thead className="sticky top-0 z-20">
                    {/* Province group header row */}
                    <tr className="bg-emerald-50">
                      <th
                        rowSpan={2}
                        className="px-3 py-2 text-[9px] font-semibold text-gray-600 border-b-2 border-r-2 border-emerald-200 sticky left-0 bg-emerald-50 z-30"
                        style={{ minWidth: 160 }}
                      >
                        Status
                      </th>
                      {provinces.map((p) => (
                        <th
                          key={p}
                          colSpan={2}
                          className="px-2 py-1.5 text-center text-[8px] font-bold text-emerald-700 uppercase tracking-[0.08em] border-b border-r border-emerald-100"
                        >
                          {p}
                        </th>
                      ))}
                      {showTotal && (
                        <th
                          colSpan={2}
                          className="px-2 py-1.5 text-center text-[8px] font-bold text-green-900 uppercase tracking-[0.08em] border-b border-emerald-100 bg-emerald-100"
                        >
                          R-V TOTAL
                        </th>
                      )}
                    </tr>
                    {/* LHs / Area sub-header row */}
                    <tr className="bg-emerald-50">
                      {provinces.map((p) => (
                        <React.Fragment key={p}>
                          <th className="px-2 pb-1.5 text-[8px] font-normal text-gray-500 border-b-2 border-emerald-300 text-center" style={{ minWidth: 52 }}>
                            LHs
                          </th>
                          <th className="px-2 pb-1.5 text-[8px] font-normal text-gray-500 border-b-2 border-r border-emerald-200 text-center" style={{ minWidth: 80 }}>
                            Area (has.)
                          </th>
                        </React.Fragment>
                      ))}
                      {showTotal && (<>
                        <th className="px-2 pb-1.5 text-[8px] font-semibold text-green-800 border-b-2 border-emerald-300 text-center bg-emerald-100" style={{ minWidth: 52 }}>
                          LHs
                        </th>
                        <th className="px-2 pb-1.5 text-[8px] font-semibold text-green-800 border-b-2 border-emerald-300 text-center bg-emerald-100" style={{ minWidth: 88 }}>
                          Area (has.)
                        </th>
                      </>)}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r.status} className={`border-b border-gray-100 ${i % 2 === 1 ? "bg-gray-50" : "bg-white"}`}>
                        <td className={`px-3 py-1.5 text-[10px] font-semibold text-gray-800 border-r-2 border-emerald-100 sticky left-0 z-10 ${i % 2 === 1 ? "bg-gray-50" : "bg-white"}`}>
                          {r.status}
                        </td>
                        {provinces.map((p) => {
                          const cell = r.byProvince[p];
                          const provLhTotal = grandTotal?.byProvince[p]?.count ?? 0;
                          const provAreaTotal = grandTotal?.byProvince[p]?.area ?? 0;
                          const lhPct = provLhTotal > 0 && cell?.count ? Math.round((cell.count / provLhTotal) * 100) : 0;
                          const areaPct = provAreaTotal > 0 && cell?.area ? Math.round((cell.area / provAreaTotal) * 100) : 0;
                          return (
                            <React.Fragment key={p}>
                              <td
                                className="px-2 py-1.5 text-right text-[10px] text-gray-700 font-mono"
                                style={lhPct > 0 ? { background: `linear-gradient(to right, rgba(99,102,241,0.18) ${lhPct}%, transparent ${lhPct}%)` } : undefined}
                              >
                                {cell?.count != null ? cell.count.toLocaleString() : "—"}
                              </td>
                              <td
                                className="px-2 py-1.5 text-right text-[10px] text-gray-600 font-mono border-r border-emerald-100"
                                style={areaPct > 0 ? { background: `linear-gradient(to right, rgba(16,185,129,0.18) ${areaPct}%, transparent ${areaPct}%)` } : undefined}
                              >
                                {cell?.area != null ? cell.area.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                              </td>
                            </React.Fragment>
                          );
                        })}
                        {showTotal && (() => {
                          const lhTotalPct = grandTotal && grandTotal.total.count > 0 ? Math.round((r.total.count / grandTotal.total.count) * 100) : 0;
                          const areaTotalPct = grandTotal && grandTotal.total.area > 0 ? Math.round((r.total.area / grandTotal.total.area) * 100) : 0;
                          return (
                            <>
                              <td
                                className="px-2 py-1.5 text-right text-[10px] font-semibold text-gray-800 font-mono bg-emerald-50"
                                style={lhTotalPct > 0 ? { background: `linear-gradient(to right, rgba(99,102,241,0.25) ${lhTotalPct}%, rgba(236,253,245,1) ${lhTotalPct}%)` } : undefined}
                              >
                                {r.total.count.toLocaleString()}
                              </td>
                              <td
                                className="px-2 py-1.5 text-right text-[10px] font-semibold text-gray-800 font-mono bg-emerald-50"
                                style={areaTotalPct > 0 ? { background: `linear-gradient(to right, rgba(16,185,129,0.25) ${areaTotalPct}%, rgba(236,253,245,1) ${areaTotalPct}%)` } : undefined}
                              >
                                {r.total.area.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                            </>
                          );
                        })()}
                      </tr>
                    ))}
                    {/* Grand Total row */}
                    {grandTotal && (
                      <tr className="bg-emerald-50 border-t-2 border-emerald-300">
                        <td className="px-3 py-2 text-[10px] font-bold text-emerald-800 uppercase tracking-wide border-r-2 border-emerald-200 sticky left-0 bg-emerald-50 z-10">
                          GRAND TOTAL
                        </td>
                        {provinces.map((p) => {
                          const cell = grandTotal.byProvince[p];
                          return (
                            <React.Fragment key={p}>
                              <td className="px-2 py-2 text-right text-[10px] font-bold text-gray-800 font-mono">
                                {cell?.count != null ? cell.count.toLocaleString() : "—"}
                              </td>
                              <td className="px-2 py-2 text-right text-[10px] font-bold text-gray-800 font-mono border-r border-emerald-200">
                                {cell?.area != null ? cell.area.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                              </td>
                            </React.Fragment>
                          );
                        })}
                        {showTotal && (<>
                          <td className="px-2 py-2 text-right text-[10px] font-bold text-emerald-800 font-mono bg-emerald-100">
                            {grandTotal.total.count.toLocaleString()}
                          </td>
                          <td className="px-2 py-2 text-right text-[10px] font-bold text-emerald-800 font-mono bg-emerald-100">
                            {grandTotal.total.area.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </>)}
                      </tr>
                    )}
                  </tbody>
              </table>
              ); })()}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 bg-emerald-50 border-t border-emerald-100 px-5 py-2.5 flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] text-gray-400">Area = validated AMENDAREA (falls back to scope AMENDAREA where not yet validated)</span>
            {exportError && <span className="text-[9px] text-red-500">{exportError}</span>}
          </div>
          {!hideExport && (
            <div className="flex gap-2">
              <button
                onClick={exportCsv}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gray-300 bg-white text-[9px] font-semibold text-gray-600 hover:bg-gray-50 tracking-wide"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/>
                </svg>
                Export CSV
              </button>
              <button
                onClick={exportImage}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-green-900 text-[9px] font-bold text-green-300 hover:bg-green-800 tracking-wide"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                </svg>
                Export as Image
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
