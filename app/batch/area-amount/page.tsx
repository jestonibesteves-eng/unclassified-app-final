"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import type { BatchLHType } from "@/app/api/batch/landholding/route";
import { DetailModal } from "@/components/RecordsTable";

/* ── Types ── */

type ConfirmMode = "confirm_area" | "confirm_amount" | "confirm_both";

type PreviewRow = {
  seqno_darro: string;
  landowner: string | null;
  province: string | null;
  clno: string | null;
  area_value: number | null;
  area_confirmed: boolean;
  area_blocked: boolean;
  amount_value: number | null;
  amount_confirmed: boolean;
  amount_blocked: boolean;
};

type PreviewData = {
  rows: PreviewRow[];
  invalid: { line: string; reason: string }[];
  notFoundSeqnos: string[];
  outOfJurisdiction: string[];
};

type DoneResult = {
  updated: number;
  updatedRecords: { seqno_darro: string; landowner: string | null; province: string | null; clno: string | null }[];
  skippedRecords: { seqno_darro: string; reason: string }[];
};

type UnconfirmedRow = {
  seqno_darro: string;
  landowner: string | null;
  province: string | null;
  clno: string | null;
  status: string | null;
  area_value: number | null;
  area_confirmed: boolean;
  amount_value: number | null;
  amount_confirmed: boolean;
  arb_area: number | null;
  arb_amount: number | null;
  arb_count: number;
};

type IneligibleRow = {
  seqno_darro: string;
  landowner: string | null;
  province: string | null;
  clno: string | null;
  status: string | null;
  area_value: number | null;
  area_blocked: boolean;
  amount_value: number | null;
  amount_blocked: boolean;
};

/* ── Helpers ── */

