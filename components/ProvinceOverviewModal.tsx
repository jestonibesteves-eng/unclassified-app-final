"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  SemiGauge, statusColor, statusLabel,
  fmtAreaShort, fmtAmountShort,
  EncSubfilter,
} from "@/lib/gauge-utils";
import type { BulkEntry, BulkProgressResponse } from "@/app/api/progress/bulk/route";

const PROVINCES = [
  "ALBAY", "CAMARINES NORTE", "CAMARINES SUR - I",
  "CAMARINES SUR - II", "CATANDUANES", "MASBATE", "SORSOGON",
];

const PROVINCE_SHORT: Record<string, string> = {
  "ALBAY":              "ALBAY",
  "CAMARINES NORTE":    "CAM. NORTE",
  "CAMARINES SUR - I":  "CAM. SUR - I",
  "CAMARINES SUR - II": "CAM. SUR - II",
  "CATANDUANES":        "CATANDUANES",
  "MASBATE":            "MASBATE",
  "SORSOGON":           "SORSOGON",
};

const EMPTY_ENTRY: BulkEntry = {
  committed_cocroms: 0,
  validation:   { total: 0, completed: 0, area_total: 0, area_completed: 0, amount_total: 0, amount_completed: 0 },
  encoding:     { cocrom_total: 0, cocrom_completed: 0, arb_total: 0, arb_completed: 0, area_total: 0, area_completed: 0, amount_total: 0, amount_completed: 0, lh_validated: 0, lh_not_validated: 0 },
  distribution: { cocrom_total: 0, cocrom_completed: 0, arb_total: 0, arb_completed: 0, area_total: 0, area_completed: 0, amount_total: 0, amount_completed: 0, lh_validated: 0, lh_not_validated: 0 },
};

type MetricKey = "validation" | "encoding" | "distribution";

function resolveMetric(entry: BulkEntry, metricKey: MetricKey, sub: EncSubfilter) {
  const enc  = entry.encoding;
  const dist = entry.distribution;
  const val  = entry.validation;

  let total = 0, completed = 0;

  if (metricKey === "validation") {
    total     = sub === "area" ? val.area_total     : sub === "amount" ? val.amount_total     : val.total;
    completed = sub === "area" ? val.area_completed : sub === "amount" ? val.amount_completed : val.completed;
  } else if (metricKey === "encoding") {
    total     = sub === "cocrom" ? enc.cocrom_total     : sub === "arb" ? enc.arb_total     : sub === "area" ? enc.area_total     : enc.amount_total;
    completed = sub === "cocrom" ? enc.cocrom_completed : sub === "arb" ? enc.arb_completed : sub === "area" ? enc.area_completed : enc.amount_completed;
  } else {
    total     = sub === "cocrom" ? dist.cocrom_total     : sub === "arb" ? dist.arb_total     : sub === "area" ? dist.area_total     : dist.amount_total;
    completed = sub === "cocrom" ? dist.cocrom_completed : sub === "arb" ? dist.arb_completed : sub === "area" ? dist.area_completed : dist.amount_completed;
  }

  const pct   = total > 0 ? (completed / total) * 100 : 0;
  const color = statusColor(pct);
  const fmtVal = (n: number) => sub === "area" ? fmtAreaShort(n) : sub === "amount" ? fmtAmountShort(n) : n.toLocaleString();

  const verb   = metricKey === "validation" ? "validated" : metricKey === "encoding" ? "encoded" : "distributed";
  const unitMap: Record<EncSubfilter, string> = {
    cocrom: metricKey === "validation" ? "LHs" : "COCROMs",
    arb:    metricKey === "validation" ? "LHs" : "ARBs",
    area:   "ha.",
    amount: "",
  };
  const ofMap: Record<EncSubfilter, string> = {
    cocrom: metricKey === "validation" ? "total LHs" : metricKey === "encoding" ? "eligible COCROMs" : "encoded COCROMs",
    arb:    metricKey === "validation" ? "total LHs" : metricKey === "encoding" ? "total ARBs" : "total ARBs",
    area:   metricKey === "validation" ? "ha. total" : "ha. encoded",
    amount: metricKey === "validation" ? "total condoned" : "total",
  };
  const subA = sub === "amount" ? `${fmtAmountShort(completed)} ${verb}`
             : sub === "area"   ? `${fmtAreaShort(completed)} ${verb}`
             : `${completed.toLocaleString()} ${unitMap[sub]} ${verb}`;
  const subB = sub === "amount" ? `of ${fmtAmountShort(total)} ${ofMap[sub]}`
             : sub === "area"   ? `of ${fmtAreaShort(total)} ${ofMap[sub]}`
             : `of ${total.toLocaleString()} ${ofMap[sub]}`;

  return { total, completed, pct, color, subA, subB, fmtVal };
}

