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

function statusColors(pct: number) {
  if (pct >= 80) return { text: "text-emerald-600" };
  if (pct >= 50) return { text: "text-amber-600"  };
  return           { text: "text-red-600"    };
}

function fmtArea  (n: number) { return n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ha"; }
function fmtAmount(n: number) { return "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtCount (n: number) { return n.toLocaleString(); }

/* ─── Gauge arc math ─── */
/**
 * Computes the SVG arc path for a semi-circle gauge.
 * Spans from (24,112) on the left to (196,112) on the right,
 * going counter-clockwise over the top (viewBox 0 0 220 130, center 110,112, radius 86).
 *
 * p=0   → null (nothing to draw)
 * p=1   → full semi-circle
 */
function gaugeArc(p: number): string | null {
  const clamped = Math.min(Math.max(p, 0), 1);
  if (clamped < 0.003) return null;

  if (clamped >= 0.999) return "M 24 112 A 86 86 0 0 0 196 112";

  const angle = Math.PI * (1 - clamped);
  const ex = (110 + 86 * Math.cos(angle)).toFixed(3);
  const ey = (112 - 86 * Math.sin(angle)).toFixed(3);
  return `M 24 112 A 86 86 0 0 0 ${ex} ${ey}`;
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
  const p    = total > 0 ? value / total : 0;
  const path = gaugeArc(p);

  return (
    <svg viewBox="0 0 220 130" width="100%" aria-hidden>
      {/* Track */}
      <path
        d="M 24 112 A 86 86 0 0 0 196 112"
        fill="none" stroke="#f1f5f9" strokeWidth="22" strokeLinecap="round"
      />
      {/* Progress */}
      {path && (
        <path
          d={path}
          fill="none" stroke={color} strokeWidth="22" strokeLinecap="round"
        />
      )}
      {/* Min label */}
      <text x="16" y="126" fontSize="9" fill="#cbd5e1" textAnchor="middle">0</text>
      {/* Max label */}
      <text x="204" y="126" fontSize="9" fill="#cbd5e1" textAnchor="middle">
        {total.toLocaleString()}
      </text>
      {/* Center line 1 */}
      <text x="110" y="95" fontSize="13" fontWeight="800" fill={color} textAnchor="middle">
        {line1}
      </text>
      {/* Center line 2 */}
      <text x="110" y="110" fontSize="9" fill="#94a3b8" textAnchor="middle">
        {line2}
      </text>
    </svg>
  );
}

/* ─── SimpleCard (Validation + Distribution) ─── */
function SimpleCard({
  title,
  accent,
  data,
}: {
  title:  string;
  accent: string;
  data:   SimpleMilestone;
}) {
  const pct       = data.total > 0 ? (data.completed / data.total) * 100 : 0;
  const remaining = data.total - data.completed;
  const weeksLeft = Math.ceil(daysToDeadline() / 7);
  const pace      = weeksLeft > 0 && remaining > 0
    ? Math.ceil(remaining / weeksLeft)
    : 0;
  const col = statusColors(pct);

  const verb  = title === "Validation" ? "validated" : "distributed";
  const noun  = title === "Validation" ? "landholdings" : "ARBs";
  const line1 = `${data.completed.toLocaleString()} ${verb}`;
  const line2 = `${pct.toFixed(1)}% of ${data.total.toLocaleString()} ${noun}`;

  return (
    <div className="card-bezel">
      <div className="card-bezel-inner">
        <div className="bg-green-900 px-5 py-2.5 rounded-t-[17px]">
          <h3 className="text-[10px] font-semibold text-green-300 uppercase tracking-[0.13em]">{title}</h3>
        </div>

        {/* Stats row */}
        <div className="px-5 pt-4 pb-2 flex items-start justify-between gap-2">
          <div>
            <p className={`text-[1.6rem] font-bold tabular-nums leading-none ${col.text}`}>
              {data.completed.toLocaleString()}
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">of {data.total.toLocaleString()}</p>
          </div>
          <div className="text-right">
            <p className={`text-[1.1rem] font-bold tabular-nums leading-none ${col.text}`}>
              {pct.toFixed(1)}%
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">{remaining.toLocaleString()} left</p>
          </div>
        </div>

        {/* Gauge */}
        <div className="px-4">
          <SemiGauge
            value={data.completed}
            total={data.total}
            color={accent}
            line1={line1}
            line2={line2}
          />
        </div>

        {/* Required pace */}
        <div className="px-5 pb-5 text-center">
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
  const pace      = weeksLeft > 0 && remaining > 0
    ? Math.ceil(remaining / weeksLeft)
    : 0;
  const col = statusColors(pct);

  const fmtVal = (n: number) =>
    sub === "area"   ? fmtArea(n)
    : sub === "amount" ? fmtAmount(n)
    : fmtCount(n);

  const unitLabel =
    sub === "cocrom" ? "COCROMs"
    : sub === "arb"  ? "ARBs"
    : sub === "area" ? "ha."
    :                  "condoned amt";

  const line1 = `${fmtVal(completed)} encoded`;
  const line2 = `${pct.toFixed(1)}% of ${fmtVal(total)} ${unitLabel}`;

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

        {/* Stats row */}
        <div className="px-5 pt-3 pb-2 flex items-start justify-between gap-2">
          <div>
            <p className={`text-[1.6rem] font-bold tabular-nums leading-none ${col.text}`}>
              {fmtVal(completed)}
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">of {fmtVal(total)}</p>
          </div>
          <div className="text-right">
            <p className={`text-[1.1rem] font-bold tabular-nums leading-none ${col.text}`}>
              {pct.toFixed(1)}%
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">{fmtVal(remaining)} left</p>
          </div>
        </div>

        {/* Gauge */}
        <div className="px-4">
          <SemiGauge
            value={completed}
            total={total}
            color={cfg.accent}
            line1={line1}
            line2={line2}
          />
        </div>

        {/* Required pace */}
        <div className="px-5 pb-5 text-center">
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
          {/* Semi-circle gauge skeleton */}
          <div className="flex justify-center">
            <div
              className="bg-gray-100"
              style={{
                width: "100%",
                height: "96px",
                borderRadius: "50% 50% 0 0 / 100% 100% 0 0",
              }}
            />
          </div>
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
      </div>

      {/* ── 3 cards ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {loading || !response ? (
          <><SkeletonCard /><SkeletonCard /><SkeletonCard /></>
        ) : (
          <>
            <SimpleCard  title="Validation"   accent="#3b82f6" data={response.validation}   />
            <EncodingCard                                       data={response.encoding}     />
            <SimpleCard  title="Distribution" accent="#10b981" data={response.distribution} />
          </>
        )}
      </div>
    </div>
  );
}
