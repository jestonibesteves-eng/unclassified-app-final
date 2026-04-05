"use client";

import { useState } from "react";

type PreviewRow = {
  seqno_darro: string;
  landowner: string | null;
  province_edited: string | null;
  clno: string | null;
  old_amount: number | null;
  new_amount: number;
};

type InvalidRow = { line: string; reason: string };
type Result = { updated: number; notFound: string[]; invalid: InvalidRow[] } | null;

function fmt(n: number | null) {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function BatchAmountPage() {
  const [input, setInput] = useState("");
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [invalid, setInvalid] = useState<InvalidRow[]>([]);
  const [notFound, setNotFound] = useState<string[]>([]);
  const [outOfJurisdiction, setOutOfJurisdiction] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const [error, setError] = useState("");

  const lineCount = input.split("\n").filter((l) => l.trim()).length;

  async function handlePreview() {
    setError("");
    setResult(null);
    if (!input.trim()) { setError("Please enter at least one row."); return; }

    setLoading(true);
    const res = await fetch("/api/batch/amount", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw: input }),
    });
    const data = await res.json();
    setPreview(data.rows);
    setInvalid(data.invalid ?? []);
    setNotFound(data.notFound ?? []);
    setOutOfJurisdiction(data.outOfJurisdiction ?? []);
    setLoading(false);
  }

  async function handleConfirm() {
    setError("");
    setLoading(true);
    const res = await fetch("/api/batch/amount", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw: input }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error); setLoading(false); return; }
    setResult(data);
    setPreview(null);
    setInput("");
    setLoading(false);
  }

  function handleReset() {
    setInput("");
    setPreview(null);
    setInvalid([]);
    setNotFound([]);
    setOutOfJurisdiction([]);
    setResult(null);
    setError("");
  }

  return (
    <div className="max-w-4xl page-enter">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Batch Amount Update</h2>
        <p className="text-sm text-gray-500 mt-1">
          Paste rows in the format <code className="bg-gray-100 px-1.5 py-0.5 rounded text-[12px] font-mono">SEQNO_DARRO &lt;space&gt; Amount</code> to update Condoned Amounts in bulk.
        </p>
      </div>

      {/* Success */}
      {result && (
        <div className="card-bezel mb-6">
        <div className="card-bezel-inner-open bg-green-50">
          <p className="font-semibold text-green-800 text-sm">
            ✓ Successfully updated <strong>{result.updated.toLocaleString()}</strong> condoned amount{result.updated !== 1 ? "s" : ""}.
          </p>
          {result.notFound.length > 0 && (
            <p className="text-sm text-orange-600 mt-1">
              {result.notFound.length} SEQNO{result.notFound.length !== 1 ? "s" : ""} not found: {result.notFound.join(", ")}
            </p>
          )}
          {result.invalid.length > 0 && (
            <p className="text-sm text-red-600 mt-1">
              {result.invalid.length} row{result.invalid.length !== 1 ? "s" : ""} skipped due to parse errors.
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
              Paste SEQNO_DARRO and Amount
            </h3>
            <p className="text-[13px] text-gray-500 mb-1">
              One entry per line. Separate SEQNO and amount with a space. You can copy two columns directly from Excel.
            </p>
            <p className="text-[12px] text-gray-400 font-mono mb-3">
              R5-UC-04277 534058.11<br />
              R5-UC-06422 426471.19<br />
              R5-UC-02858 60486.19
            </p>
            <textarea
              value={input}
              onChange={(e) => { setInput(e.target.value.toUpperCase()); setPreview(null); setResult(null); }}
              rows={10}
              placeholder={"R5-UC-04277 534058.11\nR5-UC-06422 426471.19\n..."}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 font-mono text-[13px] focus:outline-none focus:ring-2 focus:ring-green-600 resize-y"
            />
            <div className="mt-3 flex items-center justify-between">
              <span className="text-[12px] text-gray-400">
                {lineCount} row{lineCount !== 1 ? "s" : ""} entered
              </span>
              <button
                onClick={handlePreview}
                disabled={loading || !input.trim()}
                className="btn-primary"
              >
                {loading ? "Loading..." : <><span>Preview Changes</span><span className="btn-icon-trail">→</span></>}
              </button>
            </div>
          </div>
          </div>

          {/* Parse errors */}
          {invalid.length > 0 && (
            <div className="card-bezel mb-4">
            <div className="card-bezel-inner-open bg-red-50">
              <p className="text-sm font-semibold text-red-700 mb-2">
                {invalid.length} row{invalid.length !== 1 ? "s" : ""} with parse errors — will be skipped:
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

          {/* Step 2 — Preview */}
          {preview && (
            <div className="card-bezel mb-4">
            <div className="card-bezel-inner-open">
              <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-green-900 text-white flex items-center justify-center text-[11px] font-bold">2</span>
                Preview — {preview.length} record{preview.length !== 1 ? "s" : ""} will be updated
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

              {preview.length === 0 ? (
                <p className="text-sm text-gray-400 italic">No valid records to update.</p>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-lg border border-gray-100 mb-4">
                    <table className="w-full">
                      <thead className="bg-green-900 text-white">
                        <tr>
                          <th className="px-3 py-2.5 text-left">SEQNO_DARRO</th>
                          <th className="px-3 py-2.5 text-left">CLNO</th>
                          <th className="px-3 py-2.5 text-left">Landowner</th>
                          <th className="px-3 py-2.5 text-left">Province</th>
                          <th className="px-3 py-2.5 text-right">Current Amount</th>
                          <th className="px-3 py-2.5 text-right">New Amount</th>
                          <th className="px-3 py-2.5 text-right">Difference</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.map((r, i) => {
                          const diff = r.new_amount - (r.old_amount ?? 0);
                          return (
                            <tr key={r.seqno_darro} className={`border-t border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                              <td className="px-3 py-2 font-mono text-[13px] text-gray-700 whitespace-nowrap">{r.seqno_darro}</td>
                              <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.clno ?? "—"}</td>
                              <td className="px-3 py-2 text-gray-800 max-w-[160px] truncate">{r.landowner ?? "—"}</td>
                              <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.province_edited ?? "—"}</td>
                              <td className="px-3 py-2 text-right font-mono text-gray-500 whitespace-nowrap">{fmt(r.old_amount)}</td>
                              <td className="px-3 py-2 text-right font-mono font-semibold text-green-700 whitespace-nowrap">{fmt(r.new_amount)}</td>
                              <td className={`px-3 py-2 text-right font-mono whitespace-nowrap ${diff >= 0 ? "text-blue-600" : "text-red-600"}`}>
                                {diff >= 0 ? "+" : ""}{fmt(diff)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                        <tr>
                          <td colSpan={4} className="px-3 py-2 text-sm font-semibold text-gray-600">Total</td>
                          <td className="px-3 py-2 text-right font-mono font-semibold text-gray-600">
                            {fmt(preview.reduce((s, r) => s + (r.old_amount ?? 0), 0))}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-semibold text-green-700">
                            {fmt(preview.reduce((s, r) => s + r.new_amount, 0))}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-semibold text-blue-600">
                            {(() => {
                              const d = preview.reduce((s, r) => s + (r.new_amount - (r.old_amount ?? 0)), 0);
                              return `${d >= 0 ? "+" : ""}${fmt(d)}`;
                            })()}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg mb-4 text-[13px] text-green-800">
                    This will update the Condoned Amount of <strong>{preview.length} record{preview.length !== 1 ? "s" : ""}</strong>. This action is logged and cannot be automatically undone.
                  </div>

                  {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

                  <div className="flex gap-3">
                    <button onClick={handleConfirm} disabled={loading} className="btn-primary">
                      {loading ? "Updating..." : <>Confirm — Update {preview.length} Record{preview.length !== 1 ? "s" : ""} <span className="btn-icon-trail">✓</span></>}
                    </button>
                    <button onClick={handleReset} className="btn-ghost">
                      Cancel
                    </button>
                  </div>
                </>
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