function fmt4(n: number | null | undefined) {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-PH", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

function fmt2(n: number | null | undefined) {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function areaEq(lh: number | null, arb: number | null): boolean {
  if (lh == null || arb == null) return false;
  return Math.abs(lh - arb) < 0.00005;
}
function amountEq(lh: number | null, arb: number | null): boolean {
  if (lh == null || arb == null) return false;
  return Math.abs(lh - arb) < 0.005;
}

const MODES: { value: ConfirmMode; label: string; desc: string }[] = [
  { value: "confirm_area",   label: "Area Only",   desc: "Confirm Validated AMENDAREA" },
  { value: "confirm_amount", label: "Amount Only",  desc: "Confirm Validated Condoned Amount" },
  { value: "confirm_both",   label: "Both",         desc: "Confirm Area & Amount together" },
];

/* ── Page ── */

export default function AreaAmountPage() {
  const [mode, setMode] = useState<ConfirmMode>("confirm_both");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [result, setResult] = useState<DoneResult | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  // Unconfirmed list state
  const [listRecords, setListRecords] = useState<UnconfirmedRow[]>([]);
  const [listLoaded, setListLoaded] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [listFilter, setListFilter] = useState("");
  const [listSelected, setListSelected] = useState<Set<string>>(new Set());
  const [showListConfirm, setShowListConfirm] = useState(false);
  const [listResult, setListResult] = useState<number | null>(null);
  const [listPage, setListPage] = useState(1);
  const [excludeNotEligibleUnconfirmed, setExcludeNotEligibleUnconfirmed] = useState(false);
  const LIST_PAGE_SIZE = 20;

  // Ineligible records state
  const [ineligibleRecords, setIneligibleRecords] = useState<IneligibleRow[]>([]);
  const [ineligibleLoaded, setIneligibleLoaded] = useState(false);
  const [ineligibleLoading, setIneligibleLoading] = useState(false);
  const [ineligibleError, setIneligibleError] = useState("");
  const [ineligibleFilter, setIneligibleFilter] = useState("");
  const [ineligiblePage, setIneligiblePage] = useState(1);
  const [showIneligible, setShowIneligible] = useState(false);
  const [ineligibleTotal, setIneligibleTotal] = useState<number | null>(null);
  const [excludeNotEligible, setExcludeNotEligible] = useState(false);
  const [detailSeqno, setDetailSeqno] = useState<string | null>(null);

  const rowCount = input.split("\n").filter((l) => l.trim()).length;
  const confirmArea   = mode === "confirm_area"  || mode === "confirm_both";
  const confirmAmount = mode === "confirm_amount" || mode === "confirm_both";

  // Close modals on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (showListConfirm) { setShowListConfirm(false); return; }
      if (showConfirm) { setShowConfirm(false); return; }
      if (showIneligible) { setShowIneligible(false); return; }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [showConfirm, showListConfirm, showIneligible]);

  function reset() {
    setInput("");
    setPreview(null);
    setResult(null);
    setError("");
    setShowConfirm(false);
  }

  function switchMode(m: ConfirmMode) {
    setMode(m);
    setPreview(null);
    setResult(null);
    setError("");
    // Reset list when mode changes
    setListRecords([]);
    setListLoaded(false);
    setListLoading(false);
    setListError("");
    setListSelected(new Set());
    setListResult(null);
    setListPage(1);
    setExcludeNotEligibleUnconfirmed(false);
    // Close ineligible panel when switching to a mode button
    setShowIneligible(false);
    setIneligibleRecords([]);
    setIneligibleTotal(null);
    setExcludeNotEligible(false);
    setIneligibleLoaded(false);
    setIneligibleLoading(false);
    setIneligibleError("");
    setIneligibleFilter("");
    setIneligiblePage(1);
  }

  async function loadList() {
    setListLoading(true); setListError(""); setListResult(null);
    const res = await fetch(`/api/batch/landholding?list=${mode}`);
    const data = await res.json();
    setListLoading(false);
    if (!res.ok) { setListError(data.error ?? "Failed to load records."); return; }
    setListRecords(data.records ?? []);
    setListSelected(new Set());
    setListPage(1);
    setListLoaded(true);
  }

  const filteredList = listRecords.filter((r) => {
    if (excludeNotEligibleUnconfirmed && r.status === "Not Eligible for Encoding") return false;
    if (!listFilter.trim()) return true;
    return (
      r.seqno_darro.includes(listFilter.toUpperCase()) ||
      (r.landowner ?? "").toLowerCase().includes(listFilter.toLowerCase()) ||
      (r.clno ?? "").toLowerCase().includes(listFilter.toLowerCase())
    );
  });

  function getArbSortPriority(r: UnconfirmedRow): number {
    if (r.arb_count === 0) return 10;
    if (mode === "confirm_both") {
      const aMatch = areaEq(r.area_value, r.arb_area);
      const mMatch = amountEq(r.amount_value, r.arb_amount);
      if (aMatch && mMatch) return 1;
      if (aMatch) return 2;
      if (mMatch) return 3;
      return 4;
    }
    if (mode === "confirm_area")   return areaEq(r.area_value, r.arb_area)     ? 1 : 2;
    if (mode === "confirm_amount") return amountEq(r.amount_value, r.arb_amount) ? 1 : 2;
    return 5;
  }
  const sortedList = [...filteredList].sort((a, b) => getArbSortPriority(a) - getArbSortPriority(b));

  const totalPages = Math.max(1, Math.ceil(filteredList.length / LIST_PAGE_SIZE));
  const safePage = Math.min(listPage, totalPages);
  const pagedList = sortedList.slice((safePage - 1) * LIST_PAGE_SIZE, safePage * LIST_PAGE_SIZE);

  const filteredIneligible = ineligibleRecords.filter((r) => {
    if (excludeNotEligible && r.status === "Not Eligible for Encoding") return false;
    if (!ineligibleFilter.trim()) return true;
    return (
      r.seqno_darro.includes(ineligibleFilter.toUpperCase()) ||
      (r.landowner ?? "").toLowerCase().includes(ineligibleFilter.toLowerCase()) ||
      (r.clno ?? "").toLowerCase().includes(ineligibleFilter.toLowerCase())
    );
  });

  const ineligibleTotalPages = Math.max(1, Math.ceil(filteredIneligible.length / LIST_PAGE_SIZE));
  const ineligibleSafePage = Math.min(ineligiblePage, ineligibleTotalPages);
  const pagedIneligible = filteredIneligible.slice(
    (ineligibleSafePage - 1) * LIST_PAGE_SIZE,
    ineligibleSafePage * LIST_PAGE_SIZE
  );

  async function loadIneligible() {
    setIneligibleLoading(true); setIneligibleError("");
    const ineligibleType = mode === "confirm_area" ? "ineligible_area"
      : mode === "confirm_amount" ? "ineligible_amount"
      : "ineligible_both";
    const res = await fetch(`/api/batch/landholding?list=${ineligibleType}`);
    const data = await res.json();
    setIneligibleLoading(false);
    if (!res.ok) { setIneligibleError(data.error ?? "Failed to load records."); return; }
    setIneligibleRecords(data.records ?? []);
    setIneligibleTotal(data.total ?? null);
    setIneligiblePage(1);
    setIneligibleLoaded(true);
  }

  const allFilteredSelected = filteredList.length > 0 &&
    filteredList.every((r) => listSelected.has(r.seqno_darro));

  function toggleSelectAll() {
    if (allFilteredSelected) {
      setListSelected((prev) => {
        const next = new Set(prev);
        filteredList.forEach((r) => next.delete(r.seqno_darro));
        return next;
      });
    } else {
      setListSelected((prev) => {
        const next = new Set(prev);
        filteredList.forEach((r) => next.add(r.seqno_darro));
        return next;
      });
    }
  }

  async function doConfirmSelected() {
    setShowListConfirm(false);
    setListLoading(true); setListError("");
    const raw = Array.from(listSelected).join("\n");
    const res = await fetch("/api/batch/landholding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: mode as BatchLHType, raw }),
    });
    const data = await res.json();
    setListLoading(false);
    if (!res.ok) { setListError(data.error ?? "Confirmation failed."); return; }
    setListResult(data.updated);
    await loadList(); // Refresh list
  }

  async function handlePreview() {
    setError(""); setResult(null);
    if (!input.trim()) { setError("Please enter at least one SEQNO_DARRO."); return; }
    setLoading(true);
    const res = await fetch("/api/batch/landholding", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: mode as BatchLHType, raw: input }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error ?? "Preview failed."); return; }
    setPreview(data);
  }

  async function doCommit() {
    setShowConfirm(false);
    setError(""); setLoading(true);
    const res = await fetch("/api/batch/landholding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: mode as BatchLHType, raw: input }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error ?? "Update failed."); return; }
    setResult({ updated: data.updated, updatedRecords: data.updatedRecords ?? [], skippedRecords: data.skippedRecords ?? [] });
    setPreview(null); setInput("");
  }

  // Rows that will actually be confirmed (not blocked, not already confirmed for the selected fields)
  const confirmableRows = preview?.rows.filter((r) => {
    if (confirmArea  && r.area_blocked)   return false;
    if (confirmAmount && r.amount_blocked) return false;
    return true;
  }) ?? [];

  // Rows that are blocked (value ≤ 0 or null) for at least one selected field
  const blockedRows = preview?.rows.filter((r) => {
    if (confirmArea  && r.area_blocked)   return true;
    if (confirmAmount && r.amount_blocked) return true;
    return false;
  }) ?? [];

  // Already-confirmed rows (all selected fields already confirmed)
  const alreadyDoneRows = confirmableRows.filter((r) => {
    const areaOk  = !confirmArea  || r.area_confirmed;
    const amountOk = !confirmAmount || r.amount_confirmed;
    return areaOk && amountOk;
  });

  const toConfirmRows = confirmableRows.filter((r) => {
    const areaOk  = !confirmArea  || r.area_confirmed;
    const amountOk = !confirmAmount || r.amount_confirmed;
    return !(areaOk && amountOk);
  });

  return (
    <div className="max-w-4xl page-enter">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-[1.6rem] font-bold text-gray-900 leading-tight">Area & Amount Confirmation</h2>
        <p className="text-[12px] text-gray-400 mt-0.5 tracking-wide">
          Batch-confirm Validated AMENDAREA and/or Validated Condoned Amount for multiple landholdings.
        </p>
      </div>

      {!result ? (
        <>
          {/* Mode selector */}
          <div className="card-bezel mb-5">
            <div className="card-bezel-inner-open">
              <p className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-3">What to Confirm</p>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  {MODES.map(({ value, label, desc }) => {
                    const active = !showIneligible && mode === value;
                    return (
                      <button
                        key={value}
                        onClick={() => switchMode(value)}
                        className={`flex flex-col items-start px-4 py-2.5 rounded-xl border text-left transition-all duration-150 active:scale-[0.97] ${
                          active
                            ? "bg-green-900 border-green-900 text-white shadow-md"
                            : "bg-white border-green-200 text-green-900 hover:bg-green-50"
                        }`}
                      >
                        <span className="text-[13px] font-bold leading-tight">{label}</span>
                        <span className={`text-[11px] leading-tight mt-0.5 ${active ? "text-green-300" : "text-green-600"}`}>{desc}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Ineligible view button — exclusive with mode buttons */}
                <button
                  onClick={() => {
                    if (!showIneligible) {
                      setShowIneligible(true);
                      if (!ineligibleLoaded) loadIneligible();
                    }
                  }}
                  className={`flex flex-col items-start px-4 py-2.5 rounded-xl border text-left transition-all duration-150 active:scale-[0.97] flex-shrink-0 ${
                    showIneligible
                      ? "bg-amber-600 border-amber-600 text-white shadow-md"
                      : "bg-white border-amber-200 text-amber-800 hover:bg-amber-50"
                  }`}
                >
                  <span className="text-[13px] font-bold leading-tight">Not yet ready</span>
                  <span className={`text-[11px] leading-tight mt-0.5 ${showIneligible ? "text-amber-200" : "text-amber-600"}`}>
                    for Confirmation
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Ineligible Records Panel */}
          {showIneligible && (
            <div className="card-bezel mb-5">
              <div className="card-bezel-inner-open">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-semibold text-amber-600">Not yet ready for Confirmation</p>
                    <p className="text-[12px] text-gray-400 mt-0.5">
                      {mode === "confirm_area"   ? "Records with no valid Validated AMENDAREA (null, zero, or negative)" :
                       mode === "confirm_amount" ? "Records with no valid Validated Condoned Amount (null, zero, or negative)" :
                       "Records where Validated AMENDAREA or Condoned Amount is missing, zero, or negative"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {ineligibleLoaded && (
                      <button
                        onClick={() => { setExcludeNotEligible((v) => !v); setIneligiblePage(1); }}
                        title="Toggle: exclude landholdings with 'Not Eligible for Encoding' status"
                        className={`text-[12px] px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                          excludeNotEligible
                            ? "bg-red-100 border-red-300 text-red-700 hover:bg-red-200"
                            : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
                        }`}
                      >
                        {excludeNotEligible ? "✕ Excl. Not Eligible" : "Excl. Not Eligible"}
                      </button>
                    )}
                    <button
                      onClick={loadIneligible}
                      disabled={ineligibleLoading}
                      className="text-[12px] px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors font-medium disabled:opacity-50"
                    >
                      {ineligibleLoading ? "Loading…" : ineligibleLoaded ? "↺ Refresh" : "Load Records"}
                    </button>
                  </div>
                </div>

                {ineligibleError && <p className="mb-3 text-[12px] text-red-600">{ineligibleError}</p>}

                {ineligibleLoaded && (
                  <>
                    {filteredIneligible.length === 0 && ineligibleRecords.length === 0 ? (
                      <p className="text-[13px] text-gray-400 italic py-6 text-center">No ineligible records found.</p>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 mb-3">
                          <input
                            type="text"
                            value={ineligibleFilter}
                            onChange={(e) => { setIneligibleFilter(e.target.value); setIneligiblePage(1); }}
                            placeholder="Filter by SEQNO, landowner, CLNO…"
                            className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-amber-500"
                          />
                          <span className="text-[12px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full flex-shrink-0 whitespace-nowrap">
                            {ineligibleFilter
                              ? `${filteredIneligible.length.toLocaleString()} / ${ineligibleTotal?.toLocaleString() ?? ineligibleRecords.length.toLocaleString()} records`
                              : `${ineligibleRecords.length.toLocaleString()}${ineligibleTotal != null ? ` / ${ineligibleTotal.toLocaleString()}` : ""} records`}
                          </span>
                        </div>

                        <div className="overflow-x-auto rounded-lg border border-amber-100 mb-3">
                          <table className="w-full text-[13px]">
                            <thead className="bg-amber-700 text-white text-[11px] uppercase tracking-wide">
                              <tr>
                                <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">SEQNO_DARRO</th>
                                <th className="px-3 py-2.5 text-left font-semibold">Landowner</th>
                                <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">Province</th>
                                {confirmArea && (
                                  <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">Val. AMENDAREA (ha)</th>
                                )}
                                {confirmAmount && (
                                  <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">Val. Condoned Amt</th>
                                )}
                              </tr>
                            </thead>
                            <tbody>
                              {pagedIneligible.map((r, i) => (
                                <tr key={r.seqno_darro} className={`border-t border-amber-50 ${i % 2 === 0 ? "bg-white" : "bg-amber-50/30"}`}>
                                  <td className="px-3 py-2 whitespace-nowrap">
                                    <button
                                      onClick={() => setDetailSeqno(r.seqno_darro)}
                                      className="font-mono text-green-800 font-semibold hover:text-green-600 hover:underline underline-offset-2 transition-colors"
                                    >
                                      {r.seqno_darro}
                                    </button>
                                  </td>
                                  <td className="px-3 py-2 text-gray-800 max-w-[160px] truncate">{r.landowner ?? "—"}</td>
                                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{r.province ?? "—"}</td>
                                  {confirmArea && (
                                    <td className="px-3 py-2 text-right whitespace-nowrap">
                                      {r.area_blocked ? (
                                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-700">
                                          {r.area_value == null ? "Not set" : fmt4(r.area_value)}
                                        </span>
                                      ) : (
                                        <span className="font-mono text-green-800 font-semibold">{fmt4(r.area_value)}</span>
                                      )}
                                    </td>
                                  )}
                                  {confirmAmount && (
                                    <td className="px-3 py-2 text-right whitespace-nowrap">
                                      {r.amount_blocked ? (
                                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-700">
                                          {r.amount_value == null ? "Not set" : fmt2(r.amount_value)}
                                        </span>
                                      ) : (
                                        <span className="font-mono text-green-800 font-semibold">{fmt2(r.amount_value)}</span>
                                      )}
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Pagination */}
                        {ineligibleTotalPages > 1 && (
                          <div className="flex items-center justify-center gap-2 mb-2">
                            <button
                              onClick={() => setIneligiblePage((p) => Math.max(1, p - 1))}
                              disabled={ineligibleSafePage <= 1}
                              className="px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                              ← Prev
                            </button>
                            <span className="text-[12px] text-gray-600 font-medium px-1">
                              Page {ineligibleSafePage} of {ineligibleTotalPages}
                            </span>
                            <button
                              onClick={() => setIneligiblePage((p) => Math.min(ineligibleTotalPages, p + 1))}
                              disabled={ineligibleSafePage >= ineligibleTotalPages}
                              className="px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                              Next →
                            </button>
                          </div>
                        )}

                        <p className="text-[11px] text-gray-400">
                          {filteredIneligible.length} record{filteredIneligible.length !== 1 ? "s" : ""}
                          {ineligibleFilter ? ` (filtered from ${ineligibleRecords.length})` : ""}
                          {ineligibleTotalPages > 1 ? ` — page ${ineligibleSafePage} of ${ineligibleTotalPages}` : ""}.
                          &nbsp;Amber values are not yet ready; green values are ready for confirmation.
                        </p>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Input */}
          {!showIneligible && !preview && (
            <div className="card-bezel mb-5">
              <div className="card-bezel-inner-open">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] uppercase tracking-widest font-semibold text-gray-400">Enter SEQNO_DARRO</p>
                  {rowCount > 0 && (
                    <span className="text-[11px] font-semibold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                      {rowCount} row{rowCount !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-gray-400 mb-2">
                  Paste one SEQNO_DARRO per line. Extra columns are ignored.
                </p>
                <textarea
                  value={input}
                  onChange={(e) => { setInput(e.target.value.toUpperCase()); setError(""); }}
                  rows={8}
                  placeholder={"R5-UC-00001\nR5-UC-00002\nR5-UC-00003"}
                  className="w-full font-mono text-[12px] border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-green-600 resize-y"
                />
                {error && <p className="mt-2 text-[12px] text-red-600">{error}</p>}
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={handlePreview}
                    disabled={loading || !input.trim()}
                    className="btn-primary"
                  >
                    {loading ? "Loading…" : <>Preview Records →</>}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Preview */}
          {!showIneligible && preview && (
            <div className="card-bezel">
              <div className="card-bezel-inner-open">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] uppercase tracking-widest font-semibold text-gray-400">Preview</p>
                  <button onClick={reset} className="text-[12px] text-gray-400 hover:text-gray-600">← Edit</button>
                </div>

                {/* Invalid lines */}
                {preview.invalid.length > 0 && (
                  <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-[13px] text-yellow-800">
                    <strong>{preview.invalid.length} line{preview.invalid.length !== 1 ? "s" : ""} skipped (invalid format):</strong>
                    <ul className="mt-1 space-y-0.5 max-h-24 overflow-y-auto">
                      {preview.invalid.map((e, i) => <li key={i} className="font-mono">{e.line} <span className="font-sans text-yellow-600">— {e.reason}</span></li>)}
                    </ul>
                  </div>
                )}

                {/* Not found */}
                {preview.notFoundSeqnos.length > 0 && (
                  <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-[13px] text-yellow-700">
                    <strong>{preview.notFoundSeqnos.length} SEQNO{preview.notFoundSeqnos.length !== 1 ? "s" : ""} not found</strong> — will be skipped:{" "}
                    {preview.notFoundSeqnos.join(", ")}
                  </div>
                )}

                {/* Blocked rows */}
                {blockedRows.length > 0 && (
                  <div className="mb-3 p-3 bg-red-50 border border-red-300 rounded-lg text-[13px] text-red-800">
                    <p className="font-semibold mb-1">
                      {blockedRows.length} record{blockedRows.length !== 1 ? "s" : ""} cannot be confirmed — value is zero, negative, or not set:
                    </p>
                    <ul className="space-y-0.5 max-h-32 overflow-y-auto">
                      {blockedRows.map((r) => (
                        <li key={r.seqno_darro} className="font-mono">
                          {r.seqno_darro}
                          <span className="font-sans text-red-500 ml-1">
                            {confirmArea  && r.area_blocked   ? `Area: ${fmt4(r.area_value)}` : ""}
                            {confirmArea && r.area_blocked && confirmAmount && r.amount_blocked ? " · " : ""}
                            {confirmAmount && r.amount_blocked ? `Amount: ${fmt2(r.amount_value)}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Already confirmed info */}
                {alreadyDoneRows.length > 0 && (
                  <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-[13px] text-blue-700">
                    <strong>{alreadyDoneRows.length} record{alreadyDoneRows.length !== 1 ? "s" : ""}</strong> already confirmed for selected fields — will be skipped.
                  </div>
                )}

                {/* Records table */}
                {preview.rows.length === 0 ? (
                  <p className="text-sm text-gray-400 italic mb-3">No valid records found.</p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-gray-100 mb-4">
                    <table className="w-full text-[13px]">
                      <thead className="bg-green-900 text-white text-[11px] uppercase tracking-wide">
                        <tr>
                          <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">SEQNO_DARRO</th>
                          <th className="px-3 py-2.5 text-left font-semibold">Landowner</th>
                          <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">Province</th>
                          {confirmArea && (
                            <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">Val. AMENDAREA (ha)</th>
                          )}
                          {confirmAmount && (
                            <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">Val. Condoned Amt</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.rows.map((r, i) => {
                          const rowBlocked = (confirmArea && r.area_blocked) || (confirmAmount && r.amount_blocked);
                          const rowAlreadyDone = !rowBlocked && (
                            (!confirmArea || r.area_confirmed) && (!confirmAmount || r.amount_confirmed)
                          );
                          return (
                            <tr key={r.seqno_darro} className={`border-t border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50"} ${rowBlocked ? "opacity-50" : ""}`}>
                              <td className="px-3 py-2 font-mono text-gray-700 whitespace-nowrap">{r.seqno_darro}</td>
                              <td className="px-3 py-2 text-gray-800 max-w-[160px] truncate">{r.landowner ?? "—"}</td>
                              <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{r.province ?? "—"}</td>
                              {confirmArea && (
                                <td className="px-3 py-2 text-right whitespace-nowrap">
                                  {r.area_blocked ? (
                                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-red-100 text-red-700">
                                      {r.area_value == null ? "Not set" : fmt4(r.area_value)}
                                    </span>
                                  ) : r.area_confirmed ? (
                                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-100 text-blue-700">
                                      ✓ {fmt4(r.area_value)}
                                    </span>
                                  ) : (
                                    <span className="font-mono text-green-800 font-semibold">{fmt4(r.area_value)}</span>
                                  )}
                                </td>
                              )}
                              {confirmAmount && (
                                <td className="px-3 py-2 text-right whitespace-nowrap">
                                  {r.amount_blocked ? (
                                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-red-100 text-red-700">
                                      {r.amount_value == null ? "Not set" : fmt2(r.amount_value)}
                                    </span>
                                  ) : r.amount_confirmed ? (
                                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-100 text-blue-700">
                                      ✓ {fmt2(r.amount_value)}
                                    </span>
                                  ) : (
                                    <span className="font-mono text-green-800 font-semibold">{fmt2(r.amount_value)}</span>
                                  )}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Footer summary + confirm button */}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-[12px] text-gray-500">
                    {toConfirmRows.length > 0 ? (
                      <>This will confirm <strong className="text-gray-700">{toConfirmRows.length} record{toConfirmRows.length !== 1 ? "s" : ""}</strong>. This action is logged.</>
                    ) : (
                      <span className="text-gray-400 italic">No records to confirm.</span>
                    )}
                  </p>
                  <button
                    onClick={() => setShowConfirm(true)}
                    disabled={toConfirmRows.length === 0}
                    className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Confirm {toConfirmRows.length > 0 ? toConfirmRows.length : ""} Record{toConfirmRows.length !== 1 ? "s" : ""} ✓
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        /* Result */
        <div className="card-bezel">
          <div className="card-bezel-inner-open">
            <div className="flex items-center gap-3 mb-4">
              <span className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-lg flex-shrink-0">✓</span>
              <div>
                <p className="font-bold text-gray-900">{result.updated} record{result.updated !== 1 ? "s" : ""} confirmed.</p>
                {result.skippedRecords.length > 0 && (
                  <p className="text-[12px] text-gray-500">{result.skippedRecords.length} skipped.</p>
                )}
              </div>
            </div>

            {result.updatedRecords.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-gray-100 mb-4">
                <table className="w-full text-[13px]">
                  <thead className="bg-green-900 text-white text-[11px] uppercase tracking-wide">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">#</th>
                      <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">SEQNO_DARRO</th>
                      <th className="px-3 py-2 text-left font-semibold">Landowner</th>
                      <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">Province</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.updatedRecords.map((r, i) => (
                      <tr key={r.seqno_darro} className={`border-t border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                        <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                        <td className="px-3 py-2 font-mono text-gray-700">{r.seqno_darro}</td>
                        <td className="px-3 py-2 text-gray-800 max-w-[180px] truncate">{r.landowner ?? "—"}</td>
                        <td className="px-3 py-2 text-gray-500">{r.province ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {result.skippedRecords.length > 0 && (
              <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg text-[12px] text-gray-600">
                <p className="font-semibold mb-1">Skipped:</p>
                <ul className="space-y-0.5 max-h-32 overflow-y-auto">
                  {result.skippedRecords.map((r, i) => (
                    <li key={i} className="font-mono">{r.seqno_darro} <span className="font-sans text-gray-400">— {r.reason}</span></li>
                  ))}
                </ul>
              </div>
            )}

            <button onClick={reset} className="btn-primary">
              Confirm More Records
            </button>
          </div>
        </div>
      )}

      {/* ── Unconfirmed Records Browser ── */}
      {!result && !showIneligible && (
        <div className="card-bezel mt-6">
          <div className="card-bezel-inner-open">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-[10px] uppercase tracking-widest font-semibold text-gray-400">Browse Unconfirmed Records</p>
                <p className="text-[12px] text-gray-400 mt-0.5">
                  {mode === "confirm_area"   ? "Records with unconfirmed Validated AMENDAREA (value > 0)" :
                   mode === "confirm_amount" ? "Records with unconfirmed Validated Condoned Amount (value > 0)" :
                   "Records where both Validated AMENDAREA and Condoned Amount are unconfirmed (values > 0)"}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {listLoaded && (
                  <button
                    onClick={() => { setExcludeNotEligibleUnconfirmed((v) => !v); setListPage(1); }}
                    title="Toggle: exclude landholdings with 'Not Eligible for Encoding' status"
                    className={`text-[12px] px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                      excludeNotEligibleUnconfirmed
                        ? "bg-red-100 border-red-300 text-red-700 hover:bg-red-200"
                        : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    {excludeNotEligibleUnconfirmed ? "✕ Excl. Not Eligible" : "Excl. Not Eligible"}
                  </button>
                )}
                <button
                  onClick={loadList}
                  disabled={listLoading}
                  className="btn-primary text-[12px] px-3 py-1.5"
                >
                  {listLoading ? "Loading…" : listLoaded ? "↺ Refresh" : "Load Records"}
                </button>
              </div>
            </div>

            {listError && <p className="mb-3 text-[12px] text-red-600">{listError}</p>}

            {listResult !== null && (
              <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg text-[13px] text-green-800 font-semibold">
                ✓ {listResult} record{listResult !== 1 ? "s" : ""} confirmed successfully.
              </div>
            )}

            {listLoaded && (
              <>
                {listRecords.length === 0 ? (
                  <p className="text-[13px] text-gray-400 italic py-6 text-center">No unconfirmed records found.</p>
                ) : (
                  <>
                    {/* Filter + select all */}
                    <div className="flex items-center gap-2 mb-3">
                      <input
                        type="text"
                        value={listFilter}
                        onChange={(e) => { setListFilter(e.target.value); setListPage(1); }}
                        placeholder="Filter by SEQNO, landowner, CLNO…"
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-green-600"
                      />
                      {listSelected.size > 0 && (
                        <span className="text-[12px] font-semibold text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full flex-shrink-0">
                          {listSelected.size} selected
                        </span>
                      )}
                    </div>

                    <div className="overflow-x-auto rounded-lg border border-gray-100 mb-4">
                      <table className="w-full text-[13px]">
                        <thead className="bg-green-900 text-white text-[11px] uppercase tracking-wide">
                          <tr>
                            <th className="px-3 py-2.5 w-8">
                              <input
                                type="checkbox"
                                checked={allFilteredSelected}
                                onChange={toggleSelectAll}
                                className="w-3.5 h-3.5 rounded accent-green-400 cursor-pointer"
                              />
                            </th>
                            <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">SEQNO_DARRO</th>
                            <th className="px-3 py-2.5 text-left font-semibold">Landowner</th>
                            <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">Province</th>
                            {confirmArea && (
                              <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">Val. AMENDAREA (ha)</th>
                            )}
                            {confirmArea && (
                              <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">ARB Area (ha)</th>
                            )}
                            {confirmAmount && (
                              <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">Val. Condoned Amt</th>
                            )}
                            {confirmAmount && (
                              <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">ARB Amount</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {pagedList.map((r, i) => {
                            const checked = listSelected.has(r.seqno_darro);
                            return (
                              <tr
                                key={r.seqno_darro}
                                className={`border-t border-gray-100 cursor-pointer transition-colors duration-75 ${
                                  checked ? "bg-green-50" : i % 2 === 0 ? "bg-white hover:bg-gray-50" : "bg-gray-50 hover:bg-gray-100"
                                }`}
                                onClick={() =>
                                  setListSelected((prev) => {
                                    const next = new Set(prev);
                                    checked ? next.delete(r.seqno_darro) : next.add(r.seqno_darro);
                                    return next;
                                  })
                                }
                              >
                                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() =>
                                      setListSelected((prev) => {
                                        const next = new Set(prev);
                                        checked ? next.delete(r.seqno_darro) : next.add(r.seqno_darro);
                                        return next;
                                      })
                                    }
                                    className="w-3.5 h-3.5 rounded accent-green-700 cursor-pointer"
                                  />
                                </td>
                                <td className="px-3 py-2 font-mono text-gray-700 whitespace-nowrap">{r.seqno_darro}</td>
                                <td className="px-3 py-2 text-gray-800 max-w-[160px] truncate">{r.landowner ?? "—"}</td>
                                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{r.province ?? "—"}</td>
                                {confirmArea && (
                                  <td className="px-3 py-2 text-right whitespace-nowrap">
                                    {r.area_confirmed
                                      ? <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-100 text-blue-700">✓ {fmt4(r.area_value)}</span>
                                      : <span className="font-mono text-green-800 font-semibold">{fmt4(r.area_value)}</span>
                                    }
                                  </td>
                                )}
                                {confirmArea && (
                                  <td className="px-3 py-2 text-right whitespace-nowrap">
                                    {r.arb_count === 0 ? (
                                      <span className="text-gray-300 text-[11px]">—</span>
                                    ) : (
                                      <span className="inline-flex items-center justify-end gap-1">
                                        {areaEq(r.area_value, r.arb_area) ? (
                                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700">=</span>
                                        ) : (
                                          <span className="relative group cursor-help">
                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700">≠</span>
                                            <span className="absolute bottom-full right-0 mb-1.5 bg-gray-900 text-white text-[11px] rounded-lg px-2.5 py-1.5 opacity-0 group-hover:opacity-100 pointer-events-none z-20 whitespace-nowrap shadow-lg">
                                              Variance: {fmt4(Math.abs((r.area_value ?? 0) - (r.arb_area ?? 0)))} ha
                                            </span>
                                          </span>
                                        )}
                                        <span className="font-mono text-gray-700 font-semibold">{fmt4(r.arb_area)}</span>
                                      </span>
                                    )}
                                  </td>
                                )}
                                {confirmAmount && (
                                  <td className="px-3 py-2 text-right whitespace-nowrap">
                                    {r.amount_confirmed
                                      ? <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-100 text-blue-700">✓ {fmt2(r.amount_value)}</span>
                                      : <span className="font-mono text-green-800 font-semibold">{fmt2(r.amount_value)}</span>
                                    }
                                  </td>
                                )}
                                {confirmAmount && (
                                  <td className="px-3 py-2 text-right whitespace-nowrap">
                                    {r.arb_count === 0 ? (
                                      <span className="text-gray-300 text-[11px]">—</span>
                                    ) : (
                                      <span className="inline-flex items-center justify-end gap-1">
                                        {amountEq(r.amount_value, r.arb_amount) ? (
                                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700">=</span>
                                        ) : (
                                          <span className="relative group cursor-help">
                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700">≠</span>
                                            <span className="absolute bottom-full right-0 mb-1.5 bg-gray-900 text-white text-[11px] rounded-lg px-2.5 py-1.5 opacity-0 group-hover:opacity-100 pointer-events-none z-20 whitespace-nowrap shadow-lg">
                                              Variance: {fmt2(Math.abs((r.amount_value ?? 0) - (r.arb_amount ?? 0)))}
                                            </span>
                                          </span>
                                        )}
                                        <span className="font-mono text-gray-700 font-semibold">{fmt2(r.arb_amount)}</span>
                                      </span>
                                    )}
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination controls */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-center gap-2 mb-4">
                        <button
                          onClick={() => setListPage((p) => Math.max(1, p - 1))}
                          disabled={safePage <= 1}
                          className="px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          ← Prev
                        </button>
                        <span className="text-[12px] text-gray-600 font-medium px-1">
                          Page {safePage} of {totalPages}
                        </span>
                        <button
                          onClick={() => setListPage((p) => Math.min(totalPages, p + 1))}
                          disabled={safePage >= totalPages}
                          className="px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          Next →
                        </button>
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <p className="text-[12px] text-gray-500">
                        {filteredList.length} record{filteredList.length !== 1 ? "s" : ""} shown
                        {listFilter ? ` (filtered from ${listRecords.length})` : ""}
                        {totalPages > 1 ? ` — page ${safePage} of ${totalPages}` : ""}.
                      </p>
                      <button
                        onClick={() => setShowListConfirm(true)}
                        disabled={listSelected.size === 0 || listLoading}
                        className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Confirm {listSelected.size > 0 ? listSelected.size : ""} Selected ✓
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Confirmation modal — paste input */}
      {showConfirm && typeof window !== "undefined" && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="flex items-start gap-3 mb-4">
              <span className="flex-shrink-0 w-9 h-9 rounded-full bg-green-100 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-green-700" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </span>
              <div>
                <h3 className="text-[15px] font-bold text-gray-900 leading-tight mb-1">
                  Confirm {toConfirmRows.length} Record{toConfirmRows.length !== 1 ? "s" : ""}?
                </h3>
                <p className="text-[13px] text-gray-500 leading-snug">
                  This will mark{" "}
                  {mode === "confirm_area" ? "the Validated AMENDAREA" :
                   mode === "confirm_amount" ? "the Validated Condoned Amount" :
                   "both the Validated AMENDAREA and Condoned Amount"}{" "}
                  as confirmed for <strong className="text-gray-700">{toConfirmRows.length} record{toConfirmRows.length !== 1 ? "s" : ""}</strong>. This action is logged.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowConfirm(false)} className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-[13px] hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={() => void doCommit()} className="px-4 py-2 bg-green-800 hover:bg-green-900 text-white rounded-lg text-[13px] font-semibold">
                Yes, Confirm
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Confirmation modal — list selection */}
      {showListConfirm && typeof window !== "undefined" && createPortal(
        (() => {
          const selRecs = listRecords.filter((r) => listSelected.has(r.seqno_darro));
          const noArbRecs = selRecs.filter((r) => r.arb_count === 0);
          const varAreaRecs = confirmArea  ? selRecs.filter((r) => r.arb_count > 0 && !areaEq(r.area_value, r.arb_area))   : [];
          const varAmtRecs  = confirmAmount ? selRecs.filter((r) => r.arb_count > 0 && !amountEq(r.amount_value, r.arb_amount)) : [];
          const varSeqnos = [...new Set([...varAreaRecs, ...varAmtRecs].map((r) => r.seqno_darro))];
          const hasWarnings = noArbRecs.length > 0 || varSeqnos.length > 0;
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
              <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
                <div className="flex items-start gap-3 mb-4">
                  <span className="flex-shrink-0 w-9 h-9 rounded-full bg-green-100 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-green-700" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </span>
                  <div>
                    <h3 className="text-[15px] font-bold text-gray-900 leading-tight mb-1">
                      Confirm {listSelected.size} Record{listSelected.size !== 1 ? "s" : ""}?
                    </h3>
                    <p className="text-[13px] text-gray-500 leading-snug">
                      This will mark{" "}
                      {mode === "confirm_area"   ? "the Validated AMENDAREA" :
                       mode === "confirm_amount" ? "the Validated Condoned Amount" :
                       "both the Validated AMENDAREA and Condoned Amount"}{" "}
                      as confirmed for <strong className="text-gray-700">{listSelected.size} selected record{listSelected.size !== 1 ? "s" : ""}</strong>. This action is logged.
                    </p>
                  </div>
                </div>

                {noArbRecs.length > 0 && (
                  <div className="mb-3 p-3 bg-amber-50 border border-amber-300 rounded-lg text-[12px] text-amber-800">
                    <p className="font-semibold mb-1.5">⚠ {noArbRecs.length} record{noArbRecs.length !== 1 ? "s have" : " has"} no ARBs encoded yet:</p>
                    <ul className="space-y-0.5 max-h-24 overflow-y-auto font-mono text-[11px]">
                      {noArbRecs.map((r) => (
                        <li key={r.seqno_darro}>{r.seqno_darro} <span className="font-sans text-amber-600">— {r.landowner ?? "—"}</span></li>
                      ))}
                    </ul>
                  </div>
                )}

                {varSeqnos.length > 0 && (
                  <div className="mb-3 p-3 bg-red-50 border border-red-300 rounded-lg text-[12px] text-red-800">
                    <p className="font-semibold mb-1.5">⚠ Variances detected in {varSeqnos.length} record{varSeqnos.length !== 1 ? "s" : ""}:</p>
                    <ul className="space-y-1.5 max-h-40 overflow-y-auto">
                      {varSeqnos.map((seqno) => {
                        const r = listRecords.find((x) => x.seqno_darro === seqno)!;
                        const aVar = confirmArea  && r.arb_count > 0 && !areaEq(r.area_value, r.arb_area);
                        const mVar = confirmAmount && r.arb_count > 0 && !amountEq(r.amount_value, r.arb_amount);
                        return (
                          <li key={seqno} className="font-mono text-[11px]">
                            {seqno}
                            <span className="font-sans text-red-600 ml-1">
                              {aVar && <>Area: LH={fmt4(r.area_value)} vs ARB={fmt4(r.arb_area)} (Δ{fmt4(Math.abs((r.area_value ?? 0) - (r.arb_area ?? 0)))} ha)</>}
                              {aVar && mVar && <>, </>}
                              {mVar && <>Amt: LH={fmt2(r.amount_value)} vs ARB={fmt2(r.arb_amount)} (Δ{fmt2(Math.abs((r.amount_value ?? 0) - (r.arb_amount ?? 0)))})</>}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                <div className="flex gap-2 justify-end">
                  <button onClick={() => setShowListConfirm(false)} className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-[13px] hover:bg-gray-50">
                    Cancel
                  </button>
                  <button
                    onClick={() => void doConfirmSelected()}
                    className={`px-4 py-2 ${hasWarnings ? "bg-amber-600 hover:bg-amber-700" : "bg-green-800 hover:bg-green-900"} text-white rounded-lg text-[13px] font-semibold`}
                  >
                    {hasWarnings ? "Confirm Anyway" : "Yes, Confirm"}
                  </button>
                </div>
              </div>
            </div>
          );
        })(),
        document.body
      )}
      {/* Individual LH modal — opened from ineligible list */}
      {detailSeqno && (() => {
        const idx = filteredIneligible.findIndex((r) => r.seqno_darro === detailSeqno);
        return (
          <DetailModal
            seqno={detailSeqno}
            onClose={() => setDetailSeqno(null)}
            onSaved={loadIneligible}
            hasPrev={idx > 0}
            hasNext={idx < filteredIneligible.length - 1}
            onPrev={() => idx > 0 && setDetailSeqno(filteredIneligible[idx - 1].seqno_darro)}
            onNext={() => idx < filteredIneligible.length - 1 && setDetailSeqno(filteredIneligible[idx + 1].seqno_darro)}
          />
        );
      })()}
    </div>
  );
}
