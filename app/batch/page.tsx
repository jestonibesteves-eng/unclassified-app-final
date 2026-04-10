"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import type { BatchLHType } from "@/app/api/batch/landholding/route";

/* ── Column type config ── */

const TYPES: {
  value: BatchLHType;
  label: string;
  icon: string;
  hint: string;
  placeholder: string;
  activeGrad: string;
  activeShadow: string;
  inactiveBorder: string;
  inactiveText: string;
  inactiveHoverBg: string;
}[] = [
  {
    value: "status",
    label: "Status (Not Eligible for Encoding only)",
    icon: "🏷️",
    hint: 'Format: SEQNO_DARRO → Tab → REASON. Status is fixed to "Not Eligible for Encoding". Copy two columns from Excel.',
    placeholder: "R5-UC-04277\tNON-CARPABLE\nR5-UC-06422\tUNDER CLASSIFIED ARR",
    activeGrad: "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)",
    activeShadow: "0 4px 14px rgba(220,38,38,0.4)",
    inactiveBorder: "#fca5a5",
    inactiveText: "#7f1d1d",
    inactiveHoverBg: "#fef2f2",
  },
  {
    value: "amendarea",
    label: "Validated AMENDAREA",
    icon: "📐",
    hint: "Format: SEQNO_DARRO → Tab → Area (numeric, in hectares). Copy two columns from Excel.",
    placeholder: "R5-UC-04277\t1.2345\nR5-UC-06422\t0.8900",
    activeGrad: "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)",
    activeShadow: "0 4px 14px rgba(124,58,237,0.4)",
    inactiveBorder: "#c4b5fd",
    inactiveText: "#4c1d95",
    inactiveHoverBg: "#f5f3ff",
  },
  {
    value: "condoned_amount",
    label: "Validated Condoned Amount",
    icon: "₱",
    hint: "Format: SEQNO_DARRO → Tab → Amount (must be > 0). Copy two columns from Excel.",
    placeholder: "R5-UC-04277\t534058.11\nR5-UC-06422\t426471.19",
    activeGrad: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
    activeShadow: "0 4px 14px rgba(37,99,235,0.4)",
    inactiveBorder: "#93c5fd",
    inactiveText: "#1e3a8a",
    inactiveHoverBg: "#eff6ff",
  },
  {
    value: "municipality",
    label: "Municipality & Barangay",
    icon: "📍",
    hint: "Format: SEQNO_DARRO → Tab → Municipality → Tab → Barangay (Barangay optional). Copy 2–3 columns from Excel.",
    placeholder: "R5-UC-04277\tLigornes\tSto. Niño\nR5-UC-06422\tBulusan",
    activeGrad: "linear-gradient(135deg, #0d9488 0%, #0f766e 100%)",
    activeShadow: "0 4px 14px rgba(13,148,136,0.4)",
    inactiveBorder: "#5eead4",
    inactiveText: "#134e4a",
    inactiveHoverBg: "#f0fdfa",
  },
  {
    value: "asp_status",
    label: "ASP Status",
    icon: "📋",
    hint: 'Format: SEQNO_DARRO → Tab → ASP Status. Accepted: "With ASP" or "Without ASP".',
    placeholder: "R5-UC-04277\tWith ASP\nR5-UC-06422\tWithout ASP",
    activeGrad: "linear-gradient(135deg, #d97706 0%, #b45309 100%)",
    activeShadow: "0 4px 14px rgba(217,119,6,0.4)",
    inactiveBorder: "#fcd34d",
    inactiveText: "#92400e",
    inactiveHoverBg: "#fffbeb",
  },
  {
    value: "cloa_status",
    label: "CLOA / Individualization Status",
    icon: "📜",
    hint: "Format: SEQNO_DARRO → Tab → CLOA Status. Must be one of the 6 accepted values below.",
    placeholder: "R5-UC-04277\tStill CCLOA (SPLIT Target)\nR5-UC-06422\tPartial — Individual Title (Regular Redoc)",
    activeGrad: "linear-gradient(135deg, #0369a1 0%, #075985 100%)",
    activeShadow: "0 4px 14px rgba(3,105,161,0.4)",
    inactiveBorder: "#7dd3fc",
    inactiveText: "#0c4a6e",
    inactiveHoverBg: "#f0f9ff",
  },
  {
    value: "remarks",
    label: "Remarks",
    icon: "📝",
    hint: "Format: SEQNO_DARRO → Tab → Remark text. Copy two columns from Excel.",
    placeholder: "R5-UC-04277\tFor compliance review\nR5-UC-06422\tPending DAR clearance",
    activeGrad: "linear-gradient(135deg, #db2777 0%, #be185d 100%)",
    activeShadow: "0 4px 14px rgba(219,39,119,0.4)",
    inactiveBorder: "#f9a8d4",
    inactiveText: "#831843",
    inactiveHoverBg: "#fdf2f8",
  },
];

