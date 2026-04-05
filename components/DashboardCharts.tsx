"use client";

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

/* ─── Shared dark tooltip ─── */
function DarkTooltip({
  active, payload, label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number }>;
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

/* ─── Province bar chart ─── */
export function ProvinceBarChart({ data }: { data: KV[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 68 }}>
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
        />
        <Tooltip content={<DarkTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
        <Bar dataKey="value" name="Records" radius={[3, 3, 0, 0]} maxBarSize={34}>
          {data.map((_, i) => (
            <Cell key={i} fill={PROVINCE_COLORS[i % PROVINCE_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
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
        <Legend
          formatter={(value) => (
            <span style={{ fontSize: 11, color: "#4b5563" }}>{value}</span>
          )}
          wrapperStyle={{ paddingTop: 4 }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
