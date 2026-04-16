"use client";

export const dynamic = "force-dynamic";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useToast } from "@/components/Toast";
import { useUser } from "@/components/UserContext";
import { DetailModal } from "@/components/RecordsTable";

/* ─── Mismatch Tooltip ─── */
function MismatchBadge({ label, type = "Area" }: { label: string; type?: string }) {
  const isDeficit = label.startsWith("Deficit");
  const [pos, setPos] = React.useState<{ x: number; y: number } | null>(null);
  const amount = label.replace("Deficit of ", "").replace("Excess of ", "");

  return (
    <>
      <span
        onMouseEnter={(e) => setPos({ x: e.clientX, y: e.clientY })}
        onMouseMove={(e) => setPos({ x: e.clientX, y: e.clientY })}
        onMouseLeave={() => setPos(null)}
        className="text-orange-500 font-bold text-[13px] cursor-default select-none"
      >!</span>
      {pos && typeof window !== "undefined" && createPortal(
        <div
          className="pointer-events-none fixed z-[9999]"
          style={{ left: pos.x, top: pos.y - 12, transform: "translate(-50%, -100%)" }}
        >
          <div
            className={`rounded-lg overflow-hidden shadow-2xl min-w-[160px] ${isDeficit ? "bg-red-600" : "bg-amber-500"}`}
            style={{ animation: "toast-in 0.15s cubic-bezier(0.16,1,0.3,1) both" }}
          >
            <div className="px-3.5 py-2.5">
              <p className="text-[9px] uppercase tracking-[0.15em] font-bold text-white/60 mb-0.5">
                {isDeficit ? `${type} Deficit` : `${type} Excess`}
              </p>
              <p className="text-white font-bold text-[14px] font-mono leading-none">{amount}</p>
            </div>
            <div className={`h-1 w-full ${isDeficit ? "bg-red-800/40" : "bg-amber-700/40"}`} />
          </div>
          <div className={`mx-auto w-0 h-0 border-x-4 border-x-transparent border-t-4 ${isDeficit ? "border-t-red-600" : "border-t-amber-500"}`} />
        </div>,
        document.body
      )}
    </>
  );
}

/* ─── Shared Types ─── */
type LHSummary = {
  seqno_darro: string;
  landowner: string | null;
  province_edited: string | null;
  clno: string | null;
  amendarea_validated: number | null;
  amendarea: number | null;
  condoned_amount: number | null;
  net_of_reval_no_neg: number | null;
  status: string | null;
  eligibleArbCount: number;
  _count: { arbs: number };
};

type Arb = {
  id: number;
  arb_name: string | null;
  arb_id: string | null;
  ep_cloa_no: string | null;
  carpable: string | null;
  area_allocated: string | null;
  allocated_condoned_amount: string | null;
  eligibility: string | null;
  eligibility_reason: string | null;
  date_encoded: string | null;
  date_distributed: string | null;
  remarks: string | null;
};

type LHDetail = {
  landholding: {
    seqno_darro: string; landowner: string | null; province_edited: string | null;
    clno: string | null; claimclass: string | null; osarea: number | null;
    amendarea: number | null; amendarea_validated: number | null;
    condoned_amount: number | null; net_of_reval_no_neg: number | null;
    status: string | null; data_flags: string | null;
  };
  arbs: Arb[];
};

type LHLookup = {
  seqno_darro: string;
  landowner: string | null;
  province_edited: string | null;
  municipality: string | null;
  clno: string | null;
  amendarea_validated: number | null;
  amendarea: number | null;
  condoned_amount: number | null;
  net_of_reval_no_neg: number | null;
  status: string | null;
  _count: { arbs: number };
};

type ArbRow = {
  arb_name: string;
  arb_id: string;
  ep_cloa_no: string;
  carpable: string;
  area_allocated: string;
  allocated_condoned_amount: string;
  eligibility: string;
  eligibility_reason: string;
  date_encoded: string;
  date_distributed: string;
  remarks: string;
};

// Returns 0 for Collective CLOA entries (marked with "*") so they don't inflate totals
function toDateInput(val: string): string {
  if (!val) return "";
  const [m, d, y] = val.split("/");
  if (!m || !d || !y) return "";
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}
function fromDateInput(val: string): string {
  if (!val) return "";
  const [y, m, d] = val.split("-");
  if (!y || !m || !d) return "";
  return `${m}/${d}/${y}`;
}

function parseArea(val: string | null | undefined): number {
  if (!val) return 0;
  if (String(val).endsWith("*")) return 0;
  return parseFloat(String(val)) || 0;
}

// Displays area_allocated as-is (preserving "*" marker)
function displayArea(val: string | null | undefined): string {
  if (!val) return "—";
  const hasStar = String(val).endsWith("*");
  const num = parseFloat(String(val).replace("*", ""));
  if (isNaN(num)) return String(val);
  return hasStar ? `${num.toFixed(4)}*` : num.toFixed(4);
}

