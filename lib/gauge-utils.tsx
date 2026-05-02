"use client";

import React from "react";

export type EncSubfilter = "cocrom" | "arb" | "area" | "amount";

/* ── Gauge geometry ── */
export const CX = 120, CY = 114, R = 96;
export const START_X = CX - R; // 24
export const END_X   = CX + R; // 216

export function gaugePoint(p: number): { x: number; y: number } {
  const angle = Math.PI * (1 - p);
  return { x: CX + R * Math.cos(angle), y: CY - R * Math.sin(angle) };
}

export function gaugeArc(p: number): string | null {
  const clamped = Math.min(Math.max(p, 0), 1);
  if (clamped < 0.004) return null;
  if (clamped >= 0.999) return `M ${START_X} ${CY} A ${R} ${R} 0 0 1 ${END_X} ${CY}`;
  const { x, y } = gaugePoint(clamped);
  return `M ${START_X} ${CY} A ${R} ${R} 0 0 1 ${x.toFixed(3)} ${y.toFixed(3)}`;
}

/* ── Status helpers ── */
export function statusColor(pct: number): string {
  if (pct >= 80) return "#10b981";
  if (pct >= 50) return "#f59e0b";
  return "#ef4444";
}

export function statusTextClass(pct: number): string {
  if (pct >= 80) return "text-emerald-600";
  if (pct >= 50) return "text-amber-500";
  return "text-red-500";
}

export function statusLabel(pct: number): string {
  if (pct >= 80) return "On Track";
  if (pct >= 50) return "At Risk";
  return "Critical";
}

/* ── Deadline ── */
export function daysToDeadline(deadline: Date): number {
  return Math.max(0, Math.floor((deadline.getTime() - Date.now()) / 86400000));
}

/* ── Formatters ── */
export function fmtArea(n: number)   { return n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ha"; }
export function fmtAmount(n: number) { return "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
export function fmtCount(n: number)  { return n.toLocaleString(); }
export function fmtAreaShort(n: number)    { return n.toLocaleString("en-PH", { maximumFractionDigits: 1 }) + " ha."; }
export function fmtAmountShort(n: number): string {
  if (n >= 1_000_000_000) return "₱" + (n / 1_000_000_000).toFixed(2) + "B";
  if (n >= 1_000_000)     return "₱" + (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000)         return "₱" + (n / 1_000).toFixed(1) + "K";
  return "₱" + n.toLocaleString();
}

/* ── SemiGauge ── */
export function SemiGauge({
  value, total, color, subA, subB, totalLabel,
}: {
  value:      number;
  total:      number;
  color:      string;
  subA:       string;
  subB:       string;
  totalLabel: string;
}) {
  const p       = total > 0 ? Math.min(value / total, 1) : 0;
  const pct     = p * 100;
  const arcPath = gaugeArc(p);
  const gradId  = `gg-${color.replace(/[^a-f0-9]/gi, "")}`;

  return (
    <div style={{ maxWidth: "260px", margin: "0 auto" }}>
      <svg viewBox="0 0 240 140" width="100%" aria-hidden>
        <defs>
          <linearGradient id={gradId} x1={START_X} y1="0" x2={END_X} y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="1"    />
          </linearGradient>
        </defs>
        <path
          d={`M ${START_X} ${CY} A ${R} ${R} 0 0 1 ${END_X} ${CY}`}
          fill="none" stroke="#edf0f3" strokeWidth="22" strokeLinecap="round"
        />
        {arcPath && (
          <path d={arcPath} fill="none" stroke={`url(#${gradId})`}
            strokeWidth="22" strokeLinecap="round" />
        )}
        <text x={CX} y="68" fontSize="30" fontWeight="800"
          fill={total === 0 ? "#d1d5db" : color} textAnchor="middle" letterSpacing="-1">
          {total === 0 ? "—" : `${pct.toFixed(1)}%`}
        </text>
        <text x={CX} y="84" fontSize="9" fontWeight="600" fill="#4b5563" textAnchor="middle">
          {total === 0 ? "no data" : subA}
        </text>
        {total > 0 && (
          <text x={CX} y="97" fontSize="9" fill="#9ca3af" textAnchor="middle">{subB}</text>
        )}
        <text x={START_X} y="133" fontSize="9" fontWeight="600" fill="#9ca3af" textAnchor="middle">0</text>
        <text x={END_X}   y="133" fontSize="9" fontWeight="600" fill="#9ca3af" textAnchor="middle">{totalLabel}</text>
      </svg>
    </div>
  );
}
