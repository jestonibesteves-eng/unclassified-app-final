// app/admin/unconfirm/page.tsx
"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useUser } from "@/components/UserContext";
import { useToast } from "@/components/Toast";

type UnconfirmType = "area" | "amount" | "both";

type PreviewRow = {
  seqno_darro: string;
  landowner: string | null;
  province: string | null;
  clno: string | null;
  area_confirmed: boolean;
  amount_confirmed: boolean;
  action: "unconfirm" | "skip";
  reason: string | null;
};

type DoneResult = {
  updated: number;
  skipped: { seqno_darro: string; reason: string }[];
};

const MODES: { value: UnconfirmType; label: string; desc: string }[] = [
  { value: "area",   label: "Area Only",   desc: "Clear Validated AMENDAREA confirmation" },
  { value: "amount", label: "Amount Only",  desc: "Clear Validated Condoned Amount confirmation" },
  { value: "both",   label: "Both",         desc: "Clear both Area & Amount confirmations" },
];

export default function BatchUnconfirmPage() {
  const { user } = useUser();
  const toast = useToast();
  const isSuperAdmin = user?.role === "super_admin";

  const [type, setType]               = useState<UnconfirmType>("both");
  const [input, setInput]             = useState("");
  const [loading, setLoading]         = useState(false);
  const [preview, setPreview]         = useState<PreviewRow[] | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [result, setResult]           = useState<DoneResult | null>(null);
  const [showSkipped, setShowSkipped] = useState(false);

  const seqnos = input
    .split("\n")
    .map((l) => l.trim().toUpperCase())
    .filter(Boolean);

  const toUnconfirm = preview?.filter((r) => r.action === "unconfirm") ?? [];
  const toSkip      = preview?.filter((r) => r.action === "skip")      ?? [];

  async function handlePreview() {
    setLoading(true);
    setPreview(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/batch-unconfirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seqnos, type, preview: true }),
      });
      const data = await res.json() as { rows?: PreviewRow[]; error?: string };
      if (!res.ok) { toast(data.error ?? "Preview failed.", "error"); return; }
      setPreview(data.rows ?? []);
    } catch {
      toast("Server did not respond.", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleExecute() {
    setShowConfirm(false);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/batch-unconfirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seqnos, type }),
      });
      const data = await res.json() as DoneResult & { error?: string };
      if (!res.ok) { toast(data.error ?? "Unconfirm failed.", "error"); return; }
      setResult(data);
      setPreview(null);
      setInput("");
    } catch {
      toast("Server did not respond.", "error");
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setResult(null);
    setPreview(null);
    setInput("");
    setShowSkipped(false);
  }

  // Loading state — user not yet resolved
  if (!user) return null;

  // Access guard
  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p className="text-sm text-gray-500">You do not have permission to access this page.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Batch Unconfirm</h1>
        <p className="text-sm text-gray-500 mt-1">
          Clear validated area / amount confirmation flags and recompute status for multiple landholdings at once.
          Superadmin only.
        </p>
      </div>

      {/* Mode selector */}
      <div className="card-bezel">
        <div className="card-bezel-inner-open p-4 space-y-3">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">What to unconfirm</p>
          <div className="flex gap-2 flex-wrap">
            {MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => { setType(m.value); setPreview(null); setResult(null); }}
                className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${
                  type === m.value
                    ? "bg-green-800 text-white border-green-800"
                    : "bg-white text-gray-600 border-gray-300 hover:border-green-700 hover:text-green-800"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400">{MODES.find((m) => m.value === type)?.desc}</p>
        </div>
      </div>

      {/* Input panel — hidden after a successful execute */}
      {!result && (
        <div className="card-bezel">
          <div className="card-bezel-inner-open p-4 space-y-3">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">
              Paste SEQNOs — one per line
            </p>
            <textarea
              value={input}
              onChange={(e) => { setInput(e.target.value); setPreview(null); }}
              rows={10}
              placeholder={"R5-UC-00001\nR5-UC-00002\nR5-UC-00003"}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-600 resize-y"
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400">
                {seqnos.length} SEQNO{seqnos.length !== 1 ? "s" : ""} entered
              </p>
              <button
                onClick={handlePreview}
                disabled={seqnos.length === 0 || loading}
                className="px-4 py-2 bg-green-800 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-40 transition-colors"
              >
                {loading ? "Loading…" : "Preview"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview table */}
      {preview && !result && (
        <div className="card-bezel">
          <div className="card-bezel-inner-open">
            {/* Summary bar */}
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
              <p className="text-sm text-gray-700">
                <span className="font-semibold text-green-700">{toUnconfirm.length} will be unconfirmed</span>
                {toSkip.length > 0 && (
                  <span className="text-gray-400 ml-2">
                    · {toSkip.length} already unconfirmed (skip)
                  </span>
                )}
              </p>
              <button
                onClick={() => setShowConfirm(true)}
                disabled={toUnconfirm.length === 0 || loading}
                className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-40 transition-colors"
              >
                Unconfirm {toUnconfirm.length} Records
              </button>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">SEQNO</th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Landowner</th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Province</th>
                    <th className="px-3 py-2 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Area ✓</th>
                    <th className="px-3 py-2 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Amt ✓</th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {preview.map((row) => (
                    <tr
                      key={row.seqno_darro}
                      className={row.action === "unconfirm" ? "bg-green-50/60" : "opacity-50"}
                    >
                      <td className="px-3 py-2 font-mono font-semibold text-gray-800">{row.seqno_darro}</td>
                      <td className="px-3 py-2 text-gray-600 max-w-[180px] truncate">{row.landowner ?? "—"}</td>
                      <td className="px-3 py-2 text-gray-600">{row.province ?? "—"}</td>
                      <td className="px-3 py-2 text-center font-semibold">
                        {row.area_confirmed ? <span className="text-emerald-600">✓</span> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2 text-center font-semibold">
                        {row.amount_confirmed ? <span className="text-emerald-600">✓</span> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        {row.action === "unconfirm" ? (
                          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-green-100 text-green-700">
                            Will unconfirm
                          </span>
                        ) : (
                          <span className="text-gray-400 text-[11px]">{row.reason}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Result panel */}
      {result && (
        <div className="card-bezel">
          <div className="card-bezel-inner-open p-4 space-y-3">
            <p className="text-base font-bold text-green-800">
              {result.updated} record{result.updated !== 1 ? "s" : ""} unconfirmed successfully.
            </p>
            {result.skipped.length > 0 && (
              <div>
                <button
                  onClick={() => setShowSkipped((v) => !v)}
                  className="text-xs text-gray-500 underline underline-offset-2"
                >
                  {showSkipped ? "Hide" : "Show"} skipped ({result.skipped.length})
                </button>
                {showSkipped && (
                  <ul className="mt-2 space-y-0.5">
                    {result.skipped.map((s) => (
                      <li key={s.seqno_darro} className="text-xs font-mono text-gray-500">
                        {s.seqno_darro} — {s.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <button
              onClick={handleReset}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Start Over
            </button>
          </div>
        </div>
      )}

      {/* Confirmation modal */}
      {showConfirm &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4">
              <h2 className="text-base font-bold text-gray-900">Confirm Batch Unconfirm</h2>
              <p className="text-sm text-gray-600">
                This will clear the{" "}
                <span className="font-semibold">
                  {type === "area" ? "area" : type === "amount" ? "amount" : "area & amount"}
                </span>{" "}
                confirmation for{" "}
                <span className="font-bold">{toUnconfirm.length} landholding{toUnconfirm.length !== 1 ? "s" : ""}</span>{" "}
                and recompute their status. This cannot be undone in bulk.
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExecute}
                  disabled={loading}
                  className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-40 transition-colors"
                >
                  {loading ? "Processing…" : "Confirm & Execute"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
