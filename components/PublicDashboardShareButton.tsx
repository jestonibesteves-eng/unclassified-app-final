"use client";

import { useState, useEffect, useCallback } from "react";

export default function PublicDashboardShareButton() {
  const [token, setToken] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchToken = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/public-token");
      if (res.ok) {
        const data = await res.json();
        setToken(data.token);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Error ${res.status}`);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && !token) fetchToken();
  }, [open, token, fetchToken]);

  const publicUrl = token
    ? `${window.location.origin}/view/${token}`
    : null;

  async function handleCopy() {
    if (!publicUrl) return;
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleRegenerate() {
    if (!confirmRegen) { setConfirmRegen(true); return; }
    setRegenerating(true);
    setConfirmRegen(false);
    const res = await fetch("/api/admin/public-token", { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setToken(data.token);
      setCopied(false);
    }
    setRegenerating(false);
  }

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen((v) => !v); setConfirmRegen(false); }}
        title="Generate public dashboard link"
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-all duration-150 shadow-sm"
      >
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="3" r="1.5" />
          <circle cx="3" cy="6" r="1.5" />
          <circle cx="9" cy="9" r="1.5" />
          <line x1="4.4" y1="6.7" x2="7.6" y2="8.3" />
          <line x1="7.6" y1="3.7" x2="4.4" y2="5.3" />
        </svg>
        Share
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setConfirmRegen(false); }} />

          {/* Panel */}
          <div className="absolute right-0 top-full mt-2 z-50 w-80 rounded-xl border border-gray-200 bg-white shadow-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold text-gray-700 uppercase tracking-widest">Public Dashboard Link</p>
              <button onClick={() => { setOpen(false); setConfirmRegen(false); }} className="text-gray-400 hover:text-gray-600">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <line x1="2" y1="2" x2="10" y2="10" /><line x1="10" y1="2" x2="2" y2="10" />
                </svg>
              </button>
            </div>

            <p className="text-[10px] text-gray-400 leading-relaxed">
              Anyone with this link can view a read-only summary of the dashboard — no login required.
            </p>

            {error ? (
              <div className="h-8 flex items-center justify-center">
                <span className="text-[10px] text-red-500">{error}</span>
              </div>
            ) : loading ? (
              <div className="h-8 flex items-center justify-center">
                <span className="text-[10px] text-gray-400">Loading…</span>
              </div>
            ) : publicUrl ? (
              <div className="flex items-center gap-1.5">
                <input
                  readOnly
                  value={publicUrl}
                  className="flex-1 min-w-0 text-[10px] font-mono bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-600 truncate outline-none"
                />
                <button
                  onClick={handleCopy}
                  className="flex-shrink-0 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            ) : null}

            <div className="border-t border-gray-100 pt-2.5">
              {confirmRegen ? (
                <div className="flex items-center gap-2">
                  <p className="text-[10px] text-orange-600 flex-1">Old link will stop working. Confirm?</p>
                  <button
                    onClick={handleRegenerate}
                    disabled={regenerating}
                    className="px-2 py-1 rounded text-[10px] font-semibold bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50"
                  >
                    {regenerating ? "…" : "Yes"}
                  </button>
                  <button
                    onClick={() => setConfirmRegen(false)}
                    className="px-2 py-1 rounded text-[10px] font-semibold border border-gray-200 text-gray-500 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleRegenerate}
                  disabled={regenerating || !token}
                  className="text-[10px] text-gray-400 hover:text-orange-500 transition-colors disabled:opacity-40"
                >
                  Regenerate link (invalidates current URL)
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
