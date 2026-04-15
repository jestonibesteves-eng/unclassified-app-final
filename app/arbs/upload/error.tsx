"use client";

import { useEffect } from "react";

export default function ARBsUploadError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[arbs/upload] page error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
      <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center">
        <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
      </div>
      <div>
        <h2 className="text-lg font-bold text-gray-800">Something went wrong</h2>
        <p className="text-sm text-gray-500 mt-1">The ARB Upload page failed to load. Please try again.</p>
      </div>
      <button
        onClick={reset}
        className="px-5 py-2 rounded-lg bg-blue-700 text-white text-sm font-semibold hover:bg-blue-600 transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