/* ── Full gauge card for Region V ── */
function RegionGaugeCard({
  entry, metricKey, sub, targetDate,
}: {
  entry:      BulkEntry;
  metricKey:  MetricKey;
  sub:        EncSubfilter;
  targetDate: string;
}) {
  const deadline  = new Date(`${targetDate}T00:00:00+08:00`);
  const daysLeft  = Math.max(0, Math.floor((deadline.getTime() - Date.now()) / 86400000));
  const weeksLeft = Math.ceil(daysLeft / 7);

  const m         = resolveMetric(entry, metricKey, sub);
  const remaining = m.total - m.completed;
  const pace      = weeksLeft > 0 && remaining > 0 ? Math.ceil(remaining / weeksLeft) : 0;
  const label     = statusLabel(m.pct);

  const available  = entry.distribution.cocrom_total - entry.distribution.cocrom_completed;
  const committed  = entry.committed_cocroms;
  const fulfillPct = committed > 0 ? (available / committed) * 100 : 0;

  return (
    <div className="bg-green-50 border border-green-200 rounded-lg p-2 flex flex-col gap-1 min-w-0">
      {/* Status badge */}
      <div className="flex justify-end">
        <span
          className="text-[7px] font-bold px-1.5 py-0.5 rounded-full"
          style={{ background: `${m.color}22`, color: m.color }}
        >
          {label}
        </span>
      </div>
      {/* Count + pct */}
      <div className="flex items-start justify-between gap-1">
        <div>
          <p className="text-[13px] font-bold leading-none tabular-nums" style={{ color: m.color }}>
            {m.fmtVal(m.completed)}
          </p>
          <p className="text-[8px] text-gray-400 mt-0.5">of {m.fmtVal(m.total)}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[11px] font-bold leading-none tabular-nums" style={{ color: m.color }}>
            {m.total === 0 ? "—" : `${m.pct.toFixed(1)}%`}
          </p>
          <p className="text-[7px] text-gray-400 mt-0.5">{m.fmtVal(remaining)} left</p>
        </div>
      </div>
      {/* Gauge */}
      <div className="w-full">
        <SemiGauge
          value={m.completed} total={m.total} color={m.color}
          subA={m.subA} subB={m.subB} totalLabel={m.fmtVal(m.total)}
        />
      </div>
      {/* Need/wk */}
      <p className="text-[7px] text-gray-400 text-center -mt-1">
        {m.total === 0 ? "No data" : pace === 0
          ? <span className="text-emerald-600 font-semibold">✓ Target reached</span>
          : <>Need <span className="font-semibold text-gray-600">{m.fmtVal(pace)}/wk</span></>
        }
      </p>
      {/* Commitment strip — Distribution / COCROM only */}
      {metricKey === "distribution" && sub === "cocrom" && (
        <div className="rounded border-l-2 border-sky-400 bg-sky-50 px-2 py-1.5 mt-1">
          <div className="flex justify-between items-center mb-1">
            <span className="text-[6.5px] font-bold uppercase tracking-wide text-sky-500">Commitment Fulfillment</span>
            <span className="text-[9px] font-bold text-sky-600 tabular-nums">
              {committed > 0 ? `${fulfillPct.toFixed(1)}%` : "—"}
            </span>
          </div>
          {committed > 0 ? (
            <>
              <div className="h-1.5 rounded-full bg-sky-100 overflow-hidden mb-1">
                <div className="h-full rounded-full bg-sky-400" style={{ width: `${Math.min(fulfillPct, 100)}%` }} />
              </div>
              <div className="flex justify-between">
                <span className="text-[6px] text-sky-400">{available.toLocaleString()} avail.</span>
                <span className="text-[6px] text-sky-400">{committed.toLocaleString()} committed</span>
              </div>
            </>
          ) : (
            <p className="text-[7px] text-sky-400 italic">No target set</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Compact table cell for each province/metric ── */
function ProvinceMetricCell({
  entry, metricKey, sub, weeksLeft, showCommitment,
}: {
  entry:           BulkEntry;
  metricKey:       MetricKey;
  sub:             EncSubfilter;
  weeksLeft:       number;
  showCommitment?: boolean;
}) {
  const m         = resolveMetric(entry, metricKey, sub);
  const remaining = m.total - m.completed;
  const pace      = weeksLeft > 0 && remaining > 0 ? Math.ceil(remaining / weeksLeft) : 0;

  const available  = entry.distribution.cocrom_total - entry.distribution.cocrom_completed;
  const committed  = entry.committed_cocroms;
  const fulfillPct = committed > 0 ? (available / committed) * 100 : 0;

  if (m.total === 0) {
    return (
      <td className="py-3 px-3 border-l border-gray-100 align-top">
        <span className="text-[9px] text-gray-300 italic">No data</span>
      </td>
    );
  }

  return (
    <td className="py-3 px-3 border-l border-gray-100 align-top">
      <div className="flex flex-col gap-1">
        {/* Count + pct row */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[12px] font-bold tabular-nums leading-none" style={{ color: m.color }}>
            {m.fmtVal(m.completed)}
          </span>
          <span className="text-[9px] text-gray-400">/ {m.fmtVal(m.total)}</span>
          <span
            className="text-[7.5px] font-bold px-1.5 py-0.5 rounded-full ml-auto whitespace-nowrap"
            style={{ background: `${m.color}22`, color: m.color }}
          >
            {m.pct.toFixed(1)}%
          </span>
        </div>
        {/* Progress bar */}
        <div className="h-1 rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${Math.min(m.pct, 100)}%`, background: m.color }}
          />
        </div>
        {/* Need/wk */}
        <p className="text-[8px] text-gray-400">
          {pace === 0
            ? <span className="text-emerald-600 font-semibold">✓ Target reached</span>
            : <>Need <span className="font-medium text-gray-600">{m.fmtVal(pace)}/wk</span></>
          }
        </p>
        {/* Commitment strip */}
        {showCommitment && (
          <div className="mt-0.5 rounded border-l-2 border-sky-400 bg-sky-50 px-2 py-1">
            <div className="flex justify-between items-center mb-0.5">
              <span className="text-[6.5px] font-bold text-sky-500 uppercase tracking-wide">Commitment</span>
              <span className="text-[8.5px] font-bold text-sky-600">
                {committed > 0 ? `${fulfillPct.toFixed(1)}%` : "—"}
              </span>
            </div>
            {committed > 0 ? (
              <>
                <div className="h-1 rounded-full bg-sky-100 overflow-hidden mb-0.5">
                  <div className="h-full rounded-full bg-sky-400" style={{ width: `${Math.min(fulfillPct, 100)}%` }} />
                </div>
                <div className="flex justify-between">
                  <span className="text-[6px] text-sky-400">{available.toLocaleString()} avail.</span>
                  <span className="text-[6px] text-sky-400">{committed.toLocaleString()} committed</span>
                </div>
              </>
            ) : (
              <p className="text-[7px] text-sky-400 italic">No target set</p>
            )}
          </div>
        )}
      </div>
    </td>
  );
}

/* ── Skeletons ── */
function SkeletonRegionCard() {
  return (
    <div className="bg-green-50 border border-green-200 rounded-lg p-2 animate-pulse">
      <div className="h-3 bg-green-100 rounded w-1/2 mb-2" />
      <div className="h-5 bg-green-100 rounded w-2/3 mb-1" />
      <div className="h-20 bg-green-100 rounded-full mx-auto w-full mb-1" style={{ borderRadius: "50% 50% 0 0 / 100% 100% 0 0" }} />
      <div className="h-2 bg-green-100 rounded w-1/2 mx-auto" />
    </div>
  );
}

function SkeletonTableRow() {
  return (
    <tr className="border-b border-gray-100 animate-pulse">
      <td className="py-3 px-3"><div className="h-3 bg-gray-200 rounded w-20" /></td>
      {[0, 1, 2].map((i) => (
        <td key={i} className="py-3 px-3 border-l border-gray-100">
          <div className="h-3 bg-gray-200 rounded w-24 mb-1.5" />
          <div className="h-1 bg-gray-100 rounded w-full mb-1.5" />
          <div className="h-2 bg-gray-100 rounded w-16" />
        </td>
      ))}
    </tr>
  );
}

/* ── Main modal ── */
export function ProvinceOverviewModal({
  open, onClose, activeTab, targetDate, publicToken,
}: {
  open:        boolean;
  onClose:     () => void;
  activeTab:   EncSubfilter;
  targetDate:  string;
  publicToken?: string;
}) {
  const [data, setData]       = useState<BulkProgressResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const captureRef            = useRef<HTMLDivElement>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportMode, setExportMode]   = useState(false);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    if (data) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (publicToken) params.set("token", publicToken);
    fetch(`/api/progress/bulk${params.toString() ? "?" + params.toString() : ""}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => { setData(json as BulkProgressResponse); setLoading(false); })
      .catch((err) => { setError(`Failed to load data. (${err?.message ?? "unknown"})`); setLoading(false); });
  }, [open, publicToken, data]);

  async function handleExport() {
    if (!captureRef.current) return;
    setExportError(null);
    try {
      const { toPng } = await import("html-to-image");
      // Show export header + solid background, wait for DOM paint
      setExportMode(true);
      await new Promise<void>((resolve) => { requestAnimationFrame(() => requestAnimationFrame(() => resolve())); });
      const url = await toPng(captureRef.current, {
        pixelRatio: 2,
        backgroundColor: "#ffffff",
      });
      setExportMode(false);
      const a = document.createElement("a");
      a.href = url;
      a.download = `provincial-overview-${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
    } catch (err) {
      console.error("[ProvinceOverviewModal] export", err);
      setExportMode(false);
      setExportError("Export failed. Please try again.");
    }
  }

  if (!open) return null;

  const deadline  = new Date(`${targetDate}T00:00:00+08:00`);
  const daysLeft  = Math.max(0, Math.floor((deadline.getTime() - Date.now()) / 86400000));
  const weeksLeft = Math.ceil(daysLeft / 7);

  const STAGE_KEYS: MetricKey[] = ["validation", "encoding", "distribution"];
  const STAGE_LABELS: Record<MetricKey, string> = {
    validation: "Validation", encoding: "Encoding", distribution: "Distribution",
  };

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-green-900 px-5 py-3 flex items-center justify-between rounded-t-2xl shrink-0">
          <div>
            <h2 className="text-[11px] font-bold text-green-300 uppercase tracking-[0.12em]">
              Accomplishment Overview by Province
            </h2>
            <p className="text-[9px] text-green-500 mt-0.5 uppercase tracking-wide">
              {activeTab.toUpperCase()} · As of {new Date().toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-green-400 hover:text-white text-lg leading-none w-7 h-7 flex items-center justify-center rounded-md hover:bg-green-800 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="overflow-auto flex-1 p-4">
          {error ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <p className="text-red-500 text-sm">{error}</p>
              <button
                onClick={() => { setError(null); setData(null); }}
                className="px-4 py-1.5 rounded-md bg-green-700 text-white text-xs hover:bg-green-800"
              >
                Retry
              </button>
            </div>
          ) : (
            <div
              ref={captureRef}
              style={{
                background: "#ffffff",
                padding: exportMode ? "20px" : undefined,
                borderRadius: exportMode ? "8px" : undefined,
              }}
            >
              {/* ── Export header — only rendered during image capture ── */}
              {exportMode && (
                <div style={{
                  background: "#14532d",
                  borderRadius: "10px",
                  padding: "16px 20px",
                  marginBottom: "20px",
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                }}>
                  <div>
                    <p style={{ fontSize: "7px", fontWeight: 700, color: "#4ade80", textTransform: "uppercase", letterSpacing: "0.22em", marginBottom: "6px" }}>
                      Department of Agrarian Reform · Region V
                    </p>
                    <h1 style={{ fontSize: "20px", fontWeight: 800, color: "#ffffff", textTransform: "uppercase", letterSpacing: "0.03em", lineHeight: 1.15, marginBottom: "1px" }}>
                      Accomplishment Overview
                    </h1>
                    <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#86efac", textTransform: "uppercase", letterSpacing: "0.03em", lineHeight: 1.15, marginBottom: "12px" }}>
                      by Province
                    </h2>
                    <span style={{
                      display: "inline-block",
                      background: "rgba(74,222,128,0.15)",
                      border: "1px solid rgba(74,222,128,0.3)",
                      borderRadius: "4px",
                      padding: "3px 8px",
                      fontSize: "8px",
                      fontWeight: 700,
                      color: "#86efac",
                      textTransform: "uppercase",
                      letterSpacing: "0.15em",
                    }}>
                      {activeTab.toUpperCase()} Metrics
                    </span>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <p style={{ fontSize: "7px", color: "#4ade80", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: "2px" }}>As of</p>
                    <p style={{ fontSize: "11px", fontWeight: 600, color: "#bbf7d0", marginBottom: "12px" }}>
                      {new Date().toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })}
                    </p>
                    <p style={{ fontSize: "7px", color: "#4ade80", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: "2px" }}>Target Deadline</p>
                    <p style={{ fontSize: "11px", fontWeight: 600, color: "#bbf7d0" }}>
                      {new Date(`${targetDate}T00:00:00`).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })}
                    </p>
                  </div>
                </div>
              )}

              {/* ── Region V gauges ── */}
              <p className="text-[8px] font-bold text-green-700 uppercase tracking-wider mb-2">Region V Total</p>
              <div className="grid grid-cols-3 gap-3 mb-5">
                {STAGE_KEYS.map((key) => (
                  <div key={key}>
                    <p className="text-[7px] font-bold text-gray-400 uppercase tracking-wider text-center mb-1">
                      {STAGE_LABELS[key]}
                    </p>
                    {loading || !data ? (
                      <SkeletonRegionCard />
                    ) : (
                      <RegionGaugeCard
                        entry={data.region}
                        metricKey={key}
                        sub={activeTab}
                        targetDate={targetDate}
                      />
                    )}
                  </div>
                ))}
              </div>

              {/* ── Province table ── */}
              <p className="text-[8px] font-bold text-gray-500 uppercase tracking-wider mb-2">Provincial Breakdown</p>
              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="py-2 px-3 text-[8px] font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                        Province
                      </th>
                      {STAGE_KEYS.map((key) => (
                        <th
                          key={key}
                          className="py-2 px-3 text-[8px] font-bold text-gray-500 uppercase tracking-wide border-l border-gray-100"
                        >
                          {STAGE_LABELS[key]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {PROVINCES.map((prov) => {
                      if (loading || !data) return <SkeletonTableRow key={prov} />;
                      const entry = data.provinces[prov] ?? EMPTY_ENTRY;
                      return (
                        <tr key={prov} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                          <td className="py-3 px-3 align-top">
                            <span className="text-[10px] font-semibold text-gray-700 whitespace-nowrap">
                              {PROVINCE_SHORT[prov] ?? prov}
                            </span>
                          </td>
                          <ProvinceMetricCell entry={entry} metricKey="validation"   sub={activeTab} weeksLeft={weeksLeft} />
                          <ProvinceMetricCell entry={entry} metricKey="encoding"     sub={activeTab} weeksLeft={weeksLeft} />
                          <ProvinceMetricCell entry={entry} metricKey="distribution" sub={activeTab} weeksLeft={weeksLeft} showCommitment={activeTab === "cocrom"} />
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-5 py-3 flex items-center justify-between shrink-0 bg-gray-50">
          <div>
            {exportError && <p className="text-[10px] text-red-500">{exportError}</p>}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-md text-[10px] text-gray-500 hover:bg-gray-200 transition-colors"
            >
              Close
            </button>
            <button
              onClick={handleExport}
              disabled={loading || !!error}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-green-700 text-white text-[10px] font-semibold hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 12l-4-4h2.5V2h3v6H12L8 12z"/>
                <rect x="2" y="13" width="12" height="1.5" rx="0.75"/>
              </svg>
              Export as Image
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
