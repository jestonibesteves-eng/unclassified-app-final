// components/ProvinceBreakdownModal.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import type { ProvinceTableRow } from "@/app/api/dashboard/province-table/route";

type Props = {
  open: boolean;
  onClose: () => void;
  selectedProvinces?: string[];
  publicToken?: string;
};

function pct(val: number, scope: number) {
  if (scope === 0) return 0;
  return Math.min(100, Math.round((val / scope) * 100));
}

function fmtArea(n: number) {
  return n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtAmount(n: number) {
  return "₱" + n.toLocaleString("en-PH", { maximumFractionDigits: 0 });
}

function DataBar({
  value,
  scope,
  color,
  bold,
}: {
  value: number;
  scope: number;
  color: string;
  bold?: boolean;
}) {
  const p = pct(value, scope);
  return (
    <td className="relative px-2 py-1.5" style={{ minWidth: 90 }}>
      <div
        className="absolute inset-0 rounded-sm"
        style={{ background: `linear-gradient(90deg, ${color} ${p}%, transparent ${p}%)` }}
      />
      <span className={`relative text-[10px] ${bold ? "font-bold" : "font-semibold"}`}>
        {value.toLocaleString()}
      </span>
      <span className="relative ml-1 text-[8px] text-gray-400">{p}%</span>
    </td>
  );
}

function DataBarArea({
  value,
  scope,
  color,
  bold,
}: {
  value: number;
  scope: number;
  color: string;
  bold?: boolean;
}) {
  const p = pct(value, scope);
  return (
    <td className="relative px-2 py-1.5" style={{ minWidth: 100 }}>
      <div
        className="absolute inset-0 rounded-sm"
        style={{ background: `linear-gradient(90deg, ${color} ${p}%, transparent ${p}%)` }}
      />
      <span className={`relative text-[10px] ${bold ? "font-bold" : "font-semibold"}`}>
        {fmtArea(value)}
      </span>
      <span className="relative ml-1 text-[8px] text-gray-400">{p}%</span>
    </td>
  );
}

function DataBarAmount({
  value,
  scope,
  color,
  bold,
}: {
  value: number;
  scope: number;
  color: string;
  bold?: boolean;
}) {
  const p = pct(value, scope);
  return (
    <td className="relative px-2 py-1.5" style={{ minWidth: 110 }}>
      <div
        className="absolute inset-0 rounded-sm"
        style={{ background: `linear-gradient(90deg, ${color} ${p}%, transparent ${p}%)` }}
      />
      <span className={`relative text-[10px] ${bold ? "font-bold" : "font-semibold"}`}>
        {fmtAmount(value)}
      </span>
      <span className="relative ml-1 text-[8px] text-gray-400">{p}%</span>
    </td>
  );
}

export function ProvinceBreakdownModal({ open, onClose, selectedProvinces, publicToken }: Props) {
  const [rows, setRows] = useState<ProvinceTableRow[]>([]);
  const [total, setTotal] = useState<ProvinceTableRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedKey = useRef<string | null>(null);
  const captureRef = useRef<HTMLDivElement>(null);

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
    fetch(`/api/dashboard/province-table?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setRows(data.rows ?? []);
        setTotal(data.total ?? null);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load province data.");
        setLoading(false);
      });
  }, [open, selectedProvinces, publicToken]);

  function exportCsv() {
    const header = [
      "Province",
      "Records Scope", "Records Validated", "Records %",
      "LOs Scope", "LOs Validated", "LOs %",
      "Area Scope", "Area Validated", "Area %",
      "Amount Scope", "Amount Validated", "Amount %",
    ].join(",");
    const dataRows = [...rows, ...(total ? [total] : [])].map((r) =>
      [
        `"${r.province.replace(/"/g, '""')}"`,
        r.records_scope, r.records_validated, pct(r.records_validated, r.records_scope),
        r.lo_scope, r.lo_validated, pct(r.lo_validated, r.lo_scope),
        r.area_scope.toFixed(2), r.area_validated.toFixed(2), pct(r.area_validated, r.area_scope),
        r.amount_scope.toFixed(2), r.amount_validated.toFixed(2), pct(r.amount_validated, r.amount_scope),
      ].join(",")
    );
    const csv = [header, ...dataRows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `province-breakdown-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportImage() {
    if (!captureRef.current) return;
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(captureRef.current, { scale: 2, useCORS: true });
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `province-breakdown-${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
    } catch {
      setError("Failed to export image.");
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="province-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
      tabIndex={-1}
    >
      <div className="max-w-5xl w-full rounded-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-green-900 px-5 py-3 flex items-center justify-between flex-shrink-0">
          <h2 id="province-modal-title" className="text-[10px] font-bold text-green-300 uppercase tracking-[0.13em]">
            Province Breakdown — Per Landholding Data
          </h2>
          <button
            onClick={onClose}
            className="text-green-400 hover:text-green-200 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Table body */}
        <div className="flex-1 overflow-auto bg-white">
          {loading && (
            <div className="flex items-center justify-center py-16 text-sm text-gray-400">
              Loading…
            </div>
          )}
          {error && (
            <div className="flex items-center justify-center py-16 text-sm text-red-500">
              {error}
            </div>
          )}
          {!loading && !error && (
            <div ref={captureRef}>
              <table className="w-full border-collapse text-left" style={{ minWidth: 720 }}>
                <thead>
                  {/* Group header row */}
                  <tr className="bg-emerald-50">
                    <th
                      rowSpan={2}
                      className="px-3 py-2 text-[9px] font-semibold text-gray-600 border-b border-r-2 border-emerald-100 border-r-emerald-200 sticky left-0 bg-emerald-50 z-10"
                      style={{ minWidth: 120 }}
                    >
                      Province
                    </th>
                    <th colSpan={2} className="px-2 py-1.5 text-center text-[8px] font-bold text-emerald-700 uppercase tracking-[0.1em] border-b border-r-2 border-emerald-100 border-r-emerald-200">
                      No. of Records
                    </th>
                    <th colSpan={2} className="px-2 py-1.5 text-center text-[8px] font-bold text-violet-700 uppercase tracking-[0.1em] border-b border-r-2 border-emerald-100 border-r-emerald-200">
                      No. of LOs
                    </th>
                    <th colSpan={2} className="px-2 py-1.5 text-center text-[8px] font-bold text-blue-700 uppercase tracking-[0.1em] border-b border-r-2 border-emerald-100 border-r-emerald-200">
                      Area (has.)
                    </th>
                    <th colSpan={2} className="px-2 py-1.5 text-center text-[8px] font-bold text-teal-700 uppercase tracking-[0.1em] border-b border-emerald-100">
                      Amount Condoned
                    </th>
                  </tr>
                  {/* Sub-header row */}
                  <tr className="bg-emerald-50">
                    <th className="px-2 pb-1.5 text-[8px] font-normal text-gray-400 border-b-2 border-emerald-300">Scope</th>
                    <th className="px-2 pb-1.5 text-[8px] font-semibold text-emerald-700 border-b-2 border-emerald-300 border-r-2 border-r-emerald-200">Validated ▪</th>
                    <th className="px-2 pb-1.5 text-[8px] font-normal text-gray-400 border-b-2 border-violet-300">Scope</th>
                    <th className="px-2 pb-1.5 text-[8px] font-semibold text-violet-700 border-b-2 border-violet-300 border-r-2 border-r-emerald-200">Validated ▪</th>
                    <th className="px-2 pb-1.5 text-[8px] font-normal text-gray-400 border-b-2 border-blue-300">Scope</th>
                    <th className="px-2 pb-1.5 text-[8px] font-semibold text-blue-700 border-b-2 border-blue-300 border-r-2 border-r-emerald-200">Validated ▪</th>
                    <th className="px-2 pb-1.5 text-[8px] font-normal text-gray-400 border-b-2 border-teal-300">Scope</th>
                    <th className="px-2 pb-1.5 text-[8px] font-semibold text-teal-700 border-b-2 border-teal-300">Validated ▪</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr
                      key={r.province}
                      className={`border-b border-gray-100 ${i % 2 === 1 ? "bg-gray-50" : "bg-white"}`}
                    >
                      <td className={`px-3 py-1.5 text-[10px] font-semibold text-gray-800 border-r-2 border-emerald-100 sticky left-0 z-10 ${i % 2 === 1 ? "bg-gray-50" : "bg-white"}`}>
                        {r.province}
                      </td>
                      <td className="px-2 py-1.5 text-right text-[10px] text-gray-400">{r.records_scope.toLocaleString()}</td>
                      <DataBar value={r.records_validated} scope={r.records_scope} color="#d1fae5" />
                      <td className="px-2 py-1.5 text-right text-[10px] text-gray-400">{r.lo_scope.toLocaleString()}</td>
                      <DataBar value={r.lo_validated} scope={r.lo_scope} color="#ede9fe" />
                      <td className="px-2 py-1.5 text-right text-[10px] text-gray-400">{fmtArea(r.area_scope)}</td>
                      <DataBarArea value={r.area_validated} scope={r.area_scope} color="#dbeafe" />
                      <td className="px-2 py-1.5 text-right text-[10px] text-gray-400">{fmtAmount(r.amount_scope)}</td>
                      <DataBarAmount value={r.amount_validated} scope={r.amount_scope} color="#ccfbf1" />
                    </tr>
                  ))}
                  {/* TOTAL row */}
                  {total && (
                    <tr className="bg-emerald-50 border-t-2 border-emerald-300">
                      <td className="px-3 py-2 text-[10px] font-bold text-emerald-800 uppercase tracking-wide border-r-2 border-emerald-200 sticky left-0 bg-emerald-50 z-10">
                        R-V TOTAL
                      </td>
                      <td className="px-2 py-2 text-right text-[10px] font-semibold text-gray-600">{total.records_scope.toLocaleString()}</td>
                      <DataBar value={total.records_validated} scope={total.records_scope} color="#a7f3d0" bold />
                      <td className="px-2 py-2 text-right text-[10px] font-semibold text-gray-600">{total.lo_scope.toLocaleString()}</td>
                      <DataBar value={total.lo_validated} scope={total.lo_scope} color="#ddd6fe" bold />
                      <td className="px-2 py-2 text-right text-[10px] font-semibold text-gray-600">{fmtArea(total.area_scope)}</td>
                      <DataBarArea value={total.area_validated} scope={total.area_scope} color="#bfdbfe" bold />
                      <td className="px-2 py-2 text-right text-[10px] font-semibold text-gray-600">{fmtAmount(total.amount_scope)}</td>
                      <DataBarAmount value={total.amount_validated} scope={total.amount_scope} color="#99f6e4" bold />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 bg-emerald-50 border-t border-emerald-100 px-5 py-2.5 flex items-center justify-between">
          <span className="text-[9px] text-gray-400">▪ Data bars show % of scope validated</span>
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
    </div>
  );
}
