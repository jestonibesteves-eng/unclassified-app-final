"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useToast } from "@/components/Toast";
import { useUser } from "@/components/UserContext";

function toDateInput(val: string): string {
  if (!val) return "";
  const [m, d, y] = val.split("/");
  if (!m || !d || !y) return "";
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}
function fromDateInput(val: string): string {
  if (!val) return "";
  const [y, m, d] = val.split("-");
  if (!y || !m || !d) return "";
  return `${m}/${d}/${y}`;
}

function displayCondoned(val: string | null | undefined): string {
  if (!val) return "—";
  const num = parseFloat(val.replace(/,/g, ""));
  if (!isNaN(num) && String(val).trim().replace(/,/g, "") === String(num)) {
    return num.toLocaleString("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return val;
}

/* ─── Detail types ─── */
type Arb = {
  id: number;
  arb_name: string | null;
  arb_id: string | null;
  ep_cloa_no: string | null;
  carpable: string | null;
  area_allocated: string | null;
  allocated_condoned_amount: string | null;
  eligibility: string | null;
  eligibility_reason: string | null;
  date_encoded: string | null;
  date_distributed: string | null;
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
  amendarea_validated_confirmed: boolean;
  condoned_amount_confirmed: boolean;
  asp_status: string | null;
  cloa_status: string | null;
  municipality: string | null;
  barangay: string | null;
  remarks: string | null;
  non_eligibility_reason: string | null;
  arbs: Arb[];
};

const DETAIL_STATUSES = ["For Initial Validation", "For Further Validation", "For Encoding", "Partially Encoded", "Fully Encoded", "Partially Distributed", "Fully Distributed", "Not Eligible for Encoding"];

const CLOA_STATUS_VALUES = [
  "Still CCLOA (SPLIT Target)",
  "Still CCLOA (Not SPLIT Target)",
  "Full — Individual Title (SPLIT)",
  "Partial — Individual Title (SPLIT)",
  "Full — Individual Title (Regular Redoc)",
  "Partial — Individual Title (Regular Redoc)",
] as const;
type CloaStatus = typeof CLOA_STATUS_VALUES[number];

const NON_ELIGIBILITY_REASONS = [
  "UNDER CLASSIFIED ARR", "WITH CERTIFICATE OF FULL PAYMENT", "NO ISSUED TITLE",
  "AT ROD ON PROCESSING", "UNDER MANUAL REGISTRATION", "ALLEGEDLY SOLD",
  "CANCELLED TITLE", "FOR CANCELLATION OF TITLE", "FOR CANCELLATION OF ASP",
  "FOR DISQUALIFICATION OF ARB / ALI CASE", "CONVERTED TO CTITLE",
  "FOR REISSUANCE OF TITLE", "FOR RECONSTITUTION OF TITLE", "NON-CARPABLE",
  "NOT FOUND IN LRA SYSTEM", "WRONG PROVINCE",
  "FOR FURTHER RESEARCH (NO CONDONED AMOUNT)", "PROVISIONAL REGISTRATION",
  "TIMBERLAND PER PROJECTION", "WITH DEED OF SALE",
  "DETAILS DOES NOT MATCH vs. OTHER DOCS (ASP, CLOA, etc.)",
  "OCCUPIED BY ADVERSE CLAIMANTS", "DUPLICATE RECORD",
  "NO RECORD AT DAR AND ROD",
];

function excelDateToString(value: string | null): string | null {
  if (!value) return null;
  const serial = Number(value);
  if (isNaN(serial) || serial < 1) return value; // already a string date or invalid
  const date = new Date((serial - 25569) * 86400 * 1000);
  return date.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
}

const STATUS_STYLES: Record<string, { dot: string; badge: string }> = {
  "For Initial Validation":    { dot: "bg-slate-400",   badge: "bg-slate-100 text-slate-700 border-slate-200" },
  "For Further Validation":    { dot: "bg-amber-400",   badge: "bg-amber-100 text-amber-800 border-amber-200" },
  "For Encoding":              { dot: "bg-violet-400",  badge: "bg-violet-100 text-violet-800 border-violet-200" },
  "Partially Encoded":         { dot: "bg-sky-400",     badge: "bg-sky-100 text-sky-800 border-sky-200" },
  "Fully Encoded":             { dot: "bg-blue-500",    badge: "bg-blue-100 text-blue-800 border-blue-200" },
  "Partially Distributed":     { dot: "bg-teal-400",    badge: "bg-teal-100 text-teal-800 border-teal-200" },
  "Fully Distributed":         { dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  "Not Eligible for Encoding": { dot: "bg-red-400",     badge: "bg-red-100 text-red-800 border-red-200" },
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

export function DetailModal({ seqno, onClose, onSaved, onPrev, onNext, hasPrev, hasNext }: { seqno: string; onClose: () => void; onSaved: () => void; onPrev?: () => void; onNext?: () => void; hasPrev?: boolean; hasNext?: boolean }) {
  const [data, setData] = useState<LandholdingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<{ status: number; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [showNotEligibleConfirm, setShowNotEligibleConfirm] = useState(false);
  const toast = useToast();
  const { isEditor, user } = useUser();
  const isSuperAdmin = user?.role === "super_admin";
  const [status, setStatus] = useState("");
  const [nonEligibilityReason, setNonEligibilityReason] = useState("");
  const [nonEligibilityOther, setNonEligibilityOther] = useState("");
  const [condonedAmount, setCondonedAmount] = useState("");
  const [amendareavValidated, setAmendareavValidated] = useState("");
  const [areaConfirmed, setAreaConfirmed] = useState(false);
  const [condonedConfirmed, setCondonedConfirmed] = useState(false);
  const [pendingUndo, setPendingUndo] = useState<"area" | "condoned" | null>(null);
  const [cloaStatus, setCloaStatus] = useState<CloaStatus | null>(null);
  const [aspStatus, setAspStatus] = useState<"With ASP" | "Without ASP" | null>(null);
  const [municipality, setMunicipality] = useState("");
  const [barangay, setBarangay] = useState("");
  const [remarks, setRemarks] = useState("");
  const [tab, setTab] = useState<"details" | "arbs">("details");
  const [crossProvInfo, setCrossProvInfo] = useState<{ province: string | null; seqno: string } | null>(null);
  const [editingArb, setEditingArb] = useState<{ id: number; arb_name: string; arb_id: string; ep_cloa_no: string; carpable: string; area_allocated: string; allocated_condoned_amount: string; eligibility: string; eligibility_reason: string; date_encoded: string; date_distributed: string; remarks: string } | null>(null);
  const [savingArb, setSavingArb] = useState(false);
  const [arbEditError, setArbEditError] = useState("");
  const [confirmDeleteArbId, setConfirmDeleteArbId] = useState<number | null>(null);
  const [deletingArb, setDeletingArb] = useState(false);
  const [editingProvince, setEditingProvince] = useState(false);
  const [provinceInput, setProvinceInput] = useState("");
  const [provinceList, setProvinceList] = useState<string[]>([]);
  const [savingProvince, setSavingProvince] = useState(false);

  useEffect(() => {
    fetch(`/api/records/${encodeURIComponent(seqno)}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          setLoadError({ status: r.status, message: body.error ?? `HTTP ${r.status}` });
          setLoading(false);
          return null;
        }
        return r.json();
      })
      .then((d: LandholdingDetail | null) => {
        if (!d) return;
        setData(d);
        setStatus(d.status ?? "For Initial Validation");
        if (d.status === "Not Eligible for Encoding" && d.non_eligibility_reason) {
          const isKnown = NON_ELIGIBILITY_REASONS.includes(d.non_eligibility_reason);
          setNonEligibilityReason(isKnown ? d.non_eligibility_reason : "__other__");
          setNonEligibilityOther(isKnown ? "" : d.non_eligibility_reason);
        }
        setCondonedAmount(d.condoned_amount != null ? String(d.condoned_amount) : (d.net_of_reval_no_neg != null ? String(d.net_of_reval_no_neg) : ""));
        setAmendareavValidated(d.amendarea_validated != null ? String(d.amendarea_validated) : (d.amendarea != null ? String(d.amendarea) : ""));
        setAreaConfirmed(d.amendarea_validated_confirmed ?? false);
        setCondonedConfirmed(d.condoned_amount_confirmed ?? false);
        setCloaStatus((CLOA_STATUS_VALUES as readonly string[]).includes(d.cloa_status ?? "") ? d.cloa_status as CloaStatus : null);
        setAspStatus((d.asp_status === "With ASP" || d.asp_status === "Without ASP") ? d.asp_status : null);
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
      if (e.key === "Escape") {
        if (showNotEligibleConfirm) { setShowNotEligibleConfirm(false); return; }
        onClose();
      }
      if (e.key === "ArrowLeft" && e.ctrlKey && hasPrev && onPrev) { e.preventDefault(); onPrev(); }
      if (e.key === "ArrowRight" && e.ctrlKey && hasNext && onNext) { e.preventDefault(); onNext(); }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, onPrev, onNext, hasPrev, hasNext, showNotEligibleConfirm]);

  const effectiveNonEligibilityReason = nonEligibilityReason === "__other__" ? nonEligibilityOther.trim() : nonEligibilityReason;

  // Confirmed badge shows only when the DB flag is set AND the input still matches the saved value
  const savedAreaVal = data ? (data.amendarea_validated ?? data.amendarea ?? 0) : 0;
  const savedCondonedVal = data ? (data.condoned_amount ?? data.net_of_reval_no_neg ?? 0) : 0;
  const isAreaEffectivelyConfirmed = areaConfirmed && (() => {
    const input = parseFloat(amendareavValidated);
    return !isNaN(input) && parseFloat(input.toFixed(4)) === parseFloat(savedAreaVal.toFixed(4));
  })();
  const isCondonedEffectivelyConfirmed = condonedConfirmed && (() => {
    const input = parseFloat(condonedAmount);
    return !isNaN(input) && parseFloat(input.toFixed(2)) === parseFloat(savedCondonedVal.toFixed(2));
  })();

  const isDirty = !!data && (() => {
    const savedStatus = data.status ?? "For Initial Validation";
    const savedArea = data.amendarea_validated != null ? String(data.amendarea_validated) : (data.amendarea != null ? String(data.amendarea) : "");
    const savedCondoned = data.condoned_amount != null ? String(data.condoned_amount) : (data.net_of_reval_no_neg != null ? String(data.net_of_reval_no_neg) : "");
    const savedCloaStatus = (CLOA_STATUS_VALUES as readonly string[]).includes(data.cloa_status ?? "") ? data.cloa_status as CloaStatus : null;
    const savedAspStatus = (data.asp_status === "With ASP" || data.asp_status === "Without ASP") ? data.asp_status : null;
    const savedMunicipality = data.municipality ?? "";
    const savedBarangay = data.barangay ?? "";
    const savedRemarks = data.remarks ?? "";
    return (
      status !== savedStatus ||
      amendareavValidated !== savedArea ||
      condonedAmount !== savedCondoned ||
      cloaStatus !== savedCloaStatus ||
      aspStatus !== savedAspStatus ||
      municipality !== savedMunicipality ||
      barangay !== savedBarangay ||
      remarks !== savedRemarks
    );
  })();

  function handleSave() {
    if (status === "Not Eligible for Encoding" && !effectiveNonEligibilityReason) {
      toast("Reason for Non-Eligibility is required.", "error"); return;
    }
    if (status === "Not Eligible for Encoding") {
      const arbWithDate = data?.arbs.find((a) => a.date_encoded || a.date_distributed);
      if (arbWithDate) {
        toast("Cannot set to Not Eligible for Encoding — one or more ARBs have Dates Encoded/Distributed filled in.", "error");
        return;
      }
    }
    // Show confirmation when transitioning INTO Not Eligible for Encoding
    if (status === "Not Eligible for Encoding" && data?.status !== "Not Eligible for Encoding") {
      setShowNotEligibleConfirm(true);
      return;
    }
    void executeSave();
  }

  async function executeSave() {
    setShowNotEligibleConfirm(false);
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
    body.asp_status = aspStatus ?? null;
    body.cloa_status = cloaStatus ?? null;
    body.municipality = municipality.trim() || null;
    body.barangay = barangay.trim() || null;
    body.remarks = remarks.trim() || null;
    body.non_eligibility_reason = status === "Not Eligible for Encoding"
      ? effectiveNonEligibilityReason || null
      : null;
    const res = await fetch(`/api/records/${encodeURIComponent(seqno)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await res.json();
    if (!res.ok) { toast(result.error ?? "Save failed.", "error"); setSaving(false); return; }
    setData((prev) => prev ? { ...prev, ...result } : prev);
    setAreaConfirmed(result.amendarea_validated_confirmed ?? false);
    setCondonedConfirmed(result.condoned_amount_confirmed ?? false);
    if (result.status) setStatus(result.status);
    setCloaStatus((CLOA_STATUS_VALUES as readonly string[]).includes(result.cloa_status ?? "") ? result.cloa_status as CloaStatus : null);
    setAspStatus((result.asp_status === "With ASP" || result.asp_status === "Without ASP") ? result.asp_status : null);
    toast("Changes saved successfully.", "success");
    setSaving(false);
    onSaved();
  }

  async function handleRevert() {
    setReverting(true);
    const res = await fetch(`/api/records/${encodeURIComponent(seqno)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revert_not_eligible: true }),
    });
    const result = await res.json();
    if (!res.ok) { toast(result.error ?? "Revert failed.", "error"); setReverting(false); return; }
    setData(result);
    setStatus(result.status ?? "For Initial Validation");
    setNonEligibilityReason("");
    setNonEligibilityOther("");
    setAreaConfirmed(result.amendarea_validated_confirmed ?? false);
    setCondonedConfirmed(result.condoned_amount_confirmed ?? false);
    toast("Status reverted and recomputed.", "success");
    setReverting(false);
    onSaved();
  }

  async function executeUndo(field: "area" | "condoned") {
    const body = field === "area"
      ? { amendarea_validated_confirmed: false }
      : { condoned_amount_confirmed: false };
    const res = await fetch(`/api/records/${encodeURIComponent(seqno)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await res.json();
    if (res.ok) {
      if (field === "area") setAreaConfirmed(false);
      else setCondonedConfirmed(false);
      setData((prev) => prev ? { ...prev, ...result } : prev);
      if (result.status) setStatus(result.status);
      onSaved();
    } else {
      toast(result.error ?? "Failed to undo confirmation.", "error");
    }
    setPendingUndo(null);
  }

  async function handleProvinceChange() {
    if (!provinceInput.trim()) return;
    setSavingProvince(true);
    const res = await fetch(`/api/records/${encodeURIComponent(seqno)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ province_edited: provinceInput.trim() }),
    });
    const d = await res.json();
    setSavingProvince(false);
    if (!res.ok) { toast(d.error ?? "Failed to update province.", "error"); return; }
    setData(d);
    setEditingProvince(false);
    toast("Province updated.", "success");
  }

  async function handleArbSave() {
    if (!editingArb) return;
    if (!editingArb.carpable) { setArbEditError("CARPable/Non-CARPable is required."); return; }
    setArbEditError(""); setSavingArb(true);
    try {
      const res = await fetch(`/api/arbs/item/${editingArb.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          arb_name: editingArb.arb_name,
          arb_id: editingArb.arb_id || null,
          ep_cloa_no: editingArb.ep_cloa_no || null,
          carpable: editingArb.carpable,
          area_allocated: editingArb.area_allocated || null,
          allocated_condoned_amount: editingArb.allocated_condoned_amount,
          eligibility: editingArb.eligibility,
          eligibility_reason: editingArb.eligibility_reason,
          date_encoded: editingArb.date_encoded || null,
          date_distributed: editingArb.date_distributed || null,
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
    } catch (err) {
      setArbEditError(err instanceof Error ? err.message : "An unexpected error occurred.");
      setSavingArb(false);
    }
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

  const normalizedStatus = (data?.status === "Untagged" || !data?.status) ? "For Initial Validation" : data.status;
  const statusStyle = STATUS_STYLES[normalizedStatus] ?? STATUS_STYLES["For Initial Validation"];
  const hasFlag = !!data?.data_flags;
  const parsedCondonedInput = condonedAmount.trim() !== "" ? parseFloat(condonedAmount) : null;
  const userEnteredPositiveCondoned = parsedCondonedInput != null && !isNaN(parsedCondonedInput) && parsedCondonedInput > 0;
  const savedCondonedPositive = data?.condoned_amount != null && data.condoned_amount > 0;
  const isNegativeReval = !!data?.data_flags?.includes("Negative NET OF REVAL") || (data?.net_of_reval != null && data.net_of_reval < 0);
  const isZeroCondoned = !isNegativeReval && data?.net_of_reval != null && data.net_of_reval === 0 && (data?.net_of_reval_no_neg ?? 0) === 0;
  const negativeReval = (isNegativeReval || isZeroCondoned) && !userEnteredPositiveCondoned && !savedCondonedPositive;

  return (
    <>
    {createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-4"
      style={{ animation: "modal-backdrop-in 0.2s ease-out both" }}
      onMouseDown={handleBackdrop}
    >
      <style>{`
        .modal-panel { animation: modal-panel-in 0.48s cubic-bezier(0.16, 1, 0.3, 1) both; }
      `}</style>

      {/* Undo confirmation dialog */}
      {pendingUndo && (() => {
        const ADVANCE_STATUSES = ["For Encoding", "Partially Encoded", "Fully Encoded", "Partially Distributed", "Fully Distributed"];
        const currentStatus = data?.status ?? "";
        const hasAdvanced = ADVANCE_STATUSES.includes(currentStatus);
        const fieldLabel = pendingUndo === "area" ? "Validated AMENDAREA" : "Validated Condoned Amount";
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onMouseDown={(e) => e.stopPropagation()}>
            <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-sm overflow-hidden">
              {/* Header */}
              <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 bg-amber-50">
                <span className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-amber-600" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
                  </svg>
                </span>
                <div>
                  <p className="font-bold text-gray-800 text-[14px]">Undo Confirmation</p>
                  <p className="text-[11px] text-amber-700 font-medium">{fieldLabel}</p>
                </div>
              </div>
              {/* Body */}
              <div className="px-5 py-4 text-[13px] text-gray-700 space-y-2">
                {hasAdvanced ? (
                  <>
                    <p>This landholding has already reached <span className="font-semibold text-gray-900">{currentStatus}</span> status.</p>
                    <p>Undoing the confirmation of <span className="font-semibold">{fieldLabel}</span> will revert the status back to <span className="font-semibold text-amber-700">For Further Validation</span> and remove any ARB editing restrictions.</p>
                    <p className="text-gray-500">Are you sure you want to proceed?</p>
                  </>
                ) : (
                  <p>Are you sure you want to undo the confirmation of <span className="font-semibold">{fieldLabel}</span>?</p>
                )}
              </div>
              {/* Actions */}
              <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPendingUndo(null)}
                  className="px-4 py-1.5 rounded-lg border border-gray-300 text-[13px] font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => executeUndo(pendingUndo)}
                  className="px-4 py-1.5 rounded-lg bg-red-600 text-white text-[13px] font-semibold hover:bg-red-700 transition-colors"
                >
                  Yes, Undo
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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
                {data && (() => {
                  const showAreaWarning = isAreaEffectivelyConfirmed && isCondonedEffectivelyConfirmed && (() => {
                    const validatedArea = data.amendarea_validated ?? data.amendarea ?? 0;
                    const totalArbArea = (data.arbs ?? []).reduce((sum, a) => {
                      if (!a.area_allocated) return sum;
                      const s = String(a.area_allocated);
                      if (s.endsWith("*")) return sum;
                      const n = parseFloat(s);
                      return sum + (isNaN(n) ? 0 : n);
                    }, 0);
                    return parseFloat(totalArbArea.toFixed(4)) !== parseFloat(validatedArea.toFixed(4))
                      ? { totalArbArea, validatedArea }
                      : null;
                  })();
                  return (
                    <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[12px] font-semibold ${statusStyle.badge}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
                      {data.status ?? "For Initial Validation"}
                      {showAreaWarning && (() => {
                        return <ModalMismatchButton totalArbArea={showAreaWarning.totalArbArea} validatedArea={showAreaWarning.validatedArea} />;
                      })()}
                    </span>
                  );
                })()}
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
                  {(() => {
                    const carpable = data.arbs.filter((a) => a.carpable !== "NON-CARPABLE");
                    const distinct = new Set(carpable.map((a) => a.arb_name).filter(Boolean)).size;
                    const nonCarpable = data.arbs.length - carpable.length;
                    return (
                      <div className="flex flex-col items-center justify-center rounded-lg px-4 py-3 bg-gray-50 border border-gray-200">
                        <div className="flex items-baseline gap-1.5 leading-none mb-1">
                          <p className="text-lg font-bold font-mono text-gray-900">{carpable.length}</p>
                          <span className="text-[10px] text-gray-400 font-medium">/ {distinct} distinct</span>
                        </div>
                        <p className="text-[10px] uppercase tracking-widest font-semibold text-gray-400">ARBs</p>
                        {nonCarpable > 0 && (
                          <p className="text-[9px] text-gray-300 mt-1">{nonCarpable} non-CARPable</p>
                        )}
                      </div>
                    );
                  })()}
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

            {/* Tabs + nav */}
            <div className="flex items-end justify-between -mb-px">
              <div className="flex gap-0">
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
                    {t === "details" ? "Details" : `ARBs${data ? ` (${data.arbs.filter((a) => a.carpable !== "NON-CARPABLE").length})` : ""}`}
                  </button>
                ))}
              </div>
              {(onPrev || onNext) && (
                <div className="flex items-center gap-1 mb-1.5">
                  <button
                    onClick={onPrev}
                    disabled={!hasPrev}
                    title="Previous record (←)"
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-base leading-none"
                  >
                    ‹
                  </button>
                  <button
                    onClick={onNext}
                    disabled={!hasNext}
                    title="Next record (→)"
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-base leading-none"
                  >
                    ›
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-gray-50/50">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 rounded-full border-2 border-green-800 border-t-transparent animate-spin" />
            </div>
          )}

          {!loading && loadError && (
            <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
              {loadError.status === 403 ? (
                <>
                  <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-amber-600" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <p className="text-[15px] font-semibold text-gray-800 mb-1">This landholding has been transferred</p>
                  <p className="text-[13px] text-gray-500 max-w-xs">It has been moved to another province and is no longer within your jurisdiction.</p>
                </>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <p className="text-[15px] font-semibold text-gray-800 mb-1">Could not load record</p>
                  <p className="text-[13px] text-gray-500">{loadError.message}</p>
                </>
              )}
              <button onClick={onClose} className="mt-5 px-4 py-2 text-[13px] border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">Close</button>
            </div>
          )}

          {!loading && data && tab === "details" && (
            <div className="flex-1 overflow-y-auto">
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
                  {isSuperAdmin ? (
                    <div>
                      <p className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-1 leading-none">Province</p>
                      {editingProvince ? (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <select
                            value={provinceInput}
                            onChange={(e) => setProvinceInput(e.target.value)}
                            className="border border-blue-300 rounded px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                          >
                            <option value="">— select —</option>
                            {provinceList.map((p) => <option key={p} value={p}>{p}</option>)}
                          </select>
                          <button
                            onClick={() => void handleProvinceChange()}
                            disabled={savingProvince || !provinceInput.trim() || provinceInput === data.province_edited}
                            className="px-2 py-1 text-[11px] bg-blue-700 text-white rounded hover:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {savingProvince ? "Saving…" : "Save"}
                          </button>
                          <button onClick={() => setEditingProvince(false)} className="px-2 py-1 text-[11px] border border-gray-300 text-gray-500 rounded hover:bg-gray-50">Cancel</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <p className="text-[13px] font-medium text-gray-900">{data.province_edited ?? <span className="text-gray-300">—</span>}</p>
                          <button
                            onClick={() => {
                              setProvinceInput(data.province_edited ?? "");
                              setEditingProvince(true);
                              if (provinceList.length === 0)
                                fetch("/api/provinces").then((r) => r.json()).then((d) => setProvinceList(d.provinces ?? []));
                            }}
                            className="text-gray-300 hover:text-blue-600 transition-colors"
                            title="Change province"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <Field label="Province" value={data.province_edited} />
                  )}
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
              <SectionCard icon="🔍" title="Data Quality" accent={(hasFlag && !savedCondonedPositive) ? "border-l-red-500" : "border-l-gray-300"}>
                <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                  <div className="col-span-2">
                    {(() => {
                      const activeFlags = data.data_flags
                        ? data.data_flags.split(";").map((f) => f.trim()).filter((f) => {
                            // Hide "Negative NET OF REVAL" flag when a positive condoned amount has been saved
                            if (f.includes("Negative NET OF REVAL") && savedCondonedPositive) return false;
                            return true;
                          })
                        : [];
                      return activeFlags.length > 0 ? (
                        <div>
                          <p className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-1.5">Data Flags</p>
                          <div className="flex flex-wrap gap-1.5">
                            {activeFlags.map((f) => (
                              <span key={f} className="px-2.5 py-1 rounded-md bg-red-100 text-red-700 border border-red-200 text-[12px] font-semibold">
                                {f}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <Field label="Data Flags" value={null} />
                      );
                    })()}
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
                        {DETAIL_STATUSES.map((s) => (
                          <option key={s} value={s} disabled={s !== "Not Eligible for Encoding"}>
                            {s !== "Not Eligible for Encoding" ? `${s} (auto-computed)` : s}
                          </option>
                        ))}
                      </select>
                      {data?.status === "Not Eligible for Encoding" && (
                        <button
                          onClick={handleRevert}
                          disabled={reverting || saving}
                          className="group mt-2 w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 hover:border-amber-300 active:bg-amber-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 text-left"
                        >
                          <span className="flex-shrink-0 w-6 h-6 rounded-md bg-amber-200 group-hover:bg-amber-300 group-disabled:bg-amber-100 flex items-center justify-center transition-colors duration-150">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-amber-700" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M7.793 2.232a.75.75 0 01-.025 1.06L3.622 7.25h10.003a5.375 5.375 0 010 10.75H10a.75.75 0 010-1.5h3.625a3.875 3.875 0 000-7.75H3.622l4.146 3.957a.75.75 0 01-1.036 1.085l-5.5-5.25a.75.75 0 010-1.085l5.5-5.25a.75.75 0 011.061.025z" clipRule="evenodd" />
                            </svg>
                          </span>
                          <span className="flex flex-col min-w-0">
                            <span className="text-[12px] font-semibold text-amber-800 leading-tight">
                              {reverting ? "Reverting…" : "Revert Status"}
                            </span>
                            <span className="text-[10px] text-amber-600 leading-snug">
                              {reverting ? "Please wait…" : "Restore auto-computed status"}
                            </span>
                          </span>
                        </button>
                      )}
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
                      <div className="relative">
                        <input
                          type="number"
                          step="0.0001"
                          value={amendareavValidated}
                          onChange={(e) => { setAmendareavValidated(e.target.value); }}
                          placeholder={data?.amendarea?.toFixed(4) ?? "0.0000"}
                          className="w-full border border-amber-300 rounded-lg px-3 py-2 text-[13px] font-mono focus:outline-none focus:ring-2 focus:ring-amber-500 bg-amber-50/50"
                        />
                      </div>
                      {data?.amendarea != null && (() => {
                        const ind = areaChangeIndicator(
                          amendareavValidated.trim() !== "" ? parseFloat(amendareavValidated) : null,
                          data.amendarea
                        );
                        return (
                          <div className="mt-1.5 flex items-center gap-2">
                            <p className="text-[10px] text-gray-400 flex items-center gap-1">
                              Original: {data.amendarea.toFixed(4)}
                              {amendareavValidated.trim() !== "" && (
                                <span className={`font-bold ${ind.color}`} title={ind.title}>{ind.icon}</span>
                              )}
                            </p>
                            {!isAreaEffectivelyConfirmed && (() => {
                              const savedArea = data?.amendarea_validated ?? data?.amendarea ?? 0;
                              const inputVal = parseFloat(amendareavValidated);
                              const isDirty = !isNaN(inputVal) && parseFloat(inputVal.toFixed(4)) !== parseFloat(savedArea.toFixed(4));
                              const canConfirmArea = savedArea > 0 && !isDirty;
                              const title = isDirty ? "Save changes before confirming" : savedArea <= 0 ? "Value must be greater than zero to confirm" : undefined;
                              return (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const res = await fetch(`/api/records/${encodeURIComponent(seqno)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amendarea_validated_confirmed: true }) });
                                    const result = await res.json();
                                    if (res.ok) { setAreaConfirmed(true); setData((prev) => prev ? { ...prev, ...result } : prev); onSaved(); }
                                    else toast(result.error ?? "Failed to save confirmation.", "error");
                                  }}
                                  disabled={!canConfirmArea}
                                  title={title}
                                  className="text-[10px] font-semibold border rounded px-1.5 py-0.5 leading-none transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-amber-600 hover:text-amber-800 border-amber-300 hover:border-amber-500 bg-amber-50 hover:bg-amber-100 disabled:hover:text-amber-600 disabled:hover:border-amber-300 disabled:hover:bg-amber-50"
                                >
                                  Confirm
                                </button>
                              );
                            })()}
                            {isAreaEffectivelyConfirmed && (
                              <span className="flex items-center gap-1.5">
                                <span className="text-[10px] font-semibold text-emerald-600 flex items-center gap-0.5">
                                  <span>✓</span> Confirmed
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setPendingUndo("area")}
                                  className="text-[10px] font-semibold text-red-500 hover:text-red-700 underline underline-offset-2 transition-colors"
                                >
                                  Undo
                                </button>
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-widest font-semibold text-amber-600 mb-1.5">Validated Condoned Amount</label>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.01"
                          value={condonedAmount}
                          onChange={(e) => { setCondonedAmount(e.target.value); }}
                          placeholder={data?.net_of_reval_no_neg?.toFixed(2) ?? "0.00"}
                          className="w-full border border-amber-300 rounded-lg px-3 py-2 text-[13px] font-mono focus:outline-none focus:ring-2 focus:ring-amber-500 bg-amber-50/50"
                        />
                      </div>
                      {(() => {
                        const original = data?.net_of_reval ?? 0;
                        const noNeg = data?.net_of_reval_no_neg ?? 0;
                        const ind = areaChangeIndicator(
                          condonedAmount.trim() !== "" ? parseFloat(condonedAmount) : null,
                          noNeg
                        );
                        return (
                          <div className="mt-1.5 flex items-center gap-2">
                            <p className="text-[10px] text-gray-400 flex items-center gap-1">
                              Original: {original.toLocaleString("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              {condonedAmount.trim() !== "" && (
                                <span className={`font-bold ${ind.color}`} title={ind.title}>{ind.icon}</span>
                              )}
                            </p>
                            {!isCondonedEffectivelyConfirmed && (() => {
                              const savedCondoned = data?.condoned_amount ?? data?.net_of_reval_no_neg ?? 0;
                              const inputVal = parseFloat(condonedAmount);
                              const isDirty = !isNaN(inputVal) && parseFloat(inputVal.toFixed(2)) !== parseFloat(savedCondoned.toFixed(2));
                              const canConfirmCondoned = savedCondoned > 0 && !isDirty;
                              const title = isDirty ? "Save changes before confirming" : savedCondoned <= 0 ? "Value must be greater than zero to confirm" : undefined;
                              return (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const res = await fetch(`/api/records/${encodeURIComponent(seqno)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ condoned_amount_confirmed: true }) });
                                    const result = await res.json();
                                    if (res.ok) { setCondonedConfirmed(true); setData((prev) => prev ? { ...prev, ...result } : prev); onSaved(); }
                                    else toast(result.error ?? "Failed to save confirmation.", "error");
                                  }}
                                  disabled={!canConfirmCondoned}
                                  title={title}
                                  className="text-[10px] font-semibold border rounded px-1.5 py-0.5 leading-none transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-amber-600 hover:text-amber-800 border-amber-300 hover:border-amber-500 bg-amber-50 hover:bg-amber-100 disabled:hover:text-amber-600 disabled:hover:border-amber-300 disabled:hover:bg-amber-50"
                                >
                                  Confirm
                                </button>
                              );
                            })()}
                            {isCondonedEffectivelyConfirmed && (
                              <span className="flex items-center gap-1.5">
                                <span className="text-[10px] font-semibold text-emerald-600 flex items-center gap-0.5">
                                  <span>✓</span> Confirmed
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setPendingUndo("condoned")}
                                  className="text-[10px] font-semibold text-red-500 hover:text-red-700 underline underline-offset-2 transition-colors"
                                >
                                  Undo
                                </button>
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                  {/* Notice: both confirmed but area doesn't match */}
                  {isAreaEffectivelyConfirmed && isCondonedEffectivelyConfirmed && (() => {
                    const validatedArea = data?.amendarea_validated ?? data?.amendarea ?? 0;
                    const totalArbArea = (data?.arbs ?? []).reduce((sum, a) => {
                      if (!a.area_allocated) return sum;
                      const s = String(a.area_allocated);
                      if (s.endsWith("*")) return sum; // Collective CLOA — excluded
                      const n = parseFloat(s);
                      return sum + (isNaN(n) ? 0 : n);
                    }, 0);
                    const isAreaMatch = parseFloat(totalArbArea.toFixed(4)) === parseFloat(validatedArea.toFixed(4));
                    if (isAreaMatch) return null;
                    return (
                      <div className="mb-4 flex items-start gap-2.5 bg-amber-50 border border-amber-300 rounded-lg px-3.5 py-3 text-[12px] text-amber-800">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
                        </svg>
                        <div>
                          <p className="font-semibold mb-0.5">ARB total area must equal Validated AMENDAREA to advance to <em>For Encoding</em>.</p>
                          <p className="text-amber-700">
                            Current ARB total: <span className="font-mono font-bold">{totalArbArea.toFixed(4)} ha</span>
                            {" "}— Validated AMENDAREA: <span className="font-mono font-bold">{validatedArea.toFixed(4)} ha</span>
                            {" "}(<span className={`font-bold ${totalArbArea > validatedArea ? "text-red-600" : "text-blue-600"}`}>{totalArbArea > validatedArea ? "+" : ""}{(totalArbArea - validatedArea).toFixed(4)}</span>)
                          </p>
                        </div>
                      </div>
                    );
                  })()}
                  {/* ── ASP + CLOA Status dropdowns ── */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mb-4">
                    <div>
                      <label className="block text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-1.5">Approved Survey Plan (ASP)</label>
                      <select
                        value={aspStatus ?? ""}
                        onChange={(e) => setAspStatus((e.target.value as "With ASP" | "Without ASP") || null)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-green-600 bg-white"
                      >
                        <option value="">Undetermined</option>
                        <option value="With ASP">With ASP</option>
                        <option value="Without ASP">Without ASP</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-1.5">CLOA / Individualization Status</label>
                      <select
                        value={cloaStatus ?? ""}
                        onChange={(e) => setCloaStatus((e.target.value as CloaStatus) || null)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-green-600 bg-white"
                      >
                        <option value="">Undetermined</option>
                        {CLOA_STATUS_VALUES.map((v) => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
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
                      disabled={saving || !isDirty}
                      className="btn-primary"
                    >
                      {saving ? "Saving…" : <>Save Changes <span className="btn-icon-trail">✓</span></>}
                    </button>
                  </div>
                </div>
              </div>}

            </div>
            </div>
          )}

          {!loading && data && tab === "arbs" && (
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden p-5">
              {data.arbs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <p className="text-3xl mb-3">🌾</p>
                  <p className="text-gray-500 font-medium">No ARBs linked to this landholding.</p>
                  <p className="text-gray-400 text-sm mt-1">ARBs can be uploaded via the ARB Upload &amp; Viewer page.</p>
                </div>
              ) : (
                <>
                  <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  {arbEditError && <p className="px-4 py-2 text-sm text-red-600 bg-red-50 border-b border-red-200 flex-shrink-0">{arbEditError}</p>}
                  <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto">
                  <table className="w-full text-[13px]">
                    <thead className="bg-green-900 text-white sticky top-0 z-10">
                      <tr>
                        <th className="px-3 py-3 text-left font-semibold text-[11px] uppercase tracking-wide">#</th>
                        <th className="px-3 py-3 text-left font-semibold text-[11px] uppercase tracking-wide">ARB Name</th>
                        <th className="px-3 py-3 text-left font-semibold text-[11px] uppercase tracking-wide">ARB ID</th>
                        <th className="px-3 py-3 text-left font-semibold text-[11px] uppercase tracking-wide">EP/CLOA No.</th>
                        <th className="px-3 py-3 text-right font-semibold text-[11px] uppercase tracking-wide">Area (has.)</th>
                        <th className="px-3 py-3 text-left font-semibold text-[11px] uppercase tracking-wide">CARPable</th>
                        <th className="px-3 py-3 text-left font-semibold text-[11px] uppercase tracking-wide">Eligibility</th>
                        <th className="px-3 py-3 text-left font-semibold text-[11px] uppercase tracking-wide">Alloc. Condoned Amt</th>
                        <th className="px-3 py-3 text-left font-semibold text-[11px] uppercase tracking-wide">Date Encoded</th>
                        <th className="px-3 py-3 text-left font-semibold text-[11px] uppercase tracking-wide">Date Distributed</th>
                        <th className="px-3 py-3 text-left font-semibold text-[11px] uppercase tracking-wide">Remarks</th>
                        {isEditor && <th className="px-3 py-3 text-center font-semibold text-[11px] uppercase tracking-wide">Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const LOCKED_STATUSES = ["For Encoding", "Partially Encoded", "Fully Encoded", "Partially Distributed", "Fully Distributed", "Not Eligible for Encoding"];
                        const isLocked = LOCKED_STATUSES.includes(data.status ?? "");
                        return data.arbs.map((arb, i) => {
                        const isEditing = editingArb?.id === arb.id;
                        const rowBg = i % 2 === 0 ? "bg-white" : "bg-gray-50/70";
                        if (isEditing && editingArb) {
                          return (
                            <tr key={arb.id} className="border-t border-green-200 bg-green-50">
                              <td className="px-3 py-2 text-gray-400 font-mono text-[12px]">{i + 1}</td>
                              <td className="px-2 py-1.5"><input value={editingArb.arb_name} onChange={(e) => setEditingArb((p) => p && ({ ...p, arb_name: e.target.value.toUpperCase() }))} className="w-full border border-gray-300 rounded px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-green-600" /></td>
                              <td className="px-2 py-1.5">{isLocked ? <span className="text-[12px] font-mono text-gray-700 px-1">{editingArb.arb_id || "—"}</span> : <input value={editingArb.arb_id} onChange={(e) => setEditingArb((p) => p && ({ ...p, arb_id: e.target.value.toUpperCase() }))} className="w-full border border-gray-300 rounded px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-green-600" />}</td>
                              <td className="px-2 py-1.5"><input value={editingArb.ep_cloa_no} onChange={(e) => setEditingArb((p) => p && ({ ...p, ep_cloa_no: e.target.value.toUpperCase() }))} className="w-full border border-gray-300 rounded px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-green-600" /></td>
                              <td className="px-2 py-1.5">{isLocked ? <span className="text-[12px] font-mono text-right block text-gray-800 px-1">{editingArb.area_allocated || "—"}</span> : <input value={editingArb.area_allocated} onChange={(e) => setEditingArb((p) => p && ({ ...p, area_allocated: e.target.value }))} className="w-full border border-gray-300 rounded px-2 py-1 text-[12px] text-right focus:outline-none focus:ring-1 focus:ring-green-600" />}</td>
                              <td className="px-2 py-1.5">
                                <select value={editingArb.carpable} onChange={(e) => setEditingArb((p) => { if (!p) return p; const clearDates = e.target.value === "NON-CARPABLE" && p.eligibility !== "Eligible"; return { ...p, carpable: e.target.value, date_encoded: clearDates ? "" : p.date_encoded, date_distributed: clearDates ? "" : p.date_distributed }; })} className={`w-full border rounded px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-green-600 bg-white ${!editingArb.carpable ? "border-red-300" : "border-gray-300"}`}>
                                  <option value="">—</option>
                                  <option value="CARPABLE">CARPABLE</option>
                                  <option value="NON-CARPABLE">NON-CARPABLE</option>
                                </select>
                              </td>
                              <td className="px-2 py-1.5 min-w-[140px]">
                                <select value={editingArb.eligibility} onChange={(e) => setEditingArb((p) => p && ({ ...p, eligibility: e.target.value, eligibility_reason: e.target.value !== "Not Eligible" ? "" : p.eligibility_reason, date_encoded: e.target.value === "Not Eligible" ? "" : p.date_encoded, date_distributed: e.target.value === "Not Eligible" ? "" : p.date_distributed }))} className={`w-full border rounded px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-green-600 bg-white ${!editingArb.eligibility ? "border-red-300" : "border-gray-300"}`}>
                                  <option value="">—</option>
                                  <option value="Eligible">Eligible</option>
                                  <option value="Not Eligible">Not Eligible</option>
                                </select>
                                {editingArb.eligibility === "Not Eligible" && (
                                  <input value={editingArb.eligibility_reason} onChange={(e) => setEditingArb((p) => p && ({ ...p, eligibility_reason: e.target.value }))} placeholder="Reason (required)" className={`mt-1 w-full border rounded px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-green-600 ${!editingArb.eligibility_reason.trim() ? "border-red-300" : "border-gray-300"}`} />
                                )}
                              </td>
                              <td className="px-2 py-1.5"><input value={editingArb.allocated_condoned_amount} onChange={(e) => setEditingArb((p) => p && ({ ...p, allocated_condoned_amount: e.target.value }))} placeholder="e.g. ₱12,345.00 or N/A" className={`w-full border rounded px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-green-600 ${!editingArb.allocated_condoned_amount.trim() ? "border-red-300" : "border-gray-300"}`} /></td>
                              <td className="px-2 py-1.5"><input type="date" value={toDateInput(editingArb.date_encoded)} onChange={(e) => setEditingArb((p) => p && ({ ...p, date_encoded: fromDateInput(e.target.value), date_distributed: e.target.value ? p.date_distributed : "" }))} disabled={editingArb.eligibility === "Not Eligible" || (editingArb.carpable === "NON-CARPABLE" && editingArb.eligibility !== "Eligible")} className="w-full border border-gray-300 rounded px-2 py-1 text-[12px] font-mono focus:outline-none focus:ring-1 focus:ring-green-600 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed" /></td>
                              <td className="px-2 py-1.5"><input type="date" value={toDateInput(editingArb.date_distributed)} onChange={(e) => setEditingArb((p) => p && ({ ...p, date_distributed: fromDateInput(e.target.value) }))} disabled={editingArb.eligibility === "Not Eligible" || (editingArb.carpable === "NON-CARPABLE" && editingArb.eligibility !== "Eligible") || !editingArb.date_encoded} title={!editingArb.date_encoded ? "Date Encoded is required first" : undefined} className="w-full border border-gray-300 rounded px-2 py-1 text-[12px] font-mono focus:outline-none focus:ring-1 focus:ring-green-600 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed" /></td>
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
                            <td className="px-3 py-2.5 font-mono text-gray-700">{arb.arb_id ?? "—"}</td>
                            <td className="px-3 py-2.5 font-mono text-gray-700">{arb.ep_cloa_no ?? "—"}</td>
                            <td className="px-3 py-2.5 text-right font-mono text-gray-800 font-medium">
                              {arb.area_allocated != null ? (() => { const s = String(arb.area_allocated); const hasStar = s.endsWith("*"); const n = parseFloat(s.replace("*", "")); return isNaN(n) ? s : hasStar ? `${n.toFixed(4)}*` : n.toFixed(4); })() : "—"}
                            </td>
                            <td className="px-3 py-2.5">
                              {arb.carpable
                                ? <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${arb.carpable === "CARPABLE" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>{arb.carpable}</span>
                                : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-3 py-2.5">
                              {arb.eligibility ? (
                                <div>
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${arb.eligibility === "Eligible" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>{arb.eligibility}</span>
                                  {arb.eligibility_reason && <p className="text-[10px] text-gray-400 mt-0.5 max-w-[160px] truncate" title={arb.eligibility_reason}>{arb.eligibility_reason}</p>}
                                </div>
                              ) : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-3 py-2.5 font-mono text-gray-600 text-[12px]">{displayCondoned(arb.allocated_condoned_amount)}</td>
                            <td className="px-3 py-2.5 font-mono text-gray-600 text-[12px]">{arb.date_encoded ?? <span className="text-gray-300">—</span>}</td>
                            <td className="px-3 py-2.5 font-mono text-gray-600 text-[12px]">{arb.date_distributed ?? <span className="text-gray-300">—</span>}</td>
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
                                    <button onClick={() => { setArbEditError(""); setEditingArb({ id: arb.id, arb_name: arb.arb_name ?? "", arb_id: arb.arb_id ?? "", ep_cloa_no: arb.ep_cloa_no ?? "", carpable: arb.carpable ?? "", area_allocated: arb.area_allocated ?? "", allocated_condoned_amount: arb.allocated_condoned_amount ?? "", eligibility: arb.eligibility ?? "", eligibility_reason: arb.eligibility_reason ?? "", date_encoded: arb.date_encoded ?? "", date_distributed: arb.date_distributed ?? "", remarks: arb.remarks ?? "" }); }} className="text-gray-400 hover:text-green-700 transition-colors" title={isLocked ? "Edit dates / eligibility / remarks" : "Edit ARB"}>
                                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
                                    </button>
                                    <button onClick={() => !isLocked && setConfirmDeleteArbId(arb.id)} disabled={isLocked} className={`transition-colors ${isLocked ? "text-gray-200 cursor-not-allowed" : "text-gray-400 hover:text-red-600"}`} title={isLocked ? "Cannot delete — record is locked" : "Delete ARB"}>
                                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                                    </button>
                                  </span>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      });
                      })()}
                    </tbody>
                  </table>
                  </div>
                  <div className="flex-shrink-0 border-t-2 border-gray-200 bg-gray-50 px-3 py-2.5 flex items-center justify-between">
                    <span className="text-[12px] font-semibold text-gray-500 uppercase tracking-wide">Total Area</span>
                    <span className="font-mono font-bold text-gray-800 text-[13px]">
                      {data.arbs.reduce((sum, arb) => {
                        if (!arb.area_allocated) return sum;
                        const s = String(arb.area_allocated);
                        if (s.endsWith("*")) return sum;
                        const n = parseFloat(s);
                        return sum + (isNaN(n) ? 0 : n);
                      }, 0).toFixed(4)} <span className="text-gray-400 font-normal text-[11px]">ha</span>
                    </span>
                  </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
    )}
    {showNotEligibleConfirm && createPortal(
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
          <div className="flex items-start gap-3 mb-4">
            <span className="flex-shrink-0 w-9 h-9 rounded-full bg-red-100 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-red-600" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
            </span>
            <div>
              <h3 className="text-[15px] font-bold text-gray-900 leading-tight mb-1">Set as Not Eligible for Encoding?</h3>
              <p className="text-[13px] text-gray-500 leading-snug">
                This will mark <span className="font-semibold text-gray-700">{seqno}</span> as <span className="font-semibold text-red-600">Not Eligible for Encoding</span>. The reason will be logged. This action can be reverted later.
              </p>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowNotEligibleConfirm(false)}
              className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-[13px] hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={() => void executeSave()}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[13px] font-semibold"
            >
              Yes, Set Not Eligible
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}
    </>
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
  arb_area_mismatch: boolean;
  arb_total_area: number | null;
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
const STATUSES = ["For Initial Validation", "For Further Validation", "For Encoding", "Partially Encoded", "Fully Encoded", "Partially Distributed", "Fully Distributed", "Not Eligible for Encoding"];

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

function AreaMismatchPopover({ anchorRef, arbTotalArea, validatedArea }: {
  anchorRef: React.RefObject<HTMLSpanElement | null>;
  arbTotalArea: number;
  validatedArea: number;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (anchorRef.current) setRect(anchorRef.current.getBoundingClientRect());
  }, [anchorRef]);
  if (!rect || typeof document === "undefined") return null;
  const delta = arbTotalArea - validatedArea;
  const CARD_W = 228;
  const CARD_H_EST = 160;
  const GAP = 8;
  // Flip below the anchor if there isn't enough room above
  const showBelow = rect.top < CARD_H_EST + GAP + 8;
  const top = showBelow ? rect.bottom + GAP : rect.top - GAP;
  // Horizontal: center on anchor, then clamp so it stays within viewport
  const anchorCx = rect.left + rect.width / 2;
  const vw = window.innerWidth;
  const rawLeft = anchorCx - CARD_W / 2;
  const clampedLeft = Math.max(8, Math.min(rawLeft, vw - CARD_W - 8));
  // Arrow points back to anchor centre
  const arrowLeft = anchorCx - clampedLeft;
  const arrowBorderColor = "#14181f";
  return createPortal(
    <div
      style={{ position: "fixed", left: clampedLeft, top, transform: showBelow ? "none" : "translateY(-100%)", zIndex: 9999, pointerEvents: "none", width: CARD_W }}
    >
      {/* Arrow above card (when showing below anchor) */}
      {showBelow && (
        <div className="absolute bottom-full" style={{ left: arrowLeft, transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderBottom: `5px solid ${arrowBorderColor}` }} />
      )}
      <div className="rounded-xl overflow-hidden shadow-2xl" style={{ background: "linear-gradient(160deg,#1c2033 0%,#14181f 100%)", border: "1px solid rgba(249,115,22,0.25)" }}>
        {/* Header */}
        <div className="px-3 py-2 flex items-center gap-1.5 border-b border-orange-500/20" style={{ background: "rgba(249,115,22,0.09)" }}>
          <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" style={{ boxShadow: "0 0 7px #f97316" }} />
          <span className="text-[9px] font-black uppercase tracking-[0.16em] text-orange-400">Area Mismatch Detected</span>
        </div>
        {/* Data rows */}
        <div className="px-3 py-3 space-y-2">
          <div className="flex justify-between items-baseline gap-2">
            <span className="text-[9px] uppercase tracking-wide text-slate-500 shrink-0">ARB Total Area</span>
            <span className="font-mono text-[11px] font-bold text-white tabular-nums">{arbTotalArea.toFixed(4)} ha</span>
          </div>
          <div className="flex justify-between items-baseline gap-2">
            <span className="text-[9px] uppercase tracking-wide text-slate-500 shrink-0">Val. AMENDAREA</span>
            <span className="font-mono text-[11px] font-semibold text-slate-300 tabular-nums">{validatedArea.toFixed(4)} ha</span>
          </div>
          <div className="border-t border-slate-700/70 pt-2 flex justify-between items-baseline gap-2">
            <span className="text-[9px] uppercase tracking-wide text-slate-500 shrink-0">Δ Difference</span>
            <span
              className={`font-mono text-[13px] font-black tabular-nums ${delta > 0 ? "text-red-400" : "text-sky-400"}`}
              style={{ textShadow: delta > 0 ? "0 0 10px rgba(248,113,113,0.6)" : "0 0 10px rgba(56,189,248,0.6)" }}
            >
              {delta > 0 ? "+" : ""}{delta.toFixed(4)}
            </span>
          </div>
        </div>
        {/* Footer */}
        <div className="px-3 py-2 border-t border-slate-700/50" style={{ background: "rgba(0,0,0,0.3)" }}>
          <p className="text-[9px] text-slate-500 leading-relaxed">
            Both confirmations set — totals must match to advance to{" "}
            <span className="text-slate-400 font-semibold">For Encoding</span>.
          </p>
        </div>
      </div>
      {/* Arrow below card (when showing above anchor) */}
      {!showBelow && (
        <div className="absolute top-full" style={{ left: arrowLeft, transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: `5px solid ${arrowBorderColor}` }} />
      )}
    </div>,
    document.body
  );
}

function ModalMismatchButton({ totalArbArea, validatedArea }: { totalArbArea: number; validatedArea: number }) {
  const [hovered, setHovered] = useState(false);
  const btnRef = useRef<HTMLSpanElement>(null);
  return (
    <>
      <span
        ref={btnRef}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="ml-0.5 w-4 h-4 rounded-full bg-orange-500 text-white text-[10px] font-bold flex items-center justify-center leading-none cursor-help shrink-0"
        style={{ boxShadow: "0 0 0 2px rgba(249,115,22,0.35)" }}
      >!</span>
      {hovered && (
        <AreaMismatchPopover anchorRef={btnRef} arbTotalArea={totalArbArea} validatedArea={validatedArea} />
      )}
    </>
  );
}

function StatusBadge({ status, arbAreaMismatch, arbTotalArea, validatedArea }: {
  status: string | null;
  arbAreaMismatch?: boolean;
  arbTotalArea?: number | null;
  validatedArea?: number | null;
}) {
  const raw = status ?? "For Initial Validation";
  const s = raw === "Untagged" ? "For Initial Validation" : raw;
  const colors: Record<string, string> = {
    "For Initial Validation":    "bg-slate-100 text-slate-600",
    "For Further Validation":    "bg-amber-100 text-amber-700",
    "For Encoding":              "bg-violet-100 text-violet-700",
    "Partially Encoded":         "bg-sky-100 text-sky-700",
    "Fully Encoded":             "bg-blue-100 text-blue-700",
    "Partially Distributed":     "bg-teal-100 text-teal-700",
    "Fully Distributed":         "bg-emerald-100 text-emerald-700",
    "Not Eligible for Encoding": "bg-red-100 text-red-700",
  };
  const [hovered, setHovered] = useState(false);
  const btnRef = useRef<HTMLSpanElement>(null);
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold ${colors[s] ?? "bg-gray-100 text-gray-500"}`}>
      {s}
      {arbAreaMismatch && (
        <>
          <span
            ref={btnRef}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            className="w-3.5 h-3.5 rounded-full bg-orange-500 text-white text-[9px] font-bold flex items-center justify-center leading-none cursor-help shrink-0"
            style={{ boxShadow: "0 0 0 2px rgba(249,115,22,0.3)" }}
          >!</span>
          {hovered && (
            <AreaMismatchPopover
              anchorRef={btnRef}
              arbTotalArea={arbTotalArea ?? 0}
              validatedArea={validatedArea ?? 0}
            />
          )}
        </>
      )}
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
      {selectedSeqno && (() => {
        const idx = records.findIndex((r) => r.seqno_darro === selectedSeqno);
        return (
          <DetailModal
            seqno={selectedSeqno}
            onClose={() => setSelectedSeqno(null)}
            onSaved={fetchRecords}
            hasPrev={idx > 0}
            hasNext={idx < records.length - 1}
            onPrev={() => idx > 0 && setSelectedSeqno(records[idx - 1].seqno_darro)}
            onNext={() => idx < records.length - 1 && setSelectedSeqno(records[idx + 1].seqno_darro)}
          />
        );
      })()}
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
                  <td className="px-3 py-2 whitespace-nowrap">
                    <StatusBadge
                      status={r.status}
                      arbAreaMismatch={r.arb_area_mismatch}
                      arbTotalArea={r.arb_total_area}
                      validatedArea={r.amendarea_validated ?? r.amendarea}
                    />
                  </td>
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
