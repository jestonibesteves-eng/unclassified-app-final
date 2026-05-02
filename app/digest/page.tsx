"use client";

import { useEffect, useState, useCallback } from "react";
import type { DigestRecipient } from "@/lib/digest";

interface Settings {
  enabled: boolean;
  lastSentAt: string | null;
  sendUntil: string | null;
}

interface SendResult {
  sent: number;
  failed: number;
  recipients?: string[];
  error?: string;
}

const ROLE_DROPDOWN = [
  { label: "ARDO",     level: "regional",   display: undefined },
  { label: "CARPO",    level: "regional",   display: "CARPO (Regional)" },
  { label: "CARPO",    level: "provincial", display: "CARPO (Provincial)" },
  { label: "PARPO II", level: "provincial", display: undefined },
] as const;

const PROVINCE_OPTIONS = [
  "ALBAY",
  "CAMARINES NORTE",
  "CAMARINES SUR - I",
  "CAMARINES SUR - II",
  "CATANDUANES",
  "MASBATE",
  "SORSOGON",
];

function fmtDate(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DigestPage() {
  const [settings, setSettings]     = useState<Settings>({ enabled: false, lastSentAt: null, sendUntil: null });
  const [recipients, setRecipients] = useState<DigestRecipient[]>([]);
  const [sending, setSending]       = useState(false);
  const [sendResult, setSendResult] = useState<SendResult | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Add form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [addName, setAddName]         = useState("");
  const [addNickname, setAddNickname] = useState("");
  const [addEmail, setAddEmail]       = useState("");
  const [addRoleIdx, setAddRoleIdx]   = useState(0);
  const [addProvince, setAddProvince] = useState(PROVINCE_OPTIONS[0]);
  const [addSaving, setAddSaving]     = useState(false);
  const [addError, setAddError]       = useState("");

  const selectedRoleOption = ROLE_DROPDOWN[addRoleIdx] ?? ROLE_DROPDOWN[0];
  const needsProvince      = selectedRoleOption.level === "provincial";

  const loadSettings = useCallback(async () => {
    const res = await fetch("/api/admin/digest/settings");
    if (res.ok) setSettings(await res.json());
  }, []);

  const loadRecipients = useCallback(async () => {
    const res = await fetch("/api/admin/digest/recipients");
    if (res.ok) setRecipients(await res.json());
  }, []);

  useEffect(() => {
    loadSettings();
    loadRecipients();
  }, [loadSettings, loadRecipients]);

  async function handleToggleEnabled() {
    const next = !settings.enabled;
    const res  = await fetch("/api/admin/digest/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: next }),
    });
    if (res.ok) setSettings((s) => ({ ...s, enabled: next }));
  }

  async function handleSendUntilChange(date: string) {
    setSettings((s) => ({ ...s, sendUntil: date || null }));
    await fetch("/api/admin/digest/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sendUntil: date || null }),
    });
  }

  async function handleSendNow() {
    setSending(true);
    setSendResult(null);
    try {
      const res  = await fetch("/api/admin/digest/send", { method: "POST" });
      const text = await res.text();
      let data: SendResult = { sent: 0, failed: 0 };
      try { data = JSON.parse(text); } catch { data = { sent: 0, failed: 0, error: `Server error (${res.status})` }; }
      setSendResult(data);
      await loadSettings();
    } finally {
      setSending(false);
    }
  }

  async function handleToggleActive(r: DigestRecipient) {
    setTogglingId(r.id);
    await fetch(`/api/admin/digest/recipients/${r.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: r.active ? 0 : 1 }),
    });
    await loadRecipients();
    setTogglingId(null);
  }

  async function handleDelete(id: number) {
    if (!confirm("Remove this recipient?")) return;
    setDeletingId(id);
    await fetch(`/api/admin/digest/recipients/${id}`, { method: "DELETE" });
    await loadRecipients();
    setDeletingId(null);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError("");
    setAddSaving(true);
    const res = await fetch("/api/admin/digest/recipients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name:     addName,
        nickname: addNickname || undefined,
        email:    addEmail,
        role:     selectedRoleOption.label,
        level:    selectedRoleOption.level,
        province: needsProvince ? addProvince : undefined,
      }),
    });
    if (res.ok) {
      setAddName(""); setAddNickname(""); setAddEmail(""); setAddRoleIdx(0);
      setShowAddForm(false);
      await loadRecipients();
    } else {
      const data = await res.json();
      setAddError(data.error ?? "Failed to add recipient.");
    }
    setAddSaving(false);
  }

  const activeCount = recipients.filter((r) => r.active).length;

  const roleBadgeColor: Record<string, string> = {
    "ARDO":     "bg-blue-100 text-blue-800",
    "CARPO":    "bg-amber-100 text-amber-800",
    "PARPO II": "bg-purple-100 text-purple-800",
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Weekly Digest</h1>
        <p className="text-sm text-gray-500 mt-1">
          Configure and send the weekly COCROM progress email to regional and provincial recipients.
        </p>
      </div>

      {/* Card 1 — Settings */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Digest Settings</h2>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700">Automatic weekly digest</p>
            <p className="text-xs text-gray-400">Sends every Monday at 8:00 AM Philippine Time</p>
          </div>
          <button
            onClick={handleToggleEnabled}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              settings.enabled ? "bg-green-600" : "bg-gray-300"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                settings.enabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
            settings.enabled ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"
          }`}>
            {settings.enabled
              ? settings.sendUntil
                ? `Auto-send on · Until ${new Date(settings.sendUntil + "T00:00:00+08:00").toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}`
                : "Auto-send on · No end date"
              : "Auto-send off"}
          </span>
        </div>

        {settings.enabled && (
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-600 whitespace-nowrap">Send until:</label>
            <input
              type="date"
              value={settings.sendUntil ?? ""}
              onChange={(e) => handleSendUntilChange(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            {settings.sendUntil && (
              <button
                onClick={() => handleSendUntilChange("")}
                className="text-xs text-gray-400 hover:text-red-500"
              >
                Clear
              </button>
            )}
          </div>
        )}

        <div className="text-sm text-gray-500">
          Last sent: <span className="font-medium text-gray-700">{fmtDate(settings.lastSentAt)}</span>
        </div>

        <div className="pt-2 border-t border-gray-100 flex items-center justify-between gap-4">
          <p className="text-xs text-gray-400">
            Covers the previous full week (Mon – Sun PHT). {activeCount} active recipient{activeCount !== 1 ? "s" : ""}.
          </p>
          <button
            onClick={handleSendNow}
            disabled={sending || activeCount === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? (
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            )}
            {sending ? "Sending…" : "Send Now"}
          </button>
        </div>

        {sendResult && (
          <div className={`rounded-lg px-4 py-3 text-sm ${
            sendResult.error
              ? "bg-red-50 text-red-800 border border-red-200"
              : sendResult.failed === 0
                ? "bg-green-50 text-green-800 border border-green-200"
                : "bg-amber-50 text-amber-800 border border-amber-200"
          }`}>
            {sendResult.error
              ? `Error: ${sendResult.error}`
              : sendResult.sent > 0
                ? `✓ Sent to ${sendResult.sent} recipient${sendResult.sent !== 1 ? "s" : ""}.`
                : "No emails sent."}
            {!sendResult.error && sendResult.failed > 0 && ` ${sendResult.failed} failed — check server logs.`}
          </div>
        )}
      </div>

      {/* Card 2 — Recipients */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Recipients</h2>
          <button
            onClick={() => setShowAddForm((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add Recipient
          </button>
        </div>

        {showAddForm && (
          <form onSubmit={handleAdd} className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Full Name</label>
                <input
                  required value={addName} onChange={(e) => setAddName(e.target.value)}
                  placeholder="Full name"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Nickname <span className="text-gray-400 font-normal">(used in greeting)</span>
                </label>
                <input
                  value={addNickname} onChange={(e) => setAddNickname(e.target.value)}
                  placeholder="e.g. RD Rod"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                <input
                  required type="email" value={addEmail} onChange={(e) => setAddEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
                <select
                  value={addRoleIdx} onChange={(e) => setAddRoleIdx(Number(e.target.value))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                >
                  {ROLE_DROPDOWN.map((r, i) => (
                    <option key={i} value={i}>{r.display ?? r.label}</option>
                  ))}
                </select>
              </div>
              {needsProvince && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Province</label>
                  <select
                    value={addProvince} onChange={(e) => setAddProvince(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                  >
                    {PROVINCE_OPTIONS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            {addError && <p className="text-xs text-red-600">{addError}</p>}
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => { setShowAddForm(false); setAddError(""); }}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit" disabled={addSaving}
                className="rounded-lg bg-green-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
              >
                {addSaving ? "Adding…" : "Add Recipient"}
              </button>
            </div>
          </form>
        )}

        {recipients.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No recipients yet. Add one above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nickname</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Scope</th>
                  <th className="text-center py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Active</th>
                  <th className="py-2 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {recipients.map((r) => (
                  <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="py-2.5 px-3 font-medium text-gray-800">{r.name}</td>
                    <td className="py-2.5 px-3 text-gray-500">
                      {r.nickname ?? <span className="text-gray-300 italic text-xs">—</span>}
                    </td>
                    <td className="py-2.5 px-3 text-gray-500">{r.email}</td>
                    <td className="py-2.5 px-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        roleBadgeColor[r.role] ?? "bg-gray-100 text-gray-700"
                      }`}>
                        {r.role}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-gray-600">
                      {r.level === "regional" ? "Regional" : r.province ?? "—"}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <button
                        onClick={() => handleToggleActive(r)}
                        disabled={togglingId === r.id}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${
                          r.active ? "bg-green-600" : "bg-gray-300"
                        }`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                          r.active ? "translate-x-[18px]" : "translate-x-0.5"
                        }`} />
                      </button>
                    </td>
                    <td className="py-2.5 px-3">
                      <button
                        onClick={() => handleDelete(r.id)}
                        disabled={deletingId === r.id}
                        className="text-gray-400 hover:text-red-600 disabled:opacity-40"
                        title="Remove recipient"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
