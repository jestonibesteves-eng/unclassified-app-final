"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useToast } from "@/components/Toast";
import { useUser } from "@/components/UserContext";

/* ─── Detail types ─── */
type Arb = {
  id: number;
  arb_name: string | null;
  arb_no: string | null;
  ep_cloa_no: string | null;
  carpable: string | null;
  area_allocated: string | null;
  remarks: string | null;
};

type LandholdingDetail = {
  seqno_darro: string;
  lbp_seqno: string | null;
  clno: string | null;
  claim_no: string | null;
  class_field: string | null;
  claimclass: string | null;
  landowner: string | null;
  lo: string | null;
  province: string | null;
  province_edited: string | null;
  location: string | null;
  dateap: string | null;
  datebk: string | null;
  aoc: number | null;
  fssc: number | null;
  amendarea: number | null;
  amendarea_validated: number | null;
  arr_area: number | null;
  area: number | null;
  osarea: number | null;
  net_of_reval: number | null;
  net_of_reval_no_neg: number | null;
  year: string | null;
  fo2_area: number | null;
  fo2: string | null;
  epcloa_is_area: number | null;
  epcloa_is: string | null;
  split_area: number | null;
  split: string | null;
  optool_area: number | null;
  optool: string | null;
  fo3_area: number | null;
  fo3: string | null;
  dar_match_status: string | null;
  source: string | null;
  duplicate_clno: string | null;
  cross_province: string | null;
  data_flags: string | null;
  status: string | null;
  condoned_amount: number | null;
  municipality: string | null;
  barangay: string | null;
  remarks: string | null;
  arbs: Arb[];
};

const DETAIL_STATUSES = ["For Further Validation", "Fully Distributed", "Partially Distributed", "Encoded", "For Encoding", "Not Eligible for Encoding"];

const NON_ELIGIBILITY_REASONS = [
  "UNDER CLASSIFIED ARR", "WITH CERTIFICATE OF FULL PAYMENT", "NO ISSUED TITLE",
  "AT ROD ON PROCESSING", "UNDER MANUAL REGISTRATION", "ALLEGEDLY SOLD",
  "CANCELLED TITLE", "FOR CANCELLATION OF TITLE", "FOR CANCELLATION OF ASP",
  "FOR DISQUALIFICATION OF ARB / ALI CASE", "CONVERTED TO CTITLE",
  "FOR REISSUANCE OF TITLE", "FOR RECONSTITUTION OF TITLE", "NON-CARPABLE",
  "NOT FOUND IN LRA SYSTEM", "WRONG PROVINCE",
  "FOR FURTHER RESEARCH (NO CONDONED AMOUNT)", "PROVISIONAL REGISTRATION",
  "TIMBERLAND PER PROJECTION", "WITH DEED OF SALE",
  "DETAILS DOES NOT MATCH vs. OTHER DOCS (ASP, CLOA, etc..)",
  "OCCUPIED BY ADVERSE CLAIMANTS", "DUPLICATE RECORD",
  "NO RECORD AT DAR AND ROD", "NO RECORD AT DAR AND ROD; WITH ISSUED CLT",
];

function excelDateToString(value: string | null): string | null {
  if (!value) return null;
  const serial = Number(value);
  if (isNaN(serial) || serial < 1) return value; // already a string date or invalid
  const date = new Date((serial - 25569) * 86400 * 1000);
  return date.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
}

const STATUS_STYLES: Record<string, { dot: string; badge: string }> = {
  "Fully Distributed":         { dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  "Partially Distributed":     { dot: "bg-teal-400",    badge: "bg-teal-100 text-teal-800 border-teal-200" },
  "Encoded":                   { dot: "bg-blue-400",    badge: "bg-blue-100 text-blue-800 border-blue-200" },
  "For Encoding":              { dot: "bg-violet-400",  badge: "bg-violet-100 text-violet-800 border-violet-200" },
  "For Further Validation":    { dot: "bg-amber-400",   badge: "bg-amber-100 text-amber-800 border-amber-200" },
  "Not Eligible for Encoding": { dot: "bg-red-400",     badge: "bg-red-100 text-red-800 border-red-200" },
  "Untagged":                  { dot: "bg-gray-400",    badge: "bg-gray-100 text-gray-600 border-gray-200" },
};

function Field({ label, value, mono, negative }: {
  label: string; value: string | number | null | undefined; mono?: boolean; negative?: boolean;
}) {
  const display = value == null || value === "" ? null : String(value);
  return (
    <div className="group">
      <p className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-1 leading-none">{label}</p>
      {display ? (
        <p className={`text-[13px] leading-snug break-words font-medium ${mono ? "font-mono" : ""} ${negative ? "text-red-600" : "text-gray-900"}`}>
          {display}
        </p>
      ) : (
        <p className="text-[13px] text-gray-300 font-mono">—</p>
      )}
    </div>
  );
}

function SectionCard({ icon, title, accent, children }: {
  icon: string; title: string; accent: string; children: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border-l-4 ${accent} bg-white border border-gray-100 shadow-sm overflow-hidden`}>
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-gray-100 bg-gray-50/60">
        <span className="text-base leading-none">{icon}</span>
        <p className="text-[11px] uppercase tracking-widest font-bold text-gray-500">{title}</p>
      </div>
      <div className="px-4 py-4">{children}</div>
    </div>
  );
}

function areaChangeIndicator(validated: number | null, original: number | null): { icon: string; color: string; title: string } {
  if (validated == null || original == null) return { icon: "=", color: "text-blue-500", title: "Not yet validated" };
  const vStr = validated.toFixed(4);
  const oStr = original.toFixed(4);
  if (vStr === oStr) return { icon: "=", color: "text-blue-500", title: "Same as original" };
  const diff = parseFloat(vStr) - parseFloat(oStr);
  if (diff > 0) return { icon: "↑", color: "text-emerald-600", title: `+${diff.toFixed(4)} from original` };
  return { icon: "↓", color: "text-red-500", title: `${diff.toFixed(4)} from original` };
}

function MetricPill({ label, value, warn, indicator }: {
  label: string; value: string | null; warn?: boolean;
  indicator?: { icon: string; color: string; title: string };
}) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-lg px-4 py-3 ${warn ? "bg-red-50 border border-red-200" : "bg-gray-50 border border-gray-200"}`}>
      <div className="flex items-center gap-1.5 leading-none mb-1">
        <p className={`text-lg font-bold font-mono ${warn ? "text-red-600" : "text-gray-900"}`}>
          {value ?? "—"}
        </p>
        {indicator && (
          <span className={`text-sm font-bold ${indicator.color}`} title={indicator.title}>
            {indicator.icon}
          </span>
        )}
      </div>
      <p className={`text-[10px] uppercase tracking-widest font-semibold ${warn ? "text-red-400" : "text-gray-400"}`}>{label}</p>
    </div>
  );
}

