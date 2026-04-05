"use client";

import { useState } from "react";

type BatchType = "status" | "amount" | "municipality" | "amendarea" | "remarks";

const TYPES: { value: BatchType; label: string; hint: string; placeholder: string; icon: string; activeGrad: string; activeShadow: string; inactiveBorder: string; inactiveText: string; inactiveHoverBg: string }[] = [
  {
    value: "status",
    label: "Record Status",
    hint: "Paste one SEQNO_DARRO per line (or comma-separated). You can copy a column directly from Excel.",
    placeholder: "R5-UC-04277\nR5-UC-06422\nR5-UC-02858",
    icon: "🏷️",
    activeGrad: "linear-gradient(135deg, #d97706 0%, #b45309 100%)",
    activeShadow: "0 4px 14px rgba(217,119,6,0.45)",
    inactiveBorder: "#fcd34d",
    inactiveText: "#92400e",
    inactiveHoverBg: "#fffbeb",
  },
  {
    value: "amount",
    label: "Condoned Amount",
    hint: "Format: SEQNO_DARRO → Tab → Amount. Copy two columns directly from Excel.",
    placeholder: "R5-UC-04277\t534058.11\nR5-UC-06422\t426471.19",
    icon: "₱",
    activeGrad: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
    activeShadow: "0 4px 14px rgba(37,99,235,0.45)",
    inactiveBorder: "#93c5fd",
    inactiveText: "#1e3a8a",
    inactiveHoverBg: "#eff6ff",
  },
  {
    value: "municipality",
    label: "Municipality & Barangay",
    hint: "Format: SEQNO_DARRO → Tab → Municipality → Tab → Barangay (Barangay is optional). Copy 2–3 columns from Excel.",
    placeholder: "R5-UC-04277\tLigornes\tSto. Niño\nR5-UC-06422\tBulusan",
    icon: "📍",
    activeGrad: "linear-gradient(135deg, #0d9488 0%, #0f766e 100%)",
    activeShadow: "0 4px 14px rgba(13,148,136,0.45)",
    inactiveBorder: "#5eead4",
    inactiveText: "#134e4a",
    inactiveHoverBg: "#f0fdfa",
  },
  {
    value: "amendarea",
    label: "Validated Area",
    hint: "Format: SEQNO_DARRO → Tab → Area (numeric, in hectares). Copy two columns from Excel.",
    placeholder: "R5-UC-04277\t1.2345\nR5-UC-06422\t0.8900",
    icon: "📐",
    activeGrad: "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)",
    activeShadow: "0 4px 14px rgba(124,58,237,0.45)",
    inactiveBorder: "#c4b5fd",
    inactiveText: "#4c1d95",
    inactiveHoverBg: "#f5f3ff",
  },
  {
    value: "remarks",
    label: "Remarks",
    hint: "Format: SEQNO_DARRO → Tab → Remark text. Copy two columns from Excel.",
    placeholder: "R5-UC-04277\tFor compliance review\nR5-UC-06422\tPending DAR clearance",
    icon: "📝",
    activeGrad: "linear-gradient(135deg, #db2777 0%, #be185d 100%)",
    activeShadow: "0 4px 14px rgba(219,39,119,0.45)",
    inactiveBorder: "#f9a8d4",
    inactiveText: "#831843",
    inactiveHoverBg: "#fdf2f8",
  },
];

const STATUSES = [
  { value: "Fully Distributed",         color: "bg-emerald-600 hover:bg-emerald-700" },
  { value: "Partially Distributed",     color: "bg-teal-600 hover:bg-teal-700" },
  { value: "Encoded",                   color: "bg-blue-600 hover:bg-blue-700" },
  { value: "For Encoding",              color: "bg-violet-600 hover:bg-violet-700" },
  { value: "For Further Validation",    color: "bg-amber-500 hover:bg-amber-600" },
  { value: "Not Eligible for Encoding", color: "bg-red-600 hover:bg-red-700" },
];