// Formats allocated_condoned_amount: pure numbers → PHP currency, otherwise raw text
function displayCondoned(val: string | null | undefined): string {
  if (!val) return "—";
  const num = parseFloat(val.replace(/,/g, ""));
  if (!isNaN(num) && String(val).trim().replace(/,/g, "") === String(num)) {
    return num.toLocaleString("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return val;
}

function emptyRow(): ArbRow {
  return { arb_name: "", arb_id: "", ep_cloa_no: "", carpable: "", area_allocated: "", allocated_condoned_amount: "", eligibility: "", eligibility_reason: "", date_encoded: "", date_distributed: "", remarks: "" };
}

/* ─── Upload File Panel ─── */
type PreviewArb = { seqno_darro: string | null; arb_name: string | null; arb_id: string | null; ep_cloa_no: string | null; carpable: string | null; area_allocated: string | null; allocated_condoned_amount: string | null; eligibility: string | null; eligibility_reason: string | null; date_encoded: string | null; date_distributed: string | null; remarks: string | null };
type BySEQNO = Record<string, { landowner: string | null; province: string | null; count: number; existingCount: number; arbs: PreviewArb[]; amendarea: number | null; amendarea_validated: number | null; condoned_amount: number | null; net_of_reval_no_neg: number | null }>;
type PreviewData = { total: number; valid: number; errors: { row: number; reason: string }[]; arbIdConflicts: { row: number; arb_id: string; existing_seqno: string }[]; notFoundSeqnos: string[]; outOfJurisdictionSeqnos: string[]; lockedSeqnos: string[]; carpableConflicts: { row: number; seqno: string; arb_name: string; arb_id: string }[]; notEligibleConflictSeqnos?: string[]; bySEQNO: BySEQNO } | null;

function UploadFilePanel({ onSaved }: { onSaved: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"append" | "replace">("append");
  const [preview, setPreview] = useState<PreviewData>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<{ imported: number; skipped: number; skipReasons?: { row: number; reason: string }[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showReplaceModal, setShowReplaceModal] = useState(false);
  const [showCarpableModal, setShowCarpableModal] = useState(false);
  const [previewPage, setPreviewPage] = useState(1);
  const PREVIEW_PAGE_SIZE = 10;

  useEffect(() => {
    if (!showReplaceModal) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setShowReplaceModal(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showReplaceModal]);

  useEffect(() => {
    if (!showCarpableModal) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setShowCarpableModal(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showCarpableModal]);

  function clearPreview() {
    abortRef.current?.abort();
    abortRef.current = null;
    setPreview(null);
    setLoading(false);
    setError("");
    setPreviewPage(1);
  }

  async function handlePreview() {
    if (!file) { setError("Please select a file first."); return; }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError(""); setPreview(null); setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file); fd.append("mode", mode);
      const res = await fetch("/api/arbs/upload", { method: "PUT", body: fd, signal: controller.signal });
      const data = await res.json();
      if (!res.ok) { setError(data.error); setLoading(false); return; }
      setPreview(data); setPreviewPage(1); setLoading(false);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError("Preview failed. Please try again."); setLoading(false);
    }
  }

  function handleRefresh() {
    clearPreview();
    // Reset input value first — otherwise re-selecting the same filename won't fire onChange
    if (fileRef.current) fileRef.current.value = "";
    setTimeout(() => fileRef.current?.click(), 0);
  }

  function initiateImport() {
    if (!preview) return;
    const hasCarpableConflicts = (preview.carpableConflicts?.length ?? 0) > 0;
    const hasReplacements = mode === "replace" && Object.values(preview.bySEQNO).some((i) => i.existingCount > 0);
    if (hasCarpableConflicts) { setShowCarpableModal(true); return; }
    if (hasReplacements) { setShowReplaceModal(true); return; }
    handleImport();
  }

  function proceedAfterCarpableConfirm() {
    setShowCarpableModal(false);
    if (!preview) return;
    const hasReplacements = mode === "replace" && Object.values(preview.bySEQNO).some((i) => i.existingCount > 0);
    if (hasReplacements) { setShowReplaceModal(true); return; }
    handleImport();
  }

  async function handleImport() {
    if (!file) return;
    setError(""); setLoading(true);
    const fd = new FormData();
    fd.append("file", file); fd.append("mode", mode);
    const res = await fetch("/api/arbs/upload", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) { setError(data.error); setLoading(false); return; }
    setResult(data); setPreview(null); setFile(null);
    if (fileRef.current) fileRef.current.value = "";
    setLoading(false); onSaved();
  }

  function reset() {
    setFile(null); setPreview(null); setResult(null); setError("");
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div>
      {result ? (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="font-semibold text-green-800 text-sm">
            ✓ Imported <strong>{result.imported.toLocaleString()}</strong> ARB{result.imported !== 1 ? "s" : ""}.
            {result.skipped > 0 && ` ${result.skipped} skipped.`}
          </p>
          {result.skipReasons && result.skipReasons.length > 0 && (
            <div className="mt-2 max-h-40 overflow-y-auto rounded border border-green-300 bg-white p-2">
              <p className="text-[11px] font-semibold text-green-900 mb-1">Skip reasons:</p>
              {result.skipReasons.map((s, i) => (
                <p key={i} className="text-[11px] text-red-700 font-mono">Row {s.row}: {s.reason}</p>
              ))}
            </div>
          )}
          <button onClick={reset} className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-700 text-white text-[13px] font-semibold hover:bg-green-600 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
            Upload another file
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 mb-4">
            <div className="flex flex-col">
              <label className="block text-[12px] font-semibold text-gray-500 uppercase tracking-wide mb-2">File (.xlsx or .csv)</label>
              <label className={`flex-1 flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed cursor-pointer transition-colors min-h-[120px] ${
                file ? "border-green-400 bg-green-50" : "border-gray-300 bg-gray-50 hover:border-green-400 hover:bg-green-50/40"
              }`}>
                <input ref={fileRef} type="file" accept=".xlsx,.csv" className="sr-only"
                  onChange={(e) => { clearPreview(); setFile(e.target.files?.[0] ?? null); }}
                />
                {file ? (
                  <>
                    <svg className="w-8 h-8 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                    </svg>
                    <div className="text-center px-4">
                      <p className="text-[13px] font-semibold text-green-800 truncate max-w-[220px]">{file.name}</p>
                      <p className="text-[11px] text-green-600 mt-0.5">{(file.size / 1024).toFixed(1)} KB — Ready to preview</p>
                    </div>
                    <span className="text-[11px] text-green-600 underline underline-offset-2">Click to change file</span>
                  </>
                ) : (
                  <>
                    <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                    <div className="text-center">
                      <p className="text-[13px] font-semibold text-gray-600">Click to choose file</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">.xlsx or .csv accepted</p>
                    </div>
                  </>
                )}
              </label>
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Upload Mode</label>
              <div className="flex flex-col gap-2">
                {([
                  { value: "append", label: "Append", desc: "Add to existing ARBs without removing any", icon: "+" },
                  { value: "replace", label: "Replace", desc: "Delete existing ARBs for matched SEQNOs, then insert new ones", icon: "↺" },
                ] as const).map(({ value, label, desc, icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => { setMode(value); clearPreview(); }}
                    className={`flex items-start gap-3 w-full text-left px-4 py-3 rounded-xl border-2 transition-colors ${
                      mode === value
                        ? value === "replace"
                          ? "border-orange-400 bg-orange-50"
                          : "border-green-700 bg-green-50"
                        : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <span className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                      mode === value
                        ? value === "replace" ? "bg-orange-400 text-white" : "bg-green-700 text-white"
                        : "bg-gray-200 text-gray-400"
                    }`}>{icon}</span>
                    <div>
                      <p className={`text-sm font-bold ${mode === value ? (value === "replace" ? "text-orange-700" : "text-green-800") : "text-gray-700"}`}>{label}</p>
                      <p className="text-[12px] text-gray-500 mt-0.5">{desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
            <p className="text-[12px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Expected Columns</p>
            <p className="text-[12px] text-gray-500 font-mono">SEQNO_DARRO* &nbsp;|&nbsp; ARB_NAME* &nbsp;|&nbsp; ARB_ID* &nbsp;|&nbsp; EP_CLOA_NO &nbsp;|&nbsp; CARPABLE* &nbsp;|&nbsp; AREA_ALLOCATED* &nbsp;|&nbsp; ALLOCATED_CONDONED_AMOUNT* &nbsp;|&nbsp; ELIGIBILITY* &nbsp;|&nbsp; ELIGIBILITY_REASON &nbsp;|&nbsp; DATE_ENCODED &nbsp;|&nbsp; DATE_DISTRIBUTED &nbsp;|&nbsp; REMARKS</p>
            <p className="text-[11px] text-gray-400 mt-1">* Required. Column names are flexible.</p>
          </div>

          {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={handlePreview} disabled={!file || loading}
              className="px-5 py-2 bg-green-900 text-white rounded-lg text-sm font-medium hover:bg-green-800 disabled:opacity-40 transition-colors">
              {loading ? "Processing..." : "Preview File →"}
            </button>
            {preview && !loading && (
              <button
                onClick={handleRefresh}
                title="Clear preview and re-select the updated file"
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                </svg>
                Re-upload File
              </button>
            )}
          </div>

          {preview && (
            <div className="mt-4">
              <div className="grid grid-cols-3 gap-3 mb-4">
                <Stat label="Total Rows" value={preview.total} color="gray" />
                <Stat label="Valid to Import" value={preview.valid} color="green" />
                <Stat label="Skipped" value={preview.errors.length + preview.notFoundSeqnos.length + preview.outOfJurisdictionSeqnos.length + (preview.lockedSeqnos?.length ?? 0) + preview.arbIdConflicts.length} color="red" />
              </div>
              {/* ── Skip/Error Notices ── */}
              {(preview.arbIdConflicts.length > 0 || preview.notFoundSeqnos.length > 0 || preview.outOfJurisdictionSeqnos.length > 0 || (preview.lockedSeqnos?.length ?? 0) > 0 || preview.errors.length > 0) && (
                <div className="mb-4 rounded-xl border border-red-100 overflow-hidden">
                  {/* Header */}
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-red-600">
                    <svg className="w-4 h-4 text-white shrink-0" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <p className="text-white font-semibold text-[13px]">
                      {preview.errors.length + preview.notFoundSeqnos.length + preview.outOfJurisdictionSeqnos.length + preview.arbIdConflicts.length} row{(preview.errors.length + preview.notFoundSeqnos.length + preview.outOfJurisdictionSeqnos.length + preview.arbIdConflicts.length) !== 1 ? "s" : ""} skipped — review the issues below before importing
                    </p>
                  </div>

                  <div className="divide-y divide-red-50">
                    {/* ARB ID conflicts — table layout */}
                    {preview.arbIdConflicts.length > 0 && (
                      <div className="px-4 py-3 bg-red-50">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-600 text-white text-[10px] font-bold shrink-0">{preview.arbIdConflicts.length}</span>
                          <p className="text-[12px] font-semibold text-red-800">Duplicate ARB IDs — already assigned to another SEQNO</p>
                        </div>
                        <div className="rounded-lg border border-red-200 overflow-hidden">
                          <table className="w-full text-[12px]">
                            <thead>
                              <tr className="bg-red-100 text-red-600 uppercase text-[10px] tracking-wider font-semibold">
                                <th className="px-3 py-1.5 text-left w-16">Row</th>
                                <th className="px-3 py-1.5 text-left">ARB ID in File</th>
                                <th className="px-3 py-1.5 text-left">Already Assigned To</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-red-100 max-h-40 overflow-y-auto">
                              {preview.arbIdConflicts.slice(0, 12).map((c, i) => (
                                <tr key={i} className="bg-white">
                                  <td className="px-3 py-1.5 font-mono text-gray-400">{c.row}</td>
                                  <td className="px-3 py-1.5">
                                    <span className="inline-flex items-center gap-1.5 font-mono font-semibold text-red-700 bg-red-50 border border-red-200 rounded px-1.5 py-0.5 text-[11px]">
                                      <svg className="w-2.5 h-2.5 text-red-400" viewBox="0 0 8 8" fill="currentColor"><circle cx="4" cy="4" r="4"/></svg>
                                      {c.arb_id}
                                    </span>
                                  </td>
                                  <td className="px-3 py-1.5 font-mono text-[12px] text-gray-600">
                                    <span className="bg-gray-100 rounded px-1.5 py-0.5 text-gray-700">{c.existing_seqno}</span>
                                  </td>
                                </tr>
                              ))}
                              {preview.arbIdConflicts.length > 12 && (
                                <tr className="bg-red-50">
                                  <td colSpan={3} className="px-3 py-1.5 text-[11px] text-red-400 text-center">+{preview.arbIdConflicts.length - 12} more conflicts not shown</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                        <p className="mt-2 text-[11px] text-red-500">Each ARB ID must be globally unique. Fix duplicates in your file and re-upload.</p>
                      </div>
                    )}

                    {/* Not found SEQNOs */}
                    {preview.notFoundSeqnos.length > 0 && (
                      <div className="px-4 py-3 bg-amber-50">
                        <div className="flex items-start gap-2">
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold shrink-0 mt-0.5">{preview.notFoundSeqnos.length}</span>
                          <div>
                            <p className="text-[12px] font-semibold text-amber-800">SEQNO{preview.notFoundSeqnos.length !== 1 ? "s" : ""} not found in database</p>
                            <p className="text-[11px] text-amber-600 mt-1 font-mono">{preview.notFoundSeqnos.slice(0, 6).join(", ")}{preview.notFoundSeqnos.length > 6 ? ` +${preview.notFoundSeqnos.length - 6} more` : ""}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Out of jurisdiction */}
                    {preview.outOfJurisdictionSeqnos.length > 0 && (
                      <div className="px-4 py-3 bg-orange-50">
                        <div className="flex items-start gap-2">
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-orange-500 text-white text-[10px] font-bold shrink-0 mt-0.5">{preview.outOfJurisdictionSeqnos.length}</span>
                          <div>
                            <p className="text-[12px] font-semibold text-orange-800">SEQNO{preview.outOfJurisdictionSeqnos.length !== 1 ? "s" : ""} outside your jurisdiction</p>
                            <p className="text-[11px] text-orange-600 mt-1 font-mono">{preview.outOfJurisdictionSeqnos.slice(0, 6).join(", ")}{preview.outOfJurisdictionSeqnos.length > 6 ? ` +${preview.outOfJurisdictionSeqnos.length - 6} more` : ""}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Locked landholdings */}
                    {(preview.lockedSeqnos?.length ?? 0) > 0 && (
                      <div className="px-4 py-3 bg-red-50">
                        <div className="flex items-start gap-2">
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold shrink-0 mt-0.5">{preview.lockedSeqnos!.length}</span>
                          <div>
                            <p className="text-[12px] font-semibold text-red-800">SEQNO{preview.lockedSeqnos!.length !== 1 ? "s" : ""} locked — status is For Encoding or beyond</p>
                            <p className="text-[11px] text-red-600 mt-1 font-mono">{preview.lockedSeqnos!.slice(0, 6).join(", ")}{preview.lockedSeqnos!.length > 6 ? ` +${preview.lockedSeqnos!.length - 6} more` : ""}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Non-CARPable but marked Eligible */}
                    {(preview.carpableConflicts?.length ?? 0) > 0 && (
                      <div className="px-4 py-3 bg-yellow-50">
                        <div className="flex items-start gap-2">
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-yellow-500 text-white text-[10px] font-bold shrink-0 mt-0.5">{preview.carpableConflicts.length}</span>
                          <div>
                            <p className="text-[12px] font-semibold text-yellow-800">Non-CARPable ARB{preview.carpableConflicts.length !== 1 ? "s" : ""} marked as Eligible — confirmation required</p>
                            <p className="text-[11px] text-yellow-700 mt-0.5">These ARBs have CARPABLE = NON-CARPABLE but ELIGIBILITY = Eligible. You will be asked to confirm before importing.</p>
                            <p className="text-[11px] text-yellow-600 font-mono mt-1">{preview.carpableConflicts.slice(0, 4).map((c) => c.arb_id).join(", ")}{preview.carpableConflicts.length > 4 ? ` +${preview.carpableConflicts.length - 4} more` : ""}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Row-level validation errors */}
                    {preview.errors.length > 0 && (
                      <div className="px-4 py-3 bg-red-50">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-600 text-white text-[10px] font-bold shrink-0">{preview.errors.length}</span>
                          <p className="text-[12px] font-semibold text-red-800">Row validation errors</p>
                        </div>
                        <ul className="space-y-0.5 max-h-24 overflow-y-auto">
                          {preview.errors.map((e, i) => (
                            <li key={i} className="flex items-baseline gap-2 text-[12px]">
                              <span className="font-mono text-gray-400 shrink-0 w-12">Row {e.row}</span>
                              <span className="text-red-700">{e.reason.replace(/^Row \d+: /, "")}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {/* Not Eligible for Encoding + Eligible ARB conflict */}
              {(preview.notEligibleConflictSeqnos?.length ?? 0) > 0 && (
                <div className="mb-4 rounded-xl border border-amber-300 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-500">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-white shrink-0" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <p className="text-white font-semibold text-[13px]">
                      Status conflict on {preview.notEligibleConflictSeqnos!.length} landholding{preview.notEligibleConflictSeqnos!.length !== 1 ? "s" : ""} — action may be required
                    </p>
                  </div>
                  <div className="px-4 py-3 bg-amber-50">
                    <div className="flex items-start gap-2">
                      <div>
                        <p className="text-[12px] font-semibold text-amber-900">Eligible ARBs detected on landholdings tagged as "Not Eligible for Encoding"</p>
                        <p className="text-[11px] text-amber-800 mt-1 leading-snug">
                          These landholdings are marked <strong>Not Eligible for Encoding</strong>, which means all their ARBs are expected to be <strong>Not Eligible</strong>. However, some uploaded ARBs have Eligibility = <strong>Eligible</strong>.
                        </p>
                        <p className="text-[11px] text-amber-800 mt-1 leading-snug">
                          If those ARBs are truly eligible, please <strong>undo the "Not Eligible for Encoding" status on the landholding</strong> — the status should remain at a <em>Partial</em> level instead. The ARBs will still be imported, but Date Encoded and Distributed will be discarded for all ARBs under these landholdings.
                        </p>
                        <p className="text-[11px] text-amber-700 font-mono mt-1.5">{preview.notEligibleConflictSeqnos!.slice(0, 6).join(", ")}{preview.notEligibleConflictSeqnos!.length > 6 ? ` +${preview.notEligibleConflictSeqnos!.length - 6} more` : ""}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {(() => {
                const allEntries = Object.entries(preview.bySEQNO);
                const totalPages = Math.ceil(allEntries.length / PREVIEW_PAGE_SIZE);
                const allExpanded = allEntries.every(([s]) => expanded[s]);
                return (
              <>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[12px] text-gray-400">
                  Showing {Math.min((previewPage - 1) * PREVIEW_PAGE_SIZE + 1, allEntries.length)}–{Math.min(previewPage * PREVIEW_PAGE_SIZE, allEntries.length)} of {allEntries.length} landholding{allEntries.length !== 1 ? "s" : ""}
                </span>
                <button
                  onClick={() => setExpanded(allExpanded ? {} : Object.fromEntries(allEntries.map(([k]) => [k, true])))}
                  className="text-[12px] text-green-700 font-semibold hover:underline"
                >
                  {allExpanded ? "Collapse All" : "Expand All"}
                </button>
              </div>
              <div className="overflow-x-auto rounded-lg border border-gray-100 mb-3">
                <table className="w-full">
                  <thead className="bg-green-900 text-white text-[11px] uppercase tracking-wider">
                    <tr>
                      <th className="px-3 py-2.5 text-left w-6"></th>
                      <th className="px-3 py-2.5 text-left">SEQNO_DARRO</th>
                      <th className="px-3 py-2.5 text-left">Landowner</th>
                      <th className="px-3 py-2.5 text-left">Province</th>
                      <th className="px-3 py-2.5 text-right">ARBs in File</th>
                      <th className="px-3 py-2.5 text-right">Existing</th>
                      <th className="px-3 py-2.5 text-right">Total Area</th>
                      <th className="px-3 py-2.5 text-right">Validated AMENDAREA</th>
                      <th className="px-3 py-2.5 text-right">Val. Condoned Amt</th>
                      <th className="px-3 py-2.5 text-center">Match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allEntries.slice((previewPage - 1) * PREVIEW_PAGE_SIZE, previewPage * PREVIEW_PAGE_SIZE).map(([seqno, info], i) => {
                      const willReplace = mode === "replace" && info.existingCount > 0;
                      const totalArea = info.arbs.reduce((s, a) => s + parseArea(a.area_allocated), 0);
                      const validatedArea = info.amendarea_validated ?? info.amendarea;
                      const areaMatch = validatedArea != null && parseFloat(totalArea.toFixed(4)) === parseFloat(validatedArea.toFixed(4));
                      const areaDiff = validatedArea != null ? totalArea - validatedArea : null;
                      const condonedAmt = info.condoned_amount ?? info.net_of_reval_no_neg;
                      return (
                      <React.Fragment key={seqno}>
                        {/* ── Parent row ── */}
                        <tr
                          className={`border-t cursor-pointer transition-colors group ${
                            willReplace
                              ? "border-orange-200 bg-orange-50/40 hover:bg-orange-50"
                              : `border-gray-100 hover:bg-green-50/60 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/40"}`
                          }`}
                          onClick={() => setExpanded((prev) => ({ ...prev, [seqno]: !prev[seqno] }))}
                        >
                          {/* Chevron */}
                          <td className="pl-3 pr-1 py-3 w-8">
                            <span className={`inline-flex items-center justify-center w-5 h-5 rounded transition-all duration-150 ${
                              expanded[seqno] ? "bg-green-800 text-white" : "bg-gray-100 text-gray-400 group-hover:bg-green-100 group-hover:text-green-700"
                            }`}>
                              <svg className={`w-3 h-3 transition-transform duration-200 ${expanded[seqno] ? "rotate-180" : ""}`} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M2 4l4 4 4-4"/>
                              </svg>
                            </span>
                          </td>
                          {/* SEQNO */}
                          <td className="px-2 py-3">
                            <span className="font-mono text-[12px] font-bold text-green-800 bg-green-50 border border-green-200 px-2 py-0.5 rounded-md whitespace-nowrap">{seqno}</span>
                          </td>
                          {/* Landowner */}
                          <td className="px-3 py-3 max-w-[180px]">
                            <p className="text-[13px] font-semibold text-gray-800 truncate leading-tight">{info.landowner ?? "—"}</p>
                          </td>
                          {/* Province */}
                          <td className="px-3 py-3 text-[12px] text-gray-500 whitespace-nowrap">{info.province ?? "—"}</td>
                          {/* ARBs in file */}
                          <td className="px-3 py-3 text-right">
                            <span className="text-[14px] font-bold text-green-700">{info.count}</span>
                          </td>
                          {/* Existing */}
                          <td className="px-3 py-3 text-right text-[12px]">
                            {info.existingCount > 0
                              ? <span className={`font-semibold ${willReplace ? "text-orange-600" : "text-gray-500"}`}>
                                  {info.existingCount}
                                  <span className="text-[10px] font-normal ml-1 opacity-70">{willReplace ? "replace" : "keep"}</span>
                                </span>
                              : <span className="text-gray-300">—</span>}
                          </td>
                          {/* Total area */}
                          <td className="px-3 py-3 text-right font-mono text-[12px] text-gray-700">{totalArea.toFixed(4)}</td>
                          {/* Validated AMENDAREA */}
                          <td className="px-3 py-3 text-right font-mono text-[12px] text-gray-500">{validatedArea != null ? validatedArea.toFixed(4) : "—"}</td>
                          {/* Val. Condoned Amt */}
                          <td className="px-3 py-3 text-right font-mono text-[12px] text-gray-500">
                            {condonedAmt != null ? condonedAmt.toLocaleString("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 }) : "—"}
                          </td>
                          {/* Match */}
                          <td className="px-3 py-3 text-center">
                            {validatedArea == null
                              ? <span className="text-gray-200 text-[12px]">—</span>
                              : areaMatch
                              ? <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 text-[11px] font-bold" title="Matches validated AMENDAREA">✓</span>
                              : (() => {
                                  const label = areaDiff! < 0
                                    ? `Deficit of ${Math.abs(areaDiff!).toFixed(4)} ha`
                                    : `Excess of ${areaDiff!.toFixed(4)} ha`;
                                  return <MismatchBadge label={label} />;
                                })()}
                          </td>
                        </tr>

                        {/* ── Expanded ARB table ── */}
                        {expanded[seqno] && (
                          <tr className="border-t-0">
                            <td colSpan={10} className="p-0">
                              <div className="mx-4 mb-3 rounded-b-lg border border-t-0 border-green-200 overflow-hidden bg-white">
                                <table className="w-full border-collapse">
                                  <thead>
                                    <tr className="bg-green-950/90 text-green-200">
                                      <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-widest">ARB Name</th>
                                      <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-widest">ARB ID</th>
                                      <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-widest">EP/CLOA No.</th>
                                      <th className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-widest">Area</th>
                                      <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-widest">CARPable</th>
                                      <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-widest">Eligibility</th>
                                      <th className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-widest">Alloc. Amount</th>
                                      <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-widest">Date Encoded</th>
                                      <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-widest">Date Distributed</th>
                                      <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-widest">Remarks</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {info.arbs.map((arb, j) => {
                                      const isNonCarpable = arb.carpable === "NON-CARPABLE";
                                      const isNotEligible = arb.eligibility === "Not Eligible";
                                      return (
                                        <tr key={j} className={`border-t border-gray-100 ${j % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}>
                                          <td className="px-3 py-2 text-[12px] font-medium text-gray-800 whitespace-nowrap">{arb.arb_name ?? "—"}</td>
                                          <td className="px-3 py-2 text-[11px] font-mono text-gray-500 whitespace-nowrap">{arb.arb_id ?? "—"}</td>
                                          <td className="px-3 py-2 text-[11px] font-mono text-gray-400 whitespace-nowrap">{arb.ep_cloa_no ?? "—"}</td>
                                          <td className="px-3 py-2 text-right text-[12px] font-mono text-gray-700 whitespace-nowrap">{displayArea(arb.area_allocated)}</td>
                                          <td className="px-3 py-2 whitespace-nowrap">
                                            {arb.carpable
                                              ? <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isNonCarpable ? "bg-red-50 text-red-600 border border-red-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>{arb.carpable}</span>
                                              : <span className="text-gray-300">—</span>}
                                          </td>
                                          <td className="px-3 py-2 whitespace-nowrap">
                                            {arb.eligibility
                                              ? <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isNotEligible ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-sky-50 text-sky-700 border border-sky-200"}`}>{arb.eligibility}</span>
                                              : <span className="text-gray-300">—</span>}
                                            {arb.eligibility_reason && <span className="ml-1.5 text-[10px] text-gray-400" title={arb.eligibility_reason}>({arb.eligibility_reason.length > 20 ? arb.eligibility_reason.slice(0, 20) + "…" : arb.eligibility_reason})</span>}
                                          </td>
                                          <td className="px-3 py-2 text-right text-[11px] font-mono text-gray-600 whitespace-nowrap">{displayCondoned(arb.allocated_condoned_amount)}</td>
                                          <td className="px-3 py-2 text-[11px] font-mono text-gray-500 whitespace-nowrap">{arb.date_encoded ?? <span className="text-gray-300">—</span>}</td>
                                          <td className="px-3 py-2 text-[11px] font-mono text-gray-500 whitespace-nowrap">{arb.date_distributed ?? <span className="text-gray-300">—</span>}</td>
                                          <td className="px-3 py-2 text-[11px] text-gray-400 max-w-[140px] truncate" title={arb.remarks ?? ""}>{arb.remarks || <span className="text-gray-300">—</span>}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );})}
                  </tbody>
                </table>
              </div>

              {/* Pagination controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-1 mb-4">
                  <button
                    onClick={() => setPreviewPage(1)}
                    disabled={previewPage === 1}
                    className="px-2 py-1 rounded text-[12px] text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-default"
                  >«</button>
                  <button
                    onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                    disabled={previewPage === 1}
                    className="px-2 py-1 rounded text-[12px] text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-default"
                  >‹</button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - previewPage) <= 2)
                    .reduce<(number | "…")[]>((acc, p, idx, arr) => {
                      if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("…");
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, idx) =>
                      p === "…"
                        ? <span key={`e${idx}`} className="px-2 py-1 text-[12px] text-gray-400">…</span>
                        : <button
                            key={p}
                            onClick={() => setPreviewPage(p)}
                            className={`px-2.5 py-1 rounded text-[12px] font-medium transition-colors ${previewPage === p ? "bg-green-900 text-white" : "text-gray-600 hover:bg-gray-100"}`}
                          >{p}</button>
                    )}
                  <button
                    onClick={() => setPreviewPage((p) => Math.min(totalPages, p + 1))}
                    disabled={previewPage === totalPages}
                    className="px-2 py-1 rounded text-[12px] text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-default"
                  >›</button>
                  <button
                    onClick={() => setPreviewPage(totalPages)}
                    disabled={previewPage === totalPages}
                    className="px-2 py-1 rounded text-[12px] text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-default"
                  >»</button>
                </div>
              )}
              </>);})()}

              {/* Replace warning banner */}
              {mode === "replace" && (() => {
                const toReplace = Object.entries(preview.bySEQNO).filter(([, info]) => info.existingCount > 0);
                if (toReplace.length === 0) return null;
                return (
                  <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-orange-50 border border-orange-200 mb-3">
                    <span className="text-orange-500 text-lg leading-none mt-0.5">⚠</span>
                    <div>
                      <p className="text-[13px] font-semibold text-orange-800 mb-1">
                        {toReplace.length} landholding{toReplace.length !== 1 ? "s" : ""} will have their existing ARBs replaced:
                      </p>
                      <ul className="space-y-0.5">
                        {toReplace.map(([seqno, info]) => (
                          <li key={seqno} className="text-[12px] text-orange-700">
                            <span className="font-mono font-semibold">{seqno}</span>
                            {info.landowner ? ` — ${info.landowner}` : ""}
                            <span className="text-orange-400 ml-1">({info.existingCount} existing ARB{info.existingCount !== 1 ? "s" : ""} will be deleted)</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })()}

              <div className="flex gap-3">
                <button
                  onClick={initiateImport}
                  disabled={loading || preview.valid === 0}
                  className="px-6 py-2.5 bg-green-900 text-white rounded-lg text-sm font-semibold hover:bg-green-800 disabled:opacity-40 transition-colors">
                  {loading ? "Importing..." : `Confirm Import — ${preview.valid} ARB${preview.valid !== 1 ? "s" : ""}`}
                </button>
                <button onClick={reset} className="px-4 py-2.5 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
              </div>

              {/* Replace confirmation modal */}
              {showReplaceModal && typeof window !== "undefined" && createPortal(
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-4">
                  <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-orange-500 text-xl">⚠</span>
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900 text-[15px]">Confirm Replace</h3>
                        <p className="text-[12px] text-gray-500">This action cannot be undone.</p>
                      </div>
                    </div>
                    <p className="text-[13px] text-gray-700 mb-3">
                      The following landholdings have existing ARBs that will be <span className="font-semibold text-red-600">permanently deleted</span> and replaced with the new entries from your file:
                    </p>
                    <ul className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 space-y-1 mb-5">
                      {Object.entries(preview.bySEQNO).filter(([, info]) => info.existingCount > 0).map(([seqno, info]) => (
                        <li key={seqno} className="text-[12px]">
                          <span className="font-mono font-semibold text-orange-800">{seqno}</span>
                          {info.landowner ? <span className="text-gray-600"> — {info.landowner}</span> : ""}
                          <span className="text-orange-500 ml-1">({info.existingCount} ARB{info.existingCount !== 1 ? "s" : ""})</span>
                        </li>
                      ))}
                    </ul>
                    <div className="flex gap-3 justify-end">
                      <button onClick={() => setShowReplaceModal(false)} className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50">
                        Cancel
                      </button>
                      <button
                        onClick={() => { setShowReplaceModal(false); handleImport(); }}
                        className="px-5 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors">
                        Yes, Replace ARBs
                      </button>
                    </div>
                  </div>
                </div>,
                document.body
              )}

              {/* Non-CARPable / Eligible conflict modal */}
              {showCarpableModal && preview && typeof window !== "undefined" && createPortal(
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-4">
                  <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center flex-shrink-0">
                        <svg className="w-5 h-5 text-yellow-500" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900 text-[15px]">Non-CARPable ARBs Marked as Eligible</h3>
                        <p className="text-[12px] text-gray-500">Please review before proceeding.</p>
                      </div>
                    </div>
                    <p className="text-[13px] text-gray-700 mb-3">
                      The following <span className="font-semibold">{preview.carpableConflicts.length} ARB{preview.carpableConflicts.length !== 1 ? "s" : ""}</span> are marked as <span className="font-semibold text-red-600">NON-CARPABLE</span> but have Eligibility set to <span className="font-semibold text-emerald-600">Eligible</span>. This is likely a data entry error.
                    </p>
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg overflow-hidden mb-5">
                      <table className="w-full text-[12px]">
                        <thead>
                          <tr className="bg-yellow-100 text-yellow-800 font-semibold">
                            <th className="px-3 py-2 text-left">Row</th>
                            <th className="px-3 py-2 text-left">ARB ID</th>
                            <th className="px-3 py-2 text-left">ARB Name</th>
                            <th className="px-3 py-2 text-left">SEQNO</th>
                          </tr>
                        </thead>
                        <tbody>
                          {preview.carpableConflicts.slice(0, 8).map((c) => (
                            <tr key={c.arb_id} className="border-t border-yellow-200">
                              <td className="px-3 py-1.5 text-yellow-700 font-mono">{c.row}</td>
                              <td className="px-3 py-1.5 font-mono font-semibold text-gray-800">{c.arb_id}</td>
                              <td className="px-3 py-1.5 text-gray-700 truncate max-w-[120px]">{c.arb_name}</td>
                              <td className="px-3 py-1.5 font-mono text-green-700">{c.seqno}</td>
                            </tr>
                          ))}
                          {preview.carpableConflicts.length > 8 && (
                            <tr className="border-t border-yellow-200 bg-yellow-50">
                              <td colSpan={4} className="px-3 py-1.5 text-[11px] text-yellow-600 text-center">+{preview.carpableConflicts.length - 8} more</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-[12px] text-gray-500 mb-4">Do you want to proceed with the import anyway? The Eligibility values will be saved as-is.</p>
                    <div className="flex gap-3 justify-end">
                      <button onClick={() => setShowCarpableModal(false)} className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50">
                        Cancel
                      </button>
                      <button
                        onClick={proceedAfterCarpableConfirm}
                        className="px-5 py-2 bg-yellow-500 text-white rounded-lg text-sm font-semibold hover:bg-yellow-600 transition-colors">
                        Proceed Anyway
                      </button>
                    </div>
                  </div>
                </div>,
                document.body
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ─── Manual Entry Panel ─── */
function ManualEntryPanel({ onSaved }: { onSaved: () => void }) {
  const [seqnoInput, setSeqnoInput] = useState("");
  const [lh, setLh] = useState<LHLookup | null>(null);
  const [lookupError, setLookupError] = useState("");
  const [looking, setLooking] = useState(false);
  const [mode, setMode] = useState<"append" | "replace">("append");
  const [rows, setRows] = useState<ArbRow[]>([emptyRow()]);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ saved: number } | null>(null);
  const [error, setError] = useState("");

  async function handleLookup() {
    if (!seqnoInput.trim()) { setLookupError("Enter a SEQNO_DARRO first."); return; }
    setLookupError(""); setLooking(true); setLh(null);
    const res = await fetch(`/api/arbs/manual?seqno=${encodeURIComponent(seqnoInput.trim().toUpperCase())}`);
    const data = await res.json();
    if (!res.ok) { setLookupError(data.error); setLooking(false); return; }
    setLh(data); setLooking(false);
  }

  function updateRow(i: number, field: keyof ArbRow, value: string) {
    let normalised = value;
    if (field === "carpable") normalised = value.toUpperCase().replace(/\s+/g, "");
    else if (field !== "area_allocated" && field !== "remarks") normalised = value.toUpperCase();
    setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, [field]: normalised } : r));
  }

  function addRow() { setRows((prev) => [...prev, emptyRow()]); }
  function removeRow(i: number) { setRows((prev) => prev.filter((_, idx) => idx !== i)); }

  async function handleSave() {
    if (!lh) return;
    const filled = rows.filter((r) => r.arb_name.trim() && r.arb_id.trim() && r.carpable && r.area_allocated.trim());
    if (filled.length === 0) { setError("At least one row with ARB Name, ARB ID, CARPable, and Area is required."); return; }
    setError(""); setSaving(true);
    const res = await fetch("/api/arbs/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        seqno_darro: lh.seqno_darro,
        mode,
        arbs: filled.map((r) => ({
          ...r,
          area_allocated: r.area_allocated.trim() || null,
        })),
      }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error); setSaving(false); return; }
    setResult(data); setSaving(false); onSaved();
  }

  function reset() {
    setSeqnoInput(""); setLh(null); setLookupError(""); setRows([emptyRow()]);
    setResult(null); setError(""); setMode("append");
  }

  if (result) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <p className="font-semibold text-green-800 text-sm">
          ✓ Saved <strong>{result.saved}</strong> ARB{result.saved !== 1 ? "s" : ""} for <strong>{lh?.seqno_darro}</strong>.
        </p>
        <button onClick={reset} className="mt-2 text-sm text-green-700 underline">Add ARBs for another landholding</button>
      </div>
    );
  }

  return (
    <div>
      {/* Step 1 — Look up SEQNO */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-green-900 text-white text-[10px] font-bold shrink-0">1</span>
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Look up Landholding</span>
        </div>
        <div className="flex items-center gap-2 max-w-sm">
          <div className="relative flex-1">
            <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd"/>
            </svg>
            <input
              type="text"
              value={seqnoInput}
              onChange={(e) => { setSeqnoInput(e.target.value); setLh(null); }}
              onKeyDown={(e) => e.key === "Enter" && handleLookup()}
              placeholder="e.g. R5-UC-04277"
              style={{ textTransform: "uppercase" }}
              className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm font-mono bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent transition-colors"
            />
          </div>
          <button onClick={handleLookup} disabled={looking}
            className="flex items-center gap-1.5 px-4 py-2 bg-green-900 text-white rounded-lg text-[12px] font-semibold hover:bg-green-800 disabled:opacity-40 transition-colors whitespace-nowrap">
            {looking
              ? <><svg className="w-3 h-3 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg> Looking up…</>
              : <><svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd"/></svg> Look up</>
            }
          </button>
        </div>
        {lookupError && <p className="text-sm text-red-600 mt-1.5">{lookupError}</p>}

        {lh && (
          <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg text-[13px]">
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
              <div><span className="text-gray-500">Landowner:</span> <span className="font-medium text-gray-800">{lh.landowner ?? "—"}</span></div>
              <div><span className="text-gray-500">CLNO:</span> <span className="font-medium text-gray-800">{lh.clno ?? "—"}</span></div>
              <div><span className="text-gray-500">Province:</span> <span className="font-medium text-gray-800">{lh.province_edited ?? "—"}</span></div>
              <div><span className="text-gray-500">Municipality:</span> <span className="font-medium text-gray-800">{lh.municipality ?? "—"}</span></div>
              <div>
                <span className="text-gray-500">Val. AMENDAREA:</span>{" "}
                <span className="font-medium text-gray-800">
                  {(lh.amendarea_validated ?? lh.amendarea)?.toFixed(4) ?? "—"} has.
                </span>
              </div>
              <div>
                <span className="text-gray-500">Val. Condoned Amt:</span>{" "}
                <span className="font-medium text-gray-800">
                  {(lh.condoned_amount ?? lh.net_of_reval_no_neg) != null
                    ? (lh.condoned_amount ?? lh.net_of_reval_no_neg)!.toLocaleString("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 })
                    : "—"}
                </span>
              </div>
            </div>
            <div className="mt-2 pt-2 border-t border-green-200">
              <span className="text-gray-500">Existing ARBs entered (incl. Non-CARPable):</span>{" "}
              <span className={`font-semibold ${lh._count.arbs > 0 ? "text-orange-600" : "text-gray-800"}`}>{lh._count.arbs}</span>
            </div>
          </div>
        )}
      </div>

      {lh && (() => {
        const LOCKED_STATUSES = ["For Encoding", "Partially Encoded", "Fully Encoded", "Partially Distributed", "Fully Distributed"];
        if (LOCKED_STATUSES.includes(lh.status ?? "")) {
          return (
            <div className="mt-3 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-[13px] text-red-700">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd"/></svg>
              <span>This landholding is locked (<strong>{lh.status}</strong>). ARB data cannot be appended or replaced at this stage.</span>
            </div>
          );
        }
        return (
        <>
          {/* Not Eligible for Encoding notice */}
          {lh.status === "Not Eligible for Encoding" && (
            <div className="mb-4 rounded-xl border border-amber-300 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-500">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-white shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <p className="text-white font-semibold text-[13px]">Landholding is Not Eligible for Encoding</p>
              </div>
              <div className="px-4 py-3 bg-amber-50 space-y-1.5">
                <p className="text-[12px] text-amber-900 leading-snug">
                  ARB data can still be entered, but <strong>Date Encoded and Distributed will not be saved</strong> for any ARB under this landholding.
                </p>
                {rows.some((r) => r.eligibility === "Eligible") && (
                  <p className="text-[12px] font-semibold text-amber-900 leading-snug">
                    One or more ARBs are marked as <strong>Eligible</strong>. If these ARBs are truly eligible, please <strong>undo the "Not Eligible for Encoding" status on this landholding first</strong> — the status should remain at a <em>Partial</em> level instead.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Mode */}
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-green-900 text-white text-[10px] font-bold shrink-0">2</span>
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Entry Mode</span>
            </div>
            <div className="flex p-1 bg-gray-100 rounded-xl gap-0.5 w-fit">
              <button
                type="button"
                onClick={() => setMode("append")}
                className={`flex items-center gap-2 px-4 py-2 rounded-[10px] text-sm font-medium transition-all duration-200 ${
                  mode === "append"
                    ? "bg-white text-green-800 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <span className={`w-3 h-3 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-200 ${mode === "append" ? "border-green-700" : "border-gray-400"}`}>
                  {mode === "append" && <span className="w-1.5 h-1.5 rounded-full bg-green-700" />}
                </span>
                <span>+ Append</span>
                <span className={`font-normal text-[11px] transition-colors ${mode === "append" ? "text-green-600" : "text-gray-400"}`}>— add to existing</span>
              </button>
              <button
                type="button"
                onClick={() => setMode("replace")}
                className={`flex items-center gap-2 px-4 py-2 rounded-[10px] text-sm font-medium transition-all duration-200 ${
                  mode === "replace"
                    ? "bg-white text-orange-700 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <span className={`w-3 h-3 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-200 ${mode === "replace" ? "border-orange-500" : "border-gray-400"}`}>
                  {mode === "replace" && <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />}
                </span>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd"/>
                </svg>
                <span>Replace</span>
                <span className={`font-normal text-[11px] transition-colors ${mode === "replace" ? "text-orange-500" : "text-gray-400"}`}>— overwrite all existing</span>
              </button>
            </div>
            {mode === "replace" && lh._count.arbs > 0 && (
              <p className="text-[12px] text-orange-600 mt-2 flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
                This will delete {lh._count.arbs} existing ARB{lh._count.arbs !== 1 ? "s" : ""} for this landholding.
              </p>
            )}
          </div>

          {/* ARB Rows */}
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-green-900 text-white text-[10px] font-bold shrink-0">3</span>
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Enter ARBs</span>
            </div>
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-[13px]">
                <thead className="bg-green-900 text-white">
                  <tr>
                    <th className="px-2 py-2.5 text-center w-8">#</th>
                    <th className="px-2 py-2.5 text-left min-w-[160px]">ARB Name <span className="text-green-300">*</span></th>
                    <th className="px-2 py-2.5 text-left min-w-[110px]">ARB ID <span className="text-green-300">*</span></th>
                    <th className="px-2 py-2.5 text-left min-w-[120px]">EP/CLOA No.</th>
                    <th className="px-2 py-2.5 text-left min-w-[120px]">CARPable <span className="text-green-300">*</span></th>
                    <th className="px-2 py-2.5 text-left min-w-[90px]">Area (has.) <span className="text-green-300">*</span></th>
                    <th className="px-2 py-2.5 text-left min-w-[150px]">Alloc. Condoned Amt <span className="text-green-300">*</span></th>
                    <th className="px-2 py-2.5 text-left min-w-[130px]">Eligibility <span className="text-green-300">*</span></th>
                    <th className="px-2 py-2.5 text-left min-w-[160px]">Eligibility Reason</th>
                    <th className="px-2 py-2.5 text-left min-w-[110px]">Date Encoded</th>
                    <th className="px-2 py-2.5 text-left min-w-[120px]">Date Distributed</th>
                    <th className="px-2 py-2.5 text-left min-w-[120px]">Remarks</th>
                    <th className="px-2 py-2.5 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} className={`border-t border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                      <td className="px-2 py-1.5 text-center text-gray-400">{i + 1}</td>
                      {(["arb_name", "arb_id", "ep_cloa_no"] as (keyof ArbRow)[]).map((field) => (
                        <td key={field} className="px-1 py-1">
                          <input type="text" value={row[field]}
                            onChange={(e) => updateRow(i, field, ["arb_name","arb_id","ep_cloa_no"].includes(field) ? e.target.value.toUpperCase() : e.target.value)}
                            placeholder={field === "arb_name" || field === "arb_id" ? "Required" : ""}
                            className={`w-full border rounded px-2 py-1.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-green-600 ${(field === "arb_name" && !row.arb_name.trim()) || (field === "arb_id" && !row.arb_id.trim()) ? "border-red-300 bg-red-50" : "border-gray-200"}`}
                          />
                        </td>
                      ))}
                      <td className="px-1 py-1">
                        <select value={row.carpable} onChange={(e) => { updateRow(i, "carpable", e.target.value); if (e.target.value === "NON-CARPABLE") { updateRow(i, "date_encoded", ""); updateRow(i, "date_distributed", ""); } }}
                          className={`w-full border rounded px-2 py-1.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-green-600 bg-white ${!row.carpable ? "border-red-300 bg-red-50" : "border-gray-200"}`}>
                          <option value="">—</option>
                          <option value="CARPABLE">CARPABLE</option>
                          <option value="NON-CARPABLE">NON-CARPABLE</option>
                        </select>
                      </td>
                      <td className="px-1 py-1">
                        <input type="text" value={row.area_allocated} onChange={(e) => updateRow(i, "area_allocated", e.target.value)}
                          placeholder="e.g. 0.5000 or 0.5000*"
                          className={`w-full border rounded px-2 py-1.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-green-600 ${!row.area_allocated.trim() ? "border-red-300 bg-red-50" : "border-gray-200"}`}
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input type="text" value={row.allocated_condoned_amount} onChange={(e) => updateRow(i, "allocated_condoned_amount", e.target.value)}
                          placeholder="e.g. ₱12,345.00 or N/A"
                          className={`w-full border rounded px-2 py-1.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-green-600 ${!row.allocated_condoned_amount.trim() ? "border-red-300 bg-red-50" : "border-gray-200"}`}
                        />
                      </td>
                      <td className="px-1 py-1">
                        <select value={row.eligibility} onChange={(e) => { updateRow(i, "eligibility", e.target.value); if (e.target.value === "Not Eligible") { updateRow(i, "date_encoded", ""); updateRow(i, "date_distributed", ""); } }}
                          className={`w-full border rounded px-2 py-1.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-green-600 bg-white ${!row.eligibility ? "border-red-300 bg-red-50" : "border-gray-200"}`}>
                          <option value="">—</option>
                          <option value="Eligible">Eligible</option>
                          <option value="Not Eligible">Not Eligible</option>
                        </select>
                      </td>
                      <td className="px-1 py-1">
                        <input type="text" value={row.eligibility_reason} onChange={(e) => updateRow(i, "eligibility_reason", e.target.value)}
                          placeholder={row.eligibility === "Not Eligible" ? "Required" : "—"}
                          disabled={row.eligibility !== "Not Eligible"}
                          className={`w-full border rounded px-2 py-1.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-green-600 disabled:bg-gray-50 disabled:text-gray-300 ${row.eligibility === "Not Eligible" && !row.eligibility_reason.trim() ? "border-red-300 bg-red-50" : "border-gray-200"}`}
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input type="text" value={row.date_encoded} onChange={(e) => { updateRow(i, "date_encoded", e.target.value); if (!e.target.value.trim()) updateRow(i, "date_distributed", ""); }}
                          placeholder="mm/dd/yyyy"
                          disabled={row.eligibility === "Not Eligible" || row.carpable === "NON-CARPABLE"}
                          className="w-full border border-gray-200 rounded px-2 py-1.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-green-600 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input type="text" value={row.date_distributed} onChange={(e) => updateRow(i, "date_distributed", e.target.value)}
                          placeholder="mm/dd/yyyy"
                          disabled={row.eligibility === "Not Eligible" || row.carpable === "NON-CARPABLE" || !row.date_encoded?.trim()}
                          title={!row.date_encoded?.trim() ? "Date Encoded is required first" : undefined}
                          className="w-full border border-gray-200 rounded px-2 py-1.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-green-600 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input type="text" value={row.remarks} onChange={(e) => updateRow(i, "remarks", e.target.value)}
                          className="w-full border border-gray-200 rounded px-2 py-1.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-green-600"
                        />
                      </td>
                      <td className="px-1 py-1 text-center">
                        {rows.length > 1 && (
                          <button onClick={() => removeRow(i)} className="text-red-400 hover:text-red-600 text-lg leading-none px-1">×</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={addRow}
              className="mt-2 px-4 py-1.5 border border-dashed border-green-600 text-green-700 rounded-lg text-sm hover:bg-green-50 transition-colors">
              + Add Row
            </button>
          </div>

          {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

          <div className="flex gap-3">
            <button onClick={handleSave} disabled={saving}
              className="px-6 py-2.5 bg-green-900 text-white rounded-lg text-sm font-semibold hover:bg-green-800 disabled:opacity-40 transition-colors">
              {saving ? "Saving..." : `Save ${rows.filter(r => r.arb_name.trim() && r.arb_id.trim() && r.carpable).length || ""} ARB${rows.filter(r => r.arb_name.trim() && r.arb_id.trim() && r.carpable).length !== 1 ? "s" : ""}`}
            </button>
            <button onClick={reset} className="px-4 py-2.5 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          </div>
        </>
        );
      })()}
    </div>
  );
}

/* ─── ARB Viewer ─── */
function ARBViewer({ refreshKey, isEditor }: { refreshKey: number; isEditor: boolean }) {
  const toast = useToast();
  const { user } = useUser();
  const isRegional = user?.office_level === "regional";
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [landholdings, setLandholdings] = useState<LHSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [serviceCount, setServiceCount] = useState<number | null>(null);
  const [distinctCount, setDistinctCount] = useState<number | null>(null);
  const [nonCarpableCount, setNonCarpableCount] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [details, setDetails] = useState<Record<string, LHDetail>>({});
  const [matchFilter, setMatchFilter] = useState<"" | "matched" | "mismatched">("");
  const [amountFilter, setAmountFilter] = useState<"" | "matched" | "mismatched">("");
  const [confirmDelete, setConfirmDelete] = useState<{ arbId: number; seqno: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [editingArb, setEditingArb] = useState<{ id: number; seqno: string; arb_name: string; arb_id: string; ep_cloa_no: string; carpable: string; area_allocated: string; allocated_condoned_amount: string; eligibility: string; eligibility_reason: string; date_encoded: string; date_distributed: string; remarks: string } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");
  const [detailSeqno, setDetailSeqno] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [provinceFilter, setProvinceFilter] = useState("");
  const [provinces, setProvinces] = useState<string[]>([]);
  const [addingArbSeqno, setAddingArbSeqno] = useState<string | null>(null);
  const [newArbRow, setNewArbRow] = useState<ArbRow>(emptyRow());
  const [savingNewArb, setSavingNewArb] = useState(false);
  const [newArbError, setNewArbError] = useState("");
  const [selectedSeqnos, setSelectedSeqnos] = useState<Set<string>>(new Set());
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [deletingBulk, setDeletingBulk] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const limit = 30;
  const LOCKED_STATUSES = ["For Encoding","Partially Encoded","Fully Encoded","Partially Distributed","Fully Distributed"];

  async function handleExport() {
    setExporting(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (matchFilter) params.set("match", matchFilter);
    if (amountFilter) params.set("amountMatch", amountFilter);
    if (provinceFilter) params.set("province", provinceFilter);
    const res = await fetch(`/api/arbs/export?${params}`);
    if (res.ok) {
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match2 = disposition.match(/filename="(.+?)"/);
      const filename = match2 ? match2[1] : "ARBs.xlsx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    }
    setExporting(false);
  }

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set("search", search);
      if (matchFilter) params.set("match", matchFilter);
      if (amountFilter) params.set("amountMatch", amountFilter);
      if (provinceFilter) params.set("province", provinceFilter);
      const res = await fetch(`/api/arbs/list?${params}`);
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      setLandholdings(data.landholdings ?? []);
      setTotal(data.total ?? 0);
      if (data.serviceCount !== undefined) setServiceCount(data.serviceCount);
      if (data.distinctCount !== undefined) setDistinctCount(data.distinctCount);
      if (data.nonCarpableCount !== undefined) setNonCarpableCount(data.nonCarpableCount);
      if (data.error) console.error("[fetchList] API error:", data.error);
    } catch (err) {
      console.error("[fetchList] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [page, search, matchFilter, amountFilter, provinceFilter, refreshKey]);

  useEffect(() => { fetchList(); }, [fetchList]);

  useEffect(() => {
    if (!isRegional) return;
    fetch("/api/provinces")
      .then((r) => r.ok ? r.json() : { provinces: [] })
      .then((d) => setProvinces(d.provinces ?? []));
  }, [isRegional]);

  // When a new import happens (refreshKey bumps), clear cached detail panels so
  // they re-fetch fresh data the next time the user expands a row.
  useEffect(() => {
    setDetails({});
    setExpanded({});
  }, [refreshKey]);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => { setSearch(searchInput); setPage(1); setSelectedSeqnos(new Set()); }, 350);
  }, [searchInput]);

  async function fetchDetail(seqno: string) {
    if (details[seqno]) return;
    const res = await fetch(`/api/arbs/${encodeURIComponent(seqno)}`);
    const data = await res.json();
    setDetails((prev) => ({ ...prev, [seqno]: data }));
  }

  async function toggleRow(seqno: string) {
    const isOpen = expanded[seqno];
    setExpanded((prev) => ({ ...prev, [seqno]: !isOpen }));
    if (!isOpen) fetchDetail(seqno);
  }

  async function expandAll() {
    const allExpanded = landholdings.every((lh) => expanded[lh.seqno_darro]);
    if (allExpanded) {
      setExpanded({});
    } else {
      const newExpanded: Record<string, boolean> = {};
      landholdings.forEach((lh) => { newExpanded[lh.seqno_darro] = true; });
      setExpanded(newExpanded);
      await Promise.all(landholdings.map((lh) => fetchDetail(lh.seqno_darro)));
    }
  }

  async function deleteArb(arbId: number, seqno: string) {
    setDeleting(true);
    const res = await fetch(`/api/arbs/item/${arbId}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      toast(data.error ?? "Delete failed.", "error");
      setDeleting(false);
      setConfirmDelete(null);
      return;
    }
    // Refresh detail for this seqno
    const detailRes = await fetch(`/api/arbs/${encodeURIComponent(seqno)}`);
    const detailData = await detailRes.json();
    if (detailData.arbs?.length === 0) {
      // No more ARBs — collapse and remove from list
      setExpanded((prev) => { const n = { ...prev }; delete n[seqno]; return n; });
      setDetails((prev) => { const n = { ...prev }; delete n[seqno]; return n; });
      fetchList();
    } else {
      setDetails((prev) => ({ ...prev, [seqno]: detailData }));
      fetchList();
    }
    toast("ARB deleted.", "warning");
    setDeleting(false);
    setConfirmDelete(null);
  }

  async function deleteAllArbs(seqno: string) {
    setDeletingAll(true);
    const res = await fetch(`/api/arbs/${encodeURIComponent(seqno)}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      toast(data.error ?? "Delete failed.", "error");
      setDeletingAll(false);
      setConfirmDeleteAll(null);
      return;
    }
    setExpanded((prev) => { const n = { ...prev }; delete n[seqno]; return n; });
    setDetails((prev) => { const n = { ...prev }; delete n[seqno]; return n; });
    fetchList();
    toast(`All ARBs for ${seqno} deleted.`, "warning");
    setDeletingAll(false);
    setConfirmDeleteAll(null);
  }

  async function handleBulkDelete() {
    setDeletingBulk(true);
    const seqnos = Array.from(selectedSeqnos);
    for (const seqno of seqnos) {
      await fetch(`/api/arbs/${encodeURIComponent(seqno)}`, { method: "DELETE" });
    }
    setExpanded((prev) => {
      const n = { ...prev };
      seqnos.forEach((s) => delete n[s]);
      return n;
    });
    setDetails((prev) => {
      const n = { ...prev };
      seqnos.forEach((s) => delete n[s]);
      return n;
    });
    setSelectedSeqnos(new Set());
    setShowBulkDeleteModal(false);
    fetchList();
    toast(`Deleted ARBs for ${seqnos.length} landholding${seqnos.length !== 1 ? "s" : ""}.`, "warning");
    setDeletingBulk(false);
  }

  async function saveEdit() {
    if (!editingArb) return;
    if (!editingArb.carpable) { setEditError("CARPable/Non-CARPable is required."); return; }
    setEditError(""); setSavingEdit(true);
    const res = await fetch(`/api/arbs/item/${editingArb.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        arb_name: editingArb.arb_name,
        arb_id: editingArb.arb_id,
        ep_cloa_no: editingArb.ep_cloa_no,
        carpable: editingArb.carpable || null,
        area_allocated: editingArb.area_allocated,
        allocated_condoned_amount: editingArb.allocated_condoned_amount,
        eligibility: editingArb.eligibility,
        eligibility_reason: editingArb.eligibility_reason,
        date_encoded: editingArb.date_encoded,
        date_distributed: editingArb.date_distributed,
        remarks: editingArb.remarks,
      }),
    });
    const data = await res.json();
    if (!res.ok) { setEditError(data.error ?? "Save failed."); setSavingEdit(false); return; }
    // Refresh detail and stats
    const detailRes = await fetch(`/api/arbs/${encodeURIComponent(editingArb.seqno)}`);
    const detailData = await detailRes.json();
    setDetails((prev) => ({ ...prev, [editingArb.seqno]: detailData }));
    fetchList();
    toast("ARB updated.", "success");
    setSavingEdit(false);
    setEditingArb(null);
  }

  async function handleAddArbSave(seqno: string) {
    if (!newArbRow.arb_name.trim()) { setNewArbError("ARB Name is required."); return; }
    if (!newArbRow.arb_id.trim()) { setNewArbError("ARB ID is required."); return; }
    if (!newArbRow.carpable) { setNewArbError("CARPable/Non-CARPable is required."); return; }
    if (!newArbRow.area_allocated.trim()) { setNewArbError("Area is required."); return; }
    setNewArbError(""); setSavingNewArb(true);
    const res = await fetch("/api/arbs/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seqno_darro: seqno, mode: "append", arbs: [newArbRow] }),
    });
    const data = await res.json();
    if (!res.ok) { setNewArbError(data.error ?? "Save failed."); setSavingNewArb(false); return; }
    const detailRes = await fetch(`/api/arbs/${encodeURIComponent(seqno)}`);
    const detailData = await detailRes.json();
    setDetails((prev) => ({ ...prev, [seqno]: detailData }));
    fetchList();
    toast("ARB added.", "success");
    setSavingNewArb(false);
    setAddingArbSeqno(null);
    setNewArbRow(emptyRow());
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <>
    {detailSeqno && (() => {
      const idx = landholdings.findIndex((lh) => lh.seqno_darro === detailSeqno);
      return (
        <DetailModal
          seqno={detailSeqno}
          onClose={() => setDetailSeqno(null)}
          onSaved={fetchList}
          hasPrev={idx > 0}
          hasNext={idx < landholdings.length - 1}
          onPrev={() => idx > 0 && setDetailSeqno(landholdings[idx - 1].seqno_darro)}
          onNext={() => idx < landholdings.length - 1 && setDetailSeqno(landholdings[idx + 1].seqno_darro)}
        />
      );
    })()}
    {showBulkDeleteModal && typeof window !== "undefined" && createPortal(
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-4" onClick={() => !deletingBulk && setShowBulkDeleteModal(false)}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-3 mb-4">
            <span className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
              <svg className="text-red-600" width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
            </span>
            <div>
              <p className="font-bold text-gray-800 text-[15px]">Confirm Bulk Delete</p>
              <p className="text-[13px] text-gray-500 mt-0.5">This will delete all ARBs for {selectedSeqnos.size} landholding{selectedSeqnos.size !== 1 ? "s" : ""}. This action cannot be undone.</p>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <button onClick={() => setShowBulkDeleteModal(false)} disabled={deletingBulk}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors">
              Cancel
            </button>
            <button onClick={handleBulkDelete} disabled={deletingBulk}
              className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-40 transition-colors">
              {deletingBulk ? "Deleting…" : `Delete ${selectedSeqnos.size} Selected`}
            </button>
          </div>
        </div>
      </div>
    , document.body)}
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 space-y-3">
        {/* Row 1: title + stats */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <h3 className="font-bold text-gray-800 text-[15px]">ARB Viewer</h3>
            <span className="text-[12px] text-gray-400">{total.toLocaleString()} landholding{total !== 1 ? "s" : ""} with ARBs</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-[12px] bg-green-100 px-2.5 py-1 rounded-lg">
              <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
              <span className="text-green-700">Service Count</span>
              <span className="font-bold text-green-800 tabular-nums">{serviceCount !== null ? serviceCount.toLocaleString() : "—"}</span>
            </span>
            <span className="flex items-center gap-1.5 text-[12px] bg-blue-100 px-2.5 py-1 rounded-lg">
              <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
              <span className="text-blue-700">Distinct Count</span>
              <span className="font-bold text-blue-800 tabular-nums">{distinctCount !== null ? distinctCount.toLocaleString() : "—"}</span>
            </span>
            <span className="flex items-center gap-1.5 text-[12px] bg-orange-100 px-2.5 py-1 rounded-lg">
              <span className="w-2 h-2 rounded-full bg-orange-400 shrink-0" />
              <span className="text-orange-700">Non-CARPable</span>
              <span className="font-bold text-orange-800 tabular-nums">{nonCarpableCount !== null ? nonCarpableCount.toLocaleString() : "—"}</span>
            </span>
          </div>
        </div>
        {/* Row 2: filters + export + search */}
        <div className="flex flex-wrap items-end gap-2">
          {/* Area filter */}
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] font-bold uppercase tracking-widest text-sky-500 px-1 flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-2.5 h-2.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"/></svg>
              Area
            </span>
            <div className="flex items-center gap-1 bg-sky-50 border border-sky-200 rounded-lg p-1">
              {([["", "All"], ["matched", "✓ Matched"], ["mismatched", "✕ Mismatch"]] as const).map(([val, label]) => (
                <button key={val} onClick={() => { setMatchFilter(val); setPage(1); setSelectedSeqnos(new Set()); }}
                  className={`px-3 py-1 rounded-md text-[12px] font-semibold transition-colors ${
                    matchFilter === val
                      ? val === "matched" ? "bg-emerald-600 text-white" : val === "mismatched" ? "bg-red-500 text-white" : "bg-sky-600 text-white shadow-sm"
                      : "text-sky-400 hover:text-sky-700"
                  }`}>{label}</button>
              ))}
            </div>
          </div>
          {/* Amount filter */}
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] font-bold uppercase tracking-widest text-amber-600 px-1 flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-2.5 h-2.5" viewBox="0 0 20 20" fill="currentColor"><path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z"/><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd"/></svg>
              Amount
            </span>
            <div className="flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-lg p-1">
              {([["", "All"], ["matched", "✓ Matched"], ["mismatched", "✕ Mismatch"]] as const).map(([val, label]) => (
                <button key={val} onClick={() => { setAmountFilter(val); setPage(1); setSelectedSeqnos(new Set()); }}
                  className={`px-3 py-1 rounded-md text-[12px] font-semibold transition-colors ${
                    amountFilter === val
                      ? val === "matched" ? "bg-emerald-600 text-white" : val === "mismatched" ? "bg-red-500 text-white" : "bg-amber-500 text-white shadow-sm"
                      : "text-amber-500 hover:text-amber-700"
                  }`}>{label}</button>
              ))}
            </div>
          </div>
          {/* Province filter — regional accounts only */}
          {isRegional && provinces.length > 0 && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] font-bold uppercase tracking-widest text-violet-600 px-1 flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-2.5 h-2.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"/></svg>
                Province
              </span>
              <select
                value={provinceFilter}
                onChange={(e) => { setProvinceFilter(e.target.value); setPage(1); setSelectedSeqnos(new Set()); }}
                className="border border-violet-200 bg-violet-50 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-violet-800 focus:outline-none focus:ring-2 focus:ring-violet-400 self-end"
              >
                <option value="">All Provinces</option>
                {provinces.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          )}
          <button
            onClick={handleExport}
            disabled={exporting || loading || total === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-[12px] font-semibold hover:bg-emerald-600 disabled:opacity-40 transition-colors whitespace-nowrap self-end"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            {exporting ? "Exporting…" : `Export to Excel (${total.toLocaleString()})`}
          </button>
          <input type="text" placeholder="Search SEQNO, Landowner, CLNO..." value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-green-600 self-end"
          />
        </div>
      </div>

      {isEditor && selectedSeqnos.size > 0 && (
        <div className="px-5 py-2.5 bg-red-50 border-t border-red-200 flex items-center justify-between gap-3">
          <span className="text-[13px] text-red-700 font-semibold">{selectedSeqnos.size} landholding{selectedSeqnos.size !== 1 ? "s" : ""} selected</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setSelectedSeqnos(new Set())}
              className="text-[12px] text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100 transition-colors">
              Clear
            </button>
            <button onClick={() => setShowBulkDeleteModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-[12px] font-semibold rounded-lg transition-colors">
              <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              Delete Selected
            </button>
          </div>
        </div>
      )}
      {total === 0 && !loading ? (
        <div className="px-5 py-12 text-center text-gray-400 text-sm">No ARBs uploaded yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-green-900 text-white">
              <tr>
                {isEditor && (
                  <th className="pl-3 pr-1 py-2.5 w-8">
                    {(() => {
                      const selectableSeqnos = landholdings.filter((lh) => !LOCKED_STATUSES.includes(lh.status ?? "")).map((lh) => lh.seqno_darro);
                      const allSelected = selectableSeqnos.length > 0 && selectableSeqnos.every((s) => selectedSeqnos.has(s));
                      const someSelected = selectableSeqnos.some((s) => selectedSeqnos.has(s));
                      return (
                        <input type="checkbox" checked={allSelected} ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                          onChange={() => {
                            if (allSelected) {
                              setSelectedSeqnos((prev) => { const n = new Set(prev); selectableSeqnos.forEach((s) => n.delete(s)); return n; });
                            } else {
                              setSelectedSeqnos((prev) => { const n = new Set(prev); selectableSeqnos.forEach((s) => n.add(s)); return n; });
                            }
                          }}
                          className="w-3.5 h-3.5 rounded accent-green-400 cursor-pointer"
                          title="Select all on this page"
                        />
                      );
                    })()}
                  </th>
                )}
                <th className="px-3 py-2.5 text-left">SEQNO_DARRO</th>
                <th className="px-3 py-2.5 text-left">CLNO</th>
                <th className="px-3 py-2.5 text-left">Landowner</th>
                <th className="px-3 py-2.5 text-left">Province</th>
                <th className="px-3 py-2.5 text-right">Val. AMENDAREA</th>
                <th className="px-3 py-2.5 text-right">Val. Condoned Amt</th>
                <th className="px-3 py-2.5 text-right">ARBs</th>
                <th className="px-3 py-2.5 text-right">Eligible</th>
                <th className="px-3 py-2.5 text-left">Status</th>
                <th className="px-3 py-2.5 text-center">
                  {landholdings.length > 0 && (
                    <button onClick={expandAll} className="text-[11px] font-semibold text-white/80 hover:text-white underline whitespace-nowrap">
                      {landholdings.every((lh) => expanded[lh.seqno_darro]) ? "Collapse All" : "Expand All"}
                    </button>
                  )}
                </th>
              </tr>
            </thead>
            <tbody className={loading ? "opacity-40" : ""}>
              {landholdings.map((lh, i) => {
                const isOpen = !!expanded[lh.seqno_darro];
                const detail = details[lh.seqno_darro] ?? null;
                return (
                  <React.Fragment key={lh.seqno_darro}>
                    <tr
                      className={`border-t border-gray-100 cursor-pointer transition-colors border-l-4 ${isOpen ? "font-semibold" : ""} ${
                        [
                          `border-l-green-700 ${isOpen ? "bg-green-50" : "bg-white hover:bg-green-50/50"}`,
                          `border-l-blue-600 ${isOpen ? "bg-blue-50" : "bg-white hover:bg-blue-50/50"}`,
                          `border-l-amber-500 ${isOpen ? "bg-amber-50" : "bg-white hover:bg-amber-50/50"}`,
                          `border-l-violet-600 ${isOpen ? "bg-violet-50" : "bg-white hover:bg-violet-50/50"}`,
                        ][i % 4]
                      }`}
                      onClick={() => toggleRow(lh.seqno_darro)}>
                      {isEditor && (() => {
                        const locked = LOCKED_STATUSES.includes(lh.status ?? "");
                        return (
                          <td className="pl-3 pr-1 py-2 w-8" onClick={(e) => e.stopPropagation()}>
                            <input type="checkbox"
                              checked={selectedSeqnos.has(lh.seqno_darro)}
                              disabled={locked}
                              onChange={() => {
                                setSelectedSeqnos((prev) => {
                                  const n = new Set(prev);
                                  if (n.has(lh.seqno_darro)) n.delete(lh.seqno_darro);
                                  else n.add(lh.seqno_darro);
                                  return n;
                                });
                              }}
                              className={`w-3.5 h-3.5 rounded accent-green-600 ${locked ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}`}
                              title={locked ? "Cannot select — record is locked" : "Select"}
                            />
                          </td>
                        );
                      })()}
                      <td className="px-3 py-2 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setDetailSeqno(lh.seqno_darro); }}
                          className="font-mono text-[13px] text-green-700 font-semibold hover:text-green-900 hover:underline underline-offset-2 transition-colors"
                        >{lh.seqno_darro}</button>
                      </td>
                      <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{lh.clno ?? "—"}</td>
                      <td className="px-3 py-2 text-gray-800 max-w-[200px] truncate">{lh.landowner ?? "—"}</td>
                      <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{lh.province_edited ?? "—"}</td>
                      <td className="px-3 py-2 text-right font-mono text-gray-700 whitespace-nowrap">{(lh.amendarea_validated ?? lh.amendarea)?.toFixed(4) ?? "—"}</td>
                      <td className="px-3 py-2 text-right font-mono text-gray-700 whitespace-nowrap">
                        {(lh.condoned_amount ?? lh.net_of_reval_no_neg) != null
                          ? (lh.condoned_amount ?? lh.net_of_reval_no_neg)!.toLocaleString("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 })
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[11px] font-semibold">{lh._count.arbs}</span>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          lh.eligibleArbCount === lh._count.arbs
                            ? "bg-emerald-100 text-emerald-700"
                            : lh.eligibleArbCount === 0
                            ? "bg-gray-100 text-gray-500"
                            : "bg-amber-100 text-amber-700"
                        }`}>
                          {lh.eligibleArbCount} / {lh._count.arbs}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {(() => {
                          const s = lh.status ?? "For Initial Validation";
                          const styles: Record<string, string> = {
                            "For Initial Validation":   "bg-gray-100 text-gray-500",
                            "For Further Validation":   "bg-yellow-100 text-yellow-700",
                            "For Encoding":             "bg-sky-100 text-sky-700",
                            "Partially Encoded":        "bg-blue-100 text-blue-700",
                            "Fully Encoded":            "bg-indigo-100 text-indigo-700",
                            "Partially Distributed":    "bg-violet-100 text-violet-700",
                            "Fully Distributed":        "bg-emerald-100 text-emerald-700",
                            "Not Eligible for Encoding":"bg-red-100 text-red-600",
                          };
                          return <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${styles[s] ?? "bg-gray-100 text-gray-500"}`}>{s}</span>;
                        })()}
                      </td>
                      <td className="px-3 py-2 text-center text-[12px] text-green-700 font-medium whitespace-nowrap">
                        {confirmDeleteAll === lh.seqno_darro ? (
                          <span className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <button onClick={() => deleteAllArbs(lh.seqno_darro)} disabled={deletingAll}
                              className="text-[11px] font-semibold text-white bg-red-600 hover:bg-red-700 px-2 py-0.5 rounded disabled:opacity-50">
                              {deletingAll ? "…" : "Confirm"}
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setConfirmDeleteAll(null); }}
                              className="text-[11px] font-semibold text-gray-500 hover:text-gray-700 px-1">
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <span className="flex items-center justify-center gap-2">
                            <span>{isOpen ? "▲ Hide" : "▼ View"}</span>
                            {isEditor && (() => {
                              const locked = ["For Encoding","Partially Encoded","Fully Encoded","Partially Distributed","Fully Distributed"].includes(lh.status ?? "");
                              return (
                                <button
                                  onClick={(e) => { e.stopPropagation(); if (!locked) setConfirmDeleteAll(lh.seqno_darro); }}
                                  disabled={locked}
                                  className={`text-base leading-none font-bold transition-colors ${locked ? "text-gray-200 cursor-not-allowed" : "text-gray-300 hover:text-red-500"}`}
                                  title={locked ? "Cannot delete — record is locked" : "Delete all ARBs for this landholding"}
                                >×</button>
                              );
                            })()}
                          </span>
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={isEditor ? 11 : 10} className={`px-0 py-0 border-t border-l-4 ${
                          [
                            "bg-green-50 border-green-100 border-l-green-700",
                            "bg-blue-50 border-blue-100 border-l-blue-600",
                            "bg-amber-50 border-amber-100 border-l-amber-500",
                            "bg-violet-50 border-violet-100 border-l-violet-600",
                          ][i % 4]
                        }`}>
                          {!detail ? (
                            <p className="px-5 py-4 text-sm text-gray-400">Loading ARBs...</p>
                          ) : (
                            <div className="px-5 py-4">
                              <div className="overflow-x-auto rounded-lg border border-green-200">
                                <table className="w-full text-[13px]">
                                  <thead className="bg-green-800 text-white">
                                    <tr>
                                      <th className="px-3 py-2 text-left">#</th>
                                      <th className="px-3 py-2 text-left">ARB Name</th>
                                      <th className="px-3 py-2 text-left">ARB ID</th>
                                      <th className="px-3 py-2 text-left">EP/CLOA No.</th>
                                      <th className="px-3 py-2 text-right">Area (has.)</th>
                                      <th className="px-3 py-2 text-left">CARPable</th>
                                      <th className="px-3 py-2 text-left">Eligibility</th>
                                      <th className="px-3 py-2 text-left">Alloc. Condoned Amt</th>
                                      <th className="px-3 py-2 text-left">Date Encoded</th>
                                      <th className="px-3 py-2 text-left">Date Distributed</th>
                                      <th className="px-3 py-2 text-left">Remarks</th>
                                      {isEditor && <th className="px-3 py-2 w-20" />}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {detail.arbs.map((arb, j) => {
                                      const isEditing = editingArb?.id === arb.id;
                                      const locked = ["For Encoding","Partially Encoded","Fully Encoded","Partially Distributed","Fully Distributed"].includes(lh.status ?? "");
                                      return (
                                      <tr key={arb.id} className={`border-t border-green-100 ${isEditing ? "bg-yellow-50" : j % 2 === 0 ? "bg-white" : "bg-green-50"}`}>
                                        <td className="px-3 py-1.5 text-gray-400">{j + 1}</td>
                                        {isEditing ? (<>
                                          <td className="px-1 py-1">
                                            <input value={editingArb.arb_name} onChange={(e) => setEditingArb((p) => p && ({ ...p, arb_name: e.target.value.toUpperCase() }))}
                                              className="w-full border border-gray-300 rounded px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-green-600" />
                                          </td>
                                          <td className="px-1 py-1">
                                            {locked ? <span className="text-[12px] font-mono text-gray-700 px-2">{editingArb.arb_id || "—"}</span>
                                              : <input value={editingArb.arb_id} onChange={(e) => setEditingArb((p) => p && ({ ...p, arb_id: e.target.value.toUpperCase() }))}
                                                className="w-full border border-gray-300 rounded px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-green-600" />}
                                          </td>
                                          <td className="px-1 py-1">
                                            <input value={editingArb.ep_cloa_no} onChange={(e) => setEditingArb((p) => p && ({ ...p, ep_cloa_no: e.target.value.toUpperCase() }))}
                                              className="w-full border border-gray-300 rounded px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-green-600" />
                                          </td>
                                          <td className="px-1 py-1">
                                            {locked ? <span className="text-[12px] font-mono text-gray-800 px-2 block text-right">{editingArb.area_allocated || "—"}</span>
                                              : <input value={editingArb.area_allocated} onChange={(e) => setEditingArb((p) => p && ({ ...p, area_allocated: e.target.value }))}
                                                placeholder="e.g. 0.5000 or 0.5000*"
                                                className="w-full border border-gray-300 rounded px-2 py-1 text-[12px] font-mono focus:outline-none focus:ring-1 focus:ring-green-600" />}
                                          </td>
                                          <td className="px-1 py-1">
                                            <select value={editingArb.carpable} onChange={(e) => setEditingArb((p) => p && ({ ...p, carpable: e.target.value }))}
                                              className="w-full border border-gray-300 rounded px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-green-600 bg-white">
                                              <option value="">—</option>
                                              <option value="CARPABLE">CARPABLE</option>
                                              <option value="NON-CARPABLE">NON-CARPABLE</option>
                                            </select>
                                          </td>
                                          <td className="px-1 py-1 min-w-[130px]">
                                            <select value={editingArb.eligibility} onChange={(e) => setEditingArb((p) => p && ({ ...p, eligibility: e.target.value, eligibility_reason: e.target.value !== "Not Eligible" ? "" : p.eligibility_reason, date_encoded: e.target.value === "Not Eligible" ? "" : p.date_encoded, date_distributed: e.target.value === "Not Eligible" ? "" : p.date_distributed }))}
                                              className={`w-full border rounded px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-green-600 bg-white ${!editingArb.eligibility ? "border-red-300" : "border-gray-300"}`}>
                                              <option value="">—</option>
                                              <option value="Eligible">Eligible</option>
                                              <option value="Not Eligible">Not Eligible</option>
                                            </select>
                                            {editingArb.eligibility === "Not Eligible" && (
                                              <input value={editingArb.eligibility_reason} onChange={(e) => setEditingArb((p) => p && ({ ...p, eligibility_reason: e.target.value }))}
                                                placeholder="Reason (required)"
                                                className={`mt-1 w-full border rounded px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-green-600 ${!editingArb.eligibility_reason.trim() ? "border-red-300" : "border-gray-300"}`} />
                                            )}
                                          </td>
                                          <td className="px-1 py-1">
                                            <input value={editingArb.allocated_condoned_amount} onChange={(e) => setEditingArb((p) => p && ({ ...p, allocated_condoned_amount: e.target.value }))}
                                              placeholder="e.g. ₱12,345.00 or N/A"
                                              className={`w-full border rounded px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-green-600 ${!editingArb.allocated_condoned_amount.trim() ? "border-red-300" : "border-gray-300"}`} />
                                          </td>
                                          <td className="px-1 py-1">
                                            <input type="date" value={toDateInput(editingArb.date_encoded)} onChange={(e) => setEditingArb((p) => p && ({ ...p, date_encoded: fromDateInput(e.target.value), date_distributed: e.target.value ? p.date_distributed : "" }))}
                                              disabled={editingArb.eligibility === "Not Eligible" || lh.status === "Not Eligible for Encoding"}
                                              className="w-full border border-gray-300 rounded px-2 py-1 text-[12px] font-mono focus:outline-none focus:ring-1 focus:ring-green-600 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed" />
                                          </td>
                                          <td className="px-1 py-1">
                                            <input type="date" value={toDateInput(editingArb.date_distributed)} onChange={(e) => setEditingArb((p) => p && ({ ...p, date_distributed: fromDateInput(e.target.value) }))}
                                              disabled={editingArb.eligibility === "Not Eligible" || lh.status === "Not Eligible for Encoding" || !editingArb.date_encoded}
                                              title={!editingArb.date_encoded ? "Date Encoded is required first" : undefined}
                                              className="w-full border border-gray-300 rounded px-2 py-1 text-[12px] font-mono focus:outline-none focus:ring-1 focus:ring-green-600 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed" />
                                          </td>
                                          <td className="px-1 py-1">
                                            <input value={editingArb.remarks} onChange={(e) => setEditingArb((p) => p && ({ ...p, remarks: e.target.value }))}
                                              className="w-full border border-gray-300 rounded px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-green-600" />
                                          </td>
                                          <td className="px-2 py-1">
                                            <div className="flex flex-col gap-1">
                                              {editError && <p className="text-[10px] text-red-600">{editError}</p>}
                                              <div className="flex items-center gap-1">
                                                <button onClick={saveEdit} disabled={savingEdit}
                                                  className="text-[11px] font-semibold text-white bg-green-700 hover:bg-green-800 px-2 py-0.5 rounded disabled:opacity-50">
                                                  {savingEdit ? "…" : "Save"}
                                                </button>
                                                <button onClick={() => { setEditingArb(null); setEditError(""); }}
                                                  className="text-[11px] font-semibold text-gray-500 hover:text-gray-700 px-1">
                                                  Cancel
                                                </button>
                                              </div>
                                            </div>
                                          </td>
                                        </>) : (<>
                                          <td className="px-3 py-1.5 text-gray-800 font-medium">{arb.arb_name ?? "—"}</td>
                                          <td className="px-3 py-1.5 text-gray-600">{arb.arb_id ?? "—"}</td>
                                          <td className="px-3 py-1.5 text-gray-600">{arb.ep_cloa_no ?? "—"}</td>
                                          <td className="px-3 py-1.5 text-right font-mono text-gray-700">{displayArea(arb.area_allocated)}</td>
                                          <td className="px-3 py-1.5">{arb.carpable ? <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${arb.carpable === "CARPABLE" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>{arb.carpable}</span> : <span className="text-gray-300">—</span>}</td>
                                          <td className="px-3 py-1.5">
                                            {arb.eligibility ? (
                                              <div>
                                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${arb.eligibility === "Eligible" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>{arb.eligibility}</span>
                                                {arb.eligibility_reason && <p className="text-[10px] text-gray-400 mt-0.5 max-w-[160px] truncate" title={arb.eligibility_reason}>{arb.eligibility_reason}</p>}
                                              </div>
                                            ) : <span className="text-gray-300">—</span>}
                                          </td>
                                          <td className="px-3 py-1.5 text-gray-600 font-mono text-[12px]">{displayCondoned(arb.allocated_condoned_amount) || <span className="text-gray-300">—</span>}</td>
                                          <td className="px-3 py-1.5 font-mono text-gray-600 text-[12px]">{arb.date_encoded ?? <span className="text-gray-300">—</span>}</td>
                                          <td className="px-3 py-1.5 font-mono text-gray-600 text-[12px]">{arb.date_distributed ?? <span className="text-gray-300">—</span>}</td>
                                          <td className="px-3 py-1.5 text-gray-400">{arb.remarks ?? "—"}</td>
                                          {isEditor && <td className="px-3 py-1.5 text-center">
                                            {confirmDelete?.arbId === arb.id ? (
                                              <span className="flex items-center gap-1">
                                                <button onClick={() => deleteArb(arb.id, lh.seqno_darro)} disabled={deleting}
                                                  className="text-[11px] font-semibold text-white bg-red-500 hover:bg-red-600 px-2 py-0.5 rounded disabled:opacity-50">
                                                  {deleting ? "…" : "Yes"}
                                                </button>
                                                <button onClick={() => setConfirmDelete(null)}
                                                  className="text-[11px] font-semibold text-gray-500 hover:text-gray-700 px-1">
                                                  No
                                                </button>
                                              </span>
                                            ) : (() => {
                                              const locked = ["For Encoding","Partially Encoded","Fully Encoded","Partially Distributed","Fully Distributed"].includes(lh.status ?? "");
                                              return (
                                                <span className="flex items-center justify-center gap-2">
                                                  <button
                                                    onClick={(e) => { e.stopPropagation(); setEditError(""); setEditingArb({ id: arb.id, seqno: lh.seqno_darro, arb_name: arb.arb_name ?? "", arb_id: arb.arb_id ?? "", ep_cloa_no: arb.ep_cloa_no ?? "", carpable: arb.carpable ?? "", area_allocated: arb.area_allocated ?? "", allocated_condoned_amount: arb.allocated_condoned_amount ?? "", eligibility: arb.eligibility ?? "", eligibility_reason: arb.eligibility_reason ?? "", date_encoded: arb.date_encoded ?? "", date_distributed: arb.date_distributed ?? "", remarks: arb.remarks ?? "" }); }}
                                                    className="text-gray-300 hover:text-green-600 transition-colors text-sm leading-none"
                                                    title={locked ? "Edit dates / eligibility / remarks" : "Edit ARB"}
                                                  >✎</button>
                                                  <button
                                                    onClick={(e) => { e.stopPropagation(); if (!locked) setConfirmDelete({ arbId: arb.id, seqno: lh.seqno_darro }); }}
                                                    disabled={locked}
                                                    className={`transition-colors text-base leading-none font-bold ${locked ? "text-gray-200 cursor-not-allowed" : "text-gray-300 hover:text-red-500"}`}
                                                    title={locked ? "Cannot delete — record is locked" : "Delete ARB"}
                                                  >×</button>
                                                </span>
                                              );
                                            })()}
                                          </td>}
                                        </>)}
                                      </tr>
                                      );
                                    })}
                                  </tbody>
                                  <tfoot className="border-t-2 border-green-200 bg-green-50">
                                    {(() => {
                                      const totalArea = detail.arbs.reduce((s, a) => s + parseArea(a.area_allocated), 0);
                                      const validatedArea = detail.landholding.amendarea_validated ?? detail.landholding.amendarea;
                                      const match = validatedArea != null && parseFloat(totalArea.toFixed(4)) === parseFloat(validatedArea.toFixed(4));
                                      const diff = validatedArea != null ? totalArea - validatedArea : null;
                                      const mismatchLabel = diff != null && diff !== 0
                                        ? (diff < 0 ? `Deficit of ${Math.abs(diff).toFixed(4)} ha` : `Excess of ${diff.toFixed(4)} ha`)
                                        : null;
                                      const totalCondoned = detail.arbs.reduce((s, a) => {
                                        if (!a.allocated_condoned_amount) return s;
                                        const n = parseFloat(a.allocated_condoned_amount.replace(/,/g, ""));
                                        return !isNaN(n) && String(a.allocated_condoned_amount).trim().replace(/,/g, "") === String(n) ? s + n : s;
                                      }, 0);
                                      const hasCondonedTotal = detail.arbs.some((a) => {
                                        if (!a.allocated_condoned_amount) return false;
                                        const n = parseFloat(a.allocated_condoned_amount.replace(/,/g, ""));
                                        return !isNaN(n) && String(a.allocated_condoned_amount).trim().replace(/,/g, "") === String(n);
                                      });
                                      const validatedCondoned = detail.landholding.condoned_amount ?? detail.landholding.net_of_reval_no_neg;
                                      const condonedMatch = hasCondonedTotal && validatedCondoned != null
                                        && parseFloat(totalCondoned.toFixed(2)) === parseFloat(validatedCondoned.toFixed(2));
                                      const condonedDiff = hasCondonedTotal && validatedCondoned != null ? totalCondoned - validatedCondoned : null;
                                      const condonedMismatchLabel = condonedDiff != null && !condonedMatch
                                        ? (condonedDiff < 0
                                            ? `Deficit of ${Math.abs(condonedDiff).toLocaleString("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 })}`
                                            : `Excess of ${condonedDiff.toLocaleString("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 })}`)
                                        : null;
                                      return (
                                        <tr>
                                          <td colSpan={4} className="px-3 py-2 text-[12px] font-semibold text-gray-600">Total Area</td>
                                          <td className="px-3 py-2 text-right font-mono font-semibold text-gray-700">{totalArea.toFixed(4)}</td>
                                          <td colSpan={2} className="px-3 py-2">
                                            {validatedArea == null
                                              ? <span className="text-gray-400 text-[11px]" />
                                              : match
                                              ? <span className="text-emerald-600 font-bold text-[13px]" title="Matches validated AMENDAREA">✓ Match <span className="font-normal text-[11px] text-gray-400">vs {validatedArea.toFixed(4)}</span></span>
                                              : <span className="flex items-center gap-2">{mismatchLabel && <MismatchBadge label={mismatchLabel} />}<span className="text-[11px] text-gray-400">vs {validatedArea.toFixed(4)}</span></span>}
                                          </td>
                                          <td className="px-3 py-2 font-mono font-semibold text-gray-700 text-[12px]">
                                            {hasCondonedTotal ? totalCondoned.toLocaleString("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 }) : ""}
                                          </td>
                                          <td className="px-3 py-2">
                                            {hasCondonedTotal && (validatedCondoned == null
                                              ? null
                                              : condonedMatch
                                              ? <span className="text-emerald-600 font-bold text-[13px]" title="Matches validated condoned amount">✓ Match <span className="font-normal text-[11px] text-gray-400">vs {validatedCondoned.toLocaleString("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 })}</span></span>
                                              : <span className="flex items-center gap-2">{condonedMismatchLabel && <MismatchBadge label={condonedMismatchLabel} type="Amount" />}<span className="text-[11px] text-gray-400">vs {validatedCondoned.toLocaleString("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 })}</span></span>
                                            )}
                                          </td>
                                          <td colSpan={isEditor ? 3 : 2} />
                                        </tr>
                                      );
                                    })()}
                                  </tfoot>
                                </table>
                              </div>
                              {isEditor && (
                                <div className="mt-3">
                                  {addingArbSeqno === lh.seqno_darro ? (
                                    <div className="border border-green-200 rounded-lg bg-green-50 p-3">
                                      {newArbError && <p className="text-[12px] text-red-600 mb-2">{newArbError}</p>}
                                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 mb-2">
                                        <div>
                                          <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-0.5">ARB Name *</label>
                                          <input value={newArbRow.arb_name} onChange={(e) => setNewArbRow((p) => ({ ...p, arb_name: e.target.value.toUpperCase() }))} className="w-full border border-gray-300 rounded px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-green-600" />
                                        </div>
                                        <div>
                                          <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-0.5">ARB ID *</label>
                                          <input value={newArbRow.arb_id} onChange={(e) => setNewArbRow((p) => ({ ...p, arb_id: e.target.value.toUpperCase() }))} className={`w-full border rounded px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-green-600 ${!newArbRow.arb_id.trim() ? "border-red-300" : "border-gray-300"}`} />
                                        </div>
                                        <div>
                                          <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-0.5">EP/CLOA No.</label>
                                          <input value={newArbRow.ep_cloa_no} onChange={(e) => setNewArbRow((p) => ({ ...p, ep_cloa_no: e.target.value.toUpperCase() }))} className="w-full border border-gray-300 rounded px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-green-600" />
                                        </div>
                                        <div>
                                          <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-0.5">CARPable *</label>
                                          <select value={newArbRow.carpable} onChange={(e) => setNewArbRow((p) => ({ ...p, carpable: e.target.value }))} className={`w-full border rounded px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-green-600 bg-white ${!newArbRow.carpable ? "border-red-300" : "border-gray-300"}`}>
                                            <option value="">—</option>
                                            <option value="CARPABLE">CARPABLE</option>
                                            <option value="NON-CARPABLE">NON-CARPABLE</option>
                                          </select>
                                        </div>
                                        <div>
                                          <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-0.5">Area *</label>
                                          <input value={newArbRow.area_allocated} onChange={(e) => setNewArbRow((p) => ({ ...p, area_allocated: e.target.value }))} className="w-full border border-gray-300 rounded px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-green-600" />
                                        </div>
                                        <div>
                                          <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-0.5">Alloc. Condoned Amt *</label>
                                          <input value={newArbRow.allocated_condoned_amount} onChange={(e) => setNewArbRow((p) => ({ ...p, allocated_condoned_amount: e.target.value }))}
                                            placeholder="e.g. ₱12,345.00 or N/A"
                                            className={`w-full border rounded px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-green-600 ${!newArbRow.allocated_condoned_amount.trim() ? "border-red-300" : "border-gray-300"}`} />
                                        </div>
                                        <div>
                                          <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-0.5">Eligibility *</label>
                                          <select value={newArbRow.eligibility} onChange={(e) => setNewArbRow((p) => ({ ...p, eligibility: e.target.value, eligibility_reason: e.target.value !== "Not Eligible" ? "" : p.eligibility_reason, date_encoded: e.target.value === "Not Eligible" ? "" : p.date_encoded, date_distributed: e.target.value === "Not Eligible" ? "" : p.date_distributed }))}
                                            className={`w-full border rounded px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-green-600 bg-white ${!newArbRow.eligibility ? "border-red-300" : "border-gray-300"}`}>
                                            <option value="">—</option>
                                            <option value="Eligible">Eligible</option>
                                            <option value="Not Eligible">Not Eligible</option>
                                          </select>
                                        </div>
                                        <div>
                                          <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-0.5">
                                            Eligibility Reason {newArbRow.eligibility === "Not Eligible" && <span className="text-red-500">*</span>}
                                          </label>
                                          <input value={newArbRow.eligibility_reason} onChange={(e) => setNewArbRow((p) => ({ ...p, eligibility_reason: e.target.value }))}
                                            disabled={newArbRow.eligibility !== "Not Eligible"}
                                            placeholder={newArbRow.eligibility === "Not Eligible" ? "Required" : "—"}
                                            className={`w-full border rounded px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-green-600 disabled:bg-gray-50 disabled:text-gray-300 ${newArbRow.eligibility === "Not Eligible" && !newArbRow.eligibility_reason.trim() ? "border-red-300" : "border-gray-300"}`} />
                                        </div>
                                        <div>
                                          <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-0.5">Date Encoded</label>
                                          <input type="date" value={toDateInput(newArbRow.date_encoded)} onChange={(e) => setNewArbRow((p) => ({ ...p, date_encoded: fromDateInput(e.target.value) }))}
                                            disabled={newArbRow.eligibility === "Not Eligible"}
                                            className="w-full border border-gray-300 rounded px-2 py-1 text-[12px] font-mono focus:outline-none focus:ring-1 focus:ring-green-600 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed" />
                                        </div>
                                        <div>
                                          <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-0.5">Date Distributed</label>
                                          <input type="date" value={toDateInput(newArbRow.date_distributed)} onChange={(e) => setNewArbRow((p) => ({ ...p, date_distributed: fromDateInput(e.target.value) }))}
                                            disabled={newArbRow.eligibility === "Not Eligible"}
                                            className="w-full border border-gray-300 rounded px-2 py-1 text-[12px] font-mono focus:outline-none focus:ring-1 focus:ring-green-600 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed" />
                                        </div>
                                        <div className="col-span-2 sm:col-span-1">
                                          <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-0.5">Remarks</label>
                                          <input value={newArbRow.remarks} onChange={(e) => setNewArbRow((p) => ({ ...p, remarks: e.target.value }))} className="w-full border border-gray-300 rounded px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-green-600" />
                                        </div>
                                      </div>
                                      <div className="flex gap-2">
                                        <button onClick={() => handleAddArbSave(lh.seqno_darro)} disabled={savingNewArb} className="px-3 py-1.5 bg-green-800 text-white rounded text-[12px] font-medium hover:bg-green-700 disabled:opacity-40">{savingNewArb ? "Saving…" : "Save ARB"}</button>
                                        <button onClick={() => { setAddingArbSeqno(null); setNewArbRow(emptyRow()); setNewArbError(""); }} className="px-3 py-1.5 border border-gray-300 text-gray-600 rounded text-[12px] hover:bg-gray-50">Cancel</button>
                                      </div>
                                    </div>
                                  ) : (
                                    <button onClick={() => { setAddingArbSeqno(lh.seqno_darro); setNewArbRow(emptyRow()); setNewArbError(""); }} className="flex items-center gap-1.5 text-[12px] text-green-700 font-semibold hover:underline">
                                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
                                      Add ARB
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
          <p className="text-[12px] text-gray-500">{total.toLocaleString()} total</p>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(page - 1)} disabled={page <= 1 || loading} className="px-3 py-1.5 rounded border border-gray-300 text-sm disabled:opacity-40 hover:bg-gray-50">← Prev</button>
            <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
            <button onClick={() => setPage(page + 1)} disabled={page >= totalPages || loading} className="px-3 py-1.5 rounded border border-gray-300 text-sm disabled:opacity-40 hover:bg-gray-50">Next →</button>
          </div>
        </div>
      )}
    </div>
    </>
  );
}

/* ─── Stat mini card ─── */
function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  const c = { gray: "bg-gray-50 border-gray-200 text-gray-800", green: "bg-green-50 border-green-200 text-green-700", red: "bg-red-50 border-red-200 text-red-600" }[color] ?? "";
  return (
    <div className={`rounded-lg p-3 text-center border ${c}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-[11px] uppercase tracking-wide opacity-70">{label}</p>
    </div>
  );
}

/* ─── Main Page ─── */
export default function ARBsPage() {
  const { isEditor } = useUser();
  const [tab, setTab] = useState<"upload" | "manual">("upload");
  const [panelOpen, setPanelOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="page-enter">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">ARB Upload & Viewer</h2>
          <p className="text-sm text-gray-500 mt-1">Upload or manually encode ARBs per Unclassified ARR (CCLOA), then view them below.</p>
        </div>
        <div className="flex flex-col items-start sm:items-end gap-1.5 shrink-0">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Download Upload Template</p>
          <div className="flex items-center gap-2">
            <a
              href="/ARB Batch Upload Template.xlsx"
              download
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-700 text-white text-[12px] font-semibold hover:bg-blue-600 transition-colors whitespace-nowrap shadow-sm"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
              .xlsx Template
            </a>
            <a
              href="/ARB Batch Upload Template.csv"
              download
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-blue-400 text-blue-600 text-[12px] font-semibold hover:bg-blue-50 transition-colors whitespace-nowrap shadow-sm"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
              .csv Template
            </a>
          </div>
        </div>
      </div>

      {/* Entry Panel — editor+ only */}
      {isEditor && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
          {/* Tab bar doubles as the collapse toggle */}
          <div className="flex items-center border-b border-gray-200">
            <button
              onClick={() => setPanelOpen((o) => !o)}
              className="flex items-center pl-4 pr-3 py-3 text-gray-400 hover:text-gray-600 transition-colors shrink-0"
            >
              <svg
                className={`w-4 h-4 transition-transform duration-200 ${panelOpen ? "rotate-180" : ""}`}
                viewBox="0 0 20 20" fill="currentColor"
              >
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
            {(["upload", "manual"] as const).map((t) => (
              <button
                key={t}
                onClick={() => {
                  if (tab === t) {
                    setPanelOpen((o) => !o);
                  } else {
                    setTab(t);
                    setPanelOpen(true);
                  }
                }}
                className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 ${
                  tab === t && panelOpen
                    ? "border-green-700 text-green-800"
                    : tab === t
                    ? "border-green-300 text-green-700"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {t === "upload" ? "📂 Upload File" : "✏️ Manual Entry"}
              </button>
            ))}
          </div>

          {panelOpen && (
            <div className="p-5">
              {tab === "upload"
                ? <UploadFilePanel onSaved={() => setRefreshKey((k) => k + 1)} />
                : <ManualEntryPanel onSaved={() => setRefreshKey((k) => k + 1)} />}
            </div>
          )}
        </div>
      )}

      {/* Viewer */}
      <ARBViewer refreshKey={refreshKey} isEditor={isEditor} />
    </div>
  );
}
