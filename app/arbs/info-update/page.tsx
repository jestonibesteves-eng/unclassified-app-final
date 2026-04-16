"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import type { ArbInfoType } from "@/app/api/batch/arb-info/route";

/* ── Type config ── */

const TYPES: {
  value: ArbInfoType;
  label: string;
  icon: string;
  hint: string;
  placeholder: string;
  locked: boolean;
  lockedNote?: string;
}[] = [
  {
    value: "date_encoded",
    label: "Date Encoded",
    icon: "📅",
    hint: 'Format: SEQNO_DARRO → Tab → ARB_ID → Tab → DATE. Copy three columns from Excel.',
    placeholder: "R5-UC-00001\t123456789\t2024-01-15\nR5-UC-00002\t987654321\t2024-01-16",
    locked: false,
  },
  {
    value: "date_distributed",
    label: "Date Distributed",
    icon: "📬",
    hint: 'Format: SEQNO_DARRO → Tab → ARB_ID → Tab → DATE. Copy three columns from Excel.',
    placeholder: "R5-UC-00001\t123456789\t2024-03-10\nR5-UC-00002\t987654321\t2024-03-11",
    locked: false,
  },
  {
    value: "arb_name",
    label: "ARB Name",
    icon: "👤",
    hint: 'Format: SEQNO_DARRO → Tab → ARB_ID → Tab → ARB NAME. Copy three columns from Excel.',
    placeholder: "R5-UC-00001\t123456789\tDELA CRUZ, JUAN B.\nR5-UC-00002\t987654321\tSANTOS, MARIA C.",
    locked: false,
  },
  {
    value: "area_allocated",
    label: "Allocated Area",
    icon: "📐",
    hint: 'Format: SEQNO_DARRO → Tab → ARB_ID → Tab → AREA (numeric, in hectares). Copy three columns from Excel.',
    placeholder: "R5-UC-00001\t123456789\t1.5000\nR5-UC-00002\t987654321\t2.2500",
    locked: true,
    lockedNote: 'Locked when the landholding status has reached "For Encoding" or beyond.',
  },
  {
    value: "allocated_condoned_amount",
    label: "Allocated Condoned Amount",
    icon: "₱",
    hint: 'Format: SEQNO_DARRO → Tab → ARB_ID → Tab → AMOUNT (numeric). Copy three columns from Excel.',
    placeholder: "R5-UC-00001\t123456789\t56946.81\nR5-UC-00002\t987654321\t123400.00",
    locked: true,
    lockedNote: 'Locked when the landholding status has reached "For Encoding" or beyond.',
  },
  {
    value: "carpable",
    label: "CARPable",
    icon: "🌾",
    hint: 'Format: SEQNO_DARRO → Tab → ARB_ID → Tab → CARPABLE or NON-CARPABLE. Copy three columns from Excel.',
    placeholder: "R5-UC-00001\t123456789\tCARPABLE\nR5-UC-00002\t987654321\tNON-CARPABLE",
    locked: false,
  },
  {
    value: "eligibility",
    label: "Eligibility",
    icon: "✅",
    hint: 'Format: SEQNO_DARRO → Tab → ARB_ID → Tab → Eligible or Not Eligible. Copy three columns from Excel.',
    placeholder: "R5-UC-00001\t123456789\tEligible\nR5-UC-00002\t987654321\tNot Eligible",
    locked: false,
  },
  {
    value: "ep_cloa_no",
    label: "Title No.",
    icon: "📄",
    hint: 'Format: SEQNO_DARRO → Tab → ARB_ID → Tab → EP/CLOA No. Copy three columns from Excel.',
    placeholder: "R5-UC-00001\t123456789\tEP-000001\nR5-UC-00002\t987654321\tCLOA-000002",
    locked: false,
  },
  {
    value: "remarks",
    label: "Remarks",
    icon: "💬",
    hint: 'Format: SEQNO_DARRO → Tab → ARB_ID → Tab → Remarks text. Copy three columns from Excel.',
    placeholder: "R5-UC-00001\t123456789\tFor follow-up\nR5-UC-00002\t987654321\tVerified",
    locked: false,
  },
];

const LOCKED_STATUSES = [
  "For Encoding", "Partially Encoded", "Fully Encoded",
  "Partially Distributed", "Fully Distributed", "Not Eligible for Encoding",
];

/* ── Types ── */

type PreviewRow = {
  seqno_darro: string;
  arb_id: string;
  arb_db_id: number;
  landowner: string | null;
  arb_name: string | null;
  lh_status: string | null;
  current_value: string | null;
  new_value: string;
  locked: boolean;
};

type PreviewData = {
  invalid: { line: string; reason: string }[];
  notFoundPairs: string[];
  outOfJurisdiction: string[];
  rows: PreviewRow[];
};