const NON_ELIGIBILITY_REASONS = [
  "UNDER CLASSIFIED ARR",
  "WITH CERTIFICATE OF FULL PAYMENT",
  "NO ISSUED TITLE",
  "AT ROD ON PROCESSING",
  "UNDER MANUAL REGISTRATION",
  "ALLEGEDLY SOLD",
  "CANCELLED TITLE",
  "FOR CANCELLATION OF TITLE",
  "FOR CANCELLATION OF ASP",
  "FOR DISQUALIFICATION OF ARB / ALI CASE",
  "CONVERTED TO CTITLE",
  "FOR REISSUANCE OF TITLE",
  "FOR RECONSTITUTION OF TITLE",
  "NON-CARPABLE",
  "NOT FOUND IN LRA SYSTEM",
  "WRONG PROVINCE",
  "FOR FURTHER RESEARCH (NO CONDONED AMOUNT)",
  "PROVISIONAL REGISTRATION",
  "TIMBERLAND PER PROJECTION",
  "WITH DEED OF SALE",
  "DETAILS DOES NOT MATCH vs. OTHER DOCS (ASP, CLOA, etc..)",
  "OCCUPIED BY ADVERSE CLAIMANTS",
  "DUPLICATE RECORD",
  "NO RECORD AT DAR AND ROD",
  "NO RECORD AT DAR AND ROD; WITH ISSUED CLT",
];

const STATUS_BADGE: Record<string, string> = {
  "Fully Distributed":         "bg-emerald-100 text-emerald-700",
  "Partially Distributed":     "bg-teal-100 text-teal-700",
  "Encoded":                   "bg-blue-100 text-blue-700",
  "For Encoding":              "bg-violet-100 text-violet-700",
  "For Further Validation":    "bg-amber-100 text-amber-700",
  "Not Eligible for Encoding": "bg-red-100 text-red-700",
};

