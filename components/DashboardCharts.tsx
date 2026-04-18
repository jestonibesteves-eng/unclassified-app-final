"use client";

import { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend, LabelList,
} from "recharts";

/* ─── Color palettes ─── */
const PROVINCE_COLORS = [
  "#14532d", "#166534", "#15803d", "#16a34a",
  "#22c55e", "#4ade80", "#86efac",
];

const FLAG_COLORS: Record<string, string> = {
  "No Issues":                               "#10b981",
  "Zero Validated AMENDAREA":               "#f59e0b",
  "Zero Condoned Amount (NET_OF_REVAL)":    "#f97316",
  "Negative Condoned Amount (NET_OF_REVAL)": "#ef4444",
  "Cross Province Duplicates":               "#a855f7",
  "Unprocessed":                             "#94a3b8",
};

const STATUS_COLORS = [
  "#10b981", "#3b82f6", "#f59e0b",
  "#ef4444", "#8b5cf6", "#6b7280",
];

type KV = { name: string; value: number };
type ProvinceKV = { name: string; value: number; area: number };

/* ─── Shared dark tooltip ─── */
function DarkTooltip({
  active, payload, label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-900 text-white text-[11px] px-3 py-2 rounded-lg shadow-xl border border-gray-700">
      {label && <p className="font-semibold text-gray-300 mb-1">{label}</p>}
      {payload.map((p) => (
        <p key={p.name}>
          <span className="text-gray-400">{p.name}: </span>
          <span className="font-bold">{p.value.toLocaleString()}</span>
        </p>
      ))}
    </div>
  );
}

/* ─── Province chart tooltip (area formatted with ha.) ─── */
function ProvinceTooltip({
  active, payload, label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value?: number; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-900 text-white text-[11px] px-3 py-2 rounded-lg shadow-xl border border-gray-700">
      {label && <p className="font-semibold text-gray-300 mb-1">{label}</p>}
      {payload.map((p) => (
        <p key={p.name}>
          <span className="text-gray-400">{p.name}: </span>
          <span className="font-bold">
            {p.name === "Area (ha.)"
              ? Number(p.value ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ha."
              : Number(p.value ?? 0).toLocaleString()}
          </span>
        </p>
      ))}
    </div>
  );
}

/* ─── Province bar chart ─── */
export function ProvinceBarChart({ data }: { data: ProvinceKV[] }) {
  return (
    <div>
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 12, right: 48, left: 0, bottom: 68 }} barCategoryGap="25%" barGap={2}>
        <XAxis
          dataKey="name"
          tick={{ fontSize: 10, fill: "#9ca3af" }}
          angle={-40}
          textAnchor="end"
          interval={0}
          axisLine={false}
          tickLine={false}
        />
        {/* Left axis — record count */}
        <YAxis
          yAxisId="records"
          tick={{ fontSize: 10, fill: "#9ca3af" }}
          width={40}
          axisLine={false}
          tickLine={false}
        />
        {/* Right axis — area */}
        <YAxis
          yAxisId="area"
          orientation="right"
          tick={{ fontSize: 10, fill: "#2563eb" }}
          width={48}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => {
            if (v >= 1000) return (v / 1000).toFixed(0) + "k";
            return v;
          }}
        />
        <Tooltip content={<ProvinceTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
        <Legend
          verticalAlign="top"
          align="right"
          iconType="square"
          iconSize={10}
          formatter={(value) => (
            <span style={{ fontSize: 11, color: "#6b7280" }}>{value}</span>
          )}
          wrapperStyle={{ paddingBottom: 8 }}
        />
        <Bar yAxisId="records" dataKey="value" name="Records" radius={[3, 3, 0, 0]} maxBarSize={20} fill="#15803d" />
        <Bar yAxisId="area" dataKey="area" name="Area (ha.)" radius={[3, 3, 0, 0]} maxBarSize={20} fill="#2563eb" />
      </BarChart>
    </ResponsiveContainer>
    <p className="text-[10px] text-gray-300 text-right mt-1 pr-1">
      Sorted by record count, highest to lowest
    </p>
    </div>
  );
}

