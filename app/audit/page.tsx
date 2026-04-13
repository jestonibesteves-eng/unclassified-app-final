"use client";

import { useState, useEffect, useCallback, useRef, Fragment } from "react";

type AuditLog = {
  id: number;
  seqno_darro: string;
  action: string;
  field_changed: string | null;
  old_value: string | null;
  new_value: string | null;
  changed_by: string | null;
  source: string | null;
  created_at: string;
  landholding: { landowner: string | null; province_edited: string | null } | null;
};

type SessionMeta = {
  role: string;
  office_level: string;
  province: string | null;
} | null;

const ACTION_OPTIONS = [
  { value: "", label: "All Actions" },
  { value: "STATUS_UPDATE", label: "Status Update" },
  { value: "AMOUNT_UPDATE", label: "Amount Update" },
  { value: "RECORD_UPDATE", label: "Record Update" },
  { value: "ARB_EDIT", label: "ARB Edit" },
  { value: "ARB_DELETE", label: "ARB Delete" },
];

const SOURCE_LABEL: Record<string, { label: string; cls: string }> = {
  individual_modal: { label: "Individual Edit",  cls: "bg-indigo-100 text-indigo-700" },
  batch_lh:         { label: "Batch LH",         cls: "bg-purple-100 text-purple-700" },
  batch_lh_revert:  { label: "Batch Revert",     cls: "bg-pink-100 text-pink-700" },
  arb_modal:        { label: "ARB Modal",         cls: "bg-teal-100 text-teal-700" },
  batch_arb:        { label: "Batch ARB",         cls: "bg-cyan-100 text-cyan-700" },
  arb_manual:       { label: "ARB Manual",        cls: "bg-amber-100 text-amber-700" },
  arb_upload:       { label: "ARB Upload",        cls: "bg-lime-100 text-lime-700" },
};

const ACTION_BADGE: Record<string, string> = {
  STATUS_UPDATE: "bg-blue-100 text-blue-700",
  AMOUNT_UPDATE: "bg-purple-100 text-purple-700",
  RECORD_UPDATE: "bg-orange-100 text-orange-700",
  ARB_EDIT:      "bg-teal-100 text-teal-700",
  ARB_DELETE:    "bg-red-100 text-red-700",
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-PH", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function truncate(val: string | null, max = 40) {
  if (!val) return "—";
  return val.length > max ? val.slice(0, max) + "…" : val;
}