type DoneResult = {
  updated: number;
  updatedRecords: { seqno_darro: string; arb_id: string; arb_name: string | null; landowner: string | null }[];
  skippedRecords: { seqno_darro: string; arb_id: string; reason: string }[];
};

/* ── Helpers ── */

function fmt4(v: string | null | undefined) {
  if (v == null) return "—";
  const n = parseFloat(v);
  return isNaN(n) ? v : n.toLocaleString("en-PH", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

function fmt2(v: string | null | undefined) {
  if (v == null) return "—";
  const n = parseFloat(v.replace(/[₱,\s]/g, ""));
  return isNaN(n) ? v : n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function haUnit(n: number) { return Math.abs(n) >= 2 ? "has." : "ha."; }

function fmtValue(type: ArbInfoType, v: string | null | undefined) {
  if (v == null || v === "") return "—";
  if (type === "area_allocated") {
    const n = parseFloat(String(v));
    if (isNaN(n)) return v;
    return n.toLocaleString("en-PH", { minimumFractionDigits: 4, maximumFractionDigits: 4 }) + " " + haUnit(n);
  }
  if (type === "allocated_condoned_amount") return "₱" + fmt2(v);
  return v;
}

const DIFF_TYPES: ArbInfoType[] = ["area_allocated", "allocated_condoned_amount"];

function fmtDiff(type: ArbInfoType, current: string | null | undefined, next: string | null | undefined): { text: string; positive: boolean | null } | null {
  if (!DIFF_TYPES.includes(type)) return null;
  const cur = parseFloat(String(current ?? "").replace(/[₱,\s]/g, ""));
  const nxt = parseFloat(String(next ?? "").replace(/[₱,\s]/g, ""));
  if (isNaN(cur) || isNaN(nxt)) return null;
  const diff = nxt - cur;
  if (diff === 0) return { text: "—", positive: null };
  const abs = Math.abs(diff);
  const formatted = type === "area_allocated"
    ? abs.toLocaleString("en-PH", { minimumFractionDigits: 4, maximumFractionDigits: 4 }) + " " + haUnit(abs)
    : "₱" + abs.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return { text: (diff > 0 ? "+" : "−") + " " + formatted, positive: diff > 0 };
}

const STATUS_COLORS: Record<string, string> = {
  "For Initial Validation": "bg-gray-100 text-gray-600",
  "For Further Validation": "bg-yellow-100 text-yellow-700",
  "For Encoding": "bg-blue-100 text-blue-700",
  "Partially Encoded": "bg-indigo-100 text-indigo-700",
  "Fully Encoded": "bg-purple-100 text-purple-700",
  "Partially Distributed": "bg-emerald-100 text-emerald-700",
  "Fully Distributed": "bg-green-100 text-green-700",
  "Not Eligible for Encoding": "bg-red-100 text-red-700",
};

/* ── Page ── */

export default function ArbInfoUpdatePage() {
  const [type, setType] = useState<ArbInfoType>("date_encoded");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [result, setResult] = useState<DoneResult | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const cfg = TYPES.find((t) => t.value === type)!;
  const rowCount = input.split("\n").filter((l) => l.trim()).length;

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (showConfirm) { setShowConfirm(false); return; }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [showConfirm]);

  function switchType(t: ArbInfoType) {
    setType(t);
    setInput("");
    setPreview(null);
    setResult(null);
    setError("");
    setShowConfirm(false);
  }

  function reset() {
    setInput("");
    setPreview(null);
    setResult(null);
    setError("");
    setShowConfirm(false);
  }

  async function handlePreview() {
    setError(""); setResult(null);
    if (!input.trim()) { setError("Please enter at least one row."); return; }
    setLoading(true);
    const res = await fetch("/api/batch/arb-info", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, raw: input }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error ?? "Preview failed."); return; }
    setPreview(data);
  }

  async function doCommit() {
    setShowConfirm(false);
    setError(""); setLoading(true);
    const res = await fetch("/api/batch/arb-info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, raw: input }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error ?? "Update failed."); return; }
    setResult({ updated: data.updated, updatedRecords: data.updatedRecords ?? [], skippedRecords: data.skippedRecords ?? [] });
    setPreview(null); setInput("");
  }

  const activeRows = preview?.rows.filter((r) => !r.locked) ?? [];
  const lockedRows = preview?.rows.filter((r) => r.locked) ?? [];

  return (
    <div className="max-w-5xl page-enter">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-[1.6rem] font-bold text-gray-900 leading-tight">ARB Info Update</h2>
        <p className="text-[12px] text-gray-400 mt-0.5 tracking-wide">
          Batch-update ARB fields. Format: SEQNO_DARRO → Tab → ARB_ID → Tab → Value.
        </p>
      </div>

      {!result ? (
        <>
          {/* Type selector */}
          <div className="card-bezel mb-5">
            <div className="card-bezel-inner-open">
              <p className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-3">Select Column to Update</p>
              <div className="flex flex-wrap gap-2">
                {TYPES.map(({ value, label, icon, locked }) => {
                  const active = type === value;
                  return (
                    <button
                      key={value}
                      onClick={() => switchType(value)}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-left transition-all duration-150 active:scale-[0.97] ${
                        active
                          ? "bg-green-900 border-green-900 text-white shadow-md"
                          : "bg-white border-green-200 text-green-900 hover:bg-green-50"
                      }`}
                    >
                      <span className="text-base leading-none">{icon}</span>
                      <span className="text-[13px] font-bold leading-tight">{label}</span>
                      {locked && (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${active ? "bg-amber-400/30 text-amber-200" : "bg-amber-100 text-amber-700"}`}>
                          Lock-guarded
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Input */}
          {!preview && (
            <div className="card-bezel mb-5">
              <div className="card-bezel-inner-open">
                <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-green-900 text-white flex items-center justify-center text-[11px] font-bold">1</span>
                  Enter Data
                </h3>
                <p className="text-[13px] text-gray-500 mb-3">{cfg.hint}</p>

                {cfg.locked && (
                  <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-[12px] text-amber-800">
                    <strong>Lock rule:</strong> {cfg.lockedNote}
                  </div>
                )}

                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] uppercase tracking-widest font-semibold text-gray-400">Paste Data</p>
                  {rowCount > 0 && (
                    <span className="text-[11px] font-semibold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                      {rowCount} row{rowCount !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <textarea
                  value={input}
                  onChange={(e) => { setInput(e.target.value); setError(""); }}
                  rows={8}
                  placeholder={cfg.placeholder}
                  className="w-full font-mono text-[12px] border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-green-600 resize-y"
                />
                {error && <p className="mt-2 text-[12px] text-red-600">{error}</p>}
                <div className="mt-3">
                  <button
                    onClick={handlePreview}
                    disabled={loading || !input.trim()}
                    className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {loading ? "Loading…" : <>Preview Records →</>}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Preview */}
          {preview && (
            <div className="card-bezel">
              <div className="card-bezel-inner-open">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-green-900 text-white flex items-center justify-center text-[11px] font-bold">2</span>
                    Review Changes
                  </h3>
                  <button onClick={reset} className="text-[12px] text-gray-400 hover:text-gray-600">← Edit</button>
                </div>

                {/* Parse errors */}
                {preview.invalid.length > 0 && (
                  <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-[13px] text-yellow-800">
                    <strong>{preview.invalid.length} line{preview.invalid.length !== 1 ? "s" : ""} skipped (invalid format):</strong>
                    <ul className="mt-1 space-y-0.5 max-h-24 overflow-y-auto">
                      {preview.invalid.map((e, i) => (
                        <li key={i} className="font-mono">{e.line} <span className="font-sans text-yellow-600">— {e.reason}</span></li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Not found */}
                {preview.notFoundPairs.length > 0 && (
                  <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-[13px] text-yellow-700">
                    <strong>{preview.notFoundPairs.length} SEQNO / ARB_ID pair{preview.notFoundPairs.length !== 1 ? "s" : ""} not found</strong> — will be skipped:{" "}
                    {preview.notFoundPairs.join(", ")}
                  </div>
                )}

                {/* Out of jurisdiction */}
                {preview.outOfJurisdiction.length > 0 && (
                  <div className="mb-3 p-3 bg-orange-50 border border-orange-200 rounded-lg text-[13px] text-orange-700">
                    <strong>{preview.outOfJurisdiction.length} record{preview.outOfJurisdiction.length !== 1 ? "s" : ""} out of jurisdiction</strong> — will be skipped:{" "}
                    {preview.outOfJurisdiction.join(", ")}
                  </div>
                )}

                {/* Locked rows summary */}
                {lockedRows.length > 0 && (
                  <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-[13px] text-amber-800">
                    <strong>{lockedRows.length} record{lockedRows.length !== 1 ? "s" : ""} locked</strong> — LH status is at or beyond "For Encoding", field cannot be updated:
                    <ul className="mt-1 space-y-0.5 max-h-24 overflow-y-auto">
                      {lockedRows.map((r) => (
                        <li key={`${r.seqno_darro}|${r.arb_id}`} className="font-mono">
                          {r.seqno_darro} / {r.arb_id}
                          <span className="font-sans text-amber-600 ml-1">— {r.lh_status}</span>
                        </li>
                      ))}
                    </ul>
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
                          <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">ARB_ID</th>
                          <th className="px-3 py-2.5 text-left font-semibold">ARB Name</th>
                          <th className="px-3 py-2.5 text-left font-semibold">Landowner</th>
                          {cfg.locked && <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">LH Status</th>}
                          <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">Current</th>
                          <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">New Value</th>
                          {DIFF_TYPES.includes(type) && <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">Difference</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.rows.map((r, i) => (
                          <tr key={`${r.seqno_darro}|${r.arb_id}`}
                            className={`border-t border-gray-100 ${r.locked ? "opacity-50" : i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                            <td className="px-3 py-2 font-mono text-gray-700 whitespace-nowrap">{r.seqno_darro}</td>
                            <td className="px-3 py-2 font-mono text-gray-500 whitespace-nowrap">{r.arb_id}</td>
                            <td className="px-3 py-2 text-gray-700 max-w-[160px] truncate">{r.arb_name ?? "—"}</td>
                            <td className="px-3 py-2 text-gray-500 max-w-[140px] truncate">{r.landowner ?? "—"}</td>
                            {cfg.locked && (
                              <td className="px-3 py-2 whitespace-nowrap">
                                {r.lh_status ? (
                                  <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${STATUS_COLORS[r.lh_status] ?? "bg-gray-100 text-gray-600"}`}>
                                    {r.lh_status}
                                  </span>
                                ) : "—"}
                              </td>
                            )}
                            <td className="px-3 py-2 font-mono text-gray-400 whitespace-nowrap">
                              {fmtValue(type, r.current_value)}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {r.locked ? (
                                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-700">🔒 Locked</span>
                              ) : (
                                <span className="font-mono text-green-800 font-semibold">{fmtValue(type, r.new_value)}</span>
                              )}
                            </td>
                            {DIFF_TYPES.includes(type) && (() => {
                              const d = r.locked ? null : fmtDiff(type, r.current_value, r.new_value);
                              return (
                                <td className="px-3 py-2 whitespace-nowrap font-mono text-[12px]">
                                  {d ? (
                                    <span className={d.positive === null ? "text-green-600 font-semibold" : d.positive ? "text-blue-600 font-semibold" : "text-red-600 font-semibold"}>
                                      {d.text}
                                    </span>
                                  ) : "—"}
                                </td>
                              );
                            })()}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-[12px] text-gray-500">
                    {activeRows.length > 0 ? (
                      <>This will update <strong className="text-gray-700">{activeRows.length} ARB{activeRows.length !== 1 ? "s" : ""}</strong>. This action is logged.</>
                    ) : (
                      <span className="text-gray-400 italic">No records to update.</span>
                    )}
                    {lockedRows.length > 0 && (
                      <span className="ml-2 text-amber-600">{lockedRows.length} locked and will be skipped.</span>
                    )}
                  </p>
                  <button
                    onClick={() => setShowConfirm(true)}
                    disabled={activeRows.length === 0}
                    className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Update {activeRows.length > 0 ? activeRows.length : ""} ARB{activeRows.length !== 1 ? "s" : ""} ✓
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
                <p className="font-bold text-gray-900">{result.updated} ARB{result.updated !== 1 ? "s" : ""} updated.</p>
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
                      <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">ARB_ID</th>
                      <th className="px-3 py-2 text-left font-semibold">ARB Name</th>
                      <th className="px-3 py-2 text-left font-semibold">Landowner</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.updatedRecords.map((r, i) => (
                      <tr key={`${r.seqno_darro}|${r.arb_id}`} className={`border-t border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                        <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                        <td className="px-3 py-2 font-mono text-gray-700">{r.seqno_darro}</td>
                        <td className="px-3 py-2 font-mono text-gray-500">{r.arb_id}</td>
                        <td className="px-3 py-2 text-gray-700 max-w-[180px] truncate">{r.arb_name ?? "—"}</td>
                        <td className="px-3 py-2 text-gray-500 max-w-[160px] truncate">{r.landowner ?? "—"}</td>
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
                    <li key={i} className="font-mono">
                      {r.seqno_darro} / {r.arb_id}
                      <span className="font-sans text-gray-400 ml-1">— {r.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button onClick={reset} className="btn-primary">Update More ARBs</button>
          </div>
        </div>
      )}

      {/* Confirmation modal */}
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
                  Update {activeRows.length} ARB{activeRows.length !== 1 ? "s" : ""}?
                </h3>
                <p className="text-[13px] text-gray-500 leading-snug">
                  This will set <strong className="text-gray-700">{cfg.label}</strong> for{" "}
                  <strong className="text-gray-700">{activeRows.length} ARB{activeRows.length !== 1 ? "s" : ""}</strong>. This action is logged.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowConfirm(false)} className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-[13px] hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={() => void doCommit()} className="px-4 py-2 bg-green-800 hover:bg-green-900 text-white rounded-lg text-[13px] font-semibold">
                Yes, Update
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
