"use client";

import { useState, useEffect } from "react";
import {
  EncSubfilter,
  SemiGauge,
  statusColor, statusTextClass, daysToDeadline,
  fmtArea, fmtAmount, fmtCount, fmtAreaShort, fmtAmountShort,
} from "@/lib/gauge-utils";

/* ─── Types ─── */

interface SimpleMilestone {
  // LH-level count — used for Validation gauge + LH panel; 0 on Distribution
  total:     number;
  completed: number;
  // ARB-level breakdowns — present on Distribution, absent on Validation
  cocrom_total?:     number;
  cocrom_completed?: number;
  arb_total?:        number;
  arb_completed?:    number;
  // Area/Amount — sourced from Landholding on Validation, ARB on Distribution
  area_total:        number;
  area_completed:    number;
  amount_total:      number;
  amount_completed:  number;
  // LH panel for Distribution
  lh_validated?:     number;
  lh_not_validated?: number;
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
  lh_validated:     number;
  lh_not_validated: number;
}

interface ProgressResponse {
  validation:        SimpleMilestone;
  encoding:          EncodingData;
  distribution:      SimpleMilestone;
  committed_cocroms: number;
}

/* ─── Deadline ─── */
function fmtDeadlineLabel(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
}

/* ─── Constants ─── */
const COMMITTED_COCROMS = 10_786;

/* ─── Config ─── */
const ENC_SUB_CFG: Record<EncSubfilter, { label: string; accent: string }> = {
  cocrom: { label: "COCROM",  accent: "#f59e0b" },
  arb:    { label: "ARB",     accent: "#8b5cf6" },
  area:   { label: "Area",    accent: "#06b6d4" },
  amount: { label: "Amount",  accent: "#f97316" },
};




