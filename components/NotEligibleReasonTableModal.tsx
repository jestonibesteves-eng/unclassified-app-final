"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { NotEligibleReasonRow } from "@/components/DashboardCharts";

type Props = {
  open: boolean;
  onClose: () => void;
  data: NotEligibleReasonRow[];
  notEligibleForEncodingCount?: number;
  totalLandholdings?: number;
  allProvinces?: string[];
  provinceTotalLandholdings?: Record<string, number>;
};

export function NotEligibleReasonTableModal({
  open, onClose, data, notEligibleForEncodingCount, totalLandholdings, allProvinces, provinceTotalLandholdings,
}: Props) {
  const [exportError, setExportError] = useState<string | null>(null);
  const captureRef = useRef<HTMLDivElement>(null);
  const exportTitleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const sorted = [...data].sort((a, b) => b.count - a.count);

  const { provinces, provinceTotals, grandTotalCount, grandTotalArea } = (() => {
    const totals = new Map<string, { count: number; area: number }>();
    let count = 0, area = 0;
    for (const row of sorted) {
      count += row.count;
      area += row.area;
      for (const p of row.byProvince) {
        const t = totals.get(p.province) ?? { count: 0, area: 0 };
        t.count += p.count;
        t.area += p.area;
        totals.set(p.province, t);
      }
    }
    // Always show every known province as a column, even ones with zero
    // entries for this breakdown — not just the ones present in the data.
    const provinceSet = new Set([...(allProvinces ?? []), ...totals.keys()]);
    const provinces = Array.from(provinceSet).sort((a, b) => a.localeCompare(b));
    return { provinces, provinceTotals: totals, grandTotalCount: count, grandTotalArea: area };
  })();

  const notEligiblePct =
    notEligibleForEncodingCount != null && totalLandholdings
      ? ((notEligibleForEncodingCount / totalLandholdings) * 100).toFixed(1)
      : null;

  // Per-province "% of that province's own landholdings that are not eligible"
  function provincePct(province: string): string | null {
    const provTotal = provinceTotalLandholdings?.[province];
    if (!provTotal) return null;
    const provNotEligible = provinceTotals.get(province)?.count ?? 0;
    return ((provNotEligible / provTotal) * 100).toFixed(0);
  }

  function exportCsv() {
    const provHeaders = provinces.flatMap((p) => [`"${p} LHs"`, `"${p} Area (has.)"`]);
    const header = ["Reason for Non-Eligibility", ...provHeaders, "TOTAL LHs", "TOTAL Area (has.)"].join(",");
    const dataRows = sorted.map((row) => {
      const cells = provinces.flatMap((p) => {
        const cell = row.byProvince.find((bp) => bp.province === p);
        return [cell?.count ?? 0, (cell?.area ?? 0).toFixed(2)];
      });
      return [`"${row.name.replace(/"/g, '""')}"`, ...cells, row.count, row.area.toFixed(2)].join(",");
    });
    const totalCells = provinces.flatMap((p) => {
      const t = provinceTotals.get(p);
      return [t?.count ?? 0, (t?.area ?? 0).toFixed(2)];
    });
    const totalRow = ['"TOTAL"', ...totalCells, grandTotalCount, grandTotalArea.toFixed(2)].join(",");
    const csv = [header, ...dataRows, totalRow].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `not-eligible-by-reason-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportImage() {
    if (!captureRef.current) return;
    setExportError(null);
    // Web fonts loading late can shift text metrics between the measurement
    // below and html-to-image's internal SVG-based render, very slightly
    // changing line-wrapping/row heights — wait for them first so both agree.
    if (typeof document !== "undefined" && document.fonts) {
      await document.fonts.ready;
    }
    captureRef.current.style.margin = "0";
    const fullWidth = captureRef.current.scrollWidth;
    if (exportTitleRef.current) {
      exportTitleRef.current.style.minWidth = `${fullWidth}px`;
      exportTitleRef.current.style.display = "flex";
    }
    // Small safety margin on top of the measured height — cheap insurance
    // against the same kind of sub-pixel rendering drift, so any residual
    // mismatch shows as harmless blank space rather than clipped content.
    const fullHeight = captureRef.current.scrollHeight + 24;
    try {
      const { toPng } = await import("html-to-image");
      const url = await toPng(captureRef.current, {
        pixelRatio: 3,
        width: fullWidth,
        height: fullHeight,
        backgroundColor: "#ffffff",
        style: { overflow: "visible" },
      });
      if (exportTitleRef.current) {
        exportTitleRef.current.style.display = "none";
        exportTitleRef.current.style.minWidth = "";
      }
      captureRef.current.style.margin = "0 auto";
      const a = document.createElement("a");
      a.href = url;
      a.download = `not-eligible-by-reason-${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
    } catch (err) {
      if (exportTitleRef.current) {
        exportTitleRef.current.style.display = "none";
        exportTitleRef.current.style.minWidth = "";
      }
      captureRef.current.style.margin = "0 auto";
      console.error("[NotEligibleReasonTableModal exportImage]", err);
      setExportError("Failed to export image. Try Export CSV instead.");
    }
  }

  if (!open) return null;

  const asOf = new Date().toLocaleString("en-PH", {
    year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    timeZone: "Asia/Manila",
  });

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="not-eligible-table-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      tabIndex={-1}
    >
      <div className="max-w-[95vw] w-fit rounded-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-green-900 px-5 py-3 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 id="not-eligible-table-modal-title" className="text-2xl font-bold text-white tracking-[0.02em] uppercase">
              Summary of <span className="normal-case">LHs</span>{" "}that are (Fully) Not Eligible for Encoding - by Reason &amp; Province
            </h2>
            <p className="text-base text-white font-mono mt-1">As of {asOf}</p>
          </div>
          <div className="flex items-center gap-5">
            {notEligiblePct != null && (
              <div className="text-right">
                <p
                  className="text-[41px] font-bold leading-none tabular-nums"
                  style={{ color: "#FF3B3B", textShadow: "0 0 5px rgba(255,255,255,0.35)" }}
                >
                  {notEligiblePct}%
                </p>
                <p className="text-sm text-white uppercase tracking-wide mt-1.5 tabular-nums whitespace-nowrap">
                  {notEligibleForEncodingCount!.toLocaleString()} / {totalLandholdings!.toLocaleString()} <span className="normal-case">LHs</span> not eligible
                </p>
              </div>
            )}
            <button onClick={onClose} className="text-green-400 hover:text-green-200 text-xl leading-none" aria-label="Close">
              ×
            </button>
          </div>
        </div>

        {/* Table body */}
        <div className="flex-1 overflow-auto bg-white">
          <div ref={captureRef} style={{ width: "fit-content", margin: "0 auto" }}>
            {/* Hidden title bar — revealed only during PNG export */}
            <div
              ref={exportTitleRef}
              className="bg-green-900 px-5 py-3 items-center justify-between"
              style={{ display: "none" }}
            >
              <div>
                <p className="text-2xl font-bold text-white tracking-[0.02em] uppercase">
                  Summary of <span className="normal-case">LHs</span>{" "}that are (Fully) Not Eligible for Encoding - by Reason &amp; Province
                </p>
                <p className="text-base text-white font-mono mt-1">As of {asOf}</p>
              </div>
              {notEligiblePct != null && (
                <div className="text-right">
                  <p
                    className="text-[41px] font-bold leading-none tabular-nums"
                    style={{ color: "#FF3B3B", textShadow: "0 0 5px rgba(255,255,255,0.35)" }}
                  >
                    {notEligiblePct}%
                  </p>
                  <p className="text-sm text-white uppercase tracking-wide mt-1.5 tabular-nums whitespace-nowrap">
                    {notEligibleForEncodingCount!.toLocaleString()} / {totalLandholdings!.toLocaleString()} <span className="normal-case">LHs</span> not eligible
                  </p>
                </div>
              )}
            </div>
            <table className="border-collapse text-left border-2 border-gray-400" style={{ minWidth: 600 }}>
              <thead className="sticky top-0 z-20">
                <tr className="bg-red-50">
                  <th
                    rowSpan={2}
                    className="px-3 py-2 text-[11px] font-semibold text-gray-600 border-b-2 border-r-4 border-gray-400 sticky left-0 bg-red-50 z-30"
                    style={{ minWidth: 240 }}
                  >
                    Reason for Non-Eligibility
                  </th>
                  {provinces.map((p) => {
                    const pct = provincePct(p);
                    return (
                      <th key={p} colSpan={2} className="px-2 py-1.5 text-center text-[10px] font-bold text-red-700 uppercase tracking-[0.06em] border-b-2 border-r-4 border-gray-400">
                        {p}
                        {pct != null && (
                          <div className="text-[9px] font-semibold normal-case text-red-500 tracking-normal">({pct}%)</div>
                        )}
                      </th>
                    );
                  })}
                  <th colSpan={2} className="px-2 py-1.5 text-center text-[10px] font-bold text-red-900 uppercase tracking-[0.06em] border-b-2 border-gray-400 bg-red-100">
                    TOTAL
                    {notEligiblePct != null && (
                      <div className="text-[9px] font-semibold normal-case text-red-600 tracking-normal">({notEligiblePct}%)</div>
                    )}
                  </th>
                </tr>
                <tr className="bg-red-50">
                  {provinces.map((p) => (
                    <Fragment key={p}>
                      <th className="px-2 pb-1.5 text-[9px] font-normal text-gray-500 border-b-2 border-r border-gray-400 text-center" style={{ minWidth: 58 }}>
                        LHs
                      </th>
                      <th className="px-2 pb-1.5 text-[9px] font-normal text-gray-500 border-b-2 border-r-4 border-gray-400 text-center" style={{ minWidth: 90 }}>
                        Area (has.)
                      </th>
                    </Fragment>
                  ))}
                  <th className="px-2 pb-1.5 text-[9px] font-semibold text-red-800 border-b-2 border-r border-gray-400 text-center bg-red-100" style={{ minWidth: 58 }}>
                    LHs
                  </th>
                  <th className="px-2 pb-1.5 text-[9px] font-semibold text-red-800 border-b-2 border-gray-400 text-center bg-red-100" style={{ minWidth: 98 }}>
                    Area (has.)
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, i) => (
                  <tr key={row.name} className={`border-b border-gray-300 ${i % 2 === 1 ? "bg-gray-50" : "bg-white"}`}>
                    <td className={`px-3 py-1.5 text-[10px] font-semibold text-gray-800 border-r-4 border-gray-400 sticky left-0 z-10 ${i % 2 === 1 ? "bg-gray-50" : "bg-white"}`}>
                      {row.name}
                    </td>
                    {provinces.map((p) => {
                      const cell = row.byProvince.find((bp) => bp.province === p);
                      return (
                        <Fragment key={p}>
                          <td className="px-2 py-1.5 text-right text-[10px] text-gray-700 font-mono border-r border-gray-300">
                            {cell ? cell.count.toLocaleString() : "—"}
                          </td>
                          <td className="px-2 py-1.5 text-right text-[10px] text-gray-600 font-mono border-r-4 border-gray-400">
                            {cell ? cell.area.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                          </td>
                        </Fragment>
                      );
                    })}
                    <td className="px-2 py-1.5 text-right text-[10px] font-semibold text-gray-800 font-mono bg-red-50 border-r border-red-200">
                      {row.count.toLocaleString()}
                    </td>
                    <td className="px-2 py-1.5 text-right text-[10px] font-semibold text-gray-800 font-mono bg-red-50">
                      {row.area.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
                <tr className="bg-red-50 border-t-4 border-gray-500">
                  <td className="px-3 py-2 text-[10px] font-bold text-red-800 uppercase tracking-wide border-r-4 border-gray-400 sticky left-0 bg-red-50 z-10">
                    TOTAL
                  </td>
                  {provinces.map((p) => {
                    const t = provinceTotals.get(p);
                    return (
                      <Fragment key={p}>
                        <td className="px-2 py-2 text-right text-[10px] font-bold text-gray-800 font-mono border-r border-gray-400">
                          {(t?.count ?? 0).toLocaleString()}
                        </td>
                        <td className="px-2 py-2 text-right text-[10px] font-bold text-gray-800 font-mono border-r-4 border-gray-400">
                          {(t?.area ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </Fragment>
                    );
                  })}
                  <td className="px-2 py-2 text-right text-[10px] font-bold text-red-800 font-mono bg-red-100 border-r border-red-300">
                    {grandTotalCount.toLocaleString()}
                  </td>
                  <td className="px-2 py-2 text-right text-[10px] font-bold text-red-800 font-mono bg-red-100">
                    {grandTotalArea.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 bg-emerald-50 border-t border-emerald-100 px-5 py-2.5 flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] text-gray-400">Area = validated AMENDAREA (falls back to scope AMENDAREA where not yet validated)</span>
            {exportError && <span className="text-[9px] text-red-500">{exportError}</span>}
          </div>
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
        </div>
      </div>
    </div>,
    document.body,
  );
}
