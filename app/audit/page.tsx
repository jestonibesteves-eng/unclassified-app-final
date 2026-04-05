"use client";

import { useState, useEffect, useCallback } from "react";

type AuditLog = {
  id: number;
  seqno_darro: string;
  action: string;
  field_changed: string | null;
  old_value: string | null;
  new_value: string | null;
  changed_by: string | null;
  created_at: string;
};

const ACTION_OPTIONS = [
  { value: "", label: "All Actions" },
  { value: "STATUS_UPDATE", label: "Status Update" },
  { value: "AMOUNT_UPDATE", label: "Amount Update" },
  { value: "RECORD_UPDATE", label: "Record Update" },
  { value: "ARB_EDIT", label: "ARB Edit" },
  { value: "ARB_DELETE", label: "ARB Delete" },
];

const ACTION_BADGE: Record<string, string> = {
  STATUS_UPDATE: "bg-blue-100 text-blue-700",
  AMOUNT_UPDATE: "bg-purple-100 text-purple-700",
  RECORD_UPDATE: "bg-orange-100 text-orange-700",
  ARB_EDIT: "bg-teal-100 text-teal-700",
  ARB_DELETE: "bg-red-100 text-red-700",
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const [loading, setLoading] = useState(false);

  const limit = 50;
  const totalPages = Math.ceil(total / limit);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      search,
      action,
    });
    const res = await fetch(`/api/audit?${params}`);
    const data = await res.json();
    setLogs(data.logs);
    setTotal(data.total);
    setLoading(false);
  }, [page, search, action]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  function handleFilter() {
    setPage(1);
    fetchLogs();
  }

  return (
    <div className="page-enter">
      <div className="mb-5">
        <h2 className="text-2xl font-bold text-gray-800">Audit Log</h2>
        <p className="text-sm text-gray-500 mt-1">
          All changes made to landholding records — status updates, amount changes, ARB entries
        </p>
      </div>

      {/* Filters */}
      <div className="card-bezel mb-5">
      <div className="card-bezel-inner-open flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-[11px] uppercase tracking-wide font-semibold text-gray-400 mb-1">Search SEQNO</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleFilter()}
            placeholder="e.g. R5-UC-04277"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
          />
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-wide font-semibold text-gray-400 mb-1">Action Type</label>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
          >
            {ACTION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <button onClick={handleFilter} className="btn-primary">
          Filter
        </button>
        {(search || action) && (
          <button
            onClick={() => { setSearch(""); setAction(""); setPage(1); }}
            className="btn-ghost"
          >
            Clear
          </button>
        )}
      </div>
      </div>

      {/* Summary + pagination */}
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {loading ? "Loading..." : `${total.toLocaleString()} log entr${total !== 1 ? "ies" : "y"}`}
        </p>
        {totalPages > 1 && (
          <div className="flex items-center gap-2 text-sm">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="btn-page"
            >
              ← Prev
            </button>
            <span className="text-gray-500">Page {page} of {totalPages}</span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="btn-page"
            >
              Next →
            </button>
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
                <th className="px-3 py-2.5 text-left font-medium">Timestamp</th>
                <th className="px-3 py-2.5 text-left font-medium">SEQNO_DARRO</th>
                <th className="px-3 py-2.5 text-left font-medium">Action</th>
                <th className="px-3 py-2.5 text-left font-medium">Field</th>
                <th className="px-3 py-2.5 text-left font-medium">Old Value</th>
                <th className="px-3 py-2.5 text-left font-medium">New Value</th>
                <th className="px-3 py-2.5 text-left font-medium">Changed By</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-gray-400">
                    No audit logs found.
                  </td>
                </tr>
              )}
              {logs.map((log, i) => (
                <tr key={log.id} className={`border-t border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{formatDate(log.created_at)}</td>
                  <td className="px-3 py-2 font-mono text-gray-700">{log.seqno_darro}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${ACTION_BADGE[log.action] ?? "bg-gray-100 text-gray-600"}`}>
                      {log.action.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-600">{log.field_changed ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-500 max-w-[160px] truncate" title={log.old_value ?? ""}>
                    {log.old_value ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-gray-800 font-medium max-w-[160px] truncate" title={log.new_value ?? ""}>
                    {log.new_value ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-gray-500">{log.changed_by ?? "System"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm mt-4">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="btn-page"
          >
            ← Prev
          </button>
          <span className="text-gray-500">Page {page} of {totalPages}</span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="btn-page"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