/* ─── Flag donut chart ─── */
export function FlagPieChart({ data }: { data: KV[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart margin={{ top: 12, right: 0, left: 0, bottom: 0 }}>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="47%"
          innerRadius={60}
          outerRadius={95}
          paddingAngle={2}
          label={({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
            if ((percent ?? 0) < 0.05) return null;
            const RADIAN = Math.PI / 180;
            const ma = midAngle ?? 0;
            const ir = innerRadius ?? 0;
            const or = outerRadius ?? 0;
            const r = ir + (or - ir) * 0.5;
            const x = (cx as number) + r * Math.cos(-ma * RADIAN);
            const y = (cy as number) + r * Math.sin(-ma * RADIAN);
            return (
              <text
                x={x} y={y}
                fill="white"
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={11}
                fontWeight={700}
              >
                {((percent ?? 0) * 100).toFixed(0)}%
              </text>
            );
          }}
          labelLine={false}
        >
          {data.map((entry, i) => (
            <Cell
              key={i}
              fill={FLAG_COLORS[entry.name] ?? STATUS_COLORS[i % STATUS_COLORS.length]}
            />
          ))}
        </Pie>
        <Tooltip content={<DarkTooltip />} />
        <Legend
          formatter={(value) => (
            <span style={{ fontSize: 11, color: "#4b5563" }}>{value}</span>
          )}
          wrapperStyle={{ paddingTop: 8 }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

/* ─── Status bar chart with records / area toggle ─── */
const STATUS_COLORS_MAP: Record<string, string> = {
  "For Initial Validation": "#6b7280",
  "For Further Validation": "#f59e0b",
  "For Encoding": "#3b82f6",
  "Fully Encoded": "#10b981",
  "Partially Encoded": "#34d399",
  "Fully Distributed": "#8b5cf6",
  "Partially Distributed": "#a78bfa",
  "Not Eligible for Encoding": "#ef4444",
};

type StatusKV = { name: string; value: number; area: number };

export function StatusWithAreaChart({ data }: { data: StatusKV[] }) {
  const [mode, setMode] = useState<"records" | "area">("records");
  const sorted = [...data].sort((a, b) =>
    mode === "records" ? b.value - a.value : b.area - a.area,
  );
  const totalRecords = data.reduce((s, d) => s + d.value, 0);
  const totalArea = data.reduce((s, d) => s + d.area, 0);

  return (
    <div>
      {/* Toggle */}
      <div className="flex justify-end mb-3">
        <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-[11px] font-semibold">
          <button
            onClick={() => setMode("records")}
            className={`px-3 py-1 transition-colors ${mode === "records" ? "bg-green-900 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
          >
            No. of LHs
          </button>
          <button
            onClick={() => setMode("area")}
            className={`px-3 py-1 transition-colors border-l border-gray-200 ${mode === "area" ? "bg-green-900 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
          >
            Validated Area
          </button>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <BarChart
          data={sorted}
          layout="vertical"
          margin={{ top: 4, right: 96, left: 4, bottom: 4 }}
        >
          <XAxis
            type="number"
            tick={{ fontSize: 10, fill: "#9ca3af" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={mode === "area" ? (v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v : undefined}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 10, fill: "#6b7280" }}
            width={148}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const val = Number(payload[0]?.value ?? 0);
              return (
                <div className="bg-gray-900 text-white text-[11px] px-3 py-2 rounded-lg shadow-xl border border-gray-700">
                  <p className="font-semibold text-gray-300 mb-1">{label}</p>
                  <p>
                    <span className="text-gray-400">{mode === "records" ? "Records: " : "Area: "}</span>
                    <span className="font-bold">
                      {mode === "area"
                        ? val.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ha."
                        : val.toLocaleString()}
                    </span>
                  </p>
                </div>
              );
            }}
            cursor={{ fill: "rgba(0,0,0,0.04)" }}
          />
          <Bar dataKey={mode === "records" ? "value" : "area"} radius={[0, 3, 3, 0]} maxBarSize={22}>
            <LabelList
              dataKey={mode === "records" ? "value" : "area"}
              position="right"
              formatter={(v: unknown) => {
                const n = Number(v ?? 0);
                const total = mode === "records" ? totalRecords : totalArea;
                const pct = total > 0 ? ((n / total) * 100).toFixed(1) : "0.0";
                if (mode === "area") {
                  return `${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${pct}%)`;
                }
                return `${n.toLocaleString()} (${pct}%)`;
              }}
              style={{ fontSize: 10, fill: "#6b7280", fontWeight: 600 }}
            />
            {sorted.map((entry) => (
              <Cell key={entry.name} fill={STATUS_COLORS_MAP[entry.name] ?? "#6b7280"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="text-[10px] text-gray-300 text-right mt-1 pr-1">
        Sorted by {mode === "records" ? "record count" : "validated area"}, highest to lowest
      </p>
    </div>
  );
}

/* ─── Status horizontal bar chart ─── */
export function StatusBarChart({ data }: { data: KV[] }) {
  const sorted = [...data].sort((a, b) => b.value - a.value);
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart
        data={sorted}
        layout="vertical"
        margin={{ top: 4, right: 52, left: 4, bottom: 4 }}
      >
        <XAxis
          type="number"
          tick={{ fontSize: 10, fill: "#9ca3af" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 10, fill: "#6b7280" }}
          width={140}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<DarkTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
        <Bar dataKey="value" name="Records" radius={[0, 3, 3, 0]} maxBarSize={22}>
          <LabelList
            dataKey="value"
            position="right"
            formatter={(v: unknown) => (typeof v === "number" ? v.toLocaleString() : String(v))}
            style={{ fontSize: 10, fill: "#6b7280", fontWeight: 600 }}
          />
          {sorted.map((_, i) => (
            <Cell key={i} fill={STATUS_COLORS[i % STATUS_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ─── Source donut chart ─── */
export function SourcePieChart({ data }: { data: KV[] }) {
  const colors = ["#15803d", "#3b82f6", "#f59e0b", "#8b5cf6"];
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={88}
          paddingAngle={3}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={colors[i % colors.length]} />
          ))}
        </Pie>
        <Tooltip content={<DarkTooltip />} />
      </PieChart>
    </ResponsiveContainer>
  );
}

/* ─── COCROM Encoding Status donut chart ─── */

export type CocromChartMode = "cocrom" | "arbs" | "area" | "amount";

type CocromSeg = { count: number; arbs: number; area: number; amount: number };

export type CocromSourceRow = { status: string; count: number; area: number };

export type CocromEncodingData = {
  encoded:           CocromSeg;
  forEncoding:       CocromSeg;
  arbNotEligible:    CocromSeg;
  nonArbNotEligible: CocromSeg;
};

const COCROM_ENC_SEGS = [
  { key: "encoded"           as const, label: "Encoded",               color: "#10b981" },
  { key: "forEncoding"       as const, label: "For Encoding",          color: "#3b82f6" },
  { key: "arbNotEligible"    as const, label: "ARB Not Eligible",      color: "#f59e0b" },
  { key: "nonArbNotEligible" as const, label: "Non-ARB Not Eligible",  color: "#6b7280" },
];

export function CocromEncodingChart({
  data,
  sourceLandholdings,
  mode: externalMode,
  onModeChange,
}: {
  data: CocromEncodingData;
  sourceLandholdings: CocromSourceRow[];
  mode?: CocromChartMode;
  onModeChange?: (m: CocromChartMode) => void;
}) {
  const [internalMode, setInternalMode] = useState<CocromChartMode>("cocrom");
  const mode = externalMode ?? internalMode;
  const setMode = onModeChange ?? setInternalMode;
  const [hovering, setHovering] = useState(false);

  const getValue = (seg: CocromSeg) =>
    mode === "cocrom" ? seg.count : mode === "arbs" ? seg.arbs : mode === "area" ? seg.area : seg.amount;

  const fmtCenter = (n: number) =>
    mode === "area" || mode === "amount"
      ? n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : n.toLocaleString();

  const fmtLegend = (n: number) =>
    mode === "area"
      ? n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ha."
      : mode === "amount"
      ? n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : n.toLocaleString();

  const chartData = COCROM_ENC_SEGS
    .map((s) => ({
      name:  s.label,
      color: s.color,
      value: getValue(data[s.key]),
      raw:   data[s.key],
    }))
    .filter((d) => d.value > 0);

  const total = chartData.reduce((s, d) => s + d.value, 0);

  return (
    <div>
      {/* Filter toggle */}
      <div className="flex flex-wrap justify-end gap-y-1 mb-3">
        <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-[11px] font-semibold">
          {([
            { k: "cocrom" as const, l: "COCROMs"      },
            { k: "arbs"   as const, l: "ARBs (dist.)" },
            { k: "area"   as const, l: "Area"          },
            { k: "amount" as const, l: "Amount"        },
          ]).map(({ k, l }, i) => (
            <button
              key={k}
              onClick={() => setMode(k)}
              className={`px-2.5 py-1 transition-colors ${i > 0 ? "border-l border-gray-200" : ""} ${
                mode === k
                  ? "bg-green-900 text-white"
                  : "bg-white text-gray-500 hover:bg-gray-50"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Disclaimer note */}
      <p className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1 mb-3 leading-snug">
        COCROMs already distributed are not counted in this chart.
      </p>

      {/* Donut + center label */}
      <div className="relative">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={68}
              outerRadius={100}
              paddingAngle={2}
              labelLine={false}
              onMouseEnter={() => setHovering(true)}
              onMouseLeave={() => setHovering(false)}
            >
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0]?.payload as (typeof chartData)[number];
                return (
                  <div className="bg-gray-900 text-white text-[11px] px-3 py-2 rounded-lg shadow-xl border border-gray-700 space-y-0.5">
                    <p className="font-semibold text-gray-300 mb-1">{d.name}</p>
                    <p>
                      <span className="text-gray-400">COCROMs: </span>
                      <span className="font-bold">{d.raw.count.toLocaleString()}</span>
                    </p>
                    <p>
                      <span className="text-gray-400">ARBs (distinct): </span>
                      <span className="font-bold">{d.raw.arbs.toLocaleString()}</span>
                    </p>
                    <p>
                      <span className="text-gray-400">Area: </span>
                      <span className="font-bold">
                        {d.raw.area.toLocaleString("en-PH", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })} ha.
                      </span>
                    </p>
                  </div>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>

        {/* Center text — hidden while hovering so it doesn't clash with the tooltip */}
        {!hovering && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <p className="text-[1.35rem] font-bold text-gray-900 tabular-nums leading-none">
                {fmtCenter(total)}
              </p>
              {mode === "area" && (
                <p className="text-[9px] font-semibold text-gray-400 tracking-wide mt-0.5">ha.</p>
              )}
              <p className="text-[9px] text-gray-400 uppercase tracking-widest mt-1">
                {mode === "cocrom" ? "COCROMs" : mode === "arbs" ? "ARBs" : mode === "area" ? "Total Area" : "Condoned Amt"}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Custom legend with values and percentages */}
      <div className="flex flex-col gap-1.5 mt-3">
        {COCROM_ENC_SEGS.map((s) => {
          const val = getValue(data[s.key]);
          const pct = total > 0 ? ((val / total) * 100).toFixed(1) : "0.0";
          return (
            <div key={s.key} className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                style={{ backgroundColor: s.color }}
              />
              <span className="text-[11px] text-gray-500 flex-1 leading-tight">{s.label}</span>
              <span className="text-[11px] font-bold text-gray-700 tabular-nums">
                {fmtLegend(val)}
              </span>
              <span className="text-[10px] text-gray-400 tabular-nums w-10 text-right">
                {pct}%
              </span>
            </div>
          );
        })}
      </div>

      {/* Source landholdings table */}
      {sourceLandholdings.length > 0 && (
        <div className="mt-4 border-t border-gray-100 pt-3">
          <p className="text-[9px] uppercase tracking-[0.13em] font-semibold text-gray-400 mb-2">
            Source Landholdings
          </p>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-gray-400">
                <th className="text-left font-medium pb-1.5 pr-2">Status</th>
                <th className="text-right font-medium pb-1.5 pr-2 tabular-nums">Landholdings</th>
                <th className="text-right font-medium pb-1.5 tabular-nums">Validated Area</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sourceLandholdings.map((row) => (
                <tr key={row.status}>
                  <td className="py-1 pr-2 text-gray-600 leading-tight">{row.status}</td>
                  <td className="py-1 pr-2 text-right font-bold text-gray-800 tabular-nums">
                    {row.count.toLocaleString()}
                  </td>
                  <td className="py-1 text-right font-bold text-gray-800 tabular-nums">
                    {row.area.toLocaleString("en-PH", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    <span className="font-normal text-gray-400">ha.</span>
                  </td>
                </tr>
              ))}
              {/* Totals row */}
              <tr className="border-t border-gray-200">
                <td className="pt-1.5 pr-2 font-semibold text-gray-700">Total</td>
                <td className="pt-1.5 pr-2 text-right font-bold text-gray-900 tabular-nums">
                  {sourceLandholdings.reduce((s, r) => s + r.count, 0).toLocaleString()}
                </td>
                <td className="pt-1.5 text-right font-bold text-gray-900 tabular-nums">
                  {sourceLandholdings
                    .reduce((s, r) => s + r.area, 0)
                    .toLocaleString("en-PH", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                  <span className="font-normal text-gray-400">ha.</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─── COCROM Distribution bar chart (per province) ─── */

export type CocromDistributionRow = {
  province: string;
  count: number;
  arbs: number;
  area: number;
  amount: number;
};

export type CocromDistNotEligible = {
  arbNotEligible:    CocromSeg;
  nonArbNotEligible: CocromSeg;
};

const DIST_PROVINCE_COLORS = [
  "#7c3aed", "#6d28d9", "#5b21b6", "#8b5cf6",
  "#a78bfa", "#4c1d95", "#c4b5fd",
];

export function CocromDistributionChart({
  data,
  sourceLandholdings,
  notEligible,
  totals,
  mode: externalMode,
  onModeChange,
}: {
  data: CocromDistributionRow[];
  sourceLandholdings: CocromSourceRow[];
  notEligible: CocromDistNotEligible;
  totals: { cocrom: number; arbs: number; area: number; amount: number };
  mode?: CocromChartMode;
  onModeChange?: (m: CocromChartMode) => void;
}) {
  const [internalMode, setInternalMode] = useState<CocromChartMode>("cocrom");
  const mode = externalMode ?? internalMode;
  const setMode = onModeChange ?? setInternalMode;

  const getVal = (row: CocromDistributionRow) =>
    mode === "cocrom" ? row.count : mode === "arbs" ? row.arbs : mode === "area" ? row.area : row.amount;

  const grandTotal =
    mode === "cocrom" ? totals.cocrom : mode === "arbs" ? totals.arbs : mode === "area" ? totals.area : totals.amount;

  const chartData = [...data]
    .sort((a, b) => getVal(b) - getVal(a))
    .map((row) => {
      const val = getVal(row);
      const pct = grandTotal > 0 ? ((val / grandTotal) * 100).toFixed(1) : "0.0";
      return { name: row.province, value: val, pct: `${pct}%` };
    });

  const fmtTooltip = (val: number) =>
    mode === "area"
      ? val.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ha."
      : mode === "amount"
      ? val.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : val.toLocaleString();

  const totalDistributed = data.reduce((s, r) => s + getVal(r), 0);
  const overallPct = grandTotal > 0 ? ((totalDistributed / grandTotal) * 100).toFixed(1) : "0.0";

  return (
    <div>
      {/* Filter toggle */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] text-gray-400 tabular-nums">
          <span className="font-bold text-purple-700">{totalDistributed.toLocaleString()}</span>
          {" "}distributed
          {" · "}
          <span className="font-bold text-purple-700">{overallPct}%</span>
          {" "}of total
        </p>
        <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-[11px] font-semibold">
          {([
            { k: "cocrom" as const, l: "COCROMs"         },
            { k: "arbs"   as const, l: "ARBs (distinct)" },
            { k: "area"   as const, l: "Area"             },
            { k: "amount" as const, l: "Amount"           },
          ]).map(({ k, l }, i) => (
            <button
              key={k}
              onClick={() => setMode(k)}
              className={`px-3 py-1 transition-colors ${i > 0 ? "border-l border-gray-200" : ""} ${
                mode === k
                  ? "bg-purple-900 text-white"
                  : "bg-white text-gray-500 hover:bg-gray-50"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Bar chart */}
      {chartData.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-[12px] text-gray-400">
          No distributed COCROMs found.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart
            data={chartData}
            margin={{ top: 22, right: 16, left: 0, bottom: 68 }}
            barCategoryGap="30%"
          >
            <XAxis
              dataKey="name"
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              angle={-40}
              textAnchor="end"
              interval={0}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              width={40}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => {
                if (v >= 1_000_000) return (v / 1_000_000).toFixed(0) + "M";
                if (v >= 1_000) return (v / 1_000).toFixed(0) + "k";
                return v;
              }}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const val = Number(payload[0]?.value ?? 0);
                const pct = payload[0]?.payload?.pct ?? "0.0%";
                return (
                  <div className="bg-gray-900 text-white text-[11px] px-3 py-2 rounded-lg shadow-xl border border-gray-700 space-y-0.5">
                    <p className="font-semibold text-gray-300 mb-1">{label}</p>
                    <p>
                      <span className="text-gray-400">
                        {mode === "cocrom" ? "COCROMs: " : mode === "arbs" ? "ARBs: " : mode === "area" ? "Area: " : "Amount: "}
                      </span>
                      <span className="font-bold">{fmtTooltip(val)}</span>
                    </p>
                    <p>
                      <span className="text-gray-400">% of total: </span>
                      <span className="font-bold">{pct}</span>
                    </p>
                  </div>
                );
              }}
              cursor={{ fill: "rgba(0,0,0,0.04)" }}
            />
            <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={28}>
              <LabelList
                dataKey="pct"
                position="top"
                style={{ fontSize: 9, fill: "#7c3aed", fontWeight: 700 }}
              />
              {chartData.map((_, i) => (
                <Cell key={i} fill={DIST_PROVINCE_COLORS[i % DIST_PROVINCE_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}

      {/* Source landholdings table + not-eligible sidenote */}
      {sourceLandholdings.length > 0 && (
        <div className="mt-4 border-t border-gray-100 pt-3">
          <p className="text-[9px] uppercase tracking-[0.13em] font-semibold text-gray-400 mb-2">
            Source Landholdings
          </p>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-gray-400">
                <th className="text-left font-medium pb-1.5 pr-2">Status</th>
                <th className="text-right font-medium pb-1.5 pr-2 tabular-nums">Landholdings</th>
                <th className="text-right font-medium pb-1.5 tabular-nums">Validated Area</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sourceLandholdings.map((row) => (
                <tr key={row.status}>
                  <td className="py-1 pr-2 text-gray-600 leading-tight">{row.status}</td>
                  <td className="py-1 pr-2 text-right font-bold text-gray-800 tabular-nums">
                    {row.count.toLocaleString()}
                  </td>
                  <td className="py-1 text-right font-bold text-gray-800 tabular-nums">
                    {row.area.toLocaleString("en-PH", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    <span className="font-normal text-gray-400">ha.</span>
                  </td>
                </tr>
              ))}
              <tr className="border-t border-gray-200">
                <td className="pt-1.5 pr-2 font-semibold text-gray-700">Total</td>
                <td className="pt-1.5 pr-2 text-right font-bold text-gray-900 tabular-nums">
                  {sourceLandholdings.reduce((s, r) => s + r.count, 0).toLocaleString()}
                </td>
                <td className="pt-1.5 text-right font-bold text-gray-900 tabular-nums">
                  {sourceLandholdings
                    .reduce((s, r) => s + r.area, 0)
                    .toLocaleString("en-PH", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                  <span className="font-normal text-gray-400">ha.</span>
                </td>
              </tr>
            </tbody>
          </table>

          {/* Not-eligible sidenote — explains the area gap, figures follow the active filter */}
          {(notEligible.arbNotEligible.count > 0 || notEligible.nonArbNotEligible.count > 0) && (() => {
            const fmtArea = (n: number) =>
              n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

            const getSegVal = (seg: CocromSeg) =>
              mode === "cocrom" ? seg.count : mode === "arbs" ? seg.arbs : mode === "area" ? seg.area : seg.amount;

            const fmtSegVal = (seg: CocromSeg) => {
              const v = getSegVal(seg);
              if (mode === "area")   return `${fmtArea(v)} ha.`;
              if (mode === "amount") return fmtArea(v);
              return v.toLocaleString();
            };

            const unitLabel = mode === "cocrom" ? "COCROMs" : mode === "arbs" ? "ARBs" : mode === "area" ? "ha." : "Condoned";

            const arbNE      = notEligible.arbNotEligible;
            const nonArb     = notEligible.nonArbNotEligible;
            const totalVal   = getSegVal(arbNE) + getSegVal(nonArb);
            const fmtTotal   = mode === "area"
              ? `${fmtArea(totalVal)} ha.`
              : `${totalVal.toLocaleString()} ${unitLabel}`;

            return (
              <div className="mt-3 bg-amber-50 border border-amber-200 rounded p-2.5 text-[10px] leading-relaxed text-amber-700">
                <p className="font-semibold mb-1 uppercase tracking-wide text-[9px]">
                  Note — Non-Eligible ARBs (not counted in chart)
                </p>
                <p className="mb-2 text-amber-600">
                  These ARBs will never be distributed and account for the difference between
                  the validated area above and the chart values.
                </p>
                <div className="flex flex-col gap-0.5">
                  <div className="flex justify-between gap-2">
                    <span>
                      ARB Not Eligible{" "}
                      <span className="font-normal text-amber-500">(CARPable, not eligible)</span>
                    </span>
                    <span className="tabular-nums font-bold whitespace-nowrap">
                      {fmtSegVal(arbNE)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span>
                      Non-ARB Not Eligible{" "}
                      <span className="font-normal text-amber-500">(Non-CARPable)</span>
                    </span>
                    <span className="tabular-nums font-bold whitespace-nowrap">
                      {fmtSegVal(nonArb)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2 border-t border-amber-200 pt-1 mt-0.5 font-semibold">
                    <span>Total not eligible</span>
                    <span className="tabular-nums whitespace-nowrap">{fmtTotal}</span>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

/* ─── Not Eligible for Encoding — reasons horizontal bar chart ─── */

export type NotEligibleReasonRow = { name: string; count: number; area: number };

export function NotEligibleReasonsChart({ data }: { data: NotEligibleReasonRow[] }) {
  const [mode, setMode] = useState<"count" | "area">("count");

  const sorted = [...data].sort((a, b) =>
    mode === "count" ? b.count - a.count : b.area - a.area,
  );
  const total = sorted.reduce((s, d) => s + (mode === "count" ? d.count : d.area), 0);

  const chartHeight = Math.min(Math.max(160, sorted.length * 36 + 24), 420);

  return (
    <div>
      {/* Toggle */}
      <div className="flex justify-end mb-3">
        <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-[11px] font-semibold">
          {([
            { k: "count" as const, l: "Landholdings" },
            { k: "area"  as const, l: "Validated Area" },
          ]).map(({ k, l }, i) => (
            <button
              key={k}
              onClick={() => setMode(k)}
              className={`px-3 py-1 transition-colors ${i > 0 ? "border-l border-gray-200" : ""} ${
                mode === k
                  ? "bg-red-700 text-white"
                  : "bg-white text-gray-500 hover:bg-gray-50"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-[12px] text-gray-400">
          No records found.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart
            data={sorted}
            layout="vertical"
            margin={{ top: 4, right: 108, left: 4, bottom: 4 }}
          >
            <XAxis
              type="number"
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={
                mode === "area"
                  ? (v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)
                  : undefined
              }
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 10, fill: "#6b7280" }}
              width={160}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const val = Number(payload[0]?.value ?? 0);
                return (
                  <div className="bg-gray-900 text-white text-[11px] px-3 py-2 rounded-lg shadow-xl border border-gray-700">
                    <p className="font-semibold text-gray-300 mb-1 max-w-[200px] leading-snug">
                      {label}
                    </p>
                    <p>
                      <span className="text-gray-400">
                        {mode === "count" ? "Landholdings: " : "Validated Area: "}
                      </span>
                      <span className="font-bold">
                        {mode === "area"
                          ? val.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ha."
                          : val.toLocaleString()}
                      </span>
                    </p>
                  </div>
                );
              }}
              cursor={{ fill: "rgba(0,0,0,0.04)" }}
            />
            <Bar
              dataKey={mode === "count" ? "count" : "area"}
              fill="#ef4444"
              radius={[0, 3, 3, 0]}
              maxBarSize={22}
            >
              <LabelList
                dataKey={mode === "count" ? "count" : "area"}
                position="right"
                formatter={(v: unknown) => {
                  const n = Number(v ?? 0);
                  const pct = total > 0 ? ((n / total) * 100).toFixed(1) : "0.0";
                  if (mode === "area") {
                    return `${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${pct}%)`;
                  }
                  return `${n.toLocaleString()} (${pct}%)`;
                }}
                style={{ fontSize: 10, fill: "#6b7280", fontWeight: 600 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}

      {sorted.length > 0 && (
        <p className="text-[10px] text-gray-300 text-right mt-1 pr-1">
          Sorted by {mode === "count" ? "no. of landholdings" : "validated area"}, highest to lowest
        </p>
      )}
    </div>
  );
}
