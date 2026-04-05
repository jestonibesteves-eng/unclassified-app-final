"use client";

import { useState, useEffect, useCallback } from "react";

type FlagRecord = {
  seqno_darro: string;
  clno: string | null;
  landowner: string | null;
  province_edited: string | null;
  claimclass: string | null;
  osarea: number | null;
  net_of_reval: number | null;
  data_flags: string | null;
  status: string | null;
  source: string | null;
  duplicate_clno: string | null;
  cross_province: string | null;
};

const FLAG_OPTIONS = [
  { value: "", label: "All Issues" },
  { value: "Negative AOC", label: "Negative AOC" },
  { value: "Negative FSSC", label: "Negative FSSC" },
  { value: "Duplicate", label: "Duplicate CLNO" },
  { value: "Cross Province", label: "Cross Province" },
];

const FLAG_BADGE: Record<string, string> = {
  "Negative AOC": "bg-red-100 text-red-700",
  "Negative FSSC": "bg-red-100 text-red-700",
  Duplicate: "bg-yellow-100 text-yellow-700",
  "Cross Province": "bg-orange-100 text-orange-700",
};

function flagBadgeClass(flag: string): string {
  for (const [key, cls] of Object.entries(FLAG_BADGE)) {
    if (flag.includes(key)) return cls;
  }
  return "bg-gray-100 text-gray-600";
}

const STATUS_BADGE: Record<string, string> = {
  "Fully Distributed":         "bg-emerald-100 text-emerald-700",
  "Partially Distributed":     "bg-teal-100 text-teal-700",
  "Encoded":                   "bg-blue-100 text-blue-700",
  "For Encoding":              "bg-violet-100 text-violet-700",
  "For Further Validation":    "bg-amber-100 text-amber-700",
  "Not Eligible for Encoding": "bg-red-100 text-red-700",
};

export default function FlagsPage() {
  const [records, setRecords] = useState<FlagRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [flag, setFlag] = useState("");
  const [province, setProvince] = useState("");
  const [loading, setLoading] = useState(false);

  const limit = 50;
  const totalPages = Math.ceil(total / limit);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      search,
      flag,
      province,
    });
    const res = await fetch(`/api/flags?${params}`);
    const data = await res.json();
    setRecords(data.records);
    setTotal(data.total);
    setLoading(false);
  }, [page, search, flag, province]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  function handleFilter() {
    setPage(1);
    fetchRecords();
  }

  return (
    <div className="page-enter">
      <div className="mb-5">
        <h2 className="text-2xl font-bold text-gray-800">Issues &amp; Flags</h2>
        <p className="text-sm text-gray-500 mt-1">
          Records with data quality issues — negative values, duplicate CLNOs, cross-province entries
        </p>
      </div>

      {/* Filters */}
      <div className="card-bezel mb-5">
      <div className="card-bezel-inner-open flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-[11px] uppercase tracking-wide font-semibold text-gray-400 mb-1">Search</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleFilter()}
            placeholder="SEQNO, CLNO, Landowner..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
          />
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-wide font-semibold text-gray-400 mb-1">Issue Type</label>
          <select
            value={flag}
            onChange={(e) => setFlag(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
          >
            {FLAG_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-wide font-semibold text-gray-400 mb-1">Province</label>
          <input
            type="text"
            value={province}
            onChange={(e) => setProvince(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleFilter()}
            placeholder="e.g. Camarines Sur"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 w-44"
          />
        </div>
        <button onClick={handleFilter} className="btn-primary">
          Filter
        </button>
        {(search || flag || province) && (
          <button
            onClick={() => { setSearch(""); setFlag(""); setProvince(""); setPage(1); }}
            className="btn-ghost"
          >
            Clear
          </button>
        )}
      </div>
      </div>

      {/* Summary */}
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {loading ? "Loading..." : `${total.toLocaleString()} flagged record${total !== 1 ? "s" : ""}`}
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
            <span className="text-gray-500">
              Page {page} of {totalPages}
            </span>
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
                <th className="px-3 py-2.5 text-left font-medium">SEQNO_DARRO</th>
                <th className="px-3 py-2.5 text-left font-medium">CLNO</th>
                <th className="px-3 py-2.5 text-left font-medium">Landowner</th>
                <th className="px-3 py-2.5 text-left font-medium">Province</th>
                <th className="px-3 py-2.5 text-right font-medium">OS Area</th>
                <th className="px-3 py-2.5 text-right font-medium">Net of Reval</th>
                <th className="px-3 py-2.5 text-left font-medium">Issue / Flag</th>
                <th className="px-3 py-2.5 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 && !loading && (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-gray-400">
                    No flagged records found.
                  </td>
                </tr>
              )}
              {records.map((r, i) => {
                const flags = r.data_flags ? r.data_flags.split(";").map((f) => f.trim()) : [];
                return (
                  <tr key={r.seqno_darro} className={`border-t border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                    <td className="px-3 py-2 font-mono text-gray-700">{r.seqno_darro}</td>
                    <td className="px-3 py-2 text-gray-600">{r.clno ?? "—"}</td>
                    <td className="px-3 py-2 text-gray-800 max-w-[200px] truncate" title={r.landowner ?? ""}>
                      {r.landowner ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.province_edited ?? "—"}</td>
                    <td className="px-3 py-2 text-right text-gray-700 font-mono">
                      {r.osarea != null ? r.osarea.toFixed(4) : "—"}
                    </td>
                    <td className={`px-3 py-2 text-right font-mono font-semibold ${(r.net_of_reval ?? 0) < 0 ? "text-red-600" : "text-gray-700"}`}>
                      {r.net_of_reval != null ? r.net_of_reval.toFixed(4) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {flags.map((f) => (
                          <span key={f} className={`px-2 py-0.5 rounded text-[11px] font-semibold ${flagBadgeClass(f)}`}>
                            {f}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${STATUS_BADGE[r.status ?? "For Initial Validation"] ?? "bg-gray-100 text-gray-500"}`}>
                        {r.status ?? "For Initial Validation"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      </div>

      {/* Bottom pagination */}
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
