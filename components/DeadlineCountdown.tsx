"use client";

import { useEffect, useState } from "react";

const DEADLINE = new Date("2026-06-15T00:00:00+08:00");
const DEADLINE_MS = DEADLINE.getTime();

// Total span from project start to deadline (used for arc fill %)
// We treat "start" as 365 days before deadline
const TOTAL_MS = 365 * 24 * 60 * 60 * 1000;

type Urgency = "safe" | "warn" | "danger";

function urgency(msLeft: number): Urgency {
  const days = msLeft / 86400000;
  if (days <= 30) return "danger";
  if (days <= 60) return "warn";
  return "safe";
}

const THEME = {
  safe: {
    ring: "#059669",        // emerald-600
    ringBg: "#d1fae5",     // emerald-100
    num: "text-emerald-700",
    label: "text-emerald-500",
    badge: "bg-emerald-100 text-emerald-700",
    glow: "rgba(5,150,105,0.18)",
  },
  warn: {
    ring: "#d97706",
    ringBg: "#fef3c7",
    num: "text-amber-700",
    label: "text-amber-500",
    badge: "bg-amber-100 text-amber-700",
    glow: "rgba(217,119,6,0.18)",
  },
  danger: {
    ring: "#dc2626",
    ringBg: "#fee2e2",
    num: "text-red-700",
    label: "text-red-500",
    badge: "bg-red-100 text-red-700",
    glow: "rgba(220,38,38,0.18)",
  },
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function decompose(msLeft: number) {
  const totalSecs = Math.max(0, Math.floor(msLeft / 1000));
  const days    = Math.floor(totalSecs / 86400);
  const hours   = Math.floor((totalSecs % 86400) / 3600);
  const minutes = Math.floor((totalSecs % 3600) / 60);
  const seconds = totalSecs % 60;
  return { days, hours, minutes, seconds, totalSecs };
}

// SVG arc helpers
const R = 28;
const CX = 38;
const CY = 38;
const CIRCUMFERENCE = 2 * Math.PI * R;

function arcDashOffset(msLeft: number): number {
  const elapsed = TOTAL_MS - msLeft;
  const pct = Math.min(1, Math.max(0, elapsed / TOTAL_MS));
  // fill from left: we want remaining portion = 1 - pct
  return CIRCUMFERENCE * pct;
}

function Unit({ value, label, theme }: { value: string; label: string; theme: typeof THEME.safe }) {
  return (
    <div className="flex flex-col items-center gap-0">
      <span
        className="font-mono text-[1.45rem] font-black leading-none tabular-nums"
        style={{ color: theme.ring }}
      >
        {value}
      </span>
      <span className="text-[8px] uppercase tracking-[0.14em] font-semibold" style={{ color: theme.ring, opacity: 0.55 }}>
        {label}
      </span>
    </div>
  );
}

function Colon({ theme }: { theme: typeof THEME.safe }) {
  return (
    <span
      className="text-[1.1rem] font-black leading-none mb-1 animate-[blink_1s_step-end_infinite]"
      style={{ color: theme.ring, opacity: 0.4 }}
    >
      :
    </span>
  );
}

export default function DeadlineCountdown({ className = "" }: { className?: string }) {
  const [msLeft, setMsLeft] = useState(() => DEADLINE_MS - Date.now());

  useEffect(() => {
    const tick = () => setMsLeft(DEADLINE_MS - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const theme = THEME[urgency(msLeft)];
  const { days, hours, minutes, seconds } = decompose(msLeft);
  const dashOffset = arcDashOffset(msLeft);
  const weeksLeft = Math.ceil(days / 7);

  return (
    <div
      className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border ${className}`}
      style={{
        background: `linear-gradient(135deg, ${theme.ringBg}cc 0%, white 100%)`,
        borderColor: theme.ring + "44",
        boxShadow: `0 0 0 1px ${theme.ring}18, 0 4px 20px ${theme.glow}`,
      }}
    >
      {/* SVG arc clock */}
      <div className="shrink-0 relative" style={{ width: 76, height: 76 }}>
        <svg width="76" height="76" viewBox="0 0 76 76" className="block -rotate-90">
          <circle
            cx={CX} cy={CY} r={R}
            fill="none"
            stroke={theme.ring}
            strokeOpacity={0.12}
            strokeWidth="5"
            strokeLinecap="round"
          />
          <circle
            cx={CX} cy={CY} r={R}
            fill="none"
            stroke={theme.ring}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(0.4,0,0.2,1)" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="font-mono font-black leading-none tabular-nums"
            style={{ color: theme.ring, fontSize: "1.25rem" }}
          >
            {days}
          </span>
          <span
            className="text-[7px] uppercase tracking-[0.12em] font-bold mt-px"
            style={{ color: theme.ring, opacity: 0.6 }}
          >
            days
          </span>
          <span
            className="text-[6.5px] font-semibold"
            style={{ color: theme.ring, opacity: 0.42 }}
          >
            ({weeksLeft} wks)
          </span>
        </div>
      </div>

      {/* Right column */}
      <div className="flex flex-col gap-1 min-w-0">
        <span
          className={`self-start text-[7.5px] font-bold uppercase tracking-[0.2em] px-1.5 py-0.5 rounded-full ${theme.badge}`}
        >
          Deadline Countdown
        </span>
        <div className="flex items-end gap-0.5">
          <Unit value={pad(hours)}   label="hrs"  theme={theme} />
          <Colon theme={theme} />
          <Unit value={pad(minutes)} label="min"  theme={theme} />
          <Colon theme={theme} />
          <Unit value={pad(seconds)} label="sec"  theme={theme} />
        </div>
        <p className="text-[8.5px] font-medium leading-none" style={{ color: theme.ring, opacity: 0.5 }}>
          June 15, 2026
        </p>
      </div>
    </div>
  );
}
