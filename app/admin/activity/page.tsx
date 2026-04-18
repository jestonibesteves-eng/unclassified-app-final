"use client";

import { useEffect, useRef, useState } from "react";
import { useUser } from "@/components/UserContext";
import { useRouter } from "next/navigation";

type RecentLog = { created_at: string; action: string; field_changed: string | null; new_value: string | null };
type ActionCount = { action: string; count: number };
type FieldCount  = { field: string; count: number };
type ProvinceSummary = {
  province: string;
  totalPeriod: number;
  total24h: number;
  byAction: ActionCount[];
  topFields: FieldCount[];
  lastActivity: string | null;
  lastAction: string | null;
  recentLogs: RecentLog[];
  uniqueLandholdings: number;
  activeUserCount: number;
};

const DAYS_OPTIONS = [
  { label: "Today",   value: 1  },
  { label: "7 days",  value: 7  },
  { label: "30 days", value: 30 },
  { label: "90 days", value: 90 },
];

const ACTION_COLORS: Record<string, { pill: string; dot: string }> = {
  UPDATE: { pill: "bg-blue-100 text-blue-700",    dot: "bg-blue-400"    },
  INSERT: { pill: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-400" },
  DELETE: { pill: "bg-red-100 text-red-700",       dot: "bg-red-400"     },
  UPLOAD: { pill: "bg-amber-100 text-amber-700",   dot: "bg-amber-400"   },
};

function actionStyle(action: string) {
  return ACTION_COLORS[action.toUpperCase()] ?? { pill: "bg-gray-100 text-gray-600", dot: "bg-gray-400" };
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-PH", {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
    timeZone: "Asia/Manila",
  });
}

function ActivityBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
      <div className="h-full rounded-full bg-emerald-500 transition-all duration-700" style={{ width: `${pct}%` }} />
    </div>
  );
}

function StatusBadge({ total24h, totalPeriod }: { total24h: number; totalPeriod: number }) {
  if (total24h > 0) return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-semibold text-emerald-700 whitespace-nowrap">
      <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
      </span>
      Active today
    </span>
  );
  if (totalPeriod > 0) return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-[10px] font-semibold text-amber-700 whitespace-nowrap">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-400 flex-shrink-0" />
      Active this period
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200 text-[10px] font-semibold text-gray-400 whitespace-nowrap">
      <span className="h-1.5 w-1.5 rounded-full bg-gray-300 flex-shrink-0" />
      No activity
    </span>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div>
      <p className="text-[9.5px] uppercase tracking-wider text-gray-400 font-semibold leading-none mb-0.5">{label}</p>
      <p className={`text-[15px] font-bold leading-none ${accent ? "text-emerald-600" : "text-gray-800"}`}>{value}</p>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse space-y-3">
      <div className="flex justify-between">
        <div className="h-3.5 w-36 bg-gray-100 rounded" />
        <div className="h-5 w-20 bg-gray-100 rounded-full" />
      </div>
      <div className="h-8 w-20 bg-gray-100 rounded" />
      <div className="h-1.5 w-full bg-gray-100 rounded-full" />
      <div className="grid grid-cols-3 gap-2">
        {[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-gray-50 rounded-lg" />)}
      </div>
    </div>
  );
}

