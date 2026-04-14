"use client";

import { useState, useEffect, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";

/* ─── Types ─── */
type PeriodType   = "day" | "week" | "month";
type EncSubfilter = "cocrom" | "arb" | "area" | "amount";

interface SimpleMilestone {
  total:     number;
  completed: number;
  series:    { date: string; count: number }[];
}

interface EncodingData {
  cocrom_total:     number;
  cocrom_completed: number;
  arb_total:        number;
  arb_completed:    number;
  area_total:       number;
  area_completed:   number;
  amount_total:     number;
  amount_completed: number;
  series: { date: string; cocrom: number; arb: number; area: number; amount: number }[];
}

interface ProgressResponse {
  period:       PeriodType;
  validation:   SimpleMilestone;
  encoding:     EncodingData;
  distribution: SimpleMilestone;
}

/* ─── Deadline ─── */
const DEADLINE = new Date("2026-06-15T00:00:00");

function daysToDeadline(): number {
  return Math.max(0, Math.ceil((DEADLINE.getTime() - Date.now()) / 86400000));
}
function periodsLeft(period: PeriodType): number {
  const d = daysToDeadline();
  if (period === "week")  return Math.ceil(d / 7);
  if (period === "month") return Math.ceil(d / 30);
  return d;
}

/* ─── Config ─── */
const PERIOD_LABELS: Record<PeriodType, string> = {
  day: "Daily", week: "Weekly", month: "Monthly",
};

const ENC_SUB_CFG: Record<EncSubfilter, { label: string; accent: string }> = {
  cocrom: { label: "COCROM",  accent: "#f59e0b" },
  arb:    { label: "ARB",     accent: "#8b5cf6" },
  area:   { label: "Area",    accent: "#06b6d4" },
  amount: { label: "Amount",  accent: "#f97316" },
};

function statusColors(pct: number) {
  if (pct >= 80) return { bar: "bg-emerald-500", text: "text-emerald-600" };
  if (pct >= 50) return { bar: "bg-amber-500",   text: "text-amber-600"  };
  return           { bar: "bg-red-500",    text: "text-red-600"    };
}

function formatDateLabel(date: string, period: PeriodType): string {
  if (period === "day") {
    const d = new Date(date + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  if (period === "week") return "Wk " + date.split("-")[1];
  const d = new Date(date + "-01T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function fmtArea  (n: number) { return n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ha"; }
function fmtAmount(n: number) { return "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtCount (n: number) { return n.toLocaleString(); }

/* ─── Shared chart wrapper ─── */
function MilestoneChart({
  chartData,
  accent,
  pace,
  period,
  label,
}: {
  chartData: { label: string; value: number }[];
  accent:    string;
  pace:      number;
  period:    PeriodType;
  label:     string;
}) {
  const paceUnit = period === "day" ? "day" : period === "week" ? "wk" : "mo";
  const paceLabel = pace < 1 ? pace.toFixed(2) : pace < 100 ? pace.toFixed(1) : Math.ceil(pace).toLocaleString();

  return (
    <>
      <div style={{ height: 148 }} className="px-1">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 9, fill: "#94a3b8" }}
                axisLine={false} tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 9, fill: "#94a3b8" }}
                axisLine={false} tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e5e7eb", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
                labelStyle={{ fontSize: 10, color: "#6b7280", marginBottom: 2 }}
                formatter={(v) => [typeof v === "number" ? v.toLocaleString() : v, label]}
              />
              {pace > 0 && (
                <ReferenceLine y={pace} stroke="#ef4444" strokeDasharray="4 3" strokeWidth={1.5} />
              )}
              <Line
                type="monotone" dataKey="value"
                stroke={accent} strokeWidth={2}
                dot={false} activeDot={{ r: 3, strokeWidth: 0, fill: accent }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-[11px] text-gray-300 italic">No activity in this period</p>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="px-5 pb-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-5 rounded" style={{ height: 2, backgroundColor: accent }} />
          <span className="text-[9.5px] text-gray-500">{label}</span>
        </div>
        {pace > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-4 border-t-2 border-dashed border-red-400" />
            <span className="text-[9.5px] text-gray-500">
              Required pace ({paceLabel}/{paceUnit})
            </span>
          </div>
        )}
      </div>
    </>
  );
}

/* ─── Validation / Distribution card ─── */
function SimpleCard({
  title, accent, data, period,
}: {
  title:  string;
  accent: string;
  data:   SimpleMilestone;
  period: PeriodType;
}) {
  const pct       = data.total > 0 ? (data.completed / data.total) * 100 : 0;
  const remaining = data.total - data.completed;
  const pace      = periodsLeft(period) > 0 && remaining > 0 ? remaining / periodsLeft(period) : 0;
  const col       = statusColors(pct);

  const chartData = data.series.map((s) => ({
    label: formatDateLabel(s.date, period),
    value: s.count,
  }));

  return (
    <div className="card-bezel">
      <div className="card-bezel-inner">
        <div className="bg-green-900 px-5 py-2.5 rounded-t-[17px]">
          <h3 className="text-[10px] font-semibold text-green-300 uppercase tracking-[0.13em]">{title}</h3>
        </div>

        <div className="px-5 pt-4 pb-2 flex items-start justify-between gap-2">
          <div>
            <p className={`text-[1.6rem] font-bold tabular-nums leading-none ${col.text}`}>
              {data.completed.toLocaleString()}
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">
              of {data.total.toLocaleString()}
            </p>
          </div>
          <div className="text-right">
            <p className={`text-[1.1rem] font-bold tabular-nums leading-none ${col.text}`}>
              {pct.toFixed(1)}%
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">{remaining.toLocaleString()} left</p>
          </div>
        </div>

        <div className="px-5 py-2.5">
          <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-700 ${col.bar}`}
              style={{ width: `${Math.min(pct, 100)}%` }} />
          </div>
        </div>

        <MilestoneChart
          chartData={chartData} accent={accent}
          pace={pace} period={period} label={title}
        />
      </div>
    </div>
  );
}

/* ─── Encoding card (4 subfilters) ─── */
function EncodingCard({ data, period }: { data: EncodingData; period: PeriodType }) {
  const [sub, setSub] = useState<EncSubfilter>("cocrom");
  const cfg = ENC_SUB_CFG[sub];

  const total     = (sub === "cocrom" ? data.cocrom_total     : sub === "arb" ? data.arb_total     : sub === "area" ? data.area_total     : data.amount_total)     ?? 0;
  const completed = (sub === "cocrom" ? data.cocrom_completed : sub === "arb" ? data.arb_completed : sub === "area" ? data.area_completed : data.amount_completed) ?? 0;

  const pct       = total > 0 ? (completed / total) * 100 : 0;
  const remaining = total - completed;
  const pl        = periodsLeft(period);
  const pace      = pl > 0 && remaining > 0 ? remaining / pl : 0;
  const col       = statusColors(pct);

  const fmt = sub === "area" ? fmtArea : sub === "amount" ? fmtAmount : fmtCount;

  const chartData = data.series.map((s) => ({
    label: formatDateLabel(s.date, period),
    value: s[sub],
  }));

  return (
    <div className="card-bezel">
      <div className="card-bezel-inner">
        <div className="bg-green-900 px-5 py-2.5 rounded-t-[17px]">
          <h3 className="text-[10px] font-semibold text-green-300 uppercase tracking-[0.13em]">Encoding</h3>
        </div>

        {/* Subfilter tabs */}
        <div className="px-5 pt-3 pb-0 flex gap-1">
          {(["cocrom", "arb", "area", "amount"] as EncSubfilter[]).map((s) => {
            const c = ENC_SUB_CFG[s];
            const active = sub === s;
            return (
              <button
                key={s}
                onClick={() => setSub(s)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all border ${
                  active ? "border-current bg-white shadow-sm" : "border-transparent text-gray-400 hover:text-gray-600 bg-gray-50"
                }`}
                style={active ? { color: c.accent, borderColor: c.accent } : undefined}
              >
                {c.label}
              </button>
            );
          })}
        </div>

        {/* Stats */}
        <div className="px-5 pt-3 pb-2 flex items-start justify-between gap-2">
          <div>
            <p className={`text-[1.6rem] font-bold tabular-nums leading-none ${col.text}`}>
              {sub === "area" ? completed.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
               : sub === "amount" ? completed.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
               : completed.toLocaleString()}
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">
              of {fmt(total)}
              {sub === "area" ? "" : sub === "amount" ? "" : ""}
            </p>
          </div>
          <div className="text-right">
            <p className={`text-[1.1rem] font-bold tabular-nums leading-none ${col.text}`}>
              {pct.toFixed(1)}%
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">
              {sub === "area"   ? fmtArea(remaining)   + " left"
               : sub === "amount" ? fmtAmount(remaining) + " left"
               : remaining.toLocaleString() + " left"}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="px-5 py-2.5">
          <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: cfg.accent }}
            />
          </div>
        </div>

        <MilestoneChart
          chartData={chartData} accent={cfg.accent}
          pace={pace} period={period} label={cfg.label}
        />
      </div>
    </div>
  );
}

