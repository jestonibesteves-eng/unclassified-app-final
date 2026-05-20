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
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap');

        .lp-mono {
          font-family: 'IBM Plex Mono', 'Courier New', monospace;
        }

        @keyframes lp-card-in {
          from { opacity: 0; transform: translateY(28px) scale(0.972); }
          to   { opacity: 1; transform: translateY(0)    scale(1);     }
        }
        @keyframes lp-up {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0);    }
        }

        .lp-card { animation: lp-card-in 0.65s cubic-bezier(0.16,1,0.3,1) 0.04s both; }
        .lp-f1   { animation: lp-up 0.5s cubic-bezier(0.16,1,0.3,1) 0.22s both; }
        .lp-f2   { animation: lp-up 0.5s cubic-bezier(0.16,1,0.3,1) 0.30s both; }
        .lp-f3   { animation: lp-up 0.5s cubic-bezier(0.16,1,0.3,1) 0.38s both; }
        .lp-f4   { animation: lp-up 0.5s cubic-bezier(0.16,1,0.3,1) 0.46s both; }

        .lp-input {
          width: 100%;
          border-radius: 10px;
          padding: 10px 14px;
          font-size: 13px;
          border: 1px solid #e2e6eb;
          background: #f8f9fb;
          color: #0f1117;
          box-sizing: border-box;
          transition: border-color 180ms ease, box-shadow 180ms ease, background 180ms ease;
          font-family: inherit;
        }
        .lp-input::placeholder { color: #c4cad3; }
        .lp-input:focus {
          border-color: #059669;
          box-shadow: 0 0 0 3px rgba(5,150,105,0.1);
          background: #fff;
          outline: none;
        }

        .lp-pw-wrap {
          display: flex;
          align-items: center;
          border-radius: 10px;
          border: 1px solid #e2e6eb;
          background: #f8f9fb;
          transition: border-color 180ms ease, box-shadow 180ms ease, background 180ms ease;
        }
        .lp-pw-wrap:focus-within {
          border-color: #059669;
          box-shadow: 0 0 0 3px rgba(5,150,105,0.1);
          background: #fff;
        }
        .lp-pw-wrap input {
          flex: 1;
          min-width: 0;
          padding: 10px 14px;
          font-size: 13px;
          color: #0f1117;
          background: transparent;
          outline: none;
          border: none;
          border-radius: 10px 0 0 10px;
          font-family: inherit;
        }
        .lp-pw-wrap input::placeholder { color: #c4cad3; }

        .lp-eye {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: 0 10px 10px 0;
          color: #b0bac5;
          transition: color 140ms ease;
          cursor: pointer;
          background: transparent;
          border: none;
        }
        .lp-eye:hover { color: #4b5563; }

        .lp-btn {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 11px 0;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 600;
          color: #fff;
          border: none;
          cursor: pointer;
          background: #10492e;
          box-shadow: 0 1px 4px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.07);
          transition: all 200ms cubic-bezier(0.16,1,0.3,1);
          font-family: inherit;
        }
        .lp-btn:hover:not(:disabled) {
          background: #0d5c38;
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.09);
        }
        .lp-btn:active:not(:disabled) {
          transform: scale(0.98);
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
        }
        .lp-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>

      <div
        className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden"
        style={{ fontFamily: "var(--font-ibm,'IBM Plex Sans',sans-serif)", background: "#f0f4f1" }}
      >
        {/* ── Background ── */}
        <div className="absolute inset-0 pointer-events-none select-none">
          {/* Soft green glow centered behind the card */}
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 65% 65% at 50% 50%, rgba(20,83,45,0.07) 0%, transparent 65%)" }} />
          {/* Corner accents */}
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 55% 45% at 0% 100%, rgba(20,83,45,0.06) 0%, transparent 55%)" }} />
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 50% 40% at 100% 0%, rgba(20,83,45,0.05) 0%, transparent 52%)" }} />

          {/* UNCLASSIFIED stamp */}
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            <span
              aria-hidden="true"
              style={{
                fontFamily: "'Courier New', Courier, monospace",
                fontSize: "clamp(72px, 13vw, 152px)",
                fontWeight: 800,
                letterSpacing: "0.14em",
                color: "rgba(20,83,45,0.045)",
                transform: "rotate(-12deg)",
                whiteSpace: "nowrap",
                lineHeight: 1,
              }}
            >
              UNCLASSIFIED
            </span>
          </div>

          {/* Subtle grain */}
          <div
            style={{
              position: "fixed",
              inset: 0,
              backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='250' height='250'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='250' height='250' filter='url(%23n)' opacity='0.06'/%3E%3C/svg%3E\")",
              backgroundSize: "180px 180px",
              opacity: 0.3,
              pointerEvents: "none",
            }}
          />
        </div>

        {/* ── Card ── */}
        <div
          className="lp-card relative z-10 w-full mx-4"
          style={{
            maxWidth: 406,
            borderRadius: 22,
            border: "1px solid rgba(0,0,0,0.07)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06), 0 16px 48px rgba(0,0,0,0.10), 0 4px 16px rgba(0,0,0,0.06)",
          }}
        >
          {/* Card header — green brand accent, mirrors the sidebar header */}
          <div
            style={{
              background: "linear-gradient(135deg, #14532d 0%, #15803d 60%, #16a34a 100%)",
              borderRadius: "21px 21px 0 0",
              padding: "28px 32px 24px",
              borderBottom: "1px solid rgba(0,0,0,0.08)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* Shine overlay */}
            <div
              aria-hidden="true"
              style={{
                position: "absolute", top: -30, right: -30, width: 140, height: 140,
                borderRadius: "50%",
                background: "radial-gradient(circle, rgba(255,255,255,0.08) 0%, transparent 70%)",
                pointerEvents: "none",
              }}
            />
            {/* Top-edge inner highlight */}
            <div
              aria-hidden="true"
              style={{
                position: "absolute", top: 0, left: 0, right: 0, height: 1,
                background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.18) 30%, rgba(255,255,255,0.18) 70%, transparent)",
                pointerEvents: "none",
              }}
            />

            {/* Institution row */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20, position: "relative" }}>
              <div style={{ width: 54, height: 54, borderRadius: 14, flexShrink: 0, background: "rgba(255,255,255,0.95)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 0 2px rgba(255,255,255,0.4), 0 4px 14px rgba(0,0,0,0.2)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/dar-logo-square.svg" alt="DAR Bicol Region" width={40} height={40} style={{ width: 40, height: 40, objectFit: "contain" }} />
              </div>
              <div>
                <p className="lp-mono" style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.2em", color: "rgba(255,255,255,0.55)", fontWeight: 500, lineHeight: 1, marginBottom: 5 }}>
                  Republic of the Philippines
                </p>
                <p style={{ fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.95)", fontWeight: 700, lineHeight: 1.3, fontFamily: "var(--font-ibm,'IBM Plex Sans',sans-serif)" }}>
                  Department of Agrarian Reform
                </p>
                <p className="lp-mono" style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", lineHeight: 1, marginTop: 5 }}>
                  Bicol Region · Regional Office No. V
                </p>
              </div>
            </div>

            {/* System name */}
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 18, position: "relative" }}>
              <h1
                style={{
                  fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
                  fontSize: 22,
                  fontWeight: 600,
                  color: "#ffffff",
                  letterSpacing: "0.01em",
                  lineHeight: 1.2,
                  marginBottom: 7,
                }}
              >
                Unclassified{" "}
                <span style={{ color: "#86efac" }}>ARRs</span>
              </h1>
              <p className="lp-mono" style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.28em", color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>
                Data Management System
              </p>
            </div>
          </div>

          {/* Form body */}
          <div
            style={{
              background: "#ffffff",
              borderRadius: "0 0 21px 21px",
              padding: "26px 32px 24px",
            }}
          >
            <p className="lp-mono lp-f1" style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.18em", fontWeight: 500, color: "#9ca3af", marginBottom: 20 }}>
              Sign in to your account
            </p>

            {error && (
              <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", fontSize: 12, fontWeight: 500, display: "flex", alignItems: "flex-start", gap: 9 }}>
                <svg style={{ width: 14, height: 14, marginTop: 1, flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} method="post" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Username */}
              <div className="lp-f2">
                <label className="lp-mono" style={{ display: "block", fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.18em", fontWeight: 500, color: "#9ca3af", marginBottom: 7 }}>
                  Username
                </label>
                <input
                  ref={usernameRef}
                  type="text"
                  name="username"
                  autoComplete="username"
                  required
                  placeholder="Enter your username"
                  className="lp-input"
                />
              </div>

              {/* Password */}
              <div className="lp-f3">
                <label className="lp-mono" style={{ display: "block", fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.18em", fontWeight: 500, color: "#9ca3af", marginBottom: 7 }}>
                  Password
                </label>
                <div className="lp-pw-wrap">
                  <input
                    ref={passwordRef}
                    type={showPassword ? "text" : "password"}
                    name="password"
                    autoComplete="current-password"
                    required
                    placeholder="Enter your password"
                  />
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="lp-eye"
                  >
                    {showPassword ? (
                      <svg style={{ width: 15, height: 15 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg style={{ width: 15, height: 15 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <div className="lp-f4" style={{ paddingTop: 4 }}>
                <button type="submit" disabled={loading} className="lp-btn">
                  {loading ? (
                    <>
                      <svg style={{ width: 15, height: 15 }} className="animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Signing in…
                    </>
                  ) : (
                    "Sign In"
                  )}
                </button>
              </div>
            </form>

            <p className="lp-mono" style={{ marginTop: 20, textAlign: "center", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.24em", color: "#d1d5db" }}>
              LTID Group · DAR Region V
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
