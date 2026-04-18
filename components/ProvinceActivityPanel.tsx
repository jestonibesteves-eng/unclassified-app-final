"use client";

import { useEffect, useState } from "react";

type ProvinceSummary = {
  province: string;
  total7d: number;
  total24h: number;
  lastActivity: string | null;
  lastUser: string | null;
  lastAction: string | null;
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function shortProvince(name: string): string {
  return name
    .replace("CAMARINES", "CAM.")
    .replace("CATANDUANES", "CATAND.")
    .replace("SORSOGON", "SORSOG.")
    .replace("MASBATE", "MASBATE")
    .replace("ALBAY", "ALBAY");
}

export function ProvinceActivityPanel() {
  const [data, setData] = useState<ProvinceSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/admin/activity-summary")
      .then((r) => r.json())
      .then((j) => setData(j.provinces ?? []))
      .finally(() => setLoading(false));
  }, [open]);

  const activeCount = data.filter((p) => p.total24h > 0).length;

  return (
    <div
      className="relative mx-3 mb-1 rounded-[10px] overflow-hidden"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      {/* Header / toggle */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
      >
        <span className="flex-1 min-w-0">
          <span className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-green-500/70 leading-none">
            DARPO Activity
          </span>
          {!open && data.length === 0 && (
            <span className="block text-[10px] text-green-600/40 mt-0.5">Click to load</span>
          )}
          {!open && data.length > 0 && (
            <span className="block text-[10px] text-green-600/40 mt-0.5">
              {activeCount} province{activeCount !== 1 ? "s" : ""} active today
            </span>
          )}
        </span>
        {/* Pulse dot if any province active in 24h */}
        {data.some((p) => p.total24h > 0) && (
          <span className="relative flex h-2 w-2 flex-shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-40" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
        )}
        <svg
          width="10" height="10" viewBox="0 0 10 10" fill="none"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
          className={`text-green-600/50 flex-shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          <polyline points="2 3.5 5 6.5 8 3.5" />
        </svg>
      </button>

      {/* Expandable body */}
      {open && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          {loading ? (
            <div className="px-3 py-4 text-center">
              <span className="text-[10px] text-green-600/40">Loading…</span>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.05]">
              {data.map((p) => {
                const active24h = p.total24h > 0;
                const active7d  = p.total7d > 0;
                return (
                  <div key={p.province} className="px-3 py-2.5 flex items-start gap-2">
                    {/* Status dot */}
                    <span className="mt-[3px] flex-shrink-0">
                      {active24h ? (
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-50" />
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-400" />
                        </span>
                      ) : (
                        <span className={`block h-1.5 w-1.5 rounded-full ${active7d ? "bg-green-700" : "bg-white/10"}`} />
                      )}
                    </span>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-1">
                        <span className={`text-[10.5px] font-semibold truncate ${active7d ? "text-white/70" : "text-white/25"}`}>
                          {shortProvince(p.province)}
                        </span>
                        <span className={`text-[9px] font-mono flex-shrink-0 ${active24h ? "text-green-400" : "text-green-700/50"}`}>
                          {p.total7d > 0 ? `${p.total7d}×` : "—"}
                        </span>
                      </div>
                      {p.lastActivity ? (
                        <p className="text-[9px] text-green-600/50 truncate mt-0.5 leading-none">
                          {p.lastUser && <span className="text-green-500/60">{p.lastUser} · </span>}
                          {timeAgo(p.lastActivity)}
                        </p>
                      ) : (
                        <p className="text-[9px] text-white/15 mt-0.5 leading-none">no activity</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div
            className="px-3 py-2 text-[9px] text-green-700/40"
            style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
          >
            × = edits in last 7 days · dot = active today
          </div>
        </div>
      )}
    </div>
  );
}