/* ─── Skeleton ─── */
function SkeletonCard() {
  return (
    <div className="card-bezel animate-pulse">
      <div className="card-bezel-inner">
        <div className="bg-gray-200 h-9 rounded-t-[17px]" />
        <div className="p-5">
          <div className="flex justify-between mb-3">
            <div className="h-8 bg-gray-100 rounded w-1/4" />
            <div className="h-6 bg-gray-100 rounded w-1/5" />
          </div>
          <div className="h-1.5 bg-gray-100 rounded mb-4" />
          <div className="h-36 bg-gray-100 rounded" />
        </div>
      </div>
    </div>
  );
}

/* ─── Main section ─── */
export default function DashboardProgress() {
  const [period, setPeriod]     = useState<PeriodType>("week");
  const [response, setResponse] = useState<ProgressResponse | null>(null);
  const [loading, setLoading]   = useState(true);

  const load = useCallback(async (p: PeriodType) => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/progress?period=${p}`);
      const json = await res.json();
      // Only accept a well-formed response
      if (json?.validation && json?.encoding && json?.distribution) {
        setResponse(json as ProgressResponse);
      }
    } catch (e) {
      console.error("Progress fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(period); }, [period, load]);

  const daysLeft  = daysToDeadline();
  const weeksLeft = Math.ceil(daysLeft / 7);

  const deadlineBadgeColor =
    daysLeft <= 30 ? "bg-red-100 text-red-600"   :
    daysLeft <= 60 ? "bg-amber-100 text-amber-600" :
    "bg-emerald-100 text-emerald-700";

  const valTotal     = response?.validation.total     ?? 0;
  const valCompleted = response?.validation.completed ?? 0;
  const valPct       = valTotal > 0 ? (valCompleted / valTotal) * 100 : 0;

  return (
    <div className="mt-8 mb-6">
      {/* ── Header ── */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <h3 className="text-[12px] font-bold uppercase tracking-[0.13em] text-gray-700">
              Accomplishment Tracker
            </h3>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${deadlineBadgeColor}`}>
              <span className="font-mono">{daysLeft} days ({weeksLeft} weeks)</span>
              &nbsp;until June 15, 2026
            </span>
          </div>
          <p className="text-[11px] text-gray-400">
            Region V ·{" "}
            <span className="font-semibold text-gray-600">
              {valCompleted.toLocaleString()} / {valTotal.toLocaleString()}
            </span>{" "}
            validated{" "}
            <span className={`font-semibold ${valPct >= 80 ? "text-emerald-600" : valPct >= 50 ? "text-amber-600" : "text-red-500"}`}>
              ({valPct.toFixed(1)}%)
            </span>
            {" "}· Deadline: June 15, 2026
          </p>
        </div>

        {/* Shared period tabs */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-lg self-start flex-shrink-0">
          {(["day", "week", "month"] as PeriodType[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 rounded-md text-[11px] font-semibold transition-all ${
                period === p ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* ── 3 charts ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {loading || !response ? (
          <><SkeletonCard /><SkeletonCard /><SkeletonCard /></>
        ) : (
          <>
            <SimpleCard  title="Validation"   accent="#3b82f6" data={response.validation}   period={period} />
            <EncodingCard                                       data={response.encoding}     period={period} />
            <SimpleCard  title="Distribution" accent="#10b981" data={response.distribution} period={period} />
          </>
        )}
      </div>
    </div>
  );
}