const CLOA_STATUS_VALUES = [
  "Still CCLOA (SPLIT Target)",
  "Still CCLOA (Not SPLIT Target)",
  "Full — Individual Title (SPLIT)",
  "Partial — Individual Title (SPLIT)",
  "Full — Individual Title (Regular Redoc)",
  "Partial — Individual Title (Regular Redoc)",
];

/* ── Preview row types ── */

type PreviewRow = {
  seqno_darro: string;
  landowner: string | null;
  province: string | null;
  clno: string | null;
  current_status?: string | null;
  // status
  reason?: string;
  has_arbs?: boolean;
  arb_count?: number;
  // numeric
  old_value?: number | string | null;
  new_value?: number | string | null;
  will_reset_confirmation?: boolean;
  // municipality
  old_municipality?: string | null;
  old_barangay?: string | null;
  new_municipality?: string | null;
  new_barangay?: string | null;
};

type PreviewData = {
  rows: PreviewRow[];
  invalid: { line: string; reason: string }[];
  notFoundSeqnos: string[];
  outOfJurisdiction: string[];
  blockedSeqnos?: { seqno_darro: string; status: string }[];
};

type DoneResult = { updated: number; notFound: string[]; outOfJurisdiction: string[] };

type RevertRecord = {
  seqno_darro: string;
  landowner: string | null;
  province_edited: string | null;
  clno: string | null;
  non_eligibility_reason: string | null;
};

/* ── Helpers ── */