export default function DARPOActivityPage() {
  const { user } = useUser();
  const router = useRouter();
  const [days, setDays] = useState(7);
  const [data, setData] = useState<ProvinceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"image" | "pdf" | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  async function handleExportImage() {
    if (!exportRef.current) return;
    setExporting("image");
    try {
      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(exportRef.current, { scale: 2, useCORS: true, backgroundColor: "#f9fafb" });
      const link = document.createElement("a");
      link.download = `darpo-activity-${days}d-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } finally {
      setExporting(null);
    }
  }

  async function handleExportPDF() {
    if (!exportRef.current) return;
    setExporting("pdf");
    try {
      const { default: html2canvas } = await import("html2canvas");
      const { default: jsPDF } = await import("jspdf");
      const canvas = await html2canvas(exportRef.current, { scale: 2, useCORS: true, backgroundColor: "#f9fafb" });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [canvas.width / 2, canvas.height / 2] });
      pdf.addImage(imgData, "PNG", 0, 0, canvas.width / 2, canvas.height / 2);
      pdf.save(`darpo-activity-${days}d-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setExporting(null);
    }
  }

  useEffect(() => {
    if (user && user.role !== "super_admin") router.replace("/");
  }, [user, router]);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/activity-summary?days=${days}`)
      .then((r) => r.json())
      .then((j) => setData(j.provinces ?? []))
      .finally(() => setLoading(false));
  }, [days]);

  const maxActivity     = Math.max(...data.map((p) => p.totalPeriod), 1);
  const totalActions    = data.reduce((s, p) => s + p.totalPeriod, 0);
  const totalLHsTouched = data.reduce((s, p) => s + p.uniqueLandholdings, 0);
  const activeProvinces = data.filter((p) => p.totalPeriod > 0).length;
  const activeToday     = data.filter((p) => p.total24h > 0).length;
  const totalUsers      = data.reduce((s, p) => s + p.activeUserCount, 0);

  if (user && user.role !== "super_admin") return null;

  const periodLabel = days === 1 ? "last 24 hours" : `last ${days} days`;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Page header ── */}
      <div className="bg-white border-b border-gray-200 px-6 py-5">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-600 mb-1">Admin · Monitoring</p>
              <h1 className="text-[22px] font-bold text-gray-900 leading-tight tracking-tight">DARPO Activity</h1>
              <p className="text-[12px] text-gray-400 mt-0.5">
                Provincial office system usage · aggregated by province · no individual identifiers
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                {DAYS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setDays(opt.value)}
                    className={`px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all duration-150 ${
                      days === opt.value ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Export buttons */}
              <button
                onClick={handleExportImage}
                disabled={loading || !!exporting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="1" width="10" height="10" rx="1.5" />
                  <path d="M1 8l2.5-2.5 2 2L8 5l3 3" />
                  <circle cx="8.5" cy="3.5" r="1" fill="currentColor" stroke="none" />
                </svg>
                {exporting === "image" ? "Exporting…" : "PNG"}
              </button>

              <button
                onClick={handleExportPDF}
                disabled={loading || !!exporting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 1h5.5L10 3.5V11H2V1z" />
                  <path d="M7 1v3h3" />
                  <line x1="4" y1="6" x2="8" y2="6" />
                  <line x1="4" y1="8" x2="7" y2="8" />
                </svg>
                {exporting === "pdf" ? "Exporting…" : "PDF"}
              </button>
            </div>
          </div>

          {/* ── Summary strip ── */}
          {!loading && (
            <div className="flex items-center gap-6 mt-4 pt-4 border-t border-gray-100 flex-wrap">
              <Stat label="Total Actions" value={totalActions.toLocaleString()} />
              <div className="w-px h-8 bg-gray-200" />
              <Stat label="LHs Touched" value={totalLHsTouched.toLocaleString()} />
              <div className="w-px h-8 bg-gray-200" />
              <Stat label="Active Users" value={totalUsers} />
              <div className="w-px h-8 bg-gray-200" />
              <Stat label="Provinces Active" value={`${activeProvinces} / ${data.length}`} />
              <div className="w-px h-8 bg-gray-200" />
              <Stat label="Active Today" value={activeToday} accent />
            </div>
          )}
        </div>
      </div>

      {/* ── Cards grid ── */}
      <div ref={exportRef} className="max-w-6xl mx-auto px-6 py-6">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...Array(7)].map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {data.map((p) => {
              const isExpanded = expanded === p.province;
              const style = p.total24h > 0
                ? "border-emerald-200 shadow-sm shadow-emerald-50"
                : p.totalPeriod > 0
                ? "border-gray-200"
                : "border-gray-100 opacity-55";

              return (
                <div key={p.province} className={`bg-white rounded-xl border transition-all duration-200 ${style}`}>
                  <div className="p-5">
                    {/* Province + badge */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="min-w-0">
                        <h2 className="text-[13px] font-bold text-gray-800 leading-tight">{p.province}</h2>
                        {p.lastActivity && (
                          <p className="text-[10px] text-gray-400 mt-0.5">Last: {formatDateTime(p.lastActivity)}</p>
                        )}
                      </div>
                      <StatusBadge total24h={p.total24h} totalPeriod={p.totalPeriod} />
                    </div>

                    {/* Big count + bar */}
                    <div className="mb-4">
                      <div className="flex items-baseline justify-between mb-1.5">
                        <span className="text-[28px] font-bold text-gray-900 leading-none">
                          {p.totalPeriod.toLocaleString()}
                        </span>
                        {p.total24h > 0 && (
                          <span className="text-[10px] font-semibold text-emerald-600">+{p.total24h} today</span>
                        )}
                      </div>
                      <ActivityBar value={p.totalPeriod} max={maxActivity} />
                      <p className="text-[10px] text-gray-400 mt-1">actions in {periodLabel}</p>
                    </div>

                    {/* ── Mini stat row ── */}
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      <div className="bg-gray-50 rounded-lg px-2.5 py-2">
                        <p className="text-[9px] text-gray-400 uppercase tracking-wider leading-none mb-1">LHs</p>
                        <p className="text-[14px] font-bold text-gray-800 leading-none">{p.uniqueLandholdings.toLocaleString()}</p>
                        <p className="text-[9px] text-gray-400 mt-0.5">touched</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg px-2.5 py-2">
                        <p className="text-[9px] text-gray-400 uppercase tracking-wider leading-none mb-1">Users</p>
                        <p className="text-[14px] font-bold text-gray-800 leading-none">{p.activeUserCount}</p>
                        <p className="text-[9px] text-gray-400 mt-0.5">active</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg px-2.5 py-2">
                        <p className="text-[9px] text-gray-400 uppercase tracking-wider leading-none mb-1">Today</p>
                        <p className={`text-[14px] font-bold leading-none ${p.total24h > 0 ? "text-emerald-600" : "text-gray-300"}`}>
                          {p.total24h}
                        </p>
                        <p className="text-[9px] text-gray-400 mt-0.5">actions</p>
                      </div>
                    </div>

                    {/* Action type pills */}
                    {p.byAction.length > 0 && (
                      <div className="mb-3">
                        <p className="text-[9.5px] text-gray-400 uppercase tracking-wider font-semibold mb-1.5">Action types</p>
                        <div className="flex flex-wrap gap-1">
                          {p.byAction.map((a) => (
                            <span
                              key={a.action}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9.5px] font-semibold ${actionStyle(a.action).pill}`}
                            >
                              {a.action} <span className="opacity-60">{a.count}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Top fields changed */}
                    {p.topFields.length > 0 && (
                      <div className="mb-3">
                        <p className="text-[9.5px] text-gray-400 uppercase tracking-wider font-semibold mb-1.5">Most-edited fields</p>
                        <div className="space-y-1">
                          {p.topFields.map((f) => (
                            <div key={f.field} className="flex items-center gap-2">
                              <span className="text-[10px] text-gray-600 font-mono truncate flex-1">{f.field}</span>
                              <span className="text-[9px] text-gray-400 flex-shrink-0 font-semibold">{f.count}×</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Toggle recent log */}
                    {p.recentLogs.length > 0 && (
                      <button
                        onClick={() => setExpanded(isExpanded ? null : p.province)}
                        className="text-[10px] text-emerald-600 hover:text-emerald-800 font-semibold transition-colors"
                      >
                        {isExpanded ? "Hide recent ↑" : "Show recent activity ↓"}
                      </button>
                    )}
                  </div>

                  {/* ── Expanded recent logs ── */}
                  {isExpanded && p.recentLogs.length > 0 && (
                    <div className="border-t border-gray-100 divide-y divide-gray-50">
                      {p.recentLogs.map((log, i) => (
                        <div key={i} className="flex items-start gap-2.5 px-5 py-2.5">
                          <span className={`mt-0.5 flex-shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold ${actionStyle(log.action).pill}`}>
                            {log.action}
                          </span>
                          <div className="min-w-0 flex-1">
                            {log.field_changed && (
                              <p className="text-[10px] text-gray-700 font-semibold truncate">{log.field_changed}</p>
                            )}
                            {log.new_value && (
                              <p className="text-[9.5px] text-gray-400 truncate">→ {log.new_value}</p>
                            )}
                            <p className="text-[9px] text-gray-400 mt-0.5">{timeAgo(log.created_at)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!loading && data.every((p) => p.totalPeriod === 0) && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-[13px]">No DARPO activity recorded in this period.</p>
          </div>
        )}
      </div>
    </div>
  );
}
