"use client";

import { useState, useRef } from "react";

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Read from DOM refs — captures the actual value iOS autofill placed,
    // which may not have propagated through React's onChange.
    const username = usernameRef.current?.value ?? "";
    const password = passwordRef.current?.value ?? "";

    const doLogin = () =>
      fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

    try {
      let res = await doLogin();

      // In dev mode Turbopack compiles routes lazily; the first request can
      // land before compilation finishes and get a 404. Retry once to let the
      // compiler catch up. Skip in production where routes are pre-compiled.
      if (res.status === 404 && process.env.NODE_ENV !== "production") {
        await new Promise((r) => setTimeout(r, 800));
        res = await doLogin();
      }

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Login failed.");
        setLoading(false);
      } else {
        window.location.replace(data.must_change_password ? "/change-password" : "/");
      }
    } catch {
      setError("Connection error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden" style={{ fontFamily: "var(--font-ibm, 'IBM Plex Sans', sans-serif)" }}>
      {/* Background */}
      <div className="absolute inset-0 bg-[#0a2416]">
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "linear-gradient(#4ade80 1px, transparent 1px), linear-gradient(90deg, #4ade80 1px, transparent 1px)", backgroundSize: "48px 48px" }} />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_40%,rgba(20,83,45,0.6),transparent)]" />
      </div>

      {/* Card */}
      <div className="relative z-10 w-full max-w-sm mx-4">
        {/* Header */}
        <div className="bg-[#14532d] rounded-t-2xl px-8 py-6 border-b border-[#166534]/60">
          <div className="flex items-center gap-4 mb-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/dar-logo.svg"
              alt="DAR Bicol Region"
              width={56}
              height={56}
              className="flex-shrink-0 w-14 h-14 rounded-full"
              style={{ boxShadow: "0 0 0 2px rgba(212,175,55,0.5), 0 4px 16px rgba(0,0,0,0.5)" }}
            />
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] font-semibold text-emerald-400/80 leading-none mb-1">Republic of the Philippines</p>
              <p className="text-[11px] uppercase tracking-widest font-bold text-emerald-200 leading-tight">Department of Agrarian Reform</p>
              <p className="text-[10px] text-emerald-400/70 leading-none mt-0.5">Bicol Region · Regional Office No. V</p>
            </div>
          </div>
          <div className="border-t border-[#166534]/50 pt-4">
            <h1 className="text-lg font-bold text-white leading-tight">Unclassified ARRs</h1>
            <p className="text-[11px] text-emerald-300/70 mt-0.5 uppercase tracking-widest">Data Management System</p>
          </div>
        </div>

        {/* Form */}
        <div className="bg-white rounded-b-2xl px-8 py-7 shadow-2xl shadow-black/40">
          <p className="text-[11px] uppercase tracking-widest font-semibold text-gray-400 mb-5">Sign in to your account</p>

          {error && (
            <div className="mb-4 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-[12px] font-medium flex items-center gap-2">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} method="post" className="space-y-4">
            <div>
              <label className="block text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-1.5">Username</label>
              <input
                ref={usernameRef}
                type="text"
                name="username"
                autoComplete="username"
                required
                placeholder="Enter your username"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-[13px] text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent transition-all"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-1.5">Password</label>
              {/* Flex row — toggle is a sibling, not absolutely positioned.
                  iOS Safari fires onPointerDown reliably on flex siblings. */}
              <div className="flex items-center border border-gray-200 rounded-lg focus-within:ring-2 focus-within:ring-emerald-600 focus-within:border-transparent transition-all">
                <input
                  ref={passwordRef}
                  type={showPassword ? "text" : "password"}
                  name="password"
                  autoComplete="current-password"
                  required
                  placeholder="Enter your password"
                  className="flex-1 min-w-0 px-3 py-2.5 text-[13px] text-gray-800 placeholder-gray-300 focus:outline-none bg-transparent rounded-l-lg"
                />
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="flex-shrink-0 flex items-center justify-center w-11 h-11 text-gray-400 hover:text-gray-600 touch-manipulation cursor-pointer rounded-r-lg"
                >
                  {showPassword ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#14532d] hover:bg-[#166534] disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-[13px] py-2.5 rounded-lg transition-colors mt-2 flex items-center justify-center gap-2"
            >
              {loading ? (
                <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Signing in…</>
              ) : "Sign In"}
            </button>
          </form>

          <p className="mt-5 text-center text-[10px] text-gray-300 uppercase tracking-widest">LTID Group · DAR Region V</p>
        </div>
      </div>
    </div>
  );
}
