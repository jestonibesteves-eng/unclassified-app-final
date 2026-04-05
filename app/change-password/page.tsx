"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (newPass.length < 8) {
      setError("New password must be at least 8 characters."); return;
    }
    if (newPass !== confirm) {
      setError("New passwords do not match."); return;
    }

    setLoading(true);
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_password: current, new_password: newPass }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Failed to change password.");
    } else {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a2416]" style={{ fontFamily: "var(--font-ibm, 'IBM Plex Sans', sans-serif)" }}>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_40%,rgba(20,83,45,0.6),transparent)]" />

      <div className="relative z-10 w-full max-w-sm mx-4">
        <div className="bg-[#14532d] rounded-t-2xl px-8 py-5 border-b border-[#166534]/60">
          <div className="flex items-center gap-3 mb-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/dar-logo.svg"
              alt="DAR Bicol Region"
              className="flex-shrink-0 w-10 h-10 rounded-full"
              style={{ boxShadow: "0 0 0 1.5px rgba(212,175,55,0.45), 0 3px 10px rgba(0,0,0,0.4)" }}
            />
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] font-semibold text-emerald-400/80 leading-none mb-0.5">First Login</p>
              <h1 className="text-sm font-bold text-white leading-tight">Change Your Password</h1>
            </div>
          </div>
          <p className="text-[11px] text-emerald-300/70">You must set a new password before continuing.</p>
        </div>

        <div className="bg-white rounded-b-2xl px-8 py-6 shadow-2xl shadow-black/40">
          {error && (
            <div className="mb-4 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-[12px] font-medium flex items-center gap-2">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-1.5">Current Password</label>
              <input
                type={show ? "text" : "password"}
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                required
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-1.5">New Password <span className="normal-case text-gray-300">(min. 8 characters)</span></label>
              <input
                type={show ? "text" : "password"}
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                required
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-1.5">Confirm New Password</label>
              <input
                type={show ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
            <label className="flex items-center gap-2 text-[12px] text-gray-500 cursor-pointer select-none">
              <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="rounded" />
              Show passwords
            </label>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#14532d] hover:bg-[#166534] disabled:opacity-60 text-white font-semibold text-[13px] py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Saving…
                </>
              ) : "Set New Password"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
