"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

const WARN_BEFORE_S = 5 * 60; // show warning at 5 minutes remaining
const POLL_INTERVAL_MS = 30_000; // check every 30 seconds

function getExpiryFromCookie(): number | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)dar_session_exp=([^;]+)/);
  if (!match) return null;
  const val = parseInt(match[1], 10);
  return isNaN(val) ? null : val;
}

function secondsRemaining(expUnix: number): number {
  return Math.max(0, expUnix - Math.floor(Date.now() / 1000));
}

function formatCountdown(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function SessionExpiryWarning() {
  const router = useRouter();
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [dismissed, setDismissed]     = useState(false);

  const refresh = useCallback(() => {
    const exp = getExpiryFromCookie();
    if (exp === null) { setSecondsLeft(null); return; }
    setSecondsLeft(secondsRemaining(exp));
  }, []);

  // Poll the cookie every 30s to stay in sync with middleware refreshes
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  // Countdown tick every second when warning is visible
  useEffect(() => {
    if (secondsLeft === null || secondsLeft > WARN_BEFORE_S) return;
    if (secondsLeft === 0) {
      router.push("/login");
      return;
    }
    const id = setTimeout(() => setSecondsLeft((s) => (s !== null ? Math.max(0, s - 1) : null)), 1000);
    return () => clearTimeout(id);
  }, [secondsLeft, router]);

  // Reset dismissed state when session is refreshed (expiry resets)
  useEffect(() => {
    if (secondsLeft !== null && secondsLeft > WARN_BEFORE_S) setDismissed(false);
  }, [secondsLeft]);

  const isWarning = secondsLeft !== null && secondsLeft <= WARN_BEFORE_S && secondsLeft > 0;

  if (!isWarning || dismissed) return null;

  async function handleStaySignedIn() {
    // Any request triggers the middleware which reissues the token
    await fetch("/api/session-ping", { method: "GET" });
    refresh();
    setDismissed(true);
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md">
      <div className="flex items-center gap-3 bg-amber-50 border border-amber-300 text-amber-900 rounded-xl px-4 py-3 shadow-lg">
        <svg className="shrink-0 text-amber-500" width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
        </svg>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold leading-tight">Session expiring soon</p>
          <p className="text-[11px] text-amber-700 mt-0.5">
            You will be signed out in <span className="font-mono font-bold">{formatCountdown(secondsLeft)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleStaySignedIn}
            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-semibold rounded-lg transition-colors"
          >
            Stay signed in
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="text-amber-400 hover:text-amber-600 transition-colors"
            aria-label="Dismiss"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M1 1l12 12M13 1L1 13" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