function fmt4(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  return Number(n).toLocaleString("en-PH", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}
function fmt2(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  return Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STATUS_BADGE: Record<string, string> = {
  "Fully Distributed":         "bg-emerald-100 text-emerald-700",
  "Partially Distributed":     "bg-teal-100 text-teal-700",
  "Fully Encoded":             "bg-blue-100 text-blue-700",
  "Partially Encoded":         "bg-sky-100 text-sky-700",
  "For Encoding":              "bg-violet-100 text-violet-700",
  "For Further Validation":    "bg-amber-100 text-amber-700",
  "Not Eligible for Encoding": "bg-red-100 text-red-700",
};

/* ── Main Page ── */

export default function BatchPage() {
  const [type, setType] = useState<BatchLHType>("status");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [result, setResult] = useState<DoneResult | null>(null);
  const [showArbConfirm, setShowArbConfirm] = useState(false);

  const cfg = TYPES.find((t) => t.value === type)!;

  function switchType(t: BatchLHType) {
    setType(t);
    setInput("");
    setPreview(null);
    setResult(null);
    setError("");
    setShowArbConfirm(false);
  }

  function reset() {
    setInput("");
    setPreview(null);
    setResult(null);
    setError("");
    setShowArbConfirm(false);
  }

  const rowCount = input.split("\n").filter((l) => l.trim()).length;

  async function handlePreview() {
    setError(""); setResult(null);
    if (!input.trim()) { setError("Please enter data."); return; }
    setLoading(true);
    const res = await fetch("/api/batch/landholding", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, raw: input }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error ?? "Preview failed."); return; }
    setPreview(data);
  }

  const rowsWithArbs = preview?.rows.filter((r) => r.has_arbs) ?? [];
  const blockedSeqnos = preview?.blockedSeqnos ?? [];

  function handleConfirmClick(andConfirm = false) {
    if (type === "status" && rowsWithArbs.length > 0) {
      setShowArbConfirm(true);
    } else {
      void doCommit(andConfirm);
    }
  }

  async function doCommit(andConfirm = false) {
    setShowArbConfirm(false);
    setError(""); setLoading(true);
    const res = await fetch("/api/batch/landholding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, raw: input, andConfirm }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error ?? "Update failed."); return; }
    setResult({ updated: data.updated, notFound: data.notFound ?? [], outOfJurisdiction: data.outOfJurisdiction ?? [] });
    setPreview(null); setInput("");
  }

  const resetWarnings = preview?.rows.filter((r) => r.will_reset_confirmation) ?? [];

  /* ── Revert section state ── */
  const [revertRecords, setRevertRecords] = useState<RevertRecord[]>([]);
  const [revertLoaded, setRevertLoaded] = useState(false);
  const [revertLoading, setRevertLoading] = useState(false);
  const [revertSelected, setRevertSelected] = useState<Set<string>>(new Set());
  const [revertError, setRevertError] = useState("");
  const [revertResult, setRevertResult] = useState<number | null>(null);
  const [showRevertConfirm, setShowRevertConfirm] = useState(false);
  const [revertFilter, setRevertFilter] = useState("");

  async function loadRevertList() {
    setRevertLoading(true); setRevertError(""); setRevertResult(null);
    const res = await fetch("/api/batch/landholding");
    const data = await res.json();
    setRevertLoading(false);
    if (!res.ok) { setRevertError(data.error ?? "Failed to load records."); return; }
    setRevertRecords(data.records ?? []);
    setRevertSelected(new Set());
    setRevertLoaded(true);
  }

  const filteredRevertRecords = revertFilter.trim()
    ? revertRecords.filter((r) =>
        r.seqno_darro.includes(revertFilter.toUpperCase()) ||
        (r.landowner ?? "").toLowerCase().includes(revertFilter.toLowerCase()) ||
        (r.clno ?? "").toLowerCase().includes(revertFilter.toLowerCase()) ||
        (r.non_eligibility_reason ?? "").toLowerCase().includes(revertFilter.toLowerCase())
      )
    : revertRecords;

  const allFilteredSelected = filteredRevertRecords.length > 0 &&
    filteredRevertRecords.every((r) => revertSelected.has(r.seqno_darro));

  function toggleRevertAll() {
    if (allFilteredSelected) {
      setRevertSelected((prev) => {
        const next = new Set(prev);
        filteredRevertRecords.forEach((r) => next.delete(r.seqno_darro));
        return next;
      });
    } else {
      setRevertSelected((prev) => {
        const next = new Set(prev);
        filteredRevertRecords.forEach((r) => next.add(r.seqno_darro));
        return next;
      });
    }
  }

  async function doRevert() {
    setShowRevertConfirm(false);
    setRevertLoading(true); setRevertError("");
    const seqnos = Array.from(revertSelected);
    const res = await fetch("/api/batch/landholding", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seqnos }),
    });
    const data = await res.json();
    setRevertLoading(false);
    if (!res.ok) { setRevertError(data.error ?? "Revert failed."); return; }
    setRevertResult(data.reverted);
    // Reload the list
    await loadRevertList();
  }

  return (
    <div className="max-w-4xl page-enter">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-[1.6rem] font-bold text-gray-900 leading-tight">Batch Update (LH)</h2>
        <p className="text-[12px] text-gray-400 mt-0.5 tracking-wide">
          Update multiple landholding records at once by pasting data from Excel.
        </p>
      </div>

      {/* Column type selector */}
      <div className="card-bezel mb-5">
        <div className="card-bezel-inner-open">
          <p className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-3">Select Column to Update</p>
          <div className="flex flex-wrap gap-2">
            {TYPES.map((t) => {
              const active = type === t.value;
              return (
                <button
                  key={t.value}
                  onClick={() => switchType(t.value)}
                  style={
                    active
                      ? { background: t.activeGrad, boxShadow: t.activeShadow, border: "1px solid transparent", color: "#fff" }
                      : { background: "#fff", border: `1.5px solid ${t.inactiveBorder}`, color: t.inactiveText }
                  }
                  className="relative flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold transition-all duration-200 active:scale-[0.97] cursor-pointer"
                  onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = t.inactiveHoverBg; }}
                  onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = "#fff"; }}
                >
                  <span className="text-[15px] leading-none">{t.icon}</span>
                  <span>{t.label}</span>
                  {active && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-white/70 inline-block" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Success ── */}
      {result && (
        <div className="card-bezel mb-6">
          <div className="card-bezel-inner-open bg-green-50">
            <p className="font-semibold text-green-800 text-sm">
              ✓ Successfully updated <strong>{result.updated.toLocaleString()}</strong> record{result.updated !== 1 ? "s" : ""}{" "}
              — <strong>{cfg.label}</strong>.
            </p>
            {result.notFound.length > 0 && (
              <p className="text-sm text-yellow-700 mt-1">
                {result.notFound.length} SEQNO{result.notFound.length !== 1 ? "s" : ""} not found — skipped.
              </p>
            )}
            {result.outOfJurisdiction.length > 0 && (
              <p className="text-sm text-orange-600 mt-1">
                {result.outOfJurisdiction.length} SEQNO{result.outOfJurisdiction.length !== 1 ? "s" : ""} outside your jurisdiction — skipped.
              </p>
            )}
            <button onClick={reset} className="mt-3 text-sm text-green-700 underline">Do another batch update</button>
          </div>
        </div>
      )}

      {!result && (
        <>
          {/* ── Step 1: Input ── */}
          <div className="card-bezel mb-4">
            <div className="card-bezel-inner-open">
              <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-green-900 text-white flex items-center justify-center text-[11px] font-bold">1</span>
                Enter Data
              </h3>
              <p className="text-[13px] text-gray-500 mb-3">{cfg.hint}</p>

              {/* CLOA status value guide */}
              {type === "cloa_status" && (
                <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-[12px] text-blue-800">
                  <p className="font-semibold mb-1">Accepted CLOA_STATUS values:</p>
                  <ul className="space-y-0.5">
                    {CLOA_STATUS_VALUES.map((v) => (
                      <li key={v} className="font-mono text-blue-700">{v}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* ASP status value guide */}
              {type === "asp_status" && (
                <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-[12px] text-amber-800">
                  <p className="font-semibold mb-1">Accepted ASP_STATUS values:</p>
                  <ul className="space-y-0.5">
                    <li className="font-mono">With ASP</li>
                    <li className="font-mono">Without ASP</li>
                  </ul>
                </div>
              )}

              {/* Confirmation reset notice */}
              {(type === "amendarea" || type === "condoned_amount") && (
                <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-[12px] text-blue-800">
                  Setting this field will <strong>reset the confirmation flag</strong> for any records that were previously confirmed.
                  Those records will need to be re-confirmed individually.
                </div>
              )}

              <textarea
                value={input}
                onChange={(e) => { setInput(e.target.value.toUpperCase()); setPreview(null); setResult(null); }}
                rows={8}
                placeholder={cfg.placeholder.toUpperCase()}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 font-mono text-[13px] focus:outline-none focus:ring-2 focus:ring-green-600 resize-y"
              />
              <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
                <span className="text-[12px] text-gray-400">
                  {rowCount} row{rowCount !== 1 ? "s" : ""} entered
                </span>
                <button onClick={handlePreview} disabled={loading || !input.trim()} className="btn-primary">
                  {loading ? "Loading…" : <>Preview Records <span className="btn-icon-trail">→</span></>}
                </button>
              </div>
            </div>
          </div>

          {/* Parse errors */}
          {preview && preview.invalid.length > 0 && (
            <div className="card-bezel mb-4">
              <div className="card-bezel-inner-open bg-red-50">
                <p className="text-sm font-semibold text-red-700 mb-2">
                  {preview.invalid.length} row{preview.invalid.length !== 1 ? "s" : ""} with errors — will be skipped:
                </p>
                <ul className="space-y-1 max-h-48 overflow-y-auto">
                  {preview.invalid.map((e, i) => (
                    <li key={i} className="text-[13px] text-red-600 font-mono">
                      <span className="font-semibold">{e.line}</span>
                      <span className="text-red-400 ml-2 font-sans">← {e.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* ── Step 2: Preview ── */}
          {preview && (
            <div className="card-bezel mb-4">
              <div className="card-bezel-inner-open">
                <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-green-900 text-white flex items-center justify-center text-[11px] font-bold">2</span>
                  Preview — {preview.rows.length} record{preview.rows.length !== 1 ? "s" : ""} matched
                </h3>

                {preview.outOfJurisdiction.length > 0 && (
                  <div className="mb-3 p-3 bg-orange-50 border border-orange-300 rounded-lg text-[13px] text-orange-700">
                    <strong>{preview.outOfJurisdiction.length} SEQNO{preview.outOfJurisdiction.length !== 1 ? "s" : ""} outside your jurisdiction — skipped:</strong>{" "}
                    {preview.outOfJurisdiction.slice(0, 5).join(", ")}{preview.outOfJurisdiction.length > 5 ? ` +${preview.outOfJurisdiction.length - 5} more` : ""}
                  </div>
                )}
                {preview.notFoundSeqnos.length > 0 && (
                  <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-[13px] text-yellow-700">
                    <strong>{preview.notFoundSeqnos.length} SEQNO{preview.notFoundSeqnos.length !== 1 ? "s" : ""} not found</strong> — will be skipped:{" "}
                    {preview.notFoundSeqnos.join(", ")}
                  </div>
                )}

                {/* Blocked — status too advanced */}
                {type === "status" && blockedSeqnos.length > 0 && (
                  <div className="mb-3 p-3 bg-red-50 border border-red-300 rounded-lg text-[13px] text-red-800">
                    <p className="font-semibold mb-1">
                      {blockedSeqnos.length} record{blockedSeqnos.length !== 1 ? "s" : ""} cannot be set to Not Eligible for Encoding — status is too advanced:
                    </p>
                    <ul className="space-y-0.5 max-h-32 overflow-y-auto">
                      {blockedSeqnos.map((b) => (
                        <li key={b.seqno_darro} className="font-mono">
                          {b.seqno_darro} <span className="font-sans text-red-500">— {b.status}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* ARB deletion warning */}
                {type === "status" && rowsWithArbs.length > 0 && (
                  <div className="mb-3 p-3 bg-orange-50 border border-orange-400 rounded-lg text-[13px] text-orange-900">
                    <p className="font-semibold mb-1">
                      ⚠ {rowsWithArbs.length} record{rowsWithArbs.length !== 1 ? "s" : ""} currently {rowsWithArbs.length !== 1 ? "have" : "has"} ARBs encoded. Setting them to Not Eligible for Encoding will <strong>permanently delete all their ARB data</strong>:
                    </p>
                    <ul className="space-y-0.5 max-h-32 overflow-y-auto">
                      {rowsWithArbs.map((r) => (
                        <li key={r.seqno_darro} className="font-mono">
                          {r.seqno_darro} <span className="font-sans text-orange-700">— {r.arb_count} ARB{(r.arb_count ?? 0) !== 1 ? "s" : ""}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Confirmation reset warning */}
                {(type === "amendarea" || type === "condoned_amount") && resetWarnings.length > 0 && (
                  <div className="mb-3 p-3 bg-blue-50 border border-blue-300 rounded-lg text-[13px] text-blue-800">
                    ⚠ <strong>{resetWarnings.length} record{resetWarnings.length !== 1 ? "s" : ""}</strong> currently {resetWarnings.length !== 1 ? "have" : "has"} a confirmed{" "}
                    {type === "amendarea" ? "Validated Area" : "Condoned Amount"}. Updating will <strong>reset their confirmation flag</strong>.
                  </div>
                )}

                {preview.rows.length === 0 ? (
                  <p className="text-sm text-gray-400 italic mb-3">No valid records to update.</p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-gray-100 mb-4">
                    <table className="w-full text-[13px]">
                      <thead className="bg-green-900 text-white text-[11px] uppercase tracking-wide">
                        <tr>
                          <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">SEQNO_DARRO</th>
                          <th className="px-3 py-2.5 text-left font-semibold">Landowner</th>
                          <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">Province</th>
                          {type === "status" && <>
                            <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">Current Status</th>
                            <th className="px-3 py-2.5 text-left font-semibold">Reason</th>
                            <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">ARBs</th>
                          </>}
                          {(type === "amendarea" || type === "condoned_amount") && <>
                            <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">Current Value</th>
                            <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">New Value</th>
                            <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">Diff</th>
                          </>}
                          {type === "municipality" && <>
                            <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">Current Municipality</th>
                            <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">Current Barangay</th>
                            <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">New Municipality</th>
                            <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">New Barangay</th>
                          </>}
                          {(type === "asp_status" || type === "cloa_status" || type === "remarks") && <>
                            <th className="px-3 py-2.5 text-left font-semibold">Current</th>
                            <th className="px-3 py-2.5 text-left font-semibold">New</th>
                          </>}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.rows.map((r, i) => (
                          <tr key={r.seqno_darro} className={`border-t border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                            <td className="px-3 py-2 font-mono text-gray-700 whitespace-nowrap">{r.seqno_darro}</td>
                            <td className="px-3 py-2 text-gray-800 max-w-[160px] truncate">{r.landowner ?? "—"}</td>
                            <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{r.province ?? "—"}</td>

                            {type === "status" && <>
                              <td className="px-3 py-2 whitespace-nowrap">
                                <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${STATUS_BADGE[r.current_status ?? ""] ?? "bg-gray-100 text-gray-500"}`}>
                                  {r.current_status ?? "For Further Validation"}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-gray-700 max-w-[220px] truncate">{r.reason ?? "—"}</td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                {r.has_arbs
                                  ? <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-orange-100 text-orange-700">⚠ {r.arb_count} ARB{(r.arb_count ?? 0) !== 1 ? "s" : ""} — will be deleted</span>
                                  : <span className="text-gray-300 text-[11px]">—</span>}
                              </td>
                            </>}

                            {type === "amendarea" && (() => {
                              const oldV = r.old_value as number | null;
                              const newV = r.new_value as number | null;
                              const diff = (newV ?? 0) - (oldV ?? 0);
                              return <>
                                <td className="px-3 py-2 text-right font-mono text-gray-500 whitespace-nowrap">{fmt4(oldV)}</td>
                                <td className={`px-3 py-2 text-right font-mono font-semibold whitespace-nowrap ${r.will_reset_confirmation ? "text-blue-700" : "text-green-700"}`}>
                                  {fmt4(newV)}{r.will_reset_confirmation ? " ⚠" : ""}
                                </td>
                                <td className={`px-3 py-2 text-right font-mono whitespace-nowrap ${diff >= 0 ? "text-blue-600" : "text-red-500"}`}>
                                  {diff >= 0 ? "+" : ""}{fmt4(diff)}
                                </td>
                              </>;
                            })()}

                            {type === "condoned_amount" && (() => {
                              const oldV = r.old_value as number | null;
                              const newV = r.new_value as number | null;
                              const diff = (newV ?? 0) - (oldV ?? 0);
                              return <>
                                <td className="px-3 py-2 text-right font-mono text-gray-500 whitespace-nowrap">{fmt2(oldV)}</td>
                                <td className={`px-3 py-2 text-right font-mono font-semibold whitespace-nowrap ${r.will_reset_confirmation ? "text-blue-700" : "text-green-700"}`}>
                                  {fmt2(newV)}{r.will_reset_confirmation ? " ⚠" : ""}
                                </td>
                                <td className={`px-3 py-2 text-right font-mono whitespace-nowrap ${diff >= 0 ? "text-blue-600" : "text-red-500"}`}>
                                  {diff >= 0 ? "+" : ""}{fmt2(diff)}
                                </td>
                              </>;
                            })()}

                            {type === "municipality" && <>
                              <td className="px-3 py-2 text-gray-500">{r.old_municipality ?? "—"}</td>
                              <td className="px-3 py-2 text-gray-500">{r.old_barangay ?? "—"}</td>
                              <td className="px-3 py-2 font-semibold text-green-700">{r.new_municipality ?? "—"}</td>
                              <td className="px-3 py-2 font-semibold text-green-700">
                                {r.new_barangay !== undefined && r.new_barangay !== null
                                  ? r.new_barangay || "—"
                                  : <span className="text-gray-300 italic text-[11px]">unchanged</span>}
                              </td>
                            </>}

                            {(type === "asp_status" || type === "cloa_status" || type === "remarks") && <>
                              <td className="px-3 py-2 text-gray-500 max-w-[180px] truncate">{String(r.old_value ?? "—")}</td>
                              <td className="px-3 py-2 font-semibold text-green-700 max-w-[200px] truncate">{String(r.new_value ?? "—")}</td>
                            </>}
                          </tr>
                        ))}
                      </tbody>
                      {/* Totals footer for numeric types */}
                      {(type === "amendarea" || type === "condoned_amount") && preview.rows.length > 1 && (
                        <tfoot className="border-t-2 border-gray-200 bg-gray-50 text-[12px]">
                          <tr>
                            <td colSpan={3} className="px-3 py-2 font-semibold text-gray-600">Total</td>
                            <td className="px-3 py-2 text-right font-mono font-semibold text-gray-600">
                              {type === "amendarea"
                                ? fmt4(preview.rows.reduce((s, r) => s + ((r.old_value as number) ?? 0), 0))
                                : fmt2(preview.rows.reduce((s, r) => s + ((r.old_value as number) ?? 0), 0))}
                            </td>
                            <td className="px-3 py-2 text-right font-mono font-semibold text-green-700">
                              {type === "amendarea"
                                ? fmt4(preview.rows.reduce((s, r) => s + ((r.new_value as number) ?? 0), 0))
                                : fmt2(preview.rows.reduce((s, r) => s + ((r.new_value as number) ?? 0), 0))}
                            </td>
                            <td className="px-3 py-2 text-right font-mono font-semibold text-blue-600">
                              {(() => {
                                const d = preview.rows.reduce((s, r) => s + (((r.new_value as number) ?? 0) - ((r.old_value as number) ?? 0)), 0);
                                return `${d >= 0 ? "+" : ""}${type === "amendarea" ? fmt4(d) : fmt2(d)}`;
                              })()}
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                )}

                {/* Confirm */}
                {preview.rows.length > 0 && (
                  <>
                    <div className="p-3 bg-green-50 border border-green-200 rounded-lg mb-4 text-[13px] text-green-800">
                      This will update <strong>{cfg.label}</strong> for{" "}
                      <strong>{preview.rows.length} record{preview.rows.length !== 1 ? "s" : ""}</strong>. This action is logged.
                      {resetWarnings.length > 0 && (
                        <span className="text-blue-700 ml-1">
                          Confirmation flags will be reset for {resetWarnings.length} record{resetWarnings.length !== 1 ? "s" : ""}.
                        </span>
                      )}
                    </div>
                    {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
                    <div className="flex gap-3 flex-wrap">
                      {(type === "amendarea" || type === "condoned_amount") ? (
                        <>
                          <button onClick={() => handleConfirmClick(false)} disabled={loading} className="btn-primary">
                            {loading ? "Updating…" : <>Update Only <span className="btn-icon-trail">✓</span></>}
                          </button>
                          <button onClick={() => handleConfirmClick(true)} disabled={loading} className="btn-primary" style={{ background: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)", boxShadow: "0 4px 14px rgba(249,115,22,0.35)" }}>
                            {loading ? "Updating…" : <>Update and Confirm <span className="btn-icon-trail">✓✓</span></>}
                          </button>
                        </>
                      ) : (
                        <button onClick={() => handleConfirmClick()} disabled={loading} className="btn-primary">
                          {loading ? "Updating…" : <>Confirm — Update {preview.rows.length} Record{preview.rows.length !== 1 ? "s" : ""} <span className="btn-icon-trail">✓</span></>}
                        </button>
                      )}
                      <button onClick={reset} className="btn-ghost">Cancel</button>
                    </div>
                  </>
                )}

                {preview.rows.length === 0 && (
                  <button onClick={reset} className="btn-ghost">Start over</button>
                )}
              </div>
            </div>
          )}

          {error && !preview && <p className="text-sm text-red-600 mt-2">{error}</p>}
        </>
      )}

      {/* ── Revert Not Eligible for Encoding ── */}
      {type === "status" && <div className="card-bezel mt-8">
        <div className="card-bezel-inner-open">
          <div className="flex items-start justify-between gap-4 mb-1">
            <div>
              <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                <span className="text-base leading-none">↩</span>
                Revert &ldquo;Not Eligible for Encoding&rdquo; Status
              </h3>
              <p className="text-[12px] text-gray-400 mt-0.5">
                Select records to remove from &ldquo;Not Eligible for Encoding&rdquo;. The system will assign the appropriate successive status based on each record&rsquo;s current data.
              </p>
            </div>
            {!revertLoaded ? (
              <button
                onClick={() => void loadRevertList()}
                disabled={revertLoading}
                className="flex-shrink-0 btn-ghost text-[13px]"
              >
                {revertLoading ? "Loading…" : "Load List"}
              </button>
            ) : (
              <button
                onClick={() => void loadRevertList()}
                disabled={revertLoading}
                className="flex-shrink-0 text-[12px] text-gray-400 hover:text-gray-600 underline"
              >
                {revertLoading ? "Refreshing…" : "Refresh"}
              </button>
            )}
          </div>

          {revertError && <p className="text-sm text-red-600 mt-2">{revertError}</p>}

          {revertResult !== null && (
            <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg text-[13px] text-green-800">
              ✓ <strong>{revertResult} record{revertResult !== 1 ? "s" : ""}</strong> reverted — status has been auto-recomputed.
            </div>
          )}

          {revertLoaded && (
            <>
              {revertRecords.length === 0 ? (
                <p className="mt-3 text-sm text-gray-400 italic">No records currently have &ldquo;Not Eligible for Encoding&rdquo; status.</p>
              ) : (
                <>
                  <div className="mt-3 flex items-center gap-3 flex-wrap">
                    <input
                      type="text"
                      value={revertFilter}
                      onChange={(e) => setRevertFilter(e.target.value)}
                      placeholder="Filter by SEQNO, landowner, or CL No…"
                      className="flex-1 min-w-[200px] border border-gray-300 rounded-lg px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-green-600"
                    />
                    <span className="text-[12px] text-gray-400 whitespace-nowrap">
                      {revertRecords.length.toLocaleString()} total · {revertSelected.size} selected
                    </span>
                  </div>

                  <div className="mt-3 overflow-x-auto rounded-lg border border-gray-100">
                    <table className="w-full text-[13px]">
                      <thead className="bg-red-900 text-white text-[11px] uppercase tracking-wide">
                        <tr>
                          <th className="px-3 py-2.5 w-10">
                            <input
                              type="checkbox"
                              checked={allFilteredSelected}
                              onChange={toggleRevertAll}
                              className="rounded"
                              title={allFilteredSelected ? "Deselect all visible" : "Select all visible"}
                            />
                          </th>
                          <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">SEQNO_DARRO</th>
                          <th className="px-3 py-2.5 text-left font-semibold">Landowner</th>
                          <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">Province</th>
                          <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">CL No.</th>
                          <th className="px-3 py-2.5 text-left font-semibold">Reason for Non-Eligibility</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRevertRecords.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-3 py-4 text-center text-gray-400 italic text-[13px]">No records match your filter.</td>
                          </tr>
                        ) : (
                          filteredRevertRecords.map((r, i) => {
                            const checked = revertSelected.has(r.seqno_darro);
                            return (
                              <tr
                                key={r.seqno_darro}
                                className={`border-t border-gray-100 cursor-pointer transition-colors duration-100 ${checked ? "bg-red-50" : i % 2 === 0 ? "bg-white hover:bg-gray-50" : "bg-gray-50 hover:bg-gray-100"}`}
                                onClick={() => setRevertSelected((prev) => {
                                  const next = new Set(prev);
                                  checked ? next.delete(r.seqno_darro) : next.add(r.seqno_darro);
                                  return next;
                                })}
                              >
                                <td className="px-3 py-2 text-center">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {}}
                                    className="rounded pointer-events-none"
                                  />
                                </td>
                                <td className="px-3 py-2 font-mono text-gray-700 whitespace-nowrap">{r.seqno_darro}</td>
                                <td className="px-3 py-2 text-gray-800 max-w-[160px] truncate">{r.landowner ?? "—"}</td>
                                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{r.province_edited ?? "—"}</td>
                                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{r.clno ?? "—"}</td>
                                <td className="px-3 py-2 text-gray-500 max-w-[220px] truncate">{r.non_eligibility_reason ?? "—"}</td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {revertSelected.size > 0 && (
                    <div className="mt-4 flex items-center gap-3 flex-wrap">
                      <div className="flex-1 p-3 bg-red-50 border border-red-200 rounded-lg text-[13px] text-red-800">
                        <strong>{revertSelected.size} record{revertSelected.size !== 1 ? "s" : ""}</strong> selected.
                        {" "}The &ldquo;Not Eligible for Encoding&rdquo; override will be removed and the system will assign the appropriate successive status based on {revertSelected.size !== 1 ? "each record's" : "the record's"} current data.
                      </div>
                      <button
                        onClick={() => setShowRevertConfirm(true)}
                        disabled={revertLoading}
                        className="flex-shrink-0 px-5 py-2 rounded-xl text-[13px] font-semibold text-white transition-all duration-200 active:scale-[0.97]"
                        style={{ background: "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)", boxShadow: "0 4px 14px rgba(220,38,38,0.35)" }}
                      >
                        {revertLoading ? "Reverting…" : <>Revert {revertSelected.size} Record{revertSelected.size !== 1 ? "s" : ""} <span className="ml-1">↩</span></>}
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>}

      {/* ARB deletion confirmation modal */}
      {showArbConfirm && typeof window !== "undefined" && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Delete ARB Data?</h3>
            <p className="text-sm text-gray-600 mb-3">
              <strong>{rowsWithArbs.length} landholding{rowsWithArbs.length !== 1 ? "s" : ""}</strong> {rowsWithArbs.length !== 1 ? "have" : "has"} existing ARB records that will be <span className="text-red-600 font-semibold">permanently deleted</span> when you set {rowsWithArbs.length !== 1 ? "their" : "its"} status to Not Eligible for Encoding:
            </p>
            <ul className="mb-4 max-h-40 overflow-y-auto space-y-1 bg-red-50 rounded-lg p-3 border border-red-200">
              {rowsWithArbs.map((r) => (
                <li key={r.seqno_darro} className="text-[13px] font-mono text-red-800">
                  {r.seqno_darro} <span className="font-sans text-red-500">— {r.arb_count} ARB{(r.arb_count ?? 0) !== 1 ? "s" : ""}</span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-gray-500 mb-5">This action cannot be undone. Are you sure you want to proceed?</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowArbConfirm(false)} className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={() => void doCommit()}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold"
              >
                Yes, Delete ARBs & Update Status
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Revert confirmation modal */}
      {showRevertConfirm && typeof window !== "undefined" && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Revert Status?</h3>
            <p className="text-sm text-gray-600 mb-4">
              The &ldquo;Not Eligible for Encoding&rdquo; override will be removed from{" "}
              <strong>{revertSelected.size} record{revertSelected.size !== 1 ? "s" : ""}</strong>.
              The system will then assign the appropriate successive status (e.g. For Initial Validation, For Further Validation, etc.) based on each record&rsquo;s current data.
            </p>
            <p className="text-sm text-gray-500 mb-5">This action is logged and cannot be undone. Are you sure?</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowRevertConfirm(false)} className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={() => void doRevert()}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold"
              >
                Yes, Revert Status
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
