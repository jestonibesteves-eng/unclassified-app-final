"use client";

import { useEffect, useState } from "react";
import { useUser } from "@/components/UserContext";
import { useRouter } from "next/navigation";

type RecentLog = { created_at: string; action: string; field_changed: string | null };
type ActionCount = { action: string; count: number };
type ProvinceSummary = {
  province: string;
  totalPeriod: number;
  total24h: number;
  byAction: ActionCount[];
  lastActivity: string | null;
  lastAction: string | null;
  recentLogs: RecentLog[];
};

const DAYS_OPTIONS = [
  { label: "Today", value: 1 },
  { label: "7 days", value: 7 },
  { label: "30 days", value: 30 },
  { label: "90 days", value: 90 },
];

const ACTION_COLORS: Record<string, string> = {
  UPDATE: "bg-blue-100 text-blue-700",
  INSERT: "bg-emerald-100 text-emerald-700",
  DELETE: "bg-red-100 text-red-700",
  UPLOAD: "bg-amber-100 text-amber-700",
};

function actionColor(action: string) {
  return ACTION_COLORS[action.toUpperCase()] ?? "bg-gray-100 text-gray-600";
}

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
      <div
        className="h-full rounded-full bg-emerald-500 transition-all duration-700"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function StatusBadge({ total24h, totalPeriod }: { total24h: number; totalPeriod: number }) {
  if (total24h > 0) return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-semibold text-emerald-700">
      <span className="relative flex h-1.5 w-1.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
      </span>
      Active today
    </span>
  );
  if (totalPeriod > 0) return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-[10px] font-semibold text-amber-700">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
      Active this period
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200 text-[10px] font-semibold text-gray-400">
      <span className="h-1.5 w-1.5 rounded-full bg-gray-300" />
      No activity
    </span>
  );
}

export default function DARPOActivityPage() {
  const { user } = useUser();
  const router = useRouter();
  const [days, setDays] = useState(7);
  const [data, setData] = useState<ProvinceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Guard: super_admin only
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

  const maxActivity = Math.max(...data.map((p) => p.totalPeriod), 1);
  const totalActions = data.reduce((s, p) => s + p.totalPeriod, 0);
  const activeProvinces = data.filter((p) => p.totalPeriod > 0).length;
  const activeToday = data.filter((p) => p.total24h > 0).length;

  if (user && user.role !== "super_admin") return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Page header */}
      <div className="bg-white border-b border-gray-200 px-6 py-5">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-600 mb-1">Admin · Monitoring</p>
              <h1 className="text-[22px] font-bold text-gray-900 leading-tight tracking-tight">DARPO Activity</h1>
              <p className="text-[12px] text-gray-400 mt-0.5">
                Provincial office system usage — aggregated by province, no individual identifiers shown
              </p>
            </div>

            {/* Period selector */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              {DAYS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setDays(opt.value)}
                  className={`px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all duration-150 ${
                    days === opt.value
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Summary strip */}
          {!loading && (
            <div className="flex items-center gap-6 mt-4 pt-4 border-t border-gray-100">
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider">Total Actions</p>
                <p className="text-[18px] font-bold text-gray-900">{totalActions.toLocaleString()}</p>
              </div>
              <div className="w-px h-8 bg-gray-200" />
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider">Provinces Active</p>
                <p className="text-[18px] font-bold text-gray-900">{activeProvinces} <span className="text-[12px] font-normal text-gray-400">/ {data.length}</span></p>
              </div>
              <div className="w-px h-8 bg-gray-200" />
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider">Active Today</p>
                <p className="text-[18px] font-bold text-emerald-600">{activeToday}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Cards grid */}
      <div className="max-w-6xl mx-auto px-6 py-6">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
                <div className="h-3 w-32 bg-gray-100 rounded mb-3" />
                <div className="h-6 w-16 bg-gray-100 rounded mb-4" />
                <div className="h-1.5 w-full bg-gray-100 rounded" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {data.map((p) => {
              const isExpanded = expanded === p.province;
              return (
                <div
                  key={p.province}
                  className={`bg-white rounded-xl border transition-all duration-200 ${
                    p.total24h > 0
                      ? "border-emerald-200 shadow-sm shadow-emerald-50"
                      : p.totalPeriod > 0
                      ? "border-gray-200"
                      : "border-gray-100 opacity-60"
                  }`}
                >
                  <div className="p-5">
                    {/* Province header */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="min-w-0">
                        <h2 className="text-[13px] font-bold text-gray-800 leading-tight truncate">
                          {p.province}
                        </h2>
                        {p.lastActivity && (
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            Last: {formatDateTime(p.lastActivity)}
                          </p>
                        )}
                      </div>
                      <StatusBadge total24h={p.total24h} totalPeriod={p.totalPeriod} />
                    </div>

                    {/* Count + bar */}
                    <div className="mb-3">
                      <div className="flex items-baseline justify-between mb-1.5">
                        <span className="text-[26px] font-bold text-gray-900 leading-none">
                          {p.totalPeriod.toLocaleString()}
                        </span>
                        <span className="text-[10px] text-gray-400">
                          {p.total24h > 0 && <span className="text-emerald-600 font-semibold">+{p.total24h} today</span>}
                        </span>
                      </div>
                      <ActivityBar value={p.totalPeriod} max={maxActivity} />
                      <p className="text-[10px] text-gray-400 mt-1">
                        actions in the last {days === 1 ? "24 hours" : `${days} days`}
                      </p>
                    </div>

                    {/* Action type breakdown */}
                    {p.byAction.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {p.byAction.map((a) => (
                          <span
                            key={a.action}
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-semibold ${actionColor(a.action)}`}
                          >
                            {a.action} <span className="opacity-70">{a.count}</span>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Toggle recent activity */}
                    {p.recentLogs.length > 0 && (
                      <button
                        onClick={() => setExpanded(isExpanded ? null : p.province)}
                        className="text-[10px] text-emerald-600 hover:text-emerald-800 font-semibold transition-colors"
                      >
                        {isExpanded ? "Hide recent ↑" : `Show recent activity ↓`}
                      </button>
                    )}
                  </div>

                  {/* Expanded recent log */}
                  {isExpanded && p.recentLogs.length > 0 && (
                    <div className="border-t border-gray-100 px-5 py-3 space-y-2">
                      {p.recentLogs.map((log, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className={`mt-0.5 flex-shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold ${actionColor(log.action)}`}>
                            {log.action}
                          </span>
                          <div className="min-w-0 flex-1">
                            {log.field_changed && (
                              <p className="text-[10px] text-gray-600 truncate font-medium">{log.field_changed}</p>
                            )}
                            <p className="text-[9px] text-gray-400">{timeAgo(log.created_at)}</p>
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