/* ─── SimpleCard (Validation + Distribution) ─── */
function SimpleCard({
  title, data, sub, committedCocroms = COMMITTED_COCROMS, committedLabel = "committed to Central Office", deadline,
}: {
  title: "Validation" | "Distribution";
  data:  SimpleMilestone;
  sub:   EncSubfilter;
  committedCocroms?: number;
  committedLabel?:   string;
  deadline:          Date;
}) {
  const isValidation = title === "Validation";

  // Validation COCROM/ARB tabs: use LH count (no ARB-level data from Landholding table)
  // Distribution COCROM/ARB tabs: use ARB-level counts from distAgg
  const metricTotal =
    isValidation && (sub === "cocrom" || sub === "arb") ? data.total
    : sub === "cocrom" ? (data.cocrom_total     ?? 0)
    : sub === "arb"    ? (data.arb_total        ?? 0)
    : sub === "area"   ? data.area_total
    :                    data.amount_total;

  const metricCompleted =
    isValidation && (sub === "cocrom" || sub === "arb") ? data.completed
    : sub === "cocrom" ? (data.cocrom_completed ?? 0)
    : sub === "arb"    ? (data.arb_completed    ?? 0)
    : sub === "area"   ? data.area_completed
    :                    data.amount_completed;

  const pct       = metricTotal > 0 ? (metricCompleted / metricTotal) * 100 : 0;
  const remaining = metricTotal - metricCompleted;
  const weeksLeft = Math.ceil(daysToDeadline(deadline) / 7);
  const pace      = weeksLeft > 0 && remaining > 0 ? Math.ceil(remaining / weeksLeft) : 0;
  const color     = statusColor(pct);
  const textCls   = statusTextClass(pct);

  const fmtMetric = (n: number) =>
    sub === "area" ? fmtArea(n) : sub === "amount" ? fmtAmount(n) : n.toLocaleString();
  const fmtPace = (n: number) =>
    sub === "area" ? fmtAreaShort(n) : sub === "amount" ? fmtAmountShort(n) : n.toLocaleString();
  const fmtTotalLabel = (n: number) =>
    sub === "area" ? fmtAreaShort(n) : sub === "amount" ? fmtAmountShort(n) : n.toLocaleString();

  const verb = isValidation ? "validated" : "distributed";
  const unitName: Record<EncSubfilter, string> = {
    cocrom: isValidation ? "LHs" : "COCROMs",
    arb:    isValidation ? "LHs" : "ARBs",
    area:   "ha.",
    amount: "",
  };
  const ofContext: Record<EncSubfilter, string> = {
    cocrom: isValidation ? "total LHs"      : "encoded COCROMs",
    arb:    isValidation ? "total LHs"      : "total ARBs",
    area:   isValidation ? "ha. total"      : "ha. encoded",
    amount: isValidation ? "total condoned" : "total encoded",
  };

  const subA = sub === "amount"
    ? `${fmtAmountShort(metricCompleted)} ${verb}`
    : sub === "area"
    ? `${fmtAreaShort(metricCompleted)} ${verb}`
    : `${metricCompleted.toLocaleString()} ${unitName[sub]} ${verb}`;
  const subB = sub === "amount"
    ? `of ${fmtAmountShort(metricTotal)} ${ofContext[sub]}`
    : sub === "area"
    ? `of ${fmtAreaShort(metricTotal)} ${ofContext[sub]}`
    : `of ${metricTotal.toLocaleString()} ${ofContext[sub]}`;

  // LH breakdown panel — always LH-level, tab-independent
  const lhValidated    = isValidation ? data.completed               : (data.lh_validated    ?? 0);
  const lhNotValidated = isValidation ? data.total - data.completed   : (data.lh_not_validated ?? 0);
  const lhPanelTitle   = isValidation ? "Landholdings by validation status" : "Landholdings with distributed COCROMs";

  return (
    <div className="card-bezel">
      <div className="card-bezel-inner">
        {/* Header */}
        <div className="bg-green-900 px-5 py-2.5 rounded-t-[17px] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-[10px] font-semibold text-green-300 uppercase tracking-[0.13em]">{title}</h3>
            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-green-700 text-green-300 uppercase tracking-wide">
              {isValidation ? "LH" : "ARB"}
            </span>
          </div>
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${color}22`, color }}>
            {pct >= 80 ? "On Track" : pct >= 50 ? "At Risk" : "Critical"}
          </span>
        </div>

        {/* Stats */}
        <div className="px-5 pt-4 pb-1 flex items-start justify-between gap-2">
          <div>
            <p className={`text-[1.6rem] font-bold tabular-nums leading-none ${textCls}`}>
              {fmtMetric(metricCompleted)}
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">of {fmtMetric(metricTotal)}</p>
          </div>
          <div className="text-right">
            <p className={`text-[1.1rem] font-bold tabular-nums leading-none ${textCls}`}>{pct.toFixed(1)}%</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{fmtMetric(remaining)} left</p>
          </div>
        </div>

        {/* Gauge row — for Distribution, gauge sits left and comparison panel fills the right */}
        {isValidation ? (
          <>
            <div className="pt-1 px-4">
              <SemiGauge
                value={metricCompleted} total={metricTotal} color={color}
                subA={subA} subB={subB} totalLabel={fmtTotalLabel(metricTotal)}
              />
            </div>
            <div className="px-5 text-center -mt-1">
              {metricTotal === 0 ? (
                <p className="text-[10px] text-gray-400 italic">No data</p>
              ) : pace === 0 ? (
                <p className="text-[10px] font-semibold text-emerald-600">✓ Target reached</p>
              ) : (
                <p className="text-[10px] text-gray-500">
                  Need <span className="font-bold text-gray-700">{fmtPace(pace)}/wk</span> to meet deadline
                </p>
              )}
            </div>
          </>
        ) : (() => {
          const available  = (data.cocrom_total ?? 0) - (data.cocrom_completed ?? 0);
          const fulfillPct = committedCocroms > 0 ? (available / committedCocroms) * 100 : 0;
          return (
            <div className="pt-1 pl-3 pr-3 flex items-center gap-2">
              {/* Gauge — shifted left, narrower */}
              <div className="w-[55%] shrink-0">
                <SemiGauge
                  value={metricCompleted} total={metricTotal} color={color}
                  subA={subA} subB={subB} totalLabel={fmtTotalLabel(metricTotal)}
                />
                <div className="text-center -mt-1">
                  {metricTotal === 0 ? (
                    <p className="text-[10px] text-gray-400 italic">No data</p>
                  ) : pace === 0 ? (
                    <p className="text-[10px] font-semibold text-emerald-600">✓ Target reached</p>
                  ) : (
                    <p className="text-[10px] text-gray-500">
                      Need <span className="font-bold text-gray-700">{fmtPace(pace)}/wk</span> to meet deadline
                    </p>
                  )}
                </div>
              </div>
              {/* Comparison panel — right side */}
              <div className="flex-1 rounded-lg border border-sky-100 bg-sky-50 px-3 py-2.5 self-center">
                <p className="text-[8.5px] font-semibold uppercase tracking-[0.1em] text-sky-400 mb-2">
                  Available vs. Committed
                </p>
                <div className="flex flex-col gap-1.5 mb-2">
                  <div className="rounded-md bg-white border border-sky-100 px-2 py-1.5">
                    <p className="text-[13px] font-bold text-sky-700 leading-none tabular-nums">{available.toLocaleString()}</p>
                    <p className="text-[8px] text-sky-500 mt-0.5">available (not yet distributed)</p>
                  </div>
                  <div className="rounded-md bg-white border border-indigo-100 px-2 py-1.5">
                    <p className="text-[13px] font-bold text-indigo-700 leading-none tabular-nums">{committedCocroms.toLocaleString()}</p>
                    <p className="text-[8px] text-indigo-500 mt-0.5">{committedLabel}</p>
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-sky-100 overflow-hidden mb-1">
                  <div className="h-full rounded-full bg-indigo-400" style={{ width: `${Math.min(fulfillPct, 100).toFixed(1)}%` }} />
                </div>
                <p className="text-[8.5px] font-bold text-indigo-500 tabular-nums text-right">{fulfillPct.toFixed(1)}% fulfilled</p>
              </div>
            </div>
          );
        })()}

        {/* LH breakdown panel — always LH-level regardless of tab */}
        <div className="mx-5 mb-4 mt-3 rounded-lg border border-gray-100 bg-gray-50 px-3.5 py-2.5">
          <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-gray-400 mb-2">{lhPanelTitle}</p>
          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-1.5 rounded-md bg-emerald-50 border border-emerald-100 px-2.5 py-1.5">
              <span className="text-emerald-500 text-[12px] leading-none">✓</span>
              <div>
                <p className="text-[13px] font-bold text-emerald-700 leading-none tabular-nums">{lhValidated.toLocaleString()} <span className="text-[9px] font-semibold">LHs</span></p>
                <p className="text-[8.5px] text-emerald-600 mt-0.5">fully validated</p>
              </div>
            </div>
            <div className="flex-1 flex items-center gap-1.5 rounded-md bg-amber-50 border border-amber-100 px-2.5 py-1.5">
              <span className="text-amber-500 text-[13px] leading-none">⚠</span>
              <div>
                <p className="text-[13px] font-bold text-amber-700 leading-none tabular-nums">{lhNotValidated.toLocaleString()} <span className="text-[9px] font-semibold">LHs</span></p>
                <p className="text-[8.5px] text-amber-600 mt-0.5">not yet fully validated</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── EncodingCard ─── */
function EncodingCard({ data, sub, deadline }: { data: EncodingData; sub: EncSubfilter; deadline: Date }) {
  const cfg = ENC_SUB_CFG[sub];

  const total =
    sub === "cocrom" ? data.cocrom_total
    : sub === "arb"  ? data.arb_total
    : sub === "area" ? data.area_total
    :                  data.amount_total;

  const completed =
    sub === "cocrom" ? data.cocrom_completed
    : sub === "arb"  ? data.arb_completed
    : sub === "area" ? data.area_completed
    :                  data.amount_completed;

  const pct       = total > 0 ? (completed / total) * 100 : 0;
  const remaining = total - completed;
  const weeksLeft = Math.ceil(daysToDeadline(deadline) / 7);
  const pace      = weeksLeft > 0 && remaining > 0 ? Math.ceil(remaining / weeksLeft) : 0;
  const color     = statusColor(pct);
  const textCls   = statusTextClass(pct);

  const fmtVal = (n: number) =>
    sub === "area" ? fmtArea(n) : sub === "amount" ? fmtAmount(n) : fmtCount(n);

  const encSubA: Record<EncSubfilter, string> = {
    cocrom: `${completed.toLocaleString()} COCROMs encoded`,
    arb:    `${completed.toLocaleString()} ARBs encoded`,
    area:   `${fmtAreaShort(completed)} encoded`,
    amount: `${fmtAmountShort(completed)} condoned`,
  };
  const encSubB: Record<EncSubfilter, string> = {
    cocrom: `of ${total.toLocaleString()} eligible COCROMs`,
    arb:    `of ${total.toLocaleString()} total ARBs`,
    area:   `of ${fmtAreaShort(total)} total`,
    amount: `of ${fmtAmountShort(total)} total`,
  };

  return (
    <div className="card-bezel">
      <div className="card-bezel-inner">
        {/* Header */}
        <div className="bg-green-900 px-5 py-2.5 rounded-t-[17px] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-[10px] font-semibold text-green-300 uppercase tracking-[0.13em]">Encoding</h3>
            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-green-700 text-green-300 uppercase tracking-wide">ARB</span>
          </div>
          <span
            className="text-[9px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: `${color}22`, color }}
          >
            {pct >= 80 ? "On Track" : pct >= 50 ? "At Risk" : "Critical"}
          </span>
        </div>

        {/* Stats */}
        <div className="px-5 pt-3 pb-1 flex items-start justify-between gap-2">
          <div>
            <p className={`text-[1.6rem] font-bold tabular-nums leading-none ${textCls}`}>
              {fmtVal(completed)}
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">of {fmtVal(total)}</p>
          </div>
          <div className="text-right">
            <p className={`text-[1.1rem] font-bold tabular-nums leading-none ${textCls}`}>
              {pct.toFixed(1)}%
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">{fmtVal(remaining)} left</p>
          </div>
        </div>

        {/* Gauge */}
        <div className="pt-1 px-4">
          <SemiGauge
            value={completed} total={total} color={cfg.accent}
            subA={encSubA[sub]} subB={encSubB[sub]} totalLabel={fmtVal(total)}
          />
        </div>

        {/* Pace */}
        <div className="px-5 text-center -mt-1">
          {total === 0 ? (
            <p className="text-[10px] text-gray-400 italic">No data</p>
          ) : pace === 0 ? (
            <p className="text-[10px] font-semibold text-emerald-600">✓ Target reached</p>
          ) : (
            <p className="text-[10px] text-gray-500">
              Need <span className="font-bold text-gray-700">{fmtVal(pace)}/wk</span> to meet deadline
            </p>
          )}
        </div>

        {/* LH breakdown — shown always, not tab-dependent */}
        <div className="mx-5 mb-4 mt-3 rounded-lg border border-gray-100 bg-gray-50 px-3.5 py-2.5">
          <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-gray-400 mb-2">
            Landholdings with encoded COCROMs
          </p>
          <div className="flex gap-2">
            {/* Fully validated */}
            <div className="flex-1 flex items-center gap-1.5 rounded-md bg-emerald-50 border border-emerald-100 px-2.5 py-1.5">
              <span className="text-emerald-500 text-[12px] leading-none">✓</span>
              <div>
                <p className="text-[13px] font-bold text-emerald-700 leading-none tabular-nums">
                  {(data.lh_validated ?? 0).toLocaleString()} <span className="text-[9px] font-semibold">LHs</span>
                </p>
                <p className="text-[8.5px] text-emerald-600 mt-0.5">fully validated</p>
              </div>
            </div>
            {/* Not yet validated */}
            <div className="flex-1 flex items-center gap-1.5 rounded-md bg-amber-50 border border-amber-100 px-2.5 py-1.5">
              <span className="text-amber-500 text-[13px] leading-none">⚠</span>
              <div>
                <p className="text-[13px] font-bold text-amber-700 leading-none tabular-nums">
                  {(data.lh_not_validated ?? 0).toLocaleString()} <span className="text-[9px] font-semibold">LHs</span>
                </p>
                <p className="text-[8.5px] text-amber-600 mt-0.5">not yet fully validated</p>
              </div>
            </div>
          </div>
        </div>
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
          <div className="flex justify-between mb-4">
            <div className="h-8 bg-gray-100 rounded w-1/4" />
            <div className="h-6 bg-gray-100 rounded w-1/5" />
          </div>
          <div
            className="bg-gray-100 mx-auto"
            style={{ width: "100%", height: "90px", borderRadius: "50% 50% 0 0 / 100% 100% 0 0" }}
          />
          <div className="h-3 bg-gray-100 rounded w-2/5 mx-auto mt-4" />
        </div>
      </div>
    </div>
  );
}

/* ─── Main section ─── */
export default function DashboardProgress({
  selectedProvinces = [],
  publicToken,
  targetDate = "2026-06-15",
}: {
  selectedProvinces?: string[];
  publicToken?: string;
  targetDate?: string;
}) {
  const [response, setResponse] = useState<ProgressResponse | null>(null);
  const [loading, setLoading]   = useState(true);
  const [sub, setSub]           = useState<EncSubfilter>("cocrom");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const params = new URLSearchParams();
        if (selectedProvinces.length > 0) params.set("provinces", selectedProvinces.join(","));
        if (publicToken) params.set("token", publicToken);
        const qs  = params.toString() ? "?" + params.toString() : "";
        const res = await fetch(`/api/progress${qs}`);
        const json = await res.json();
        if (!cancelled && json?.validation && json?.encoding && json?.distribution) {
          setResponse(json as ProgressResponse);
        }
      } catch (e) {
        console.error("Progress fetch error:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedProvinces.join(","), publicToken]);

  const deadline      = new Date(`${targetDate}T00:00:00+08:00`);
  const deadlineLabel = fmtDeadlineLabel(targetDate);

  const [daysLeft, setDaysLeft] = useState(() => daysToDeadline(deadline));
  useEffect(() => {
    setDaysLeft(daysToDeadline(deadline));
    const id = setInterval(() => setDaysLeft(daysToDeadline(deadline)), 60_000);
    return () => clearInterval(id);
  }, [deadline.getTime()]);

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
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <h3 className="text-[12px] font-bold uppercase tracking-[0.13em] text-gray-700">
              Accomplishment Tracker
            </h3>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${deadlineBadgeColor}`}>
              <span className="font-mono">{daysLeft} days ({weeksLeft} weeks)</span>
              &nbsp;until {deadlineLabel}
            </span>
          </div>
          <p className="text-[11px] text-gray-400">
            Region V ·{" "}
            <span className="font-semibold text-gray-600">
              {valCompleted.toLocaleString()} / {valTotal.toLocaleString()}
            </span>{" "}
            validated{" "}
            <span className={`font-semibold ${valPct >= 80 ? "text-emerald-600" : valPct >= 50 ? "text-amber-500" : "text-red-500"}`}>
              ({valPct.toFixed(1)}%)
            </span>
            {" "}· Deadline: {deadlineLabel}
          </p>
        </div>

        {/* Encoding sub-filter — upper right, controls Encoding card gauge */}
        <div className="flex items-center gap-1 self-start shrink-0">
          {(["cocrom", "arb", "area", "amount"] as EncSubfilter[]).map((s) => {
            const c      = ENC_SUB_CFG[s];
            const active = sub === s;
            return (
              <button
                key={s}
                onClick={() => setSub(s)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all border ${
                  active
                    ? "border-current bg-white shadow-sm"
                    : "border-transparent text-gray-400 hover:text-gray-600 bg-gray-50"
                }`}
                style={active ? { color: c.accent, borderColor: c.accent } : undefined}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {loading || !response ? (
          <><SkeletonCard /><SkeletonCard /><SkeletonCard /></>
        ) : (
          <>
            <SimpleCard  title="Validation"   data={response.validation}   sub={sub} deadline={deadline} />
            <EncodingCard data={response.encoding} sub={sub} deadline={deadline} />
            <SimpleCard
              title="Distribution"
              data={response.distribution}
              sub={sub}
              committedCocroms={response.committed_cocroms}
              committedLabel={selectedProvinces.length > 0 ? "provincial commitment target" : "committed to Central Office"}
              deadline={deadline}
            />
          </>
        )}
      </div>
    </div>
  );
}