function fmt(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-PH", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}
function fmtAmt(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type AnyRow = Record<string, unknown>;

export default function BatchPage() {
  const [type, setType]       = useState<BatchType>("status");
  const [input, setInput]     = useState("");
  const [preview, setPreview] = useState<AnyRow[] | null>(null);
  const [invalid, setInvalid] = useState<{ line: string; reason: string }[]>([]);
  const [notFound, setNotFound]               = useState<string[]>([]);
  const [outOfJurisdiction, setOutOfJurisdiction] = useState<string[]>([]);
  const [selectedStatus, setSelectedStatus]   = useState("");
  const [nonEligibilityReason, setNonEligibilityReason] = useState("");
  const [nonEligibilityOther, setNonEligibilityOther] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState<{ updated: number; notFound: string[]; outOfJurisdiction: string[]; appliedLabel?: string } | null>(null);
  const [error, setError]     = useState("");

  const cfg = TYPES.find((t) => t.value === type)!;
  const activeStatus = selectedStatus;

  function reset() {
    setInput(""); setPreview(null); setInvalid([]); setNotFound([]);
    setOutOfJurisdiction([]); setSelectedStatus(""); setNonEligibilityReason(""); setNonEligibilityOther("");
    setResult(null); setError("");
  }

  function switchType(t: BatchType) {
    setType(t); reset();
  }

  function parseSeqnos() {
    return input.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
  }

  async function handlePreview() {
    setError(""); setResult(null);
    const seqnos = type === "status" ? parseSeqnos() : null;
    if (type === "status" && (!seqnos || seqnos.length === 0)) { setError("Please enter at least one SEQNO_DARRO."); return; }
    if (type !== "status" && !input.trim()) { setError("Please enter data."); return; }

    setLoading(true);
    const body = type === "status" ? { type, seqnos } : { type, raw: input };
    const res = await fetch("/api/batch", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) { setError(data.error ?? "Request failed."); return; }

    setInvalid(data.invalid ?? []);
    setNotFound(data.notFound ?? []);
    setOutOfJurisdiction(data.outOfJurisdiction ?? []);

    // normalise preview rows from different response shapes
    if (type === "status") setPreview(data.records ?? []);
    else setPreview(data.rows ?? []);
  }

  const effectiveReason = nonEligibilityReason === "__other__" ? nonEligibilityOther.trim() : nonEligibilityReason;

  async function handleConfirm() {
    if (type === "status" && !activeStatus) { setError("Please select a status before confirming."); return; }
    if (type === "status" && activeStatus === "Not Eligible for Encoding" && !effectiveReason) {
      setError("Please select or enter a Reason for Non-Eligibility."); return;
    }
    setError(""); setLoading(true);

    const seqnos = preview!.map((r) => r.seqno_darro as string);
    const body: Record<string, unknown> = { type, seqnos };
    if (type === "status") {
      body.value = activeStatus;
      if (activeStatus === "Not Eligible for Encoding" && effectiveReason)
        body.nonEligibilityReason = effectiveReason;
    } else body.raw = input;

    const res = await fetch("/api/batch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) { setError(data.error ?? "Update failed."); return; }

    setResult({
      updated: data.updated,
      notFound: data.notFound ?? [],
      outOfJurisdiction: data.outOfJurisdiction ?? [],
      appliedLabel: type === "status" ? activeStatus : undefined,
    });
    setPreview(null); setInput(""); setSelectedStatus(""); setNonEligibilityReason(""); setNonEligibilityOther("");
  }

  const rowCount = type === "status"
    ? parseSeqnos().length
    : input.split("\n").filter((l) => l.trim()).length;

  return (
    <div className="max-w-4xl page-enter">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-[1.6rem] font-bold text-gray-900 leading-tight">Batch Update</h2>
        <p className="text-[12px] text-gray-400 mt-0.5 tracking-wide">
          Update multiple landholding records at once by pasting SEQNOs from Excel.
        </p>
      </div>

      {/* Type selector */}
      <div className="card-bezel mb-5">
        <div className="card-bezel-inner-open">
          <p className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-3">Select Field to Update</p>
          <div className="flex flex-wrap gap-2">
            {TYPES.map((t) => {
              const active = type === t.value;
              return (
                <button
                  key={t.value}
                  onClick={() => switchType(t.value)}
                  style={active
                    ? { background: t.activeGrad, boxShadow: t.activeShadow, border: "1px solid transparent", color: "#fff" }
                    : { background: "#fff", border: `1.5px solid ${t.inactiveBorder}`, color: t.inactiveText }
                  }
                  className="relative flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold transition-all duration-200 active:scale-[0.97] cursor-pointer"
                  onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = t.inactiveHoverBg; }}
                  onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = "#fff"; }}
                >
                  <span className="text-[15px] leading-none">{t.icon}</span>
                  <span>{t.label}</span>
                  {active && (
                    <span className="ml-1 w-1.5 h-1.5 rounded-full bg-white/70 inline-block" />
                  )}
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
              ✓ Successfully updated <strong>{result.updated.toLocaleString()}</strong> record{result.updated !== 1 ? "s" : ""}
              {result.appliedLabel ? <> — Status set to <strong>"{result.appliedLabel}"</strong></> : <> ({cfg.label})</>}.
            </p>
            {result.notFound.length > 0 && (
              <p className="text-sm text-yellow-700 mt-1">
                {result.notFound.length} SEQNO{result.notFound.length !== 1 ? "s" : ""} not found: {result.notFound.join(", ")}
              </p>
            )}
            {result.outOfJurisdiction.length > 0 && (
              <p className="text-sm text-orange-600 mt-1">
                {result.outOfJurisdiction.length} SEQNO{result.outOfJurisdiction.length !== 1 ? "s" : ""} outside your jurisdiction — skipped.
              </p>
            )}
            <button onClick={reset} className="mt-3 text-sm text-green-700 underline">
              Do another batch update
            </button>
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
                {type === "status" ? "Enter SEQNO_DARROs" : `Enter SEQNO_DARROs and ${cfg.label}`}
              </h3>
              <p className="text-[13px] text-gray-500 mb-3">{cfg.hint}</p>
              <textarea
                value={input}
                onChange={(e) => { setInput(e.target.value.toUpperCase()); setPreview(null); setResult(null); }}
                rows={8}
                placeholder={cfg.placeholder.toUpperCase()}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 font-mono text-[13px] focus:outline-none focus:ring-2 focus:ring-green-600 resize-y"
              />
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[12px] text-gray-400">
                  {rowCount} {type === "status" ? "SEQNO" : "row"}{rowCount !== 1 ? "s" : ""} entered
                </span>
                <button onClick={handlePreview} disabled={loading || !input.trim()} className="btn-primary">
                  {loading ? "Loading…" : <>Preview Records <span className="btn-icon-trail">→</span></>}
                </button>
              </div>
            </div>
          </div>

          {/* Parse errors */}
          {invalid.length > 0 && (
            <div className="card-bezel mb-4">
              <div className="card-bezel-inner-open bg-red-50">
                <p className="text-sm font-semibold text-red-700 mb-2">
                  {invalid.length} row{invalid.length !== 1 ? "s" : ""} with errors — will be skipped:
                </p>
                <ul className="space-y-1">
                  {invalid.map((r, i) => (
                    <li key={i} className="text-[13px] text-red-600 font-mono">
                      <span className="font-semibold">{r.line}</span>
                      <span className="text-red-400 ml-2 font-sans">← {r.reason}</span>
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
                  Preview — {preview.length} record{preview.length !== 1 ? "s" : ""} matched
                </h3>

                {outOfJurisdiction.length > 0 && (
                  <div className="mb-3 p-3 bg-orange-50 border border-orange-300 rounded-lg text-[13px] text-orange-700">
                    <strong>{outOfJurisdiction.length} SEQNO{outOfJurisdiction.length !== 1 ? "s" : ""} outside your jurisdiction — skipped:</strong>{" "}
                    {outOfJurisdiction.slice(0, 5).join(", ")}{outOfJurisdiction.length > 5 ? ` +${outOfJurisdiction.length - 5} more` : ""}
                  </div>
                )}
                {notFound.length > 0 && (
                  <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-[13px] text-yellow-700">
                    <strong>{notFound.length} SEQNO{notFound.length !== 1 ? "s" : ""} not found</strong> — will be skipped:{" "}
                    {notFound.join(", ")}
                  </div>
                )}

                {preview.length === 0 ? (
                  <p className="text-sm text-gray-400 italic mb-3">No valid records to update.</p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-gray-100 mb-4">
                    <table className="w-full text-[13px]">
                      <thead className="bg-green-900 text-white text-[11px] uppercase tracking-wide">
                        <tr>
                          <th className="px-3 py-2.5 text-left font-semibold">SEQNO_DARRO</th>
                          <th className="px-3 py-2.5 text-left font-semibold">CLNO</th>
                          <th className="px-3 py-2.5 text-left font-semibold">Landowner</th>
                          <th className="px-3 py-2.5 text-left font-semibold">Province</th>
                          {type === "status" && <>
                            <th className="px-3 py-2.5 text-left font-semibold">Current Status</th>
                            <th className="px-3 py-2.5 text-left font-semibold">Flag</th>
                          </>}
                          {type === "amount" && <>
                            <th className="px-3 py-2.5 text-right font-semibold">Current Amount</th>
                            <th className="px-3 py-2.5 text-right font-semibold">New Amount</th>
                            <th className="px-3 py-2.5 text-right font-semibold">Diff</th>
                          </>}
                          {type === "municipality" && <>
                            <th className="px-3 py-2.5 text-left font-semibold">Current Municipality</th>
                            <th className="px-3 py-2.5 text-left font-semibold">Current Barangay</th>
                            <th className="px-3 py-2.5 text-left font-semibold">New Municipality</th>
                            <th className="px-3 py-2.5 text-left font-semibold">New Barangay</th>
                          </>}
                          {type === "amendarea" && <>
                            <th className="px-3 py-2.5 text-right font-semibold">Current Area (ha)</th>
                            <th className="px-3 py-2.5 text-right font-semibold">New Area (ha)</th>
                            <th className="px-3 py-2.5 text-right font-semibold">Diff</th>
                          </>}
                          {type === "remarks" && <>
                            <th className="px-3 py-2.5 text-left font-semibold">Current Remarks</th>
                            <th className="px-3 py-2.5 text-left font-semibold">New Remarks</th>
                          </>}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.map((r, i) => (
                          <tr key={r.seqno_darro as string} className={`border-t border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                            <td className="px-3 py-2 font-mono text-gray-700 whitespace-nowrap">{r.seqno_darro as string}</td>
                            <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{(r.clno as string) ?? "—"}</td>
                            <td className="px-3 py-2 text-gray-800 max-w-[160px] truncate">{(r.landowner as string) ?? "—"}</td>
                            <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{(r.province_edited as string) ?? "—"}</td>
                            {type === "status" && <>
                              <td className="px-3 py-2">
                                <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${STATUS_BADGE[r.status as string ?? ""] ?? "bg-gray-100 text-gray-500"}`}>
                                  {(r.status as string) ?? "For Further Validation"}
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                {r.data_flags ? <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-red-100 text-red-700">{(r.data_flags as string).includes(";") ? "Both Neg." : (r.data_flags as string).replace("Negative ", "Neg. ")}</span> : null}
                              </td>
                            </>}
                            {type === "amount" && (() => {
                              const diff = (r.new_value as number) - ((r.old_value as number) ?? 0);
                              return <>
                                <td className="px-3 py-2 text-right font-mono text-gray-500 whitespace-nowrap">{fmtAmt(r.old_value as number)}</td>
                                <td className="px-3 py-2 text-right font-mono font-semibold text-green-700 whitespace-nowrap">{fmtAmt(r.new_value as number)}</td>
                                <td className={`px-3 py-2 text-right font-mono whitespace-nowrap ${diff >= 0 ? "text-blue-600" : "text-red-500"}`}>{diff >= 0 ? "+" : ""}{fmtAmt(diff)}</td>
                              </>;
                            })()}
                            {type === "municipality" && <>
                              <td className="px-3 py-2 text-gray-500">{(r.old_municipality as string) ?? "—"}</td>
                              <td className="px-3 py-2 text-gray-500">{(r.old_barangay as string) ?? "—"}</td>
                              <td className="px-3 py-2 font-semibold text-green-700">{(r.new_municipality as string) ?? "—"}</td>
                              <td className="px-3 py-2 font-semibold text-green-700">{r.new_barangay !== undefined && r.new_barangay !== null ? (r.new_barangay as string) || "—" : <span className="text-gray-300 italic text-[11px]">unchanged</span>}</td>
                            </>}
                            {type === "amendarea" && (() => {
                              const diff = (r.new_value as number) - ((r.old_value as number) ?? 0);
                              return <>
                                <td className="px-3 py-2 text-right font-mono text-gray-500 whitespace-nowrap">{fmt(r.old_value as number)}</td>
                                <td className="px-3 py-2 text-right font-mono font-semibold text-green-700 whitespace-nowrap">{fmt(r.new_value as number)}</td>
                                <td className={`px-3 py-2 text-right font-mono whitespace-nowrap ${diff >= 0 ? "text-blue-600" : "text-red-500"}`}>{diff >= 0 ? "+" : ""}{fmt(diff)}</td>
                              </>;
                            })()}
                            {type === "remarks" && <>
                              <td className="px-3 py-2 text-gray-500 max-w-[180px] truncate">{(r.old_value as string) ?? "—"}</td>
                              <td className="px-3 py-2 font-semibold text-green-700 max-w-[200px] truncate">{(r.new_value as string) ?? "—"}</td>
                            </>}
                          </tr>
                        ))}
                      </tbody>
                      {/* Amount totals footer */}
                      {type === "amount" && preview.length > 1 && (
                        <tfoot className="border-t-2 border-gray-200 bg-gray-50 text-[12px]">
                          <tr>
                            <td colSpan={4} className="px-3 py-2 font-semibold text-gray-600">Total</td>
                            <td className="px-3 py-2 text-right font-mono font-semibold text-gray-600">{fmtAmt(preview.reduce((s, r) => s + ((r.old_value as number) ?? 0), 0))}</td>
                            <td className="px-3 py-2 text-right font-mono font-semibold text-green-700">{fmtAmt(preview.reduce((s, r) => s + (r.new_value as number), 0))}</td>
                            <td className="px-3 py-2 text-right font-mono font-semibold text-blue-600">{(() => { const d = preview.reduce((s, r) => s + ((r.new_value as number) - ((r.old_value as number) ?? 0)), 0); return `${d >= 0 ? "+" : ""}${fmtAmt(d)}`; })()}</td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                )}

                {/* ── Step 3: Status picker (status type only) ── */}
                {type === "status" && preview.length > 0 && (
                  <>
                    <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-green-900 text-white flex items-center justify-center text-[11px] font-bold">3</span>
                      Set New Status & Confirm
                    </h3>
                    <p className="text-[12px] text-gray-400 mb-2 uppercase tracking-wide font-semibold">Quick select</p>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {STATUSES.map((s) => (
                        <button key={s.value} onClick={() => setSelectedStatus(s.value)}
                          className={`px-4 py-1.5 rounded-full text-[12px] font-semibold text-white transition-all duration-150 [transition-timing-function:cubic-bezier(0.32,0.72,0,1)] active:scale-[0.96] ${s.color} ${selectedStatus === s.value ? "ring-2 ring-offset-2 ring-gray-400 shadow-md opacity-100" : "opacity-65 hover:opacity-90"}`}>
                          {s.value}
                        </button>
                      ))}
                    </div>
                    {activeStatus === "Not Eligible for Encoding" && (
                      <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl">
                        <label className="block text-[11px] uppercase tracking-widest font-bold text-red-600 mb-2">
                          Reason for Non-Eligibility <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={nonEligibilityReason}
                          onChange={(e) => { setNonEligibilityReason(e.target.value); setNonEligibilityOther(""); }}
                          className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 mb-2 ${nonEligibilityReason ? "border-red-300 bg-white" : "border-red-300 bg-white"}`}
                        >
                          <option value="">— Select a reason —</option>
                          {NON_ELIGIBILITY_REASONS.map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                          <option value="__other__">Other (specify below)…</option>
                        </select>
                        {nonEligibilityReason === "__other__" && (
                          <input
                            type="text"
                            value={nonEligibilityOther}
                            onChange={(e) => setNonEligibilityOther(e.target.value)}
                            placeholder="Type the reason…"
                            className="w-full border border-red-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                          />
                        )}
                        {effectiveReason && (
                          <p className="mt-2 text-[12px] text-red-700 font-medium">Reason: <strong>{effectiveReason}</strong></p>
                        )}
                      </div>
                    )}
                    {activeStatus && (
                      <div className="p-3 bg-green-50 border border-green-200 rounded-lg mb-4 text-[13px] text-green-800">
                        This will set <strong>{preview.length} record{preview.length !== 1 ? "s" : ""}</strong> to <strong>"{activeStatus}"</strong>
                        {activeStatus === "Not Eligible for Encoding" && effectiveReason && (
                          <> with reason: <strong>"{effectiveReason}"</strong></>
                        )}
                        . This action is logged.
                      </div>
                    )}
                  </>
                )}

                {/* Confirm / Cancel */}
                {preview.length > 0 && (
                  <>
                    {type !== "status" && (
                      <div className="p-3 bg-green-50 border border-green-200 rounded-lg mb-4 text-[13px] text-green-800">
                        This will update <strong>{cfg.label}</strong> for <strong>{preview.length} record{preview.length !== 1 ? "s" : ""}</strong>. This action is logged.
                      </div>
                    )}
                    {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
                    <div className="flex gap-3">
                      <button
                        onClick={handleConfirm}
                        disabled={loading || (type === "status" && (!activeStatus || (activeStatus === "Not Eligible for Encoding" && !effectiveReason)))}
                        className="btn-primary"
                      >
                        {loading ? "Updating…" : <>Confirm — Update {preview.length} Record{preview.length !== 1 ? "s" : ""} <span className="btn-icon-trail">✓</span></>}
                      </button>
                      <button onClick={reset} className="btn-ghost">Cancel</button>
                    </div>
                  </>
                )}

                {preview.length === 0 && (
                  <button onClick={reset} className="btn-ghost">Start over</button>
                )}
              </div>
            </div>
          )}

          {error && !preview && <p className="text-sm text-red-600 mt-2">{error}</p>}
        </>
      )}
    </div>
  );
}
