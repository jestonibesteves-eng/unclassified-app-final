"use client";

import { useEffect, useRef, useState } from "react";

/* ─── Count-up hook ─── */
function useCountUp(target: number, duration = 900) {
  const [count, setCount] = useState(0);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    startRef.current = null;
    const step = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const progress = Math.min((ts - startRef.current) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * target));
      if (progress < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return count;
}

/* ─── Compact number formatter ─── */
function formatCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) {
    return (Math.trunc(n / 100_000_000) / 10).toFixed(1).replace(/\.0$/, "") + "B";
  }
  if (abs >= 1_000_000) {
    return (Math.trunc(n / 100_000) / 10).toFixed(1).replace(/\.0$/, "") + "M";
  }
  if (abs >= 1_000) {
    return (Math.trunc(n / 100) / 10).toFixed(1).replace(/\.0$/, "") + "k";
  }
  return n.toLocaleString();
}

/* ─── Stat card ─── */
const CARD_CFG = {
  green:  { top: "border-t-emerald-500", num: "text-emerald-700", dot: "bg-emerald-500" },
  amber:  { top: "border-t-amber-500",   num: "text-amber-700",   dot: "bg-amber-500"  },
  red:    { top: "border-t-red-500",     num: "text-red-600",     dot: "bg-red-500"    },
  blue:   { top: "border-t-blue-500",    num: "text-blue-700",    dot: "bg-blue-500"   },
  purple: { top: "border-t-purple-500",  num: "text-purple-700",  dot: "bg-purple-500" },
  teal:   { top: "border-t-teal-500",    num: "text-teal-700",    dot: "bg-teal-500"   },
  orange: { top: "border-t-orange-500",  num: "text-orange-700",  dot: "bg-orange-500" },
} as const;