function DetailModal({ seqno, onClose, onSaved }: { seqno: string; onClose: () => void; onSaved: () => void }) {
  const [data, setData] = useState<LandholdingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const { isEditor } = useUser();
  const [status, setStatus] = useState("");
  const [nonEligibilityReason, setNonEligibilityReason] = useState("");
  const [nonEligibilityOther, setNonEligibilityOther] = useState("");
  const [condonedAmount, setCondonedAmount] = useState("");
  const [amendareavValidated, setAmendareavValidated] = useState("");
  const [municipality, setMunicipality] = useState("");
  const [barangay, setBarangay] = useState("");
  const [remarks, setRemarks] = useState("");
  const [tab, setTab] = useState<"details" | "arbs">("details");
  const [crossProvInfo, setCrossProvInfo] = useState<{ province: string | null; seqno: string } | null>(null);
  const [editingArb, setEditingArb] = useState<{ id: number; arb_name: string; arb_no: string; ep_cloa_no: string; carpable: string; area_allocated: string; remarks: string } | null>(null);
  const [savingArb, setSavingArb] = useState(false);
  const [arbEditError, setArbEditError] = useState("");
  const [confirmDeleteArbId, setConfirmDeleteArbId] = useState<number | null>(null);
  const [deletingArb, setDeletingArb] = useState(false);

  useEffect(() => {
    fetch(`/api/records/${encodeURIComponent(seqno)}`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: LandholdingDetail) => {
        setData(d);
        setStatus(d.status ?? "For Initial Validation");
        if (d.status === "Not Eligible for Encoding" && d.remarks) {
          const isKnown = NON_ELIGIBILITY_REASONS.includes(d.remarks);
          setNonEligibilityReason(isKnown ? d.remarks : "__other__");
          setNonEligibilityOther(isKnown ? "" : d.remarks);
        }
        setCondonedAmount(d.condoned_amount != null ? String(d.condoned_amount) : (d.net_of_reval_no_neg != null ? String(d.net_of_reval_no_neg) : ""));
        setAmendareavValidated(d.amendarea_validated != null ? String(d.amendarea_validated) : (d.amendarea != null ? String(d.amendarea) : ""));
        setMunicipality(d.municipality ?? "");
        setBarangay(d.barangay ?? "");
        setRemarks(d.remarks ?? "");
        setLoading(false);
        if (d.cross_province && d.clno) {
          fetch(`/api/records?search=${encodeURIComponent(d.clno)}&limit=50`)
            .then((r) => r.ok ? r.json() : null)
            .then((res) => {
              if (!res?.records) return;
              const dup = res.records.find((r: { seqno_darro: string; province_edited?: string | null }) => r.seqno_darro !== d.seqno_darro);
              if (dup) setCrossProvInfo({ province: dup.province_edited ?? null, seqno: dup.seqno_darro });
            })
            .catch(() => {});
        }
      });
  }, [seqno]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const effectiveNonEligibilityReason = nonEligibilityReason === "__other__" ? nonEligibilityOther.trim() : nonEligibilityReason;

  async function handleSave() {
    if (status === "Not Eligible for Encoding" && !effectiveNonEligibilityReason) {
      toast("Reason for Non-Eligibility is required.", "error"); return;
    }
    setSaving(true);
    const body: Record<string, unknown> = { status };
    const parsedAmount = condonedAmount.trim() === "" ? null : parseFloat(condonedAmount);
    if (condonedAmount.trim() !== "" && isNaN(parsedAmount as number)) {
      toast("Condoned amount must be a number.", "error"); setSaving(false); return;
    }
    const parsedValidated = amendareavValidated.trim() === "" ? null : parseFloat(amendareavValidated);
    if (amendareavValidated.trim() !== "" && isNaN(parsedValidated as number)) {
      toast("Validated AMENDAREA must be a number.", "error"); setSaving(false); return;
    }
    body.condoned_amount = parsedAmount;
    body.amendarea_validated = parsedValidated;
    body.municipality = municipality.trim() || null;
    body.barangay = barangay.trim() || null;
    // When Not Eligible for Encoding, overwrite remarks with the reason
    body.remarks = status === "Not Eligible for Encoding" && effectiveNonEligibilityReason
      ? effectiveNonEligibilityReason
      : remarks.trim() || null;
    const res = await fetch(`/api/records/${encodeURIComponent(seqno)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await res.json();
    if (!res.ok) { toast(result.error ?? "Save failed.", "error"); setSaving(false); return; }
    setData((prev) => prev ? { ...prev, ...result } : prev);
    toast("Changes saved successfully.", "success");
    setSaving(false);
    onSaved();
  }

  async function handleArbSave() {
    if (!editingArb) return;
    if (!editingArb.carpable) { setArbEditError("CARPable/Non-CARPable is required."); return; }
    setArbEditError(""); setSavingArb(true);
    const res = await fetch(`/api/arbs/item/${editingArb.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        arb_name: editingArb.arb_name,
        arb_no: editingArb.arb_no || null,
        ep_cloa_no: editingArb.ep_cloa_no || null,
        carpable: editingArb.carpable,
        area_allocated: editingArb.area_allocated || null,
        remarks: editingArb.remarks || null,
      }),
    });
    const result = await res.json();
    if (!res.ok) { setArbEditError(result.error ?? "Save failed."); setSavingArb(false); return; }
    // Refresh detail
    const detailRes = await fetch(`/api/records/${encodeURIComponent(seqno)}`);
    const detailData = await detailRes.json();
    setData(detailData);
    toast("ARB updated.", "success");
    setSavingArb(false);
    setEditingArb(null);
  }

  async function handleArbDelete(arbId: number) {
    setDeletingArb(true);
    const res = await fetch(`/api/arbs/item/${arbId}`, { method: "DELETE" });
    const result = await res.json();
    if (!res.ok) { toast(result.error ?? "Delete failed.", "error"); setDeletingArb(false); setConfirmDeleteArbId(null); return; }
    const detailRes = await fetch(`/api/records/${encodeURIComponent(seqno)}`);
    const detailData = await detailRes.json();
    setData(detailData);
    toast("ARB deleted.", "warning");
    setDeletingArb(false);
    setConfirmDeleteArbId(null);
  }

  function handleBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  const statusStyle = STATUS_STYLES[data?.status ?? "Untagged"] ?? STATUS_STYLES["Untagged"];
  const hasFlag = !!data?.data_flags;
  const parsedCondonedInput = condonedAmount.trim() !== "" ? parseFloat(condonedAmount) : null;
  const userEnteredPositiveCondoned = parsedCondonedInput != null && !isNaN(parsedCondonedInput) && parsedCondonedInput > 0;
  const savedCondonedPositive = data?.condoned_amount != null && data.condoned_amount > 0;
  const isNegativeReval = !!data?.data_flags?.includes("Negative NET OF REVAL") || (data?.net_of_reval != null && data.net_of_reval < 0);
  const isZeroCondoned = !isNegativeReval && data?.net_of_reval != null && data.net_of_reval === 0 && (data?.net_of_reval_no_neg ?? 0) === 0;
  const negativeReval = (isNegativeReval || isZeroCondoned) && !userEnteredPositiveCondoned && !savedCondonedPositive;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-4"
      style={{ animation: "modal-backdrop-in 0.2s ease-out both" }}
      onMouseDown={handleBackdrop}
    >
      <style>{`
        .modal-panel { animation: modal-panel-in 0.48s cubic-bezier(0.16, 1, 0.3, 1) both; }
      `}</style>

      <div className="modal-panel bg-white w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden">

        {/* ── Hero Header ── */}
        <div className="relative bg-green-900 text-white px-6 pt-5 pb-0 overflow-hidden flex-shrink-0">
          {/* Subtle grid pattern */}
          <div className="absolute inset-0 opacity-[0.06]" style={{
            backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 19px,#fff 19px,#fff 20px),repeating-linear-gradient(90deg,transparent,transparent 19px,#fff 19px,#fff 20px)"
          }} />

          <div className="relative">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-green-400 font-semibold mb-1">
                  DAR Region V · Landholding Record
                </p>
                <h2 className="text-2xl font-bold font-mono tracking-tight text-white leading-none">{seqno}</h2>
                {data && (
                  <p className="text-sm text-green-200 mt-1.5 font-medium truncate max-w-md">
                    {data.landowner ?? "Unknown Landowner"}
                    {data.province_edited ? <span className="text-green-400 font-normal"> · {data.province_edited}</span> : ""}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                {hasFlag && !(userEnteredPositiveCondoned && data?.data_flags?.includes("Negative")) && (
                  <span className="px-2.5 py-1 rounded-lg bg-red-500/20 border border-red-400/40 text-red-200 text-[11px] font-bold uppercase tracking-wide">
                    ⚠ Flagged
                  </span>
                )}
                {data && (
                  <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[12px] font-semibold ${statusStyle.badge}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
                    {data.status ?? "For Initial Validation"}
                  </span>
                )}
                <button
                  onClick={onClose}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors text-lg leading-none"
                >
                  ×
                </button>
              </div>
            </div>

            {/* Key metrics strip */}
            {data && (() => {
              const effectiveValidated = data.amendarea_validated ?? data.amendarea;
              const ind = areaChangeIndicator(data.amendarea_validated, data.amendarea);
              return (
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <MetricPill
                    label="Validated AMENDAREA"
                    value={effectiveValidated != null ? effectiveValidated.toFixed(4) : null}
                    indicator={ind}
                  />
                  {(() => {
                    const effective = data.condoned_amount ?? data.net_of_reval_no_neg;
                    const ind = effective != null ? areaChangeIndicator(data.condoned_amount, data.net_of_reval_no_neg ?? 0) : undefined;
                    return (
                      <MetricPill
                        label="Validated Condoned Amount"
                        value={effective != null ? effective.toLocaleString("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2, maximumFractionDigits: 2 }) : null}
                        indicator={ind}
                      />
                    );
                  })()}
                  <MetricPill label="ARBs" value={String(data.arbs.length)} />
                </div>
              );
            })()}

            {/* LBP Reconciliation notice */}
            {negativeReval && (
              <div className="mx-0 mb-3 flex items-center gap-2.5 rounded-lg bg-red-500/20 border border-red-400/40 px-3.5 py-2.5">
                <span className="text-base leading-none flex-shrink-0">⚠️</span>
                <p className="text-[12px] font-semibold text-red-100 leading-snug">
                  This landholding requires <span className="underline underline-offset-2">LBP reconciliation</span> — NET OF REVAL is {isNegativeReval ? "negative" : "zero"}.
                </p>
              </div>
            )}

            {/* Cross Province Duplicate notice */}
            {data?.cross_province && (
              <div className="mx-0 mb-3 flex items-center gap-2.5 rounded-lg bg-orange-500/20 border border-orange-400/40 px-3.5 py-2.5">
                <span className="text-base leading-none flex-shrink-0">⚠️</span>
                <p className="text-[12px] font-semibold text-orange-100 leading-snug">
                  This landholding has the same CLNO with the landholding from{" "}
                  <span className="font-bold">{crossProvInfo?.province ?? "another province"}</span>
                  {crossProvInfo?.seqno ? <>{" "}(<span className="font-mono">{crossProvInfo.seqno}</span>)</> : ""}.
                </p>
              </div>
            )}

            {/* Tabs */}
            <div className="flex gap-0 -mb-px">
              {(["details", "arbs"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-5 py-2.5 text-[13px] font-semibold border-b-2 transition-all ${
                    tab === t
                      ? "border-white text-white bg-white/10"
                      : "border-transparent text-green-300 hover:text-white hover:border-white/40"
                  }`}
                >
                  {t === "details" ? "Details" : `ARBs${data ? ` (${data.arbs.length})` : ""}`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto bg-gray-50/50">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 rounded-full border-2 border-green-800 border-t-transparent animate-spin" />
            </div>
          )}

          {!loading && data && tab === "details" && (
            <div className="p-5 space-y-4">

              {/* Identification */}
              <SectionCard icon="🪪" title="Identification" accent="border-l-green-700">
                <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                  <Field label="SEQNO_DARRO" value={data.seqno_darro} mono />
                  <Field label="LBP SEQNO" value={data.lbp_seqno} mono />
                  <Field label="CLNO" value={data.clno} mono />
                  <Field label="Claim No." value={data.claim_no} mono />
                  <Field label="Class Field" value={data.class_field} />
                  <Field label="Claim Class" value={data.claimclass} />
                  <Field label="Year" value={data.year} />
                  <Field label="Source" value={data.source} />
                </div>
              </SectionCard>

              {/* Landowner */}
              <SectionCard icon="👤" title="Landowner" accent="border-l-blue-500">
                <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
                  <div className="col-span-2 sm:col-span-2">
                    <Field label="Landowner (Full)" value={data.landowner} />
                  </div>
                  <Field label="Province" value={data.province_edited} />
                  <Field label="Location" value={data.location} />
                  <Field label="Date AP" value={excelDateToString(data.dateap)} />
                  <Field label="Date BK" value={excelDateToString(data.datebk)} />
                </div>
              </SectionCard>

              {/* Area Data */}
              <SectionCard icon="📐" title="Area Data (ha)" accent="border-l-amber-500">
                <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-1 leading-none">Amend Area <span className="normal-case text-gray-300">(original)</span></p>
                    <p className="text-[13px] font-mono font-medium text-gray-900">{data.amendarea?.toFixed(4) ?? <span className="text-gray-300">—</span>}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-semibold text-amber-600 mb-1 leading-none">Amend Area <span className="normal-case text-amber-400">(validated)</span></p>
                    {(() => {
                      const ind = areaChangeIndicator(data.amendarea_validated, data.amendarea);
                      const display = (data.amendarea_validated ?? data.amendarea)?.toFixed(4) ?? "—";
                      return (
                        <div className="flex items-center gap-1.5">
                          <p className="text-[13px] font-mono font-semibold text-amber-700">{display}</p>
                          <span className={`text-[13px] font-bold ${ind.color}`} title={ind.title}>{ind.icon}</span>
                        </div>
                      );
                    })()}
                  </div>
                  <Field label="ARR Area" value={data.arr_area?.toFixed(4)} mono />
                  <Field label="Area" value={data.area?.toFixed(4)} mono />
                  <Field label="OS Area" value={data.osarea?.toFixed(4)} mono negative={data.osarea != null && data.osarea < 0} />
                  <Field label="Net of Reval" value={data.net_of_reval != null ? data.net_of_reval.toLocaleString("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2, maximumFractionDigits: 2 }) : null} mono negative={negativeReval} />
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-semibold text-amber-600 mb-1 leading-none">Validated Condoned Amount</p>
                    {(() => {
                      const effective = data.condoned_amount ?? data.net_of_reval_no_neg;
                      const ind = effective != null ? areaChangeIndicator(data.condoned_amount, data.net_of_reval_no_neg ?? 0) : null;
                      return (
                        <div className="flex items-center gap-1.5">
                          <p className="text-[13px] font-mono font-semibold text-amber-700">
                            {effective != null ? effective.toLocaleString("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                          </p>
                          {ind && <span className={`text-[13px] font-bold ${ind.color}`} title={ind.title}>{ind.icon}</span>}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </SectionCard>

              {/* DAR Central Office Data Validation */}
              <SectionCard icon="📄" title="DAR Central Office Data Validation" accent="border-l-purple-500">
                <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                  <Field label="FO2" value={data.fo2} mono />
                  <Field label="FO2 Area" value={data.fo2_area?.toFixed(4)} mono />
                  <Field label="EP/CLOA IS" value={data.epcloa_is} mono />
                  <Field label="EP/CLOA IS Area" value={data.epcloa_is_area?.toFixed(4)} mono />
                  <Field label="Split" value={data.split} mono />
                  <Field label="Split Area" value={data.split_area?.toFixed(4)} mono />
                  <Field label="OP Tool" value={data.optool} mono />
                  <Field label="OP Tool Area" value={data.optool_area?.toFixed(4)} mono />
                  <Field label="FO3" value={data.fo3} mono />
                  <Field label="FO3 Area" value={data.fo3_area?.toFixed(4)} mono />
                  <Field label="DAR Match Status" value={data.dar_match_status} />
                </div>
              </SectionCard>

              {/* Data Quality */}
              <SectionCard icon="🔍" title="Data Quality" accent={hasFlag ? "border-l-red-500" : "border-l-gray-300"}>
                <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                  <div className="col-span-2">
                    {data.data_flags ? (
                      <div>
                        <p className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-1.5">Data Flags</p>
                        <div className="flex flex-wrap gap-1.5">
                          {data.data_flags.split(";").map((f) => (
                            <span key={f} className="px-2.5 py-1 rounded-md bg-red-100 text-red-700 border border-red-200 text-[12px] font-semibold">
                              {f.trim()}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <Field label="Data Flags" value={null} />
                    )}
                  </div>
                  <Field label="Duplicate CLNO" value={data.duplicate_clno} />
                  <Field label="Cross Province" value={data.cross_province} />
                </div>
              </SectionCard>

              {/* Management — editable (editor+ only) */}
              {isEditor && <div className="rounded-xl border border-green-200 bg-white overflow-hidden shadow-sm">
                <div className="flex items-center gap-2.5 px-4 py-3 border-b border-green-100 bg-green-900">
                  <span className="text-base leading-none">✏️</span>
                  <p className="text-[11px] uppercase tracking-widest font-bold text-green-200">Management — Editable</p>
                </div>
                <div className="px-5 py-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-4 items-start">
                    <div>
                      <label className="block text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-1.5">Status</label>
                      <select
                        value={status}
                        onChange={(e) => { setStatus(e.target.value); if (e.target.value !== "Not Eligible for Encoding") { setNonEligibilityReason(""); setNonEligibilityOther(""); } }}
                        className={`w-full border rounded-lg px-3 py-2 text-[13px] font-medium focus:outline-none focus:ring-2 bg-white ${status === "Not Eligible for Encoding" ? "border-red-400 focus:ring-red-400 text-red-700" : "border-gray-300 focus:ring-green-600"}`}
                      >
                        {DETAIL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                      {status === "Not Eligible for Encoding" && (
                        <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                          <label className="block text-[10px] uppercase tracking-widest font-bold text-red-600 mb-1.5">
                            Reason for Non-Eligibility <span className="text-red-500">*</span>
                          </label>
                          <select
                            value={nonEligibilityReason}
                            onChange={(e) => { setNonEligibilityReason(e.target.value); setNonEligibilityOther(""); }}
                            className="w-full border border-red-300 rounded-lg px-3 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-red-400 bg-white mb-1.5"
                          >
                            <option value="">— Select a reason —</option>
                            {NON_ELIGIBILITY_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                            <option value="__other__">Other (specify below)…</option>
                          </select>
                          {nonEligibilityReason === "__other__" && (
                            <input
                              type="text"
                              value={nonEligibilityOther}
                              onChange={(e) => setNonEligibilityOther(e.target.value)}
                              placeholder="Type the reason…"
                              className="w-full border border-red-300 rounded-lg px-3 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-red-400"
                            />
                          )}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-widest font-semibold text-amber-600 mb-1.5">Validated AMENDAREA (ha)</label>
                      <input
                        type="number"
                        step="0.0001"
                        value={amendareavValidated}
                        onChange={(e) => { setAmendareavValidated(e.target.value); }}
                        placeholder={data?.amendarea?.toFixed(4) ?? "0.0000"}
                        className="w-full border border-amber-300 rounded-lg px-3 py-2 text-[13px] font-mono focus:outline-none focus:ring-2 focus:ring-amber-500 bg-amber-50/50"
                      />
                      {data?.amendarea != null && (() => {
                        const ind = areaChangeIndicator(
                          amendareavValidated.trim() !== "" ? parseFloat(amendareavValidated) : null,
                          data.amendarea
                        );
                        return (
                          <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                            Original: {data.amendarea.toFixed(4)}
                            {amendareavValidated.trim() !== "" && (
                              <span className={`font-bold ${ind.color}`} title={ind.title}>{ind.icon}</span>
                            )}
                          </p>
                        );
                      })()}
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-widest font-semibold text-amber-600 mb-1.5">Validated Condoned Amount</label>
                      <input
                        type="number"
                        step="0.01"
                        value={condonedAmount}
                        onChange={(e) => { setCondonedAmount(e.target.value); }}
                        placeholder={data?.net_of_reval_no_neg?.toFixed(2) ?? "0.00"}
                        className="w-full border border-amber-300 rounded-lg px-3 py-2 text-[13px] font-mono focus:outline-none focus:ring-2 focus:ring-amber-500 bg-amber-50/50"
                      />
                      {(() => {
                        const original = data?.net_of_reval ?? 0;
                        const noNeg = data?.net_of_reval_no_neg ?? 0;
                        const ind = areaChangeIndicator(
                          condonedAmount.trim() !== "" ? parseFloat(condonedAmount) : null,
                          noNeg
                        );
                        return (
                          <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                            Original: {original.toLocaleString("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            {condonedAmount.trim() !== "" && (
                              <span className={`font-bold ${ind.color}`} title={ind.title}>{ind.icon}</span>
                            )}
                          </p>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-4 items-start">
                    <div>
                      <label className="block text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-1.5">Municipality</label>
                      <input
                        type="text"
                        value={municipality}
                        onChange={(e) => { setMunicipality(e.target.value.toUpperCase()); }}
                        placeholder="e.g. LEGAZPI CITY"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-green-600"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-1.5">Barangay</label>
                      <input
                        type="text"
                        value={barangay}
                        onChange={(e) => { setBarangay(e.target.value.toUpperCase()); }}
                        placeholder="e.g. RAWIS"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-green-600"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-1.5">Remarks</label>
                      <textarea
                        value={remarks}
                        onChange={(e) => { setRemarks(e.target.value); }}
                        placeholder="Optional notes..."
                        rows={4}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-green-600 resize-y"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="btn-primary"
                    >
                      {saving ? "Saving…" : <>Save Changes <span className="btn-icon-trail">✓</span></>}
                    </button>
                  </div>
                </div>
              </div>}

            </div>
          )}

          {!loading && data && tab === "arbs" && (
            <div className="p-5">
              {data.arbs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <p className="text-3xl mb-3">🌾</p>
                  <p className="text-gray-500 font-medium">No ARBs linked to this landholding.</p>
                  <p className="text-gray-400 text-sm mt-1">ARBs can be uploaded via the ARB Upload &amp; Viewer page.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
                  {arbEditError && <p className="px-4 py-2 text-sm text-red-600 bg-red-50 border-b border-red-200">{arbEditError}</p>}
                  <table className="w-full text-[13px]">
                    <thead className="bg-green-900 text-white">
                      <tr>
                        <th className="px-3 py-3 text-left font-semibold text-[11px] uppercase tracking-wide">#</th>
                        <th className="px-3 py-3 text-left font-semibold text-[11px] uppercase tracking-wide">ARB Name</th>
                        <th className="px-3 py-3 text-left font-semibold text-[11px] uppercase tracking-wide">ARB ID</th>
                        <th className="px-3 py-3 text-left font-semibold text-[11px] uppercase tracking-wide">EP/CLOA No.</th>
                        <th className="px-3 py-3 text-left font-semibold text-[11px] uppercase tracking-wide">CARPable</th>
                        <th className="px-3 py-3 text-right font-semibold text-[11px] uppercase tracking-wide">Area (has.)</th>
                        <th className="px-3 py-3 text-left font-semibold text-[11px] uppercase tracking-wide">Remarks</th>
                        {isEditor && <th className="px-3 py-3 text-center font-semibold text-[11px] uppercase tracking-wide">Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {data.arbs.map((arb, i) => {
                        const isEditing = editingArb?.id === arb.id;
                        const rowBg = i % 2 === 0 ? "bg-white" : "bg-gray-50/70";
                        if (isEditing && editingArb) {
                          return (
                            <tr key={arb.id} className="border-t border-green-200 bg-green-50">
                              <td className="px-3 py-2 text-gray-400 font-mono text-[12px]">{i + 1}</td>
                              <td className="px-2 py-1.5"><input value={editingArb.arb_name} onChange={(e) => setEditingArb((p) => p && ({ ...p, arb_name: e.target.value.toUpperCase() }))} className="w-full border border-gray-300 rounded px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-green-600" /></td>
                              <td className="px-2 py-1.5"><input value={editingArb.arb_no} onChange={(e) => setEditingArb((p) => p && ({ ...p, arb_no: e.target.value.toUpperCase() }))} className="w-full border border-gray-300 rounded px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-green-600" /></td>
                              <td className="px-2 py-1.5"><input value={editingArb.ep_cloa_no} onChange={(e) => setEditingArb((p) => p && ({ ...p, ep_cloa_no: e.target.value.toUpperCase() }))} className="w-full border border-gray-300 rounded px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-green-600" /></td>
                              <td className="px-2 py-1.5">
                                <select value={editingArb.carpable} onChange={(e) => setEditingArb((p) => p && ({ ...p, carpable: e.target.value }))} className={`w-full border rounded px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-green-600 bg-white ${!editingArb.carpable ? "border-red-300" : "border-gray-300"}`}>
                                  <option value="">—</option>
                                  <option value="CARPABLE">CARPABLE</option>
                                  <option value="NON-CARPABLE">NON-CARPABLE</option>
                                </select>
                              </td>
                              <td className="px-2 py-1.5"><input value={editingArb.area_allocated} onChange={(e) => setEditingArb((p) => p && ({ ...p, area_allocated: e.target.value }))} className="w-full border border-gray-300 rounded px-2 py-1 text-[12px] text-right focus:outline-none focus:ring-1 focus:ring-green-600" /></td>
                              <td className="px-2 py-1.5"><input value={editingArb.remarks} onChange={(e) => setEditingArb((p) => p && ({ ...p, remarks: e.target.value }))} className="w-full border border-gray-300 rounded px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-green-600" /></td>
                              <td className="px-3 py-1.5 text-center whitespace-nowrap">
                                <button onClick={handleArbSave} disabled={savingArb} className="text-[11px] px-2 py-1 bg-green-700 text-white rounded hover:bg-green-600 disabled:opacity-40 mr-1">{savingArb ? "…" : "Save"}</button>
                                <button onClick={() => { setEditingArb(null); setArbEditError(""); }} className="text-[11px] px-2 py-1 border border-gray-300 text-gray-600 rounded hover:bg-gray-100">Cancel</button>
                              </td>
                            </tr>
                          );
                        }
                        return (
                          <tr key={arb.id} className={`border-t border-gray-100 ${rowBg}`}>
                            <td className="px-3 py-2.5 text-gray-400 font-mono text-[12px]">{i + 1}</td>
                            <td className="px-3 py-2.5 text-gray-900 font-medium">{arb.arb_name ?? "—"}</td>
                            <td className="px-3 py-2.5 font-mono text-gray-700">{arb.arb_no ?? "—"}</td>
                            <td className="px-3 py-2.5 font-mono text-gray-700">{arb.ep_cloa_no ?? "—"}</td>
                            <td className="px-3 py-2.5">
                              {arb.carpable
                                ? <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${arb.carpable === "CARPABLE" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>{arb.carpable}</span>
                                : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono text-gray-800 font-medium">
                              {arb.area_allocated != null ? (() => { const s = String(arb.area_allocated); const hasStar = s.endsWith("*"); const n = parseFloat(s.replace("*", "")); return isNaN(n) ? s : hasStar ? `${n.toFixed(4)}*` : n.toFixed(4); })() : "—"}
                            </td>
                            <td className="px-3 py-2.5 text-gray-400 italic">{arb.remarks ?? "—"}</td>
                            {isEditor && (
                              <td className="px-3 py-2.5 text-center whitespace-nowrap">
                                {confirmDeleteArbId === arb.id ? (
                                  <span className="inline-flex items-center gap-1">
                                    <button onClick={() => handleArbDelete(arb.id)} disabled={deletingArb} className="text-[10px] px-1.5 py-0.5 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-40">{deletingArb ? "…" : "Confirm"}</button>
                                    <button onClick={() => setConfirmDeleteArbId(null)} className="text-[10px] px-1.5 py-0.5 border border-gray-300 text-gray-500 rounded hover:bg-gray-100">Cancel</button>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-2">
                                    <button onClick={() => { setArbEditError(""); setEditingArb({ id: arb.id, arb_name: arb.arb_name ?? "", arb_no: arb.arb_no ?? "", ep_cloa_no: arb.ep_cloa_no ?? "", carpable: arb.carpable ?? "", area_allocated: arb.area_allocated ?? "", remarks: arb.remarks ?? "" }); }} className="text-gray-400 hover:text-green-700 transition-colors" title="Edit ARB">
                                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
                                    </button>
                                    <button onClick={() => setConfirmDeleteArbId(arb.id)} className="text-gray-400 hover:text-red-600 transition-colors" title="Delete ARB">
                                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                                    </button>
                                  </span>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-200 bg-gray-50">
                        <td colSpan={5} className="px-3 py-2.5 text-[12px] font-semibold text-gray-500">Total Area</td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-gray-800">
                          {data.arbs.reduce((sum, arb) => {
                            if (!arb.area_allocated) return sum;
                            const s = String(arb.area_allocated);
                            if (s.endsWith("*")) return sum;
                            const n = parseFloat(s);
                            return sum + (isNaN(n) ? 0 : n);
                          }, 0).toFixed(4)}
                        </td>
                        <td colSpan={isEditor ? 2 : 1} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

type LandholdingRow = {
  id: number;
  seqno_darro: string;
  clno: string | null;
  claim_no: string | null;
  landowner: string | null;
  province_edited: string | null;
  claimclass: string | null;
  amendarea: number | null;
  amendarea_validated: number | null;
  net_of_reval_no_neg: number | null;
  source: string | null;
  duplicate_clno: string | null;
  cross_province: string | null;
  data_flags: string | null;
  status: string | null;
  condoned_amount: number | null;
  dar_match_status: string | null;
};

const PROVINCES = [
  "ALBAY", "CAMARINES NORTE", "CAMARINES SUR - I",
  "CAMARINES SUR - II", "CATANDUANES", "MASBATE", "SORSOGON",
];
const SOURCES = ["RA 6657", "RA 9700", "Original File Only"];
const FLAGS = [
  { label: "All Flags", value: "" },
  { label: "No Issues", value: "none" },
  { label: "Zero Validated AMENDAREA", value: "zero_amendarea" },
  { label: "Zero Condoned Amount (NET_OF_REVAL)", value: "zero_condoned" },
  { label: "Negative Condoned Amount (NET_OF_REVAL)", value: "Negative NET OF REVAL" },
  { label: "Cross Province Duplicates", value: "cross_province" },
];
const STATUSES = ["For Further Validation", "Fully Distributed", "Partially Distributed", "Encoded", "For Encoding", "Not Eligible for Encoding"];

function flagBadge(flag: string | null) {
  if (!flag) return null;
  const flags = flag.split(";").map((f) => f.trim()).filter((f) => !f.includes("OSAREA"));
  if (flags.length === 0) return null;
  const joined = flags.join("; ");
  const color = joined.includes("Negative")
    ? "bg-red-100 text-red-700"
    : "bg-yellow-100 text-yellow-700";
  return (
    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${color}`}>
      {flags.length > 1 ? "Both Negative" : joined.replace("Negative ", "Neg. ")}
    </span>
  );
}

function statusBadge(status: string | null) {
  const s = status ?? "For Further Validation";
  const colors: Record<string, string> = {
    "Fully Distributed":         "bg-emerald-100 text-emerald-700",
    "Partially Distributed":     "bg-teal-100 text-teal-700",
    "Encoded":                   "bg-blue-100 text-blue-700",
    "For Encoding":              "bg-violet-100 text-violet-700",
    "For Further Validation":    "bg-amber-100 text-amber-700",
    "Not Eligible for Encoding": "bg-red-100 text-red-700",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${colors[s] ?? "bg-gray-100 text-gray-500"}`}>
      {s}
    </span>
  );
}

export default function RecordsTable() {
  const { isEditor, user } = useUser();
  const provinceScope =
    user && user.office_level !== "regional" ? user.province ?? null : null;
  const municipalityScope =
    user && user.office_level === "municipal" ? user.municipality ?? null : null;

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const page = parseInt(searchParams.get("page") ?? "1");
  const search = searchParams.get("search") ?? "";
  // Provincial/municipal users are always locked to their province
  const province = provinceScope ?? (searchParams.get("province") ?? "");
  // Municipal users are locked to their municipality
  const municipality = municipalityScope ?? (searchParams.get("municipality") ?? "");
  const source = searchParams.get("source") ?? "";
  const flag = searchParams.get("flag") ?? "";
  const status = searchParams.get("status") ?? "";
  const limit = 50;

  const [records, setRecords] = useState<LandholdingRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState(search);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedSeqno, setSelectedSeqno] = useState<string | null>(null);
  const [municipalities, setMunicipalities] = useState<string[]>([]);

  // Fetch municipalities whenever province changes (or on mount)
  useEffect(() => {
    if (municipalityScope) return; // locked users don't need the list
    const params = new URLSearchParams();
    if (province) params.set("province", province);
    fetch(`/api/municipalities?${params}`)
      .then((r) => r.ok ? r.json() : { municipalities: [] })
      .then((d) => setMunicipalities(d.municipalities ?? []));
  }, [province, municipalityScope]);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) params.set("search", search);
    if (province) params.set("province", province);
    if (municipality) params.set("municipality", municipality);
    if (source) params.set("source", source);
    if (flag) params.set("flag", flag);
    if (status) params.set("status", status);

    const res = await fetch(`/api/records?${params}`);
    const data = await res.json();
    setRecords(data.records);
    setTotal(data.total);
    setLoading(false);
  }, [page, search, province, municipality, source, flag, status]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  function handleSearchChange(value: string) {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => updateParam("search", value), 350);
  }

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value); else params.delete(key);
    // Reset municipality when province changes
    if (key === "province") params.delete("municipality");
    params.delete("page");
    router.push(`${pathname}?${params}`);
  }

  function setPage(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(p));
    router.push(`${pathname}?${params}`);
  }

  const [exporting, setExporting] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node))
        setExportMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function handleExport(type: "simplified" | "full") {
    setExportMenuOpen(false);
    setExporting(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (province) params.set("province", province);
    if (municipality) params.set("municipality", municipality);
    if (source) params.set("source", source);
    if (flag) params.set("flag", flag);
    if (status) params.set("status", status);
    params.set("type", type);
    const res = await fetch(`/api/records/export?${params}`);
    if (res.ok) {
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="(.+?)"/);
      const filename = match ? match[1] : "Records.xlsx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    }
    setExporting(false);
  }

  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  return (
    <div className="flex flex-col gap-4 text-sm">
      {selectedSeqno && (
        <DetailModal
          seqno={selectedSeqno}
          onClose={() => setSelectedSeqno(null)}
          onSaved={fetchRecords}
        />
      )}
      {/* Filters */}
      <div className="card-bezel mb-4">
      <div className="card-bezel-inner-open">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <input
            type="text"
            placeholder="Search SEQNO, CLNO, Landowner..."
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="col-span-2 lg:col-span-2 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          {!provinceScope && (
            <select
              value={province}
              onChange={(e) => updateParam("province", e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">All Provinces</option>
              {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
          {!municipalityScope && (
            <select
              value={municipality}
              onChange={(e) => updateParam("municipality", e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              disabled={municipalities.length === 0}
            >
              <option value="">All Municipalities</option>
              {municipalities.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
          <select
            value={source}
            onChange={(e) => updateParam("source", e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">All Sources</option>
            {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={flag}
            onChange={(e) => updateParam("flag", e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            {FLAGS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <span className="text-xs text-gray-500">Status:</span>
          {["", ...STATUSES].map((s) => (
            <button
              key={s}
              onClick={() => updateParam("status", s)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                status === s
                  ? "bg-green-700 text-white border-green-700"
                  : "bg-white text-gray-600 border-gray-300 hover:border-green-500"
              }`}
            >
              {s === "" ? "All" : s}
            </button>
          ))}
        </div>
      </div>
      </div>

      {/* Table */}
      <div className="card-bezel">
      <div className="card-bezel-inner">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-gray-600">
            {loading ? "Loading..." : `Showing ${start.toLocaleString()}–${end.toLocaleString()} of ${total.toLocaleString()} records`}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <div ref={exportMenuRef} className="relative">
              <div className={`flex rounded-lg overflow-hidden border transition-opacity ${exporting || loading || total === 0 ? "opacity-40 pointer-events-none" : ""}`}>
                <button
                  onClick={() => handleExport("simplified")}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 text-white text-[12px] font-semibold hover:bg-emerald-600 transition-colors whitespace-nowrap"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                  {exporting ? "Exporting…" : `Export (${total.toLocaleString()})`}
                </button>
                <button
                  onClick={() => setExportMenuOpen((v) => !v)}
                  className="px-2 py-1.5 bg-emerald-800 text-white hover:bg-emerald-700 transition-colors border-l border-emerald-600"
                  title="More export options"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
              {exportMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 z-50 overflow-hidden">
                  <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                    <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400">Export Format</p>
                  </div>
                  <button
                    onClick={() => handleExport("simplified")}
                    className="w-full text-left px-3 py-2.5 hover:bg-emerald-50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <p className="text-[13px] font-semibold text-gray-800">Simplified</p>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 uppercase tracking-wide">Recommended</span>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5">Key fields only — SEQNO, CLNO, Landowner, Province, Class, AMENDAREA, Status, ARB count</p>
                  </button>
                  <div className="border-t border-gray-100" />
                  <button
                    onClick={() => handleExport("full")}
                    className="w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors"
                  >
                    <p className="text-[13px] font-semibold text-gray-800">Full Data</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">All fields — includes DAR CO validation data, area breakdowns, flags, and remarks</p>
                  </button>
                </div>
              )}
            </div>
            <div className="w-px h-5 bg-gray-200" />
            <button onClick={() => setPage(page - 1)} disabled={page <= 1 || loading} className="btn-page">
              ← Prev
            </button>
            <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
            <button onClick={() => setPage(page + 1)} disabled={page >= totalPages || loading} className="btn-page">
              Next →
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-green-900 text-white text-xs uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2.5 text-left whitespace-nowrap">#</th>
                <th className="px-3 py-2.5 text-left whitespace-nowrap">SEQNO_DARRO</th>
                <th className="px-3 py-2.5 text-left whitespace-nowrap">CLNO</th>
                <th className="px-3 py-2.5 text-left whitespace-nowrap">Landowner</th>
                <th className="px-3 py-2.5 text-left whitespace-nowrap">Province</th>
                <th className="px-3 py-2.5 text-left whitespace-nowrap">Class</th>
                <th className="px-3 py-2.5 text-right whitespace-nowrap">AMENDAREA (Val.)</th>
                <th className="px-3 py-2.5 text-right whitespace-nowrap">Condoned Amt.</th>
                <th className="px-3 py-2.5 text-left whitespace-nowrap">Source</th>
                <th className="px-3 py-2.5 text-left whitespace-nowrap">Flag</th>
                <th className="px-3 py-2.5 text-left whitespace-nowrap">Status</th>
              </tr>
            </thead>
            <tbody className={loading ? "opacity-40" : ""}>
              {records.map((r, i) => (
                <tr
                  key={r.id}
                  onDoubleClick={() => setSelectedSeqno(r.seqno_darro)}
                  className={`border-t border-gray-100 hover:bg-green-50 transition-colors cursor-pointer ${
                    i % 2 === 0 ? "bg-white" : "bg-gray-50"
                  } ${r.data_flags?.includes("Negative") ? "border-l-2 border-l-red-400" : ""}`}
                >
                  <td className="px-3 py-2 text-gray-400">{start + i}</td>
                  <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                    <button
                      onClick={() => setSelectedSeqno(r.seqno_darro)}
                      className="text-green-700 hover:underline font-semibold"
                    >
                      {r.seqno_darro}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.clno ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-800 max-w-[200px] truncate">{r.landowner ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.province_edited ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{r.claimclass ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-mono text-gray-700 whitespace-nowrap">
                    {(r.amendarea_validated ?? r.amendarea)?.toFixed(4) ?? "—"}
                  </td>
                  {(() => {
                    const condoned = r.condoned_amount ?? r.net_of_reval_no_neg;
                    const isZeroOrNeg = condoned !== null && condoned <= 0;
                    return (
                      <td className={`px-3 py-2 text-right font-mono whitespace-nowrap ${isZeroOrNeg ? "text-red-600 font-semibold" : "text-gray-700"}`}>
                        {condoned !== null
                          ? condoned.toLocaleString("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2, maximumFractionDigits: 2 })
                          : "—"}
                      </td>
                    );
                  })()}
                  <td className="px-3 py-2 text-gray-500 text-xs whitespace-nowrap">{r.source ?? "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="flex flex-wrap gap-1">
                      {!(r.condoned_amount != null && r.condoned_amount > 0) && flagBadge(r.data_flags)}
                      {(() => {
                        const validatedArea = r.amendarea_validated ?? r.amendarea;
                        const condoned = r.condoned_amount ?? r.net_of_reval_no_neg;
                        return (
                          <>
                            {(validatedArea === null || validatedArea <= 0) && (
                              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-700">
                                Zero Validated AMENDAREA
                              </span>
                            )}
                            {condoned !== null && condoned === 0 && !r.data_flags?.includes("Negative NET OF REVAL") && (
                              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-orange-100 text-orange-700">
                                Zero NET OF REVAL
                              </span>
                            )}
                          </>
                        );
                      })()}
                      {r.cross_province && (
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-100 text-purple-700">
                          Cross Province
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{statusBadge(r.status)}</td>
                </tr>
              ))}
              {!loading && records.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-10 text-center text-gray-400">No records found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Bottom pagination */}
        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
          <p className="text-sm text-gray-500">{total.toLocaleString()} total records</p>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(1)} disabled={page <= 1 || loading} className="btn-page">First</button>
            <button onClick={() => setPage(page - 1)} disabled={page <= 1 || loading} className="btn-page">← Prev</button>
            <span className="text-sm text-gray-600 px-2">Page <strong>{page}</strong> of {totalPages}</span>
            <button onClick={() => setPage(page + 1)} disabled={page >= totalPages || loading} className="btn-page">Next →</button>
            <button onClick={() => setPage(totalPages)} disabled={page >= totalPages || loading} className="btn-page">Last</button>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