function exportToCsv(logs: AuditLog[]) {
  const headers = ["Timestamp", "SEQNO_DARRO", "Landowner", "Province", "Action", "Field", "Old Value", "New Value", "Changed By", "Source"];
  const rows = logs.map((l) => [
    formatDate(l.created_at),
    l.seqno_darro,
    l.landholding?.landowner ?? "",
    l.landholding?.province_edited ?? "",
    l.action,
    l.field_changed ?? "",
    l.old_value ?? "",
    l.new_value ?? "",
    l.changed_by ?? "System",
    SOURCE_LABEL[l.source ?? ""]?.label ?? (l.source ?? ""),
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<SessionMeta>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Filters
  const [search, setSearch]   = useState("");
  const [action, setAction]   = useState("");
  const [user, setUser]       = useState("");
  const [from, setFrom]       = useState("");
  const [to, setTo]           = useState("");
  const [province, setProvince] = useState("");

  // Expanded row
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const limit = 50;
  const totalPages = Math.ceil(total / limit);

  // Debounce ref for search/user
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildParams = useCallback((overrides: Record<string, string> = {}) => {
    const base = { page: String(page), limit: String(limit), search, action, user, from, to, province };
    return new URLSearchParams({ ...base, ...overrides });
  }, [page, search, action, user, from, to, province]);

  const fetchLogs = useCallback(async (pageOverride?: number) => {
    setLoading(true);
    const params = buildParams(pageOverride != null ? { page: String(pageOverride) } : {});
    const res = await fetch(`/api/audit?${params}`);
    const data = await res.json();
    setLogs(data.logs ?? []);
    setTotal(data.total ?? 0);
    if (data.meta) setMeta(data.meta);
    setLoading(false);
  }, [buildParams]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // Debounced text field changes
  function handleTextChange(setter: (v: string) => void, value: string) {
    setter(value);
    setPage(1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchLogs(1), 450);
  }

  function handleSelectChange(setter: (v: string) => void, value: string) {
    setter(value);
    setPage(1);
    void fetchLogs(1);
  }

  async function handleExport() {
    setExporting(true);
    const params = buildParams({ export: "1" });
    const res = await fetch(`/api/audit?${params}`);
    const data = await res.json();
    exportToCsv(data.logs ?? []);
    setExporting(false);
  }

  function clearFilters() {
    setSearch(""); setAction(""); setUser(""); setFrom(""); setTo(""); setProvince("");
    setPage(1);
  }

  const hasFilters = search || action || user || from || to || province;
  const isRegional = meta?.office_level === "regional";

  return (
    <div className="page-enter">
      <div className="mb-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Audit Log</h2>
          <p className="text-sm text-gray-500 mt-1">
            All changes made to landholding records — status updates, amount changes, ARB entries
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting || loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-green-700 text-green-700 text-[13px] font-semibold hover:bg-green-50 active:scale-[0.97] transition-all duration-150 disabled:opacity-50"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>

      {/* Filters */}
      <div className="card-bezel mb-5">
        <div className="card-bezel-inner-open">
          <div className="flex flex-wrap gap-3 items-end">
            {/* SEQNO search */}
            <div className="flex-1 min-w-[160px]">
              <label className="block text-[11px] uppercase tracking-wide font-semibold text-gray-400 mb-1">Search SEQNO</label>
              <input
                type="text"
                value={search}
                onChange={(e) => handleTextChange(setSearch, e.target.value)}
                placeholder="e.g. R5-UC-04277"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
              />
            </div>

            {/* Action type */}
            <div>
              <label className="block text-[11px] uppercase tracking-wide font-semibold text-gray-400 mb-1">Action</label>
              <select
                value={action}
                onChange={(e) => handleSelectChange(setAction, e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
              >
                {ACTION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Changed by */}
            <div className="min-w-[140px]">
              <label className="block text-[11px] uppercase tracking-wide font-semibold text-gray-400 mb-1">Changed By</label>
              <input
                type="text"
                value={user}
                onChange={(e) => handleTextChange(setUser, e.target.value)}
                placeholder="username"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
              />
            </div>

            {/* Province — regional only */}
            {isRegional && (
              <div className="min-w-[150px]">
                <label className="block text-[11px] uppercase tracking-wide font-semibold text-gray-400 mb-1">Province</label>
                <input
                  type="text"
                  value={province}
                  onChange={(e) => handleTextChange(setProvince, e.target.value)}
                  placeholder="e.g. Albay"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                />
              </div>
            )}

            {/* Date range */}
            <div>
              <label className="block text-[11px] uppercase tracking-wide font-semibold text-gray-400 mb-1">From</label>
              <input
                type="date"
                value={from}
                onChange={(e) => { setFrom(e.target.value); setPage(1); void fetchLogs(1); }}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wide font-semibold text-gray-400 mb-1">To</label>
              <input
                type="date"
                value={to}
                onChange={(e) => { setTo(e.target.value); setPage(1); void fetchLogs(1); }}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
              />
            </div>

            {hasFilters && (
              <button onClick={clearFilters} className="btn-ghost self-end">
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Summary + pagination */}
      <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-gray-500">
          {loading
            ? "Loading…"
            : `${total.toLocaleString()} log entr${total !== 1 ? "ies" : "y"}${hasFilters ? " (filtered)" : ""}`}
        </p>
        {totalPages > 1 && (
          <div className="flex items-center gap-2 text-sm">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="btn-page">← Prev</button>
            <span className="text-gray-500">
              {((page - 1) * limit + 1).toLocaleString()}–{Math.min(page * limit, total).toLocaleString()} of {total.toLocaleString()}
            </span>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="btn-page">Next →</button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="card-bezel">
        <div className="card-bezel-inner">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-green-900 text-white">
                <tr>
                  <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">Timestamp</th>
                  <th className="px-3 py-2.5 text-left font-medium">SEQNO</th>
                  <th className="px-3 py-2.5 text-left font-medium">Landowner</th>
                  <th className="px-3 py-2.5 text-left font-medium">Province</th>
                  <th className="px-3 py-2.5 text-left font-medium">Action</th>
                  <th className="px-3 py-2.5 text-left font-medium">Field</th>
                  <th className="px-3 py-2.5 text-left font-medium">Old Value</th>
                  <th className="px-3 py-2.5 text-left font-medium">New Value</th>
                  <th className="px-3 py-2.5 text-left font-medium">Changed By</th>
                  <th className="px-3 py-2.5 text-left font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 && !loading && (
                  <tr>
                    <td colSpan={10} className="text-center py-10 text-gray-400">
                      No audit logs found.
                    </td>
                  </tr>
                )}
                {logs.map((log, i) => {
                  const isExpanded = expandedId === log.id;
                  const hasLong = (log.old_value?.length ?? 0) > 40 || (log.new_value?.length ?? 0) > 40;
                  return (
                    <Fragment key={log.id}>
                      <tr
                        onClick={() => hasLong && setExpandedId(isExpanded ? null : log.id)}
                        className={`border-t border-gray-100 transition-colors ${i % 2 === 0 ? "bg-white" : "bg-gray-50"} ${hasLong ? "cursor-pointer hover:bg-green-50/40" : ""}`}
                      >
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{formatDate(log.created_at)}</td>
                        <td className="px-3 py-2 font-mono text-gray-700">{log.seqno_darro}</td>
                        <td className="px-3 py-2 text-gray-600 max-w-[160px] truncate" title={log.landholding?.landowner ?? ""}>
                          {log.landholding?.landowner ?? <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                          {log.landholding?.province_edited ?? <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${ACTION_BADGE[log.action] ?? "bg-gray-100 text-gray-600"}`}>
                            {log.action.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-600">{log.field_changed ?? "—"}</td>
                        <td className="px-3 py-2 text-gray-500 max-w-[160px]">
                          <span className="truncate block" title={log.old_value ?? ""}>{truncate(log.old_value)}</span>
                        </td>
                        <td className="px-3 py-2 text-gray-800 font-medium max-w-[160px]">
                          <span className="truncate block" title={log.new_value ?? ""}>{truncate(log.new_value)}</span>
                        </td>
                        <td className="px-3 py-2 text-gray-500">{log.changed_by ?? "System"}</td>
                        <td className="px-3 py-2">
                          {log.source ? (
                            <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${SOURCE_LABEL[log.source]?.cls ?? "bg-gray-100 text-gray-600"}`}>
                              {SOURCE_LABEL[log.source]?.label ?? log.source}
                            </span>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className={`border-t-0 ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                          <td colSpan={10} className="px-4 pb-3 pt-0">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px]">
                              <div>
                                <p className="text-[10px] uppercase tracking-wide font-semibold text-gray-400 mb-1">Old Value</p>
                                <div className="bg-gray-100 rounded-lg px-3 py-2 font-mono text-gray-600 whitespace-pre-wrap break-all">
                                  {log.old_value ?? "—"}
                                </div>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-wide font-semibold text-gray-400 mb-1">New Value</p>
                                <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 font-mono text-gray-800 whitespace-pre-wrap break-all">
                                  {log.new_value ?? "—"}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm mt-4">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="btn-page">← Prev</button>
          <span className="text-gray-500">
            {((page - 1) * limit + 1).toLocaleString()}–{Math.min(page * limit, total).toLocaleString()} of {total.toLocaleString()}
          </span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="btn-page">Next →</button>
        </div>
      )}
    </div>
  );
}
