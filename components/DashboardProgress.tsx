"use client";

import { useState, useEffect } from "react";

/* ─── Types ─── */
type EncSubfilter = "cocrom" | "arb" | "area" | "amount";

interface SimpleMilestone {
  total:     number;
  completed: number;
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
}

interface ProgressResponse {
  validation:   SimpleMilestone;
  encoding:     EncodingData;
  distribution: SimpleMilestone;
}

/* ─── Deadline ─── */
const DEADLINE = new Date("2026-06-15T00:00:00");

function daysToDeadline(): number {
  return Math.max(0, Math.ceil((DEADLINE.getTime() - Date.now()) / 86400000));
}

/* ─── Config ─── */
const ENC_SUB_CFG: Record<EncSubfilter, { label: string; accent: string }> = {
  cocrom: { label: "COCROM",  accent: "#f59e0b" },
  arb:    { label: "ARB",     accent: "#8b5cf6" },
  area:   { label: "Area",    accent: "#06b6d4" },
  amount: { label: "Amount",  accent: "#f97316" },
};

function statusColor(pct: number): string {
  if (pct >= 80) return "#10b981";
  if (pct >= 50) return "#f59e0b";
  return "#ef4444";
}

function statusTextClass(pct: number): string {
  if (pct >= 80) return "text-emerald-600";
  if (pct >= 50) return "text-amber-500";
  return "text-red-500";
}

