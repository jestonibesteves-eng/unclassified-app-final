"use client";

import { useState } from "react";

const STATUSES = [
  { value: "Fully Distributed",         color: "bg-emerald-600 hover:bg-emerald-700" },
  { value: "Partially Distributed",     color: "bg-teal-600 hover:bg-teal-700" },
  { value: "Encoded",                   color: "bg-blue-600 hover:bg-blue-700" },
  { value: "For Encoding",              color: "bg-violet-600 hover:bg-violet-700" },
  { value: "For Further Validation",    color: "bg-amber-500 hover:bg-amber-600" },
  { value: "Not Eligible for Encoding", color: "bg-red-600 hover:bg-red-700" },
];

type PreviewRecord = {
  seqno_darro: string;
  landowner: string | null;
  province_edited: string | null;
  clno: string | null;
  status: string | null;
  data_flags: string | null;
};

type Result = { updated: number; skipped: string[]; appliedStatus: string } | null;

export default function BatchStatusPage() {
  const [input, setInput] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [customStatus, setCustomStatus] = useState("");
  const [preview, setPreview] = useState<PreviewRecord[] | null>(null);
  const [notFound, setNotFound] = useState<string[]>([]);
  const [outOfJurisdiction, setOutOfJurisdiction] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const [error, setError] = useState("");

  const activeStatus = customStatus.trim() || selectedStatus;

  function parseSeqnos() {
    return input
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async function handlePreview() {
    setError("");
    setResult(null);
    const seqnos = parseSeqnos();
    if (seqnos.length === 0) { setError("Please enter at least one SEQNO_DARRO."); return; }

    setLoading(true);
    const res = await fetch("/api/batch/status", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seqnos }),
    });
    const data = await res.json();
    setPreview(data.records);
    setNotFound(data.notFound ?? []);
    setOutOfJurisdiction(data.outOfJurisdiction ?? []);
    setLoading(false);
  }

  async function handleConfirm() {
    if (!activeStatus) { setError("Please select or type a status before confirming."); return; }
    setError("");
    setLoading(true);

    const seqnos = preview!.map((r) => r.seqno_darro);
    const res = await fetch("/api/batch/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seqnos, status: activeStatus }),
    });
    const data = await res.json();

    if (!res.ok) { setError(data.error); setLoading(false); return; }

    setResult({ ...data, appliedStatus: activeStatus });
    setPreview(null);
    setInput("");
    setSelectedStatus("");
    setCustomStatus("");
    setLoading(false);
  }

  function handleReset() {
    setInput("");
    setSelectedStatus("");
    setCustomStatus("");
    setPreview(null);
    setNotFound([]);
    setOutOfJurisdiction([]);
    setResult(null);
    setError("");
  }

  const statusBadgeColor: Record<string, string> = {
    "Fully Distributed":         "bg-emerald-100 text-emerald-700",
    "Partially Distributed":     "bg-teal-100 text-teal-700",
    "Encoded":                   "bg-blue-100 text-blue-700",
    "For Encoding":              "bg-violet-100 text-violet-700",
    "For Further Validation":    "bg-amber-100 text-amber-700",
    "Not Eligible for Encoding": "bg-red-100 text-red-700",
  };

  return (
    <div className="max-w-4xl page-enter">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Batch Status Update</h2>
        <p className="text-sm text-gray-500 mt-1">
          Paste multiple SEQNO_DARROs to update their status in one click.
        </p>
      </div>

      {/* Success result */}
      {result && (
        <div className="card-bezel mb-6">
        <div className="card-bezel-inner-open bg-green-50">
          <p className="font-semibold text-green-800 text-sm">
            ✓ Successfully updated {result.updated.toLocaleString()} record{result.updated !== 1 ? "s" : ""} to <strong>"{result.appliedStatus}"</strong>.
          </p>
          {result.skipped.length > 0 && (
            <p className="text-sm text-yellow-700 mt-1">
              {result.skipped.length} SEQNO{result.skipped.length !== 1 ? "s" : ""} not found: {result.skipped.join(", ")}
            </p>
          )}
          <button onClick={handleReset} className="mt-3 text-sm text-green-700 underline">
            Do another batch update
          </button>
        </div>
        </div>
      )}

      {!result && (
        <>
          {/* Step 1 — Input */}
          <div className="card-bezel mb-4">
          <div className="card-bezel-inner-open">
            <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-green-900 text-white flex items-center justify-center text-[11px] font-bold">1</span>
              Enter SEQNO_DARROs
            </h3>
            <p className="text-[13px] text-gray-500 mb-3">
              Paste or type one SEQNO per line (or comma-separated). You can copy directly from Excel.
            </p>
            <textarea
              value={input}
              onChange={(e) => { setInput(e.target.value.toUpperCase()); setPreview(null); setResult(null); }}
              rows={8}
              placeholder={"R5-UC-04277\nR5-UC-06422\nR5-UC-02858\n..."}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 font-mono text-[13px] focus:outline-none focus:ring-2 focus:ring-green-600 resize-y"
            />
            <div className="mt-3 flex items-center justify-between">
              <span className="text-[12px] text-gray-400">
                {parseSeqnos().length} SEQNO{parseSeqnos().length !== 1 ? "s" : ""} entered
              </span>
              <button
                onClick={handlePreview}
                disabled={loading || !input.trim()}
                className="btn-primary"
              >
                {loading ? "Loading..." : <>Preview Records <span className="btn-icon-trail">→</span></>}
              </button>
            </div>
          </div>
          </div>

          {/* Step 2 — Preview */}
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
                  <strong>{notFound.length} SEQNO{notFound.length !== 1 ? "s" : ""} not found</strong> and will be skipped:{" "}
                  {notFound.join(", ")}
                </div>
              )}

              <div className="overflow-x-auto rounded-lg border border-gray-100 mb-4">
                <table className="w-full">
                  <thead className="bg-green-900 text-white">
                    <tr>
                      <th className="px-3 py-2.5 text-left">SEQNO_DARRO</th>
                      <th className="px-3 py-2.5 text-left">CLNO</th>
                      <th className="px-3 py-2.5 text-left">Landowner</th>
                      <th className="px-3 py-2.5 text-left">Province</th>
                      <th className="px-3 py-2.5 text-left">Current Status</th>
                      <th className="px-3 py-2.5 text-left">Flag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((r, i) => (
                      <tr key={r.seqno_darro} className={`border-t border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                        <td className="px-3 py-2 font-mono text-[13px] text-gray-700">{r.seqno_darro}</td>
                        <td className="px-3 py-2 text-gray-600">{r.clno ?? "—"}</td>
                        <td className="px-3 py-2 text-gray-800 max-w-[180px] truncate">{r.landowner ?? "—"}</td>
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.province_edited ?? "—"}</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${statusBadgeColor[r.status ?? "For Initial Validation"] ?? "bg-gray-100 text-gray-500"}`}>
                            {r.status ?? "For Initial Validation"}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {r.data_flags && (
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-red-100 text-red-700">
                              {r.data_flags.includes(";") ? "Both Negative" : r.data_flags.replace("Negative ", "Neg. ")}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Step 3 — Select Status & Confirm (only shown when there are actionable records) */}
              {preview.length > 0 && (<>
                <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-green-900 text-white flex items-center justify-center text-[11px] font-bold">3</span>
                  Set New Status & Confirm
                </h3>

                <p className="text-[12px] text-gray-400 mb-2 uppercase tracking-wide font-semibold">Quick select</p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {STATUSES.map((s) => (
                    <button
                      key={s.value}
                      onClick={() => { setSelectedStatus(s.value); setCustomStatus(""); }}
                      className={`px-4 py-1.5 rounded-full text-[12px] font-semibold text-white transition-all duration-150 [transition-timing-function:cubic-bezier(0.32,0.72,0,1)] active:scale-[0.96] ${s.color} ${
                        selectedStatus === s.value && !customStatus.trim() ? "ring-2 ring-offset-2 ring-gray-400 shadow-md opacity-100" : "opacity-65 hover:opacity-90"
                      }`}
                    >
                      {s.value}
                    </button>
                  ))}
                </div>

                <p className="text-[12px] text-gray-400 mb-2 uppercase tracking-wide font-semibold">Or type a custom status</p>
                <input
                  type="text"
                  value={customStatus}
                  onChange={(e) => { setCustomStatus(e.target.value); setSelectedStatus(""); }}
                  placeholder="e.g. Pending EP Issuance, For CLOA Cancellation..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 mb-4"
                />

                {activeStatus && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg mb-4 text-[13px] text-green-800">
                    This will set <strong>{preview.length} record{preview.length !== 1 ? "s" : ""}</strong> to{" "}
                    <strong>"{activeStatus}"</strong>. This action is logged.
                  </div>
                )}

                {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

                <div className="flex gap-3">
                  <button
                    onClick={handleConfirm}
                    disabled={!activeStatus || loading}
                    className="btn-primary"
                  >
                    {loading ? "Updating..." : <>Confirm — Update {preview.length} Record{preview.length !== 1 ? "s" : ""} <span className="btn-icon-trail">✓</span></>}
                  </button>
                  <button onClick={handleReset} className="btn-ghost">
                    Cancel
                  </button>
                </div>
              </>)}

              {preview.length === 0 && (
                <div className="mt-2">
                  <button onClick={handleReset} className="btn-ghost">
                    Start over
                  </button>
                </div>
              )}
            </div>
            </div>
          )}

          {error && !preview && (
            <p className="text-sm text-red-600 mt-2">{error}</p>
          )}
        </>
      )}
    </div>
  );
}
