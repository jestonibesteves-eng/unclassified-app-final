"use client";

import { useSidebar } from "@/components/SidebarContext";

function HamburgerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="2" y1="4.5" x2="16" y2="4.5" />
      <line x1="2" y1="9" x2="16" y2="9" />
      <line x1="2" y1="13.5" x2="16" y2="13.5" />
    </svg>
  );
}

export default function MobileHeader() {
  const { toggle } = useSidebar();
  return (
    <div className="md:hidden sticky top-0 z-30 flex items-center gap-3 h-12 px-4 bg-[#14532d]/95 backdrop-blur-sm border-b border-green-900/30">
      <button
        onClick={toggle}
        className="flex items-center justify-center w-8 h-8 rounded-lg text-green-200 hover:bg-white/10 active:scale-95 transition-all duration-150"
        aria-label="Toggle navigation"
      >
        <HamburgerIcon />
      </button>
      {/* Logo chip */}
      <div className="w-6 h-6 rounded-md bg-white/15 flex items-center justify-center flex-shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/dar-logo.svg" alt="" className="w-4 h-4" />
      </div>
      <span
        className="text-[12px] font-semibold text-green-100 tracking-tight truncate"
        style={{ fontFamily: "var(--font-jetbrains), monospace" }}
      >
        Unclassified ARRs
      </span>
    </div>
  );
}