function fmtArea  (n: number) { return n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ha"; }
function fmtAmount(n: number) { return "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtCount (n: number) { return n.toLocaleString(); }

/* ─── Gauge geometry ───────────────────────────────────────────────────────
   Semi-circle: left (28, 108) → over the top → right (192, 108)
   Center: (110, 108), radius: 82, viewBox: 0 0 220 118
   sweep-flag=1 → clockwise on screen → arc goes UPWARD (correct for a gauge)
────────────────────────────────────────────────────────────────────────── */
const CX = 110, CY = 108, R = 82;
const START_X = CX - R; // 28
const END_X   = CX + R; // 192

function gaugePoint(p: number): { x: number; y: number } {
  const angle = Math.PI * (1 - p);
  return {
    x: CX + R * Math.cos(angle),
    y: CY - R * Math.sin(angle),
  };
}

function gaugeArc(p: number): string | null {
  const clamped = Math.min(Math.max(p, 0), 1);
  if (clamped < 0.004) return null;
  if (clamped >= 0.999) return `M ${START_X} ${CY} A ${R} ${R} 0 0 1 ${END_X} ${CY}`;
  const { x, y } = gaugePoint(clamped);
  return `M ${START_X} ${CY} A ${R} ${R} 0 0 1 ${x.toFixed(3)} ${y.toFixed(3)}`;
}

/* ─── SemiGauge ─── */
function SemiGauge({
  value,
  total,
  color,
  line1,
  line2,
}: {
  value: number;
  total: number;
  color: string;
  line1: string;
  line2: string;
}) {
  const p       = total > 0 ? Math.min(value / total, 1) : 0;
  const arcPath = gaugeArc(p);
  const tip     = p > 0.004 && p < 0.999 ? gaugePoint(p) : null;

  return (
    /* maxWidth constrains rendered size so gauge stays proportional inside wide cards */
    <div style={{ maxWidth: "240px", margin: "0 auto" }}>
      <svg viewBox="0 0 220 118" width="100%" aria-hidden>
        {/* Track */}
        <path
          d={`M ${START_X} ${CY} A ${R} ${R} 0 0 1 ${END_X} ${CY}`}
          fill="none" stroke="#e9ecef" strokeWidth="14" strokeLinecap="round"
        />
        {/* Progress arc */}
        {arcPath && (
          <path d={arcPath} fill="none" stroke={color} strokeWidth="14" strokeLinecap="round" />
        )}
        {/* Tip dot at arc endpoint */}
        {tip && <circle cx={tip.x} cy={tip.y} r="5" fill={color} />}
        {/* 0 / max labels flanking the arc base */}
        <text x={START_X} y="116" fontSize="8.5" fill="#cbd5e1" textAnchor="middle">0</text>
        <text x={END_X}   y="116" fontSize="8.5" fill="#cbd5e1" textAnchor="middle">
          {total.toLocaleString()}
        </text>
        {/* Center text — vertically centred inside the bowl (bowl spans y=26→108, mid=67) */}
        <text x="110" y="63" fontSize="13.5" fontWeight="800" fill={color} textAnchor="middle">
          {line1}
        </text>
        <text x="110" y="80" fontSize="8" fill="#9ca3af" textAnchor="middle">
          {line2}
        </text>
      </svg>
    </div>
  );
}

/* ─── SimpleCard (Validation + Distribution) ─── */
function SimpleCard({
  title,
  data,
}: {
  title:  "Validation" | "Distribution";
  data:   SimpleMilestone;
}) {
  const pct       = data.total > 0 ? (data.completed / data.total) * 100 : 0;
  const remaining = data.total - data.completed;
  const weeksLeft = Math.ceil(daysToDeadline() / 7);
  const pace      = weeksLeft > 0 && remaining > 0 ? Math.ceil(remaining / weeksLeft) : 0;
  const color     = statusColor(pct);
  const textCls   = statusTextClass(pct);

  const isValidation = title === "Validation";
  const verb  = isValidation ? "validated"  : "distributed";
  const noun  = isValidation ? "landholdings" : "ARBs";
  const accent = isValidation ? "#3b82f6" : "#10b981";
  const line1 = `${data.completed.toLocaleString()} ${verb}`;
  const line2 = `${pct.toFixed(1)}% of ${data.total.toLocaleString()} ${noun}`;

  return (
    <div className="card-bezel">
      <div className="card-bezel-inner">
        {/* Header */}
        <div className="bg-green-900 px-5 py-2.5 rounded-t-[17px] flex items-center justify-between">
          <h3 className="text-[10px] font-semibold text-green-300 uppercase tracking-[0.13em]">{title}</h3>
          <span
            className="text-[9px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: `${color}22`, color }}
          >
            {pct >= 80 ? "On Track" : pct >= 50 ? "At Risk" : "Critical"}
          </span>
        </div>

        {/* Stats */}
        <div className="px-5 pt-4 pb-1 flex items-start justify-between gap-2">
          <div>
            <p className={`text-[1.6rem] font-bold tabular-nums leading-none ${textCls}`}>
              {data.completed.toLocaleString()}
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">of {data.total.toLocaleString()}</p>
          </div>
          <div className="text-right">
            <p className={`text-[1.1rem] font-bold tabular-nums leading-none ${textCls}`}>
              {pct.toFixed(1)}%
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">{remaining.toLocaleString()} left</p>
          </div>
        </div>

        {/* Gauge */}
        <div className="pt-1 px-4">
          <SemiGauge value={data.completed} total={data.total} color={accent} line1={line1} line2={line2} />
        </div>

        {/* Pace */}
        <div className="px-5 pb-5 text-center -mt-1">
          {pace === 0 ? (
            <p className="text-[10px] font-semibold text-emerald-600">✓ Target reached</p>
          ) : (
            <p className="text-[10px] text-gray-500">
              Need <span className="font-bold text-gray-700">{pace.toLocaleString()}/wk</span> to meet deadline
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── EncodingCard ─── */
function EncodingCard({ data }: { data: EncodingData }) {
  const [sub, setSub] = useState<EncSubfilter>("cocrom");
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
  const weeksLeft = Math.ceil(daysToDeadline() / 7);
  const pace      = weeksLeft > 0 && remaining > 0 ? Math.ceil(remaining / weeksLeft) : 0;
  const color     = statusColor(pct);
  const textCls   = statusTextClass(pct);

  const fmtVal = (n: number) =>
    sub === "area" ? fmtArea(n) : sub === "amount" ? fmtAmount(n) : fmtCount(n);

  const unitLabel =
    sub === "cocrom" ? "COCROMs" : sub === "arb" ? "ARBs" : sub === "area" ? "ha." : "condoned amt";

  const line1 = `${fmtVal(completed)} encoded`;
  const line2 = `${pct.toFixed(1)}% of ${fmtVal(total)} ${unitLabel}`;

  return (
    <div className="card-bezel">
      <div className="card-bezel-inner">
        {/* Header */}
        <div className="bg-green-900 px-5 py-2.5 rounded-t-[17px] flex items-center justify-between">
          <h3 className="text-[10px] font-semibold text-green-300 uppercase tracking-[0.13em]">Encoding</h3>
          <span
            className="text-[9px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: `${color}22`, color }}
          >
            {pct >= 80 ? "On Track" : pct >= 50 ? "At Risk" : "Critical"}
          </span>
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
          <SemiGauge value={completed} total={total} color={cfg.accent} line1={line1} line2={line2} />
        </div>

        {/* Pace */}
        <div className="px-5 pb-5 text-center -mt-1">
          {pace === 0 ? (
            <p className="text-[10px] font-semibold text-emerald-600">✓ Target reached</p>
          ) : (
            <p className="text-[10px] text-gray-500">
              Need <span className="font-bold text-gray-700">{fmtVal(pace)}/wk</span> to meet deadline
            </p>
          )}
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
export default function DashboardProgress() {
  const [response, setResponse] = useState<ProgressResponse | null>(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res  = await fetch("/api/progress");
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
  }, []);

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
      {/* Header */}
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
            <span className={`font-semibold ${valPct >= 80 ? "text-emerald-600" : valPct >= 50 ? "text-amber-500" : "text-red-500"}`}>
              ({valPct.toFixed(1)}%)
            </span>
            {" "}· Deadline: June 15, 2026
          </p>
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {loading || !response ? (
          <><SkeletonCard /><SkeletonCard /><SkeletonCard /></>
        ) : (
          <>
            <SimpleCard  title="Validation"   data={response.validation}   />
            <EncodingCard                      data={response.encoding}     />
            <SimpleCard  title="Distribution" data={response.distribution} />
          </>
        )}
      </div>
    </div>
  );
}
