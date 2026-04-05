"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useToast } from "@/components/Toast";
import { useUser } from "@/components/UserContext";

/* ─── Mismatch Tooltip ─── */
function MismatchBadge({ label }: { label: string }) {
  const isDeficit = label.startsWith("Deficit");
  const [pos, setPos] = React.useState<{ x: number; y: number } | null>(null);
  const amount = label.replace("Deficit of ", "").replace("Excess of ", "");

  return (
    <>
      <span
        onMouseEnter={(e) => setPos({ x: e.clientX, y: e.clientY })}
        onMouseMove={(e) => setPos({ x: e.clientX, y: e.clientY })}
        onMouseLeave={() => setPos(null)}
        className="text-red-500 font-bold text-[13px] cursor-default select-none"
      >✕</span>
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
                {isDeficit ? "Area Deficit" : "Area Excess"}
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
  _count: { arbs: number };
};

type Arb = {
  id: number;
  arb_name: string | null;
  arb_no: string | null;
  ep_cloa_no: string | null;
  carpable: string | null;
  area_allocated: string | null;
  remarks: string | null;
};

type LHDetail = {
  landholding: {
    seqno_darro: string; landowner: string | null; province_edited: string | null;
    clno: string | null; claimclass: string | null; osarea: number | null;
    amendarea: number | null; amendarea_validated: number | null;
    status: string | null; data_flags: string | null;
  };
  arbs: Arb[];
};

type LHLookup = {
  seqno_darro: string;
  landowner: string | null;
  province_edited: string | null;
  clno: string | null;
  claimclass: string | null;
  osarea: number | null;
  _count: { arbs: number };
};

type ArbRow = {
  arb_name: string;
  arb_no: string;
  ep_cloa_no: string;
  carpable: string;
  area_allocated: string;
  remarks: string;
};

// Returns 0 for Collective CLOA entries (marked with "*") so they don't inflate totals
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

function emptyRow(): ArbRow {
  return { arb_name: "", arb_no: "", ep_cloa_no: "", carpable: "", area_allocated: "", remarks: "" };
}

/* ─── Upload File Panel ─── */
type PreviewArb = { seqno_darro: string | null; arb_name: string | null; arb_no: string | null; ep_cloa_no: string | null; area_allocated: string | null; remarks: string | null };
type BySEQNO = Record<string, { landowner: string | null; province: string | null; count: number; existingCount: number; arbs: PreviewArb[]; amendarea: number | null; amendarea_validated: number | null }>;
type PreviewData = { total: number; valid: number; errors: { row: number; reason: string }[]; notFoundSeqnos: string[]; outOfJurisdictionSeqnos: string[]; bySEQNO: BySEQNO } | null;

function UploadFilePanel({ onSaved }: { onSaved: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"append" | "replace">("append");
  const [preview, setPreview] = useState<PreviewData>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handlePreview() {
    if (!file) { setError("Please select a file first."); return; }
    setError(""); setLoading(true);
    const fd = new FormData();
    fd.append("file", file); fd.append("mode", mode);
    const res = await fetch("/api/arbs/upload", { method: "PUT", body: fd });
    const data = await res.json();
    if (!res.ok) { setError(data.error); setLoading(false); return; }
    setPreview(data); setLoading(false);
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
          <button onClick={reset} className="mt-2 text-sm text-green-700 underline">Upload another file</button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 mb-4">
            <div>
              <label className="block text-[12px] font-semibold text-gray-500 uppercase tracking-wide mb-1">File (.xlsx or .csv)</label>
              <input ref={fileRef} type="file" accept=".xlsx,.csv"
                onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); }}
                className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-green-900 file:text-white hover:file:bg-green-800 cursor-pointer"
              />
              {file && (
                <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                  <svg className="w-4 h-4 text-green-600 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                  </svg>
                  <span className="text-[12px] text-green-800 font-medium truncate">{file.name}</span>
                  <span className="text-[11px] text-green-600 shrink-0">({(file.size / 1024).toFixed(1)} KB) — Ready to preview</span>
                </div>
              )}
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Upload Mode</label>
              <div className="flex flex-col gap-1.5">
                {(["append", "replace"] as const).map((m) => (
                  <label key={m} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="upload-mode" value={m} checked={mode === m} onChange={() => setMode(m)} className="accent-green-700" />
                    <span className="text-sm capitalize font-medium">{m}</span>
                    <span className="text-[11px] text-gray-400">{m === "append" ? "— add to existing ARBs" : "— replace existing ARBs for matched SEQNOs"}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
            <p className="text-[12px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Expected Columns</p>
            <p className="text-[12px] text-gray-500 font-mono">SEQNO_DARRO* &nbsp;|&nbsp; ARB_NAME* &nbsp;|&nbsp; ARB_NO &nbsp;|&nbsp; EP_CLOA_NO &nbsp;|&nbsp; CARPABLE* &nbsp;|&nbsp; AREA_ALLOCATED* &nbsp;|&nbsp; REMARKS</p>
            <p className="text-[11px] text-gray-400 mt-1">* Required. Column names are flexible.</p>
          </div>

          {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
          <button onClick={handlePreview} disabled={!file || loading}
            className="px-5 py-2 bg-green-900 text-white rounded-lg text-sm font-medium hover:bg-green-800 disabled:opacity-40 transition-colors">
            {loading ? "Processing..." : "Preview File →"}
          </button>

          {preview && (
            <div className="mt-4">
              <div className="grid grid-cols-3 gap-3 mb-4">
                <Stat label="Total Rows" value={preview.total} color="gray" />
                <Stat label="Valid to Import" value={preview.valid} color="green" />
                <Stat label="Skipped" value={preview.errors.length + preview.notFoundSeqnos.length + preview.outOfJurisdictionSeqnos.length} color="red" />
              </div>
              {preview.outOfJurisdictionSeqnos.length > 0 && (
                <div className="mb-3 p-3 bg-orange-50 border border-orange-300 rounded-lg text-[13px] text-orange-700">
                  <strong>{preview.outOfJurisdictionSeqnos.length} SEQNO{preview.outOfJurisdictionSeqnos.length !== 1 ? "s" : ""} outside your jurisdiction — skipped:</strong>{" "}
                  {preview.outOfJurisdictionSeqnos.slice(0, 5).join(", ")}{preview.outOfJurisdictionSeqnos.length > 5 ? ` +${preview.outOfJurisdictionSeqnos.length - 5} more` : ""}
                </div>
              )}
              {preview.notFoundSeqnos.length > 0 && (
                <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-[13px] text-yellow-700">
                  <strong>{preview.notFoundSeqnos.length} SEQNO{preview.notFoundSeqnos.length !== 1 ? "s" : ""} not found</strong>: {preview.notFoundSeqnos.slice(0, 5).join(", ")}{preview.notFoundSeqnos.length > 5 ? ` +${preview.notFoundSeqnos.length - 5} more` : ""}
                </div>
              )}
              {preview.errors.length > 0 && (
                <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-[13px] text-red-700 max-h-28 overflow-y-auto">
                  <strong>Row errors:</strong>
                  <ul className="mt-1 space-y-0.5">{preview.errors.map((e, i) => <li key={i}>Row {e.row}: {e.reason}</li>)}</ul>
                </div>
              )}
              <div className="flex justify-end mb-1.5">
                {(() => {
                  const allExpanded = Object.keys(preview.bySEQNO).every((s) => expanded[s]);
                  return (
                    <button
                      onClick={() => {
                        const keys = Object.keys(preview.bySEQNO);
                        setExpanded(allExpanded ? {} : Object.fromEntries(keys.map((k) => [k, true])));
                      }}
                      className="text-[12px] text-green-700 font-semibold hover:underline"
                    >
                      {allExpanded ? "Collapse All" : "Expand All"}
                    </button>
                  );
                })()}
              </div>
              <div className="overflow-x-auto rounded-lg border border-gray-100 mb-4">
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
                      <th className="px-3 py-2.5 text-center">Match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(preview.bySEQNO).map(([seqno, info], i) => (
                      <React.Fragment key={seqno}>
                        <tr
                          className={`border-t border-gray-100 cursor-pointer hover:bg-green-50 transition-colors ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}
                          onClick={() => setExpanded((prev) => ({ ...prev, [seqno]: !prev[seqno] }))}
                        >
                          <td className="px-3 py-2 text-gray-400 text-[11px] text-center">
                            {expanded[seqno] ? "▾" : "▸"}
                          </td>
                          <td className="px-3 py-2 font-mono text-[13px] text-green-700 font-semibold">{seqno}</td>
                          <td className="px-3 py-2 text-gray-800 max-w-[180px] truncate">{info.landowner ?? "—"}</td>
                          <td className="px-3 py-2 text-gray-600">{info.province ?? "—"}</td>
                          <td className="px-3 py-2 text-right font-semibold text-green-700">{info.count}</td>
                          <td className="px-3 py-2 text-right text-gray-500">
                            {info.existingCount > 0
                              ? <span className={mode === "replace" ? "text-orange-600" : "text-gray-500"}>{info.existingCount} {mode === "replace" ? "(replace)" : "(keep)"}</span>
                              : "—"}
                          </td>
                          {(() => {
                            const totalArea = info.arbs.reduce((s, a) => s + parseArea(a.area_allocated), 0);
                            const validatedArea = info.amendarea_validated ?? info.amendarea;
                            const match = validatedArea != null && parseFloat(totalArea.toFixed(4)) === parseFloat(validatedArea.toFixed(4));
                            const mismatch = validatedArea != null && !match;
                            return (
                              <>
                                <td className="px-3 py-2 text-right font-mono text-[13px] text-gray-700">{totalArea.toFixed(4)}</td>
                                <td className="px-3 py-2 text-right font-mono text-[13px] text-gray-500">{validatedArea != null ? validatedArea.toFixed(4) : "—"}</td>
                                <td className="px-3 py-2 text-center">
                                  {validatedArea == null ? <span className="text-gray-300 text-[12px]">—</span>
                                    : match
                                    ? <span className="text-emerald-600 font-bold text-[13px]" title="Matches validated AMENDAREA">✓</span>
                                    : (() => {
                                        const diff = totalArea - validatedArea;
                                        const label = diff < 0
                                          ? `Deficit of ${Math.abs(diff).toFixed(4)} ha`
                                          : `Excess of ${diff.toFixed(4)} ha`;
                                        return <MismatchBadge label={label} />;
                                      })()}
                                </td>
                              </>
                            );
                          })()}
                        </tr>
                        {expanded[seqno] && (
                          <tr className="bg-green-50/60 border-t border-green-100">
                            <td colSpan={9} className="px-6 py-3">
                              <table className="w-full text-[12px]">
                                <thead>
                                  <tr className="text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-200">
                                    <th className="pb-1 text-left font-semibold">ARB Name</th>
                                    <th className="pb-1 text-left font-semibold">ARB ID</th>
                                    <th className="pb-1 text-left font-semibold">EP/CLOA No.</th>
                                    <th className="pb-1 text-left font-semibold">CARPable</th>
                                    <th className="pb-1 pr-4 text-right font-semibold">Area (has.)</th>
                                    <th className="pb-1 text-left font-semibold">Remarks</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {info.arbs.map((arb, j) => (
                                    <tr key={j} className="border-t border-gray-100">
                                      <td className="py-1.5 pr-3 text-gray-800 font-medium">{arb.arb_name ?? "—"}</td>
                                      <td className="py-1.5 pr-3 text-gray-600 font-mono">{arb.arb_no ?? "—"}</td>
                                      <td className="py-1.5 pr-3 text-gray-600 font-mono">{arb.ep_cloa_no ?? "—"}</td>
                                      <td className="py-1.5 pr-3">{arb.carpable ? <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${arb.carpable === "CARPABLE" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>{arb.carpable}</span> : <span className="text-gray-300">—</span>}</td>
                                      <td className="py-1.5 pr-6 text-right text-gray-600">{displayArea(arb.area_allocated)}</td>
                                      <td className="py-1.5 text-gray-400">{arb.remarks ?? "—"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-3">
                <button onClick={handleImport} disabled={loading || preview.valid === 0}
                  className="px-6 py-2.5 bg-green-900 text-white rounded-lg text-sm font-semibold hover:bg-green-800 disabled:opacity-40 transition-colors">
                  {loading ? "Importing..." : `Confirm Import — ${preview.valid} ARB${preview.valid !== 1 ? "s" : ""}`}
                </button>
                <button onClick={reset} className="px-4 py-2.5 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
              </div>
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
    const res = await fetch(`/api/arbs/manual?seqno=${encodeURIComponent(seqnoInput.trim())}`);
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
    const filled = rows.filter((r) => r.arb_name.trim() && r.carpable && r.area_allocated.trim());
    if (filled.length === 0) { setError("At least one row with ARB Name, CARPable, and Area is required."); return; }
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
        <label className="block text-[12px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Step 1 — Look up Landholding
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={seqnoInput}
            onChange={(e) => { setSeqnoInput(e.target.value.toUpperCase()); setLh(null); }}
            onKeyDown={(e) => e.key === "Enter" && handleLookup()}
            placeholder="e.g. R5-UC-04277"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-600"
          />
          <button onClick={handleLookup} disabled={looking}
            className="px-4 py-2 bg-green-900 text-white rounded-lg text-sm font-medium hover:bg-green-800 disabled:opacity-40 transition-colors">
            {looking ? "Looking up..." : "Look up"}
          </button>
        </div>
        {lookupError && <p className="text-sm text-red-600 mt-1.5">{lookupError}</p>}

        {lh && (
          <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg grid grid-cols-2 gap-x-6 gap-y-1 text-[13px]">
            <div><span className="text-gray-500">Landowner:</span> <span className="font-medium text-gray-800">{lh.landowner ?? "—"}</span></div>
            <div><span className="text-gray-500">CLNO:</span> <span className="font-medium text-gray-800">{lh.clno ?? "—"}</span></div>
            <div><span className="text-gray-500">Province:</span> <span className="font-medium text-gray-800">{lh.province_edited ?? "—"}</span></div>
            <div><span className="text-gray-500">Class:</span> <span className="font-medium text-gray-800">{lh.claimclass ?? "—"}</span></div>
            <div><span className="text-gray-500">OSAREA:</span> <span className="font-medium text-gray-800">{lh.osarea?.toFixed(4) ?? "—"} has.</span></div>
            <div><span className="text-gray-500">Existing ARBs:</span> <span className={`font-semibold ${lh._count.arbs > 0 ? "text-orange-600" : "text-gray-800"}`}>{lh._count.arbs}</span></div>
          </div>
        )}
      </div>

      {lh && (
        <>
          {/* Mode */}
          <div className="mb-4">
            <label className="block text-[12px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Step 2 — Entry Mode</label>
            <div className="flex gap-4">
              {(["append", "replace"] as const).map((m) => (
                <label key={m} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="manual-mode" value={m} checked={mode === m} onChange={() => setMode(m)} className="accent-green-700" />
                  <span className="text-sm capitalize font-medium">{m}</span>
                  <span className="text-[11px] text-gray-400">{m === "append" ? "— add to existing" : "— replace all existing ARBs"}</span>
                </label>
              ))}
            </div>
            {mode === "replace" && lh._count.arbs > 0 && (
              <p className="text-[12px] text-orange-600 mt-1.5">⚠ This will delete {lh._count.arbs} existing ARB{lh._count.arbs !== 1 ? "s" : ""} for this landholding.</p>
            )}
          </div>

          {/* ARB Rows */}
          <div className="mb-4">
            <label className="block text-[12px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Step 3 — Enter ARBs</label>
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-[13px]">
                <thead className="bg-green-900 text-white">
                  <tr>
                    <th className="px-2 py-2.5 text-center w-8">#</th>
                    <th className="px-2 py-2.5 text-left min-w-[160px]">ARB Name <span className="text-green-300">*</span></th>
                    <th className="px-2 py-2.5 text-left min-w-[110px]">ARB ID</th>
                    <th className="px-2 py-2.5 text-left min-w-[120px]">EP/CLOA No.</th>
                    <th className="px-2 py-2.5 text-left min-w-[120px]">CARPable <span className="text-green-300">*</span></th>
                    <th className="px-2 py-2.5 text-left min-w-[90px]">Area (has.) <span className="text-green-300">*</span></th>
                    <th className="px-2 py-2.5 text-left min-w-[120px]">Remarks</th>
                    <th className="px-2 py-2.5 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} className={`border-t border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                      <td className="px-2 py-1.5 text-center text-gray-400">{i + 1}</td>
                      {(["arb_name", "arb_no", "ep_cloa_no", "carpable", "area_allocated", "remarks"] as (keyof ArbRow)[]).map((field) => (
                        <td key={field} className="px-1 py-1">
                          {field === "carpable" ? (
                            <select
                              value={row.carpable}
                              onChange={(e) => updateRow(i, "carpable", e.target.value)}
                              className={`w-full border rounded px-2 py-1.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-green-600 bg-white ${!row.carpable ? "border-red-300 bg-red-50" : "border-gray-200"}`}
                            >
                              <option value="">—</option>
                              <option value="CARPABLE">CARPABLE</option>
                              <option value="NON-CARPABLE">NON-CARPABLE</option>
                            </select>
                          ) : (
                            <input
                              type="text"
                              value={row[field]}
                              onChange={(e) => updateRow(i, field, e.target.value)}
                              placeholder={field === "arb_name" ? "Required" : field === "area_allocated" ? "e.g. 0.5000 or 0.5000*" : ""}
                              className={`w-full border rounded px-2 py-1.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-green-600 ${
                                (field === "arb_name" && !row.arb_name.trim()) || (field === "area_allocated" && !row.area_allocated.trim()) ? "border-red-300 bg-red-50" : "border-gray-200"
                              }`}
                            />
                          )}
                        </td>
                      ))}
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
              {saving ? "Saving..." : `Save ${rows.filter(r => r.arb_name.trim() && r.carpable).length || ""} ARB${rows.filter(r => r.arb_name.trim() && r.carpable).length !== 1 ? "s" : ""}`}
            </button>
            <button onClick={reset} className="px-4 py-2.5 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── ARB Viewer ─── */
function ARBViewer({ refreshKey, isEditor }: { refreshKey: number; isEditor: boolean }) {
  const toast = useToast();
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
  const [confirmDelete, setConfirmDelete] = useState<{ arbId: number; seqno: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editingArb, setEditingArb] = useState<{ id: number; seqno: string; arb_name: string; arb_no: string; ep_cloa_no: string; carpable: string; area_allocated: string; remarks: string } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [addingArbSeqno, setAddingArbSeqno] = useState<string | null>(null);
  const [newArbRow, setNewArbRow] = useState<ArbRow>(emptyRow());
  const [savingNewArb, setSavingNewArb] = useState(false);
  const [newArbError, setNewArbError] = useState("");
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const limit = 30;

  async function handleExport() {
    setExporting(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (matchFilter) params.set("match", matchFilter);
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
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) params.set("search", search);
    if (matchFilter) params.set("match", matchFilter);
    const res = await fetch(`/api/arbs/list?${params}`);
    const data = await res.json();
    setLandholdings(data.landholdings ?? []);
    setTotal(data.total ?? 0);
    if (data.serviceCount !== undefined) setServiceCount(data.serviceCount);
    if (data.distinctCount !== undefined) setDistinctCount(data.distinctCount);
    if (data.nonCarpableCount !== undefined) setNonCarpableCount(data.nonCarpableCount);
    setLoading(false);
  }, [page, search, matchFilter, refreshKey]);

  useEffect(() => { fetchList(); }, [fetchList]);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => { setSearch(searchInput); setPage(1); }, 350);
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

  async function saveEdit() {
    if (!editingArb) return;
    if (!editingArb.carpable) { setEditError("CARPable/Non-CARPable is required."); return; }
    setEditError(""); setSavingEdit(true);
    const res = await fetch(`/api/arbs/item/${editingArb.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        arb_name: editingArb.arb_name,
        arb_no: editingArb.arb_no,
        ep_cloa_no: editingArb.ep_cloa_no,
        carpable: editingArb.carpable || null,
        area_allocated: editingArb.area_allocated,
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
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold text-gray-700">ARB Viewer</h3>
          <p className="text-[12px] text-gray-400 mt-0.5">{total.toLocaleString()} landholding{total !== 1 ? "s" : ""} with ARBs</p>
          <div className="flex flex-wrap gap-2 mt-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 border border-green-200">
              <span className="text-[11px] font-semibold text-green-600 uppercase tracking-wide">Service Count</span>
              <span className="text-[13px] font-bold text-green-800">{serviceCount !== null ? serviceCount.toLocaleString() : "—"}</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200">
              <span className="text-[11px] font-semibold text-blue-600 uppercase tracking-wide">Distinct Count</span>
              <span className="text-[13px] font-bold text-blue-800">{distinctCount !== null ? distinctCount.toLocaleString() : "—"}</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-50 border border-orange-200">
              <span className="text-[11px] font-semibold text-orange-600 uppercase tracking-wide">Non-CARPable Lots</span>
              <span className="text-[13px] font-bold text-orange-800">{nonCarpableCount !== null ? nonCarpableCount.toLocaleString() : "—"}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap justify-end">
          {/* Match filter pills */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {([["", "All"], ["matched", "✓ Matched"], ["mismatched", "✕ Mismatch"]] as const).map(([val, label]) => (
              <button
                key={val}
                onClick={() => { setMatchFilter(val); setPage(1); }}
                className={`px-3 py-1 rounded-md text-[12px] font-semibold transition-colors ${
                  matchFilter === val
                    ? val === "matched" ? "bg-emerald-600 text-white" : val === "mismatched" ? "bg-red-500 text-white" : "bg-white text-gray-700 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >{label}</button>
            ))}
          </div>

          <button
            onClick={handleExport}
            disabled={exporting || loading || total === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-[12px] font-semibold hover:bg-emerald-600 disabled:opacity-40 transition-colors whitespace-nowrap"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            {exporting ? "Exporting…" : `Export to Excel (${total.toLocaleString()})`}
          </button>
          <input type="text" placeholder="Search SEQNO, Landowner, CLNO..." value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-green-600"
          />
        </div>
      </div>

      {total === 0 && !loading ? (
        <div className="px-5 py-12 text-center text-gray-400 text-sm">No ARBs uploaded yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-green-900 text-white">
              <tr>
                <th className="px-3 py-2.5 text-left">SEQNO_DARRO</th>
                <th className="px-3 py-2.5 text-left">CLNO</th>
                <th className="px-3 py-2.5 text-left">Landowner</th>
                <th className="px-3 py-2.5 text-left">Province</th>
                <th className="px-3 py-2.5 text-right">Val. AMENDAREA</th>
                <th className="px-3 py-2.5 text-right">ARBs</th>
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
                      className={`border-t border-gray-100 cursor-pointer transition-colors border-l-4 ${
                        [
                          `border-l-green-700 ${isOpen ? "bg-green-50" : "bg-white hover:bg-green-50/50"}`,
                          `border-l-blue-600 ${isOpen ? "bg-blue-50" : "bg-white hover:bg-blue-50/50"}`,
                          `border-l-amber-500 ${isOpen ? "bg-amber-50" : "bg-white hover:bg-amber-50/50"}`,
                          `border-l-violet-600 ${isOpen ? "bg-violet-50" : "bg-white hover:bg-violet-50/50"}`,
                        ][i % 4]
                      }`}
                      onClick={() => toggleRow(lh.seqno_darro)}>
                      <td className="px-3 py-2 font-mono text-[13px] text-gray-700 whitespace-nowrap">{lh.seqno_darro}</td>
                      <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{lh.clno ?? "—"}</td>
                      <td className="px-3 py-2 text-gray-800 max-w-[200px] truncate">{lh.landowner ?? "—"}</td>
                      <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{lh.province_edited ?? "—"}</td>
                      <td className="px-3 py-2 text-right font-mono text-gray-700 whitespace-nowrap">{(lh.amendarea_validated ?? lh.amendarea)?.toFixed(4) ?? "—"}</td>
                      <td className="px-3 py-2 text-right">
                        <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[11px] font-semibold">{lh._count.arbs}</span>
                      </td>
                      <td className="px-3 py-2 text-center text-[12px] text-green-700 font-medium">
                        {isOpen ? "▲ Hide" : "▼ View"}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={7} className={`px-0 py-0 border-t border-l-4 ${
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
                                      <th className="px-3 py-2 text-left">CARPable</th>
                                      <th className="px-3 py-2 text-right">Area (has.)</th>
                                      <th className="px-3 py-2 text-left">Remarks</th>
                                      {isEditor && <th className="px-3 py-2 w-20" />}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {detail.arbs.map((arb, j) => {
                                      const isEditing = editingArb?.id === arb.id;
                                      return (
                                      <tr key={arb.id} className={`border-t border-green-100 ${isEditing ? "bg-yellow-50" : j % 2 === 0 ? "bg-white" : "bg-green-50"}`}>
                                        <td className="px-3 py-1.5 text-gray-400">{j + 1}</td>
                                        {isEditing ? (<>
                                          <td className="px-1 py-1">
                                            <input value={editingArb.arb_name} onChange={(e) => setEditingArb((p) => p && ({ ...p, arb_name: e.target.value.toUpperCase() }))}
                                              className="w-full border border-gray-300 rounded px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-green-600" />
                                          </td>
                                          <td className="px-1 py-1">
                                            <input value={editingArb.arb_no} onChange={(e) => setEditingArb((p) => p && ({ ...p, arb_no: e.target.value.toUpperCase() }))}
                                              className="w-full border border-gray-300 rounded px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-green-600" />
                                          </td>
                                          <td className="px-1 py-1">
                                            <input value={editingArb.ep_cloa_no} onChange={(e) => setEditingArb((p) => p && ({ ...p, ep_cloa_no: e.target.value.toUpperCase() }))}
                                              className="w-full border border-gray-300 rounded px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-green-600" />
                                          </td>
                                          <td className="px-1 py-1">
                                            <select value={editingArb.carpable} onChange={(e) => setEditingArb((p) => p && ({ ...p, carpable: e.target.value }))}
                                              className="w-full border border-gray-300 rounded px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-green-600 bg-white">
                                              <option value="">—</option>
                                              <option value="CARPABLE">CARPABLE</option>
                                              <option value="NON-CARPABLE">NON-CARPABLE</option>
                                            </select>
                                          </td>
                                          <td className="px-1 py-1">
                                            <input value={editingArb.area_allocated} onChange={(e) => setEditingArb((p) => p && ({ ...p, area_allocated: e.target.value }))}
                                              placeholder="e.g. 0.5000 or 0.5000*"
                                              className="w-full border border-gray-300 rounded px-2 py-1 text-[12px] font-mono focus:outline-none focus:ring-1 focus:ring-green-600" />
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
                                          <td className="px-3 py-1.5 text-gray-600">{arb.arb_no ?? "—"}</td>
                                          <td className="px-3 py-1.5 text-gray-600">{arb.ep_cloa_no ?? "—"}</td>
                                          <td className="px-3 py-1.5">{arb.carpable ? <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${arb.carpable === "CARPABLE" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>{arb.carpable}</span> : <span className="text-gray-300">—</span>}</td>
                                          <td className="px-3 py-1.5 text-right font-mono text-gray-700">{displayArea(arb.area_allocated)}</td>
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
                                            ) : (
                                              <span className="flex items-center justify-center gap-2">
                                                <button
                                                  onClick={(e) => { e.stopPropagation(); setEditError(""); setEditingArb({ id: arb.id, seqno: lh.seqno_darro, arb_name: arb.arb_name ?? "", arb_no: arb.arb_no ?? "", ep_cloa_no: arb.ep_cloa_no ?? "", carpable: arb.carpable ?? "", area_allocated: arb.area_allocated ?? "", remarks: arb.remarks ?? "" }); }}
                                                  className="text-gray-300 hover:text-green-600 transition-colors text-sm leading-none"
                                                  title="Edit ARB"
                                                >✎</button>
                                                <button
                                                  onClick={(e) => { e.stopPropagation(); setConfirmDelete({ arbId: arb.id, seqno: lh.seqno_darro }); }}
                                                  className="text-gray-300 hover:text-red-500 transition-colors text-base leading-none font-bold"
                                                  title="Delete ARB"
                                                >×</button>
                                              </span>
                                            )}
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
                                      return (
                                        <tr>
                                          <td colSpan={5} className="px-3 py-2 text-[12px] font-semibold text-gray-600">Total Area</td>
                                          <td className="px-3 py-2 text-right font-mono font-semibold text-gray-700">{totalArea.toFixed(4)}</td>
                                          <td colSpan={isEditor ? 2 : 1} className="px-3 py-2">
                                            {validatedArea == null
                                              ? <span className="text-gray-400 text-[11px]" />
                                              : match
                                              ? <span className="text-emerald-600 font-bold text-[13px]" title="Matches validated AMENDAREA">✓ Match <span className="font-normal text-[11px] text-gray-400">vs {validatedArea.toFixed(4)}</span></span>
                                              : <span className="flex items-center gap-2">{mismatchLabel && <MismatchBadge label={mismatchLabel} />}<span className="text-[11px] text-gray-400">vs {validatedArea.toFixed(4)}</span></span>}
                                          </td>
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
                                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 mb-2">
                                        <div>
                                          <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-0.5">ARB Name *</label>
                                          <input value={newArbRow.arb_name} onChange={(e) => setNewArbRow((p) => ({ ...p, arb_name: e.target.value.toUpperCase() }))} className="w-full border border-gray-300 rounded px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-green-600" />
                                        </div>
                                        <div>
                                          <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-0.5">ARB ID</label>
                                          <input value={newArbRow.arb_no} onChange={(e) => setNewArbRow((p) => ({ ...p, arb_no: e.target.value.toUpperCase() }))} className="w-full border border-gray-300 rounded px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-green-600" />
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
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="page-enter">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">ARB Upload & Viewer</h2>
          <p className="text-sm text-gray-500 mt-1">Upload or manually encode ARBs per Unclassified ARR (CCLOA), then view them below.</p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
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
          {/* Tabs */}
          <div className="flex border-b border-gray-200">
            {(["upload", "manual"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 ${tab === t ? "border-green-700 text-green-800" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                {t === "upload" ? "📂 Upload File" : "✏️ Manual Entry"}
              </button>
            ))}
          </div>
          <div className="p-5">
            {tab === "upload"
              ? <UploadFilePanel onSaved={() => setRefreshKey((k) => k + 1)} />
              : <ManualEntryPanel onSaved={() => setRefreshKey((k) => k + 1)} />}
          </div>
        </div>
      )}

      {/* Viewer */}
      <ARBViewer refreshKey={refreshKey} isEditor={isEditor} />
    </div>
  );
}
