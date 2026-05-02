"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/components/UserContext";
import { useToast } from "@/components/Toast";

const REGION = "V";

type TargetRow  = { id: number | null; province: string; committed: number };
type RegionTotal = { id: number | null; committed: number; target_date: string };

interface ApiResponse {
  region:      string;
  targets:     TargetRow[];
  regionTotal: RegionTotal;
}

function Spinner() {
  return <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin opacity-60" />;
}

function fmtDraft(d: string | undefined): string {
  if (d === undefined || d === "") return "";
  const n = parseInt(d, 10);
  return isNaN(n) ? "" : n.toLocaleString();
}

function parseDraft(raw: string): string {
  return raw.replace(/[^0-9]/g, "");
}

export default function CommitmentTargetsPage() {
  const { user, loading: authLoading } = useUser();
  const router       = useRouter();
  const toast        = useToast();
  const isSuperAdmin = user?.role === "super_admin";

  const [targets,     setTargets]     = useState<TargetRow[]>([]);
  const [regionTotal, setRegionTotal] = useState<RegionTotal>({ id: null, committed: 0, target_date: "2026-06-15" });
  const [drafts,      setDrafts]      = useState<Record<string, string>>({});
  const [saved,       setSaved]       = useState<Record<string, number>>({});
  const [dateDraft,   setDateDraft]   = useState("2026-06-15");
  const [dateSaved,   setDateSaved]   = useState("2026-06-15");
  const [saving,      setSaving]      = useState<Record<string, boolean>>({});
  const [savingDate,  setSavingDate]  = useState(false);
  const [fetching,    setFetching]    = useState(true);

  useEffect(() => {
    if (!authLoading && (!user || !["super_admin", "admin"].includes(user.role)))
      router.replace("/");
  }, [user, authLoading, router]);

  const loadTargets = useCallback(async () => {
    setFetching(true);
    try {
      const res  = await fetch(`/api/admin/commitment-targets?region=${REGION}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `API error ${res.status}`);

      const api = data as ApiResponse;
      setTargets(api.targets);
      setRegionTotal(api.regionTotal);
      setDateDraft(api.regionTotal.target_date);
      setDateSaved(api.regionTotal.target_date);

      const initDrafts: Record<string, string> = { __REGION__: String(api.regionTotal.committed) };
      const initSaved:  Record<string, number> = { __REGION__: api.regionTotal.committed };
      api.targets.forEach((t) => {
        initDrafts[t.province] = String(t.committed);
        initSaved[t.province]  = t.committed;
      });
      setDrafts(initDrafts);
      setSaved(initSaved);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to load commitment targets.", "error");
    } finally {
      setFetching(false);
    }
  }, [toast]);

  useEffect(() => { loadTargets(); }, [loadTargets]);

  async function handleSave(key: string, province: string | null) {
    const val = parseInt(drafts[key] ?? "", 10);
    if (isNaN(val) || val < 0) { toast("Enter a valid non-negative number.", "error"); return; }

    setSaving((s) => ({ ...s, [key]: true }));
    try {
      const res = await fetch("/api/admin/commitment-targets", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ region: REGION, province, committed: val }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error ?? "Save failed."); }
      setSaved((s) => ({ ...s, [key]: val }));
      toast(`Saved ${province ?? "Region Total"}: ${val.toLocaleString()} COCROMs`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to save.", "error");
    } finally {
      setSaving((s) => ({ ...s, [key]: false }));
    }
  }

  async function handleSaveDate() {
    if (!dateDraft || !/^\d{4}-\d{2}-\d{2}$/.test(dateDraft)) {
      toast("Enter a valid date.", "error"); return;
    }
    setSavingDate(true);
    try {
      const res = await fetch("/api/admin/commitment-targets", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ region: REGION, province: null, committed: saved.__REGION__ ?? 0, target_date: dateDraft }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error ?? "Save failed."); }
      setDateSaved(dateDraft);
      toast(`Target date updated to ${dateDraft}`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to save date.", "error");
    } finally {
      setSavingDate(false);
    }
  }

  const isDirty    = (key: string) => { const v = parseInt(drafts[key] ?? "", 10); return !isNaN(v) && v !== saved[key]; };
  const isDateDirty = dateDraft !== dateSaved;

  const provinceSum  = targets.reduce((s, t) => s + (saved[t.province] ?? 0), 0);
  const regionCommit = saved.__REGION__ ?? 0;
  const unallocated  = regionCommit - provinceSum;

  // Format "2026-06-15" → "June 15, 2026"
  function fmtDate(d: string) {
    const [y, m, day] = d.split("-").map(Number);
    return new Date(y, m - 1, day).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
  }

  if (authLoading || (!user && !authLoading)) return null;

  return (
    <div className="page-enter">
      {/* ── Page header ── */}
      <div className="mb-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-600 mb-1">Admin · Settings</p>
        <h2 className="text-[1.6rem] font-bold text-gray-900 leading-tight">Commitment Targets</h2>
        <p className="text-[12px] text-gray-400 mt-0.5">COCROM distribution targets per province · Region {REGION}</p>
      </div>

      <div className="space-y-6">
        {/* ── Region Total + Target Date ── */}
        <div className="card-bezel">
          <div className="card-bezel-inner">
            <div className="bg-green-900 px-5 py-2.5 rounded-t-[17px]">
              <h3 className="text-[10px] font-semibold text-green-300 uppercase tracking-[0.13em]">
                Region Total — Official Commitment
              </h3>
            </div>
            <div className="px-5 py-4 space-y-4">
              {/* Committed COCROMs row */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[12px] font-semibold text-gray-700 mb-0.5">Total Committed COCROMs</p>
                  <p className="text-[11px] text-gray-400">
                    Official commitment to Central Office. Provincial targets should sum to this number.
                  </p>
                  {regionCommit > 0 && (
                    <p className="text-[11px] mt-1">
                      Province sum: <span className="font-bold text-gray-700">{provinceSum.toLocaleString()}</span>
                      {" · "}
                      <span className={unallocated === 0 ? "text-emerald-600 font-semibold" : unallocated > 0 ? "text-amber-600 font-semibold" : "text-red-500 font-semibold"}>
                        {unallocated === 0 ? "✓ Fully allocated" : unallocated > 0 ? `${unallocated.toLocaleString()} unallocated` : `${Math.abs(unallocated).toLocaleString()} over-allocated`}
                      </span>
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="text" inputMode="numeric"
                    value={fmtDraft(drafts.__REGION__)}
                    onChange={(e) => setDrafts((d) => ({ ...d, __REGION__: parseDraft(e.target.value) }))}
                    disabled={!isSuperAdmin || fetching}
                    className="w-36 border border-gray-200 rounded-lg px-3 py-1.5 text-[14px] font-bold text-gray-900 tabular-nums text-right focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
                  />
                  <span className="text-[11px] text-gray-400 font-medium">COCROMs</span>
                  {isSuperAdmin && (
                    <button
                      onClick={() => handleSave("__REGION__", null)}
                      disabled={!isDirty("__REGION__") || saving.__REGION__}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all border disabled:opacity-40 disabled:cursor-not-allowed"
                      style={isDirty("__REGION__") ? { background: "#14532d", color: "#fff", borderColor: "#14532d" } : { background: "#f9fafb", color: "#9ca3af", borderColor: "#e5e7eb" }}
                    >
                      {saving.__REGION__ ? <Spinner /> : null}Save
                    </button>
                  )}
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-gray-100" />

              {/* Target date row */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[12px] font-semibold text-gray-700 mb-0.5">Target Date of Distribution</p>
                  <p className="text-[11px] text-gray-400">
                    Deadline used for the countdown timer and all progress gauges.
                  </p>
                  {dateSaved && (
                    <p className="text-[11px] text-emerald-600 font-semibold mt-1">{fmtDate(dateSaved)}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="date"
                    value={dateDraft}
                    onChange={(e) => setDateDraft(e.target.value)}
                    disabled={!isSuperAdmin || fetching}
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-[13px] text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
                  />
                  {isSuperAdmin && (
                    <button
                      onClick={handleSaveDate}
                      disabled={!isDateDirty || savingDate}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all border disabled:opacity-40 disabled:cursor-not-allowed"
                      style={isDateDirty ? { background: "#14532d", color: "#fff", borderColor: "#14532d" } : { background: "#f9fafb", color: "#9ca3af", borderColor: "#e5e7eb" }}
                    >
                      {savingDate ? <Spinner /> : null}Save
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Provincial breakdown ── */}
        <div className="card-bezel">
          <div className="card-bezel-inner">
            <div className="bg-green-900 px-5 py-2.5 rounded-t-[17px] flex items-center justify-between">
              <h3 className="text-[10px] font-semibold text-green-300 uppercase tracking-[0.13em]">Provincial Breakdown</h3>
              {!isSuperAdmin && (
                <span className="text-[9px] text-green-400 bg-green-800 px-2 py-0.5 rounded-full">View only</span>
              )}
            </div>

            {fetching ? (
              <div className="flex items-center justify-center h-40 gap-2 text-[12px] text-gray-400">
                <Spinner /> Loading…
              </div>
            ) : targets.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-[12px] text-gray-400">No province data found.</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="px-5 py-3 text-left   text-[10px] font-semibold text-gray-400 uppercase tracking-[0.1em]">Province</th>
                    <th className="px-5 py-3 text-right  text-[10px] font-semibold text-gray-400 uppercase tracking-[0.1em]">Committed COCROMs</th>
                    {isSuperAdmin && <th className="px-5 py-3 w-20" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {targets.map((row) => {
                    const key   = row.province;
                    const dirty = isDirty(key);
                    return (
                      <tr key={key} className={`transition-colors ${dirty ? "bg-amber-50/40" : "hover:bg-gray-50/60"}`}>
                        <td className="px-5 py-3">
                          <span className="text-[12px] font-semibold text-gray-700">{row.province}</span>
                          {regionCommit > 0 && saved[key] > 0 && (
                            <span className="ml-2 text-[10px] text-gray-400 tabular-nums">
                              ({((saved[key] / regionCommit) * 100).toFixed(1)}%)
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <input
                              type="text" inputMode="numeric"
                              value={fmtDraft(drafts[key])}
                              onChange={(e) => setDrafts((d) => ({ ...d, [key]: parseDraft(e.target.value) }))}
                              disabled={!isSuperAdmin || fetching}
                              className="w-32 border border-gray-200 rounded-lg px-3 py-1 text-[13px] font-bold text-gray-900 tabular-nums text-right focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
                            />
                          </div>
                        </td>
                        {isSuperAdmin && (
                          <td className="px-5 py-3 text-right">
                            <button
                              onClick={() => handleSave(key, row.province)}
                              disabled={!dirty || saving[key]}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all border disabled:opacity-40 disabled:cursor-not-allowed"
                              style={dirty ? { background: "#14532d", color: "#fff", borderColor: "#14532d" } : { background: "#f9fafb", color: "#9ca3af", borderColor: "#e5e7eb" }}
                            >
                              {saving[key] ? <Spinner /> : null}Save
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50">
                    <td className="px-5 py-3 text-[11px] font-bold text-gray-600 uppercase tracking-wide">Province Sum</td>
                    <td className="px-5 py-3 text-right">
                      <span className={`text-[13px] font-bold tabular-nums ${unallocated === 0 && regionCommit > 0 ? "text-emerald-600" : unallocated < 0 ? "text-red-500" : "text-gray-700"}`}>
                        {provinceSum.toLocaleString()}
                      </span>
                      {regionCommit > 0 && (
                        <span className="text-[10px] text-gray-400 ml-2">of {regionCommit.toLocaleString()}</span>
                      )}
                    </td>
                    {isSuperAdmin && <td />}
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
