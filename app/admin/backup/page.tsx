"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useUser } from "@/components/UserContext";
import { useToast } from "@/components/Toast";
import { useRouter } from "next/navigation";

type BackupEntry = {
  filename: string;
  sizeBytes: number;
  createdAt: string;
  label: "auto" | "manual" | "unknown";
};

type PendingRestore = { filename: string; stagedAt: string } | null;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-PH", {
    year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

/* ─── Restore confirmation modal ─── */
function RestoreModal({
  backup,
  onConfirm,
  onCancel,
  staging,
}: {
  backup: BackupEntry;
  onConfirm: () => void;
  onCancel: () => void;
  staging: boolean;
}) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
        {/* Warning icon */}
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#dc2626" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 2L16.5 15H1.5L9 2z" />
              <line x1="9" y1="8" x2="9" y2="11" />
              <circle cx="9" cy="13.5" r="0.5" fill="#dc2626" />
            </svg>
          </div>
          <div>
            <h2 className="text-[14px] font-bold text-gray-900">Stage Restore Point</h2>
            <p className="text-[11px] text-gray-500">This action requires a server restart to take effect</p>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 space-y-1">
          <p className="text-[12px] font-semibold text-amber-800">All current data will be replaced.</p>
          <p className="text-[11px] text-amber-700">
            Every record added or modified after{" "}
            <span className="font-semibold">{formatDateTime(backup.createdAt)}</span>{" "}
            will be permanently lost once the server restarts.
          </p>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold mb-0.5">Restore point</p>
          <p className="text-[12px] font-mono text-gray-700 truncate">{backup.filename}</p>
          <p className="text-[11px] text-gray-500">{formatDateTime(backup.createdAt)} · {formatBytes(backup.sizeBytes)}</p>
        </div>

        <p className="text-[11px] text-gray-500">
          The backup will be staged immediately. The database will only be replaced after you restart the server. You can cancel before restarting.
        </p>

        <div className="flex gap-2 pt-1">
          <button
            onClick={onCancel}
            disabled={staging}
            className="flex-1 px-4 py-2 rounded-lg border border-gray-200 text-[12px] font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={staging}
            className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white text-[12px] font-semibold hover:bg-red-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {staging ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Staging…
              </>
            ) : (
              "Yes, stage restore"
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function BackupPage() {
  const { user } = useUser();
  const toast = useToast();
  const router = useRouter();

  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [pendingRestore, setPendingRestore] = useState<PendingRestore>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<BackupEntry | null>(null);
  const [staging, setStaging] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const [recomputeResult, setRecomputeResult] = useState<number | null>(null);

  const fetchBackups = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/backup");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setBackups(data.backups);
      setPendingRestore(data.pendingRestore ?? null);
    } catch {
      toast("Failed to load backups.", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (user && user.role !== "super_admin") {
      router.replace("/");
      return;
    }
    fetchBackups();
  }, [user, router, fetchBackups]);

  async function handleCreate() {
    setCreating(true);
    try {
      const res = await fetch("/api/admin/backup", { method: "POST" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      toast(`Backup created: ${data.filename}`, "success");
      await fetchBackups();
    } catch {
      toast("Failed to create backup.", "error");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(filename: string) {
    setDeletingFile(filename);
    setConfirmDelete(null);
    try {
      const res = await fetch(`/api/admin/backup/${encodeURIComponent(filename)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      toast(`Deleted: ${filename}`, "success");
      setBackups((prev) => prev.filter((b) => b.filename !== filename));
    } catch {
      toast("Failed to delete backup.", "error");
    } finally {
      setDeletingFile(null);
    }
  }

  async function handleDownload(filename: string) {
    setDownloadingFile(filename);
    try {
      const res = await fetch(`/api/admin/backup/${encodeURIComponent(filename)}`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast("Failed to download backup.", "error");
    } finally {
      setDownloadingFile(null);
    }
  }

  async function handleStageRestore() {
    if (!restoreTarget) return;
    setStaging(true);
    try {
      const res = await fetch(
        `/api/admin/backup/${encodeURIComponent(restoreTarget.filename)}/restore`,
        { method: "POST" }
      );
      if (!res.ok) throw new Error();
      setPendingRestore({ filename: restoreTarget.filename, stagedAt: new Date().toISOString() });
      toast("Restore staged. Restart the server to apply.", "success");
    } catch {
      toast("Failed to stage restore.", "error");
    } finally {
      setStaging(false);
      setRestoreTarget(null);
    }
  }

  async function handleCancelRestore() {
    setCancelling(true);
    try {
      const res = await fetch("/api/admin/backup/pending-restore", { method: "DELETE" });
      if (!res.ok) throw new Error();
      setPendingRestore(null);
      toast("Staged restore cancelled.", "success");
    } catch {
      toast("Failed to cancel restore.", "error");
    } finally {
      setCancelling(false);
    }
  }

  async function handleRecompute() {
    setRecomputing(true);
    setRecomputeResult(null);
    try {
      const res = await fetch("/api/admin/recompute-status", { method: "POST" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setRecomputeResult(data.recomputed);
      toast(`Recomputed status for ${data.recomputed} landholding(s).`, "success");
    } catch {
      toast("Failed to recompute statuses.", "error");
    } finally {
      setRecomputing(false);
    }
  }

  if (user && user.role !== "super_admin") return null;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-4xl mx-auto">
      {/* Pending restore banner */}
      {pendingRestore && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-amber-50 border border-amber-300 rounded-xl px-4 py-3">
          <div className="flex items-start gap-2.5 flex-1 min-w-0">
            <svg className="flex-shrink-0 mt-0.5" width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="#d97706" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7.5 1.5L13.5 13H1.5L7.5 1.5z" />
              <line x1="7.5" y1="6.5" x2="7.5" y2="9" />
              <circle cx="7.5" cy="11" r="0.5" fill="#d97706" />
            </svg>
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-amber-800">Restore staged — restart the server to apply</p>
              <p className="text-[11px] text-amber-700 truncate">
                <span className="font-mono">{pendingRestore.filename}</span>
                {" · staged "}
                {formatDateTime(pendingRestore.stagedAt)}
              </p>
            </div>
          </div>
          <button
            onClick={handleCancelRestore}
            disabled={cancelling}
            className="flex-shrink-0 self-start sm:self-auto text-[11px] font-medium px-3 py-1.5 rounded-lg border border-amber-300 text-amber-800 hover:bg-amber-100 transition-colors disabled:opacity-50"
          >
            {cancelling ? "Cancelling…" : "Cancel restore"}
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-[15px] font-bold text-gray-900 tracking-tight">Backup Management</h1>
          <p className="text-[12px] text-gray-500 mt-0.5">
            Daily auto-backups run at 2:00 AM. All backups are stored on the server.
          </p>
        </div>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="btn-primary text-[12px] px-4 py-2 flex items-center gap-2 self-start sm:self-auto disabled:opacity-60"
        >
          {creating ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              Creating…
            </>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="6.5" cy="6.5" r="5.5" />
                <line x1="6.5" y1="4" x2="6.5" y2="9" />
                <line x1="4" y1="6.5" x2="9" y2="6.5" />
              </svg>
              Create Backup Now
            </>
          )}
        </button>
      </div>

      {/* Recompute Status */}
      <div className="card-bezel">
        <div className="card-bezel-inner px-4 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-gray-800">Recompute All Landholding Statuses</p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Re-runs the status formula on every landholding that has ARBs. Use this after formula changes to bring all records up to date.
            </p>
            {recomputeResult !== null && (
              <p className="text-[11px] text-green-700 font-medium mt-1">
                Done — {recomputeResult} landholding{recomputeResult !== 1 ? "s" : ""} recomputed.
              </p>
            )}
          </div>
          <button
            onClick={handleRecompute}
            disabled={recomputing}
            className="flex-shrink-0 self-start sm:self-auto text-[12px] font-medium px-4 py-2 rounded-lg bg-green-800 text-white hover:bg-green-700 transition-colors disabled:opacity-60 flex items-center gap-2"
          >
            {recomputing ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Recomputing…
              </>
            ) : "Recompute Now"}
          </button>
        </div>
      </div>

      {/* Table card */}
      <div className="card-bezel">
        <div className="card-bezel-inner overflow-x-auto">
          <table className="w-full text-[12px] min-w-[600px]">
            <thead>
              <tr className="bg-green-900 text-white text-left">
                <th className="px-4 py-2.5 font-semibold tracking-wide">Filename</th>
                <th className="px-4 py-2.5 font-semibold tracking-wide">Created</th>
                <th className="px-4 py-2.5 font-semibold tracking-wide">Size</th>
                <th className="px-4 py-2.5 font-semibold tracking-wide">Type</th>
                <th className="px-4 py-2.5 font-semibold tracking-wide text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    Loading backups…
                  </td>
                </tr>
              ) : backups.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    No backups yet. Create one using the button above.
                  </td>
                </tr>
              ) : (
                backups.map((b, i) => {
                  const isPending = pendingRestore?.filename === b.filename;
                  return (
                    <tr
                      key={b.filename}
                      className={`border-t border-gray-100 ${
                        isPending
                          ? "bg-amber-50/60"
                          : i % 2 === 0 ? "bg-white" : "bg-gray-50/60"
                      }`}
                    >
                      <td className="px-4 py-2.5 font-mono text-[11px] text-gray-700 truncate max-w-[200px]">
                        {b.filename}
                        {isPending && (
                          <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-700 uppercase tracking-wide">
                            staged
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
                        {formatDateTime(b.createdAt)}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
                        {formatBytes(b.sizeBytes)}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            b.label === "auto"
                              ? "bg-blue-50 text-blue-700"
                              : b.label === "manual"
                              ? "bg-amber-50 text-amber-700"
                              : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {b.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleDownload(b.filename)}
                            disabled={downloadingFile === b.filename}
                            className="text-[11px] px-2.5 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-50"
                          >
                            {downloadingFile === b.filename ? "…" : "Download"}
                          </button>
                          <button
                            onClick={() => setRestoreTarget(b)}
                            disabled={!!staging}
                            className="text-[11px] px-2.5 py-1 rounded border border-green-200 text-green-700 hover:bg-green-50 hover:border-green-300 transition-colors disabled:opacity-50"
                          >
                            Restore
                          </button>
                          {confirmDelete === b.filename ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] text-gray-500">Sure?</span>
                              <button
                                onClick={() => handleDelete(b.filename)}
                                disabled={deletingFile === b.filename}
                                className="text-[11px] px-2.5 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                              >
                                {deletingFile === b.filename ? "…" : "Yes, delete"}
                              </button>
                              <button
                                onClick={() => setConfirmDelete(null)}
                                className="text-[11px] px-2.5 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDelete(b.filename)}
                              className="text-[11px] px-2.5 py-1 rounded border border-red-100 text-red-500 hover:bg-red-50 hover:border-red-200 transition-colors"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {!loading && backups.length > 0 && (
          <div className="px-4 py-2 border-t border-gray-100 text-[11px] text-gray-400">
            {backups.length} backup{backups.length !== 1 ? "s" : ""} · sorted newest first
          </div>
        )}
      </div>

      {/* Restore confirmation modal */}
      {restoreTarget && (
        <RestoreModal
          backup={restoreTarget}
          onConfirm={handleStageRestore}
          onCancel={() => setRestoreTarget(null)}
          staging={staging}
        />
      )}
    </div>
  );
}