function StatCard({
  label, rawValue, displayValue, sub, color, index, prefix = "",
}: {
  label: React.ReactNode;
  rawValue: number;
  displayValue: string;
  sub: React.ReactNode;
  color: keyof typeof CARD_CFG;
  index: number;
  prefix?: string;
}) {
  const count = useCountUp(rawValue, 800 + index * 100);
  const done = count >= rawValue;
  const cfg = CARD_CFG[color];

  const wrapRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [isOverflow, setIsOverflow] = useState(false);

  useEffect(() => {
    const wrap = wrapRef.current;
    const measure = measureRef.current;
    if (!wrap || !measure) return;
    const check = () => setIsOverflow(measure.scrollWidth > wrap.clientWidth);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [displayValue]);

  return (
    <div
      className="card-bezel dash-stat-card h-full"
      style={{ "--card-delay": `${index * 70}ms` } as React.CSSProperties}
    >
      <div className={`card-bezel-inner h-full border-t-4 ${cfg.top} p-5`}>
        <div className="flex items-start justify-between mb-4">
          <p className="text-[10px] tracking-[0.13em] font-semibold text-gray-400 leading-snug">
            {label}
          </p>
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot} mt-0.5`} />
        </div>
        <div ref={wrapRef} className="relative mb-2 overflow-hidden">
          {/* Hidden measurer — always renders the full value to detect overflow */}
          <span
            ref={measureRef}
            aria-hidden
            className="absolute opacity-0 pointer-events-none whitespace-nowrap font-bold tabular-nums text-[1.6rem] sm:text-[2.5rem] leading-none"
          >
            {displayValue}
          </span>
          <p className={`text-[1.6rem] sm:text-[2.5rem] leading-none font-bold tabular-nums whitespace-nowrap overflow-hidden text-ellipsis ${cfg.num}`}>
            {done
              ? (isOverflow ? prefix + formatCompact(rawValue) : displayValue)
              : (isOverflow ? prefix + formatCompact(count) : prefix + count.toLocaleString())}
          </p>
        </div>
        <p className="text-[11px] text-gray-400">{sub}</p>
      </div>
    </div>
  );
}

/* ─── Issue breakdown strip ─── */
const STRIP_SEGS = [
  { key: "noIssues" as const,         label: "No Issues",                              bar: "bg-emerald-500", dot: "bg-emerald-500", text: "text-emerald-700" },
  { key: "zeroAmendarea" as const,    label: "Zero Validated AMENDAREA",               bar: "bg-amber-400",   dot: "bg-amber-400",   text: "text-amber-700"  },
  { key: "zeroCondoned" as const,     label: "Zero Condoned Amount (NET_OF_REVAL)",    bar: "bg-orange-400",  dot: "bg-orange-400",  text: "text-orange-700" },
  { key: "negativeCondoned" as const, label: "Negative Condoned Amount (NET_OF_REVAL)", bar: "bg-red-500",     dot: "bg-red-500",     text: "text-red-700"    },
  { key: "crossProvince" as const,    label: "Cross Province Duplicates",               bar: "bg-purple-500",  dot: "bg-purple-500",  text: "text-purple-700" },
  { key: "unprocessed" as const,      label: "Unprocessed",                             bar: "bg-slate-400",   dot: "bg-slate-400",   text: "text-slate-600"  },
];

type StripData = {
  noIssues: number;
  zeroAmendarea: number;
  zeroCondoned: number;
  negativeCondoned: number;
  crossProvince: number;
  unprocessed: number;
  total: number;
};

function pct(n: number, total: number) {
  return total === 0 ? 0 : (n / total) * 100;
}

export function IssueStrip({ data }: { data: StripData }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(t);
  }, []);

  const segs = STRIP_SEGS
    .map((s) => ({ ...s, count: data[s.key] }))
    .filter((s) => s.count > 0);

  return (
    <div className="card-bezel mb-6">
      <div className="card-bezel-inner-open">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] uppercase tracking-[0.13em] font-semibold text-gray-400">
            Data Issue Breakdown
          </span>
          <span className="text-[11px] font-mono text-gray-400">
            {data.total.toLocaleString()} records
          </span>
        </div>

      {/* Segmented bar */}
      <div className="flex h-2.5 rounded-full overflow-hidden bg-gray-100 mb-4">
        {segs.map((s, i) => (
          <div
            key={s.key}
            className={`${s.bar} transition-all duration-700 ease-out ${i > 0 ? "ml-px" : ""}`}
            style={{ width: mounted ? `${pct(s.count, data.total)}%` : "0%" }}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {segs.map((s) => (
          <div key={s.key} className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-sm flex-shrink-0 ${s.dot}`} />
            <span className={`text-[12px] font-bold tabular-nums ${s.text}`}>
              {s.count.toLocaleString()}
            </span>
            <span className="text-[11px] text-gray-500">{s.label}</span>
            <span className="text-[10px] text-gray-300">
              {pct(s.count, data.total).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}

/* ─── Stat cards grid ─── */
export function DashboardStatCards({
  total, totalArea, validatedCount, validatedArea, validatedCondoned,
  notEligibleForEncodingCount, notEligibleForEncodingArea, notEligibleForEncodingCondoned,
  distinctCarpableARBCount, serviceCarpableARBCount, nonCarpableARBCount,
  noIssuesCount, useValidated, distinctLOCount, totalCondoned,
  cocromCount, eligibleArbCount, cocromForValidation, cocromForEncoding, cocromEncoded, cocromDistributed,
  eligibleDistinctCarpableARBCount,
}: {
  total: number;
  totalArea: number;
  validatedCount: number;
  validatedArea: number;
  validatedCondoned: number;
  notEligibleForEncodingCount: number;
  notEligibleForEncodingArea: number;
  notEligibleForEncodingCondoned: number;
  distinctCarpableARBCount: number;
  serviceCarpableARBCount: number;
  nonCarpableARBCount: number;
  noIssuesCount: number;
  useValidated: boolean;
  distinctLOCount: number;
  totalCondoned: number;
  cocromCount: number;
  eligibleArbCount: number;
  cocromForValidation: number;
  cocromForEncoding: number;
  cocromEncoded: number;
  cocromDistributed: number;
  eligibleDistinctCarpableARBCount: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 mb-6 lg:grid-cols-6">
      <StatCard
        label="TOTAL RECORDS"
        rawValue={total}
        displayValue={total.toLocaleString()}
        sub={<>{validatedCount.toLocaleString()} landholdings validated <span className="text-red-300">({notEligibleForEncodingCount.toLocaleString()} Not Eligible for Encoding)</span></>}
        color="green"
        index={0}
      />
      <StatCard
        label={<>TOTAL NO. OF LO<span className="text-[8px]">s</span></>}
        rawValue={distinctLOCount}
        displayValue={distinctLOCount.toLocaleString()}
        sub="Distinct landowners"
        color="purple"
        index={1}
      />
      <StatCard
        label={useValidated ? "TOTAL AREA · VALIDATED" : "TOTAL AREA · ORIGINAL"}
        rawValue={Math.floor(totalArea)}
        displayValue={totalArea.toLocaleString("en-PH", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}
        sub={
          useValidated
            ? <>{validatedArea.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} has. validated <span className="text-red-300">({notEligibleForEncodingArea.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Not Eligible for Encoding)</span></>

            : "Based on original AMENDAREA"
        }
        color={useValidated ? "amber" : "blue"}
        index={2}
      />
      <StatCard
        label="TOTAL AMOUNT CONDONED"
        rawValue={Math.floor(totalCondoned)}
        displayValue={"₱" + totalCondoned.toLocaleString("en-PH", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}
        sub={<>₱{validatedCondoned.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} validated <span className="text-red-300">(₱{notEligibleForEncodingCondoned.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Not Eligible for Encoding)</span></>}
        color="teal"
        index={3}
        prefix="₱"
      />
      <StatCard
        label={<>TOTAL NO. OF COCROM<span className="text-[8px]">s</span></>}
        rawValue={cocromCount}
        displayValue={cocromCount.toLocaleString()}
        sub={
          <span className="flex flex-col gap-1">
            <span>{eligibleArbCount.toLocaleString()} eligible · {(cocromCount - eligibleArbCount).toLocaleString()} not eligible</span>
            <span className="border-t border-gray-200 pt-1">{cocromForValidation.toLocaleString()} for val. · {cocromForEncoding.toLocaleString()} for enc. · {cocromEncoded.toLocaleString()} enc'd · {cocromDistributed.toLocaleString()} distrib.</span>
          </span>
        }
        color="orange"
        index={4}
      />
      <StatCard
        label={<>ARB<span className="text-[8px]">s</span> UPLOADED</>}
        rawValue={distinctCarpableARBCount}
        displayValue={distinctCarpableARBCount.toLocaleString()}
        sub={
          <span className="flex flex-col gap-1">
            <span>{eligibleDistinctCarpableARBCount.toLocaleString()} eligible ARBs · {(distinctCarpableARBCount - eligibleDistinctCarpableARBCount).toLocaleString()} not eligible ARBs</span>
            <span className="border-t border-gray-200 pt-1">Service count: {serviceCarpableARBCount.toLocaleString()} CARPable lots · {nonCarpableARBCount.toLocaleString()} Non-CARPable lots</span>
          </span>
        }
        color="blue"
        index={5}
      />
    </div>
  );
}
