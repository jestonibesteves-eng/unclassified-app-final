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
      <div className="w-7 h-7 rounded-[7px] bg-white/95 flex items-center justify-center flex-shrink-0 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/dar-logo-square.svg" alt="DAR Logo" className="w-5 h-5 object-contain" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold text-white leading-tight truncate" style={{ fontFamily: "var(--font-jetbrains), monospace" }}>
          DAR Bicol Region
        </p>
        <p className="text-[8px] text-green-200/80 leading-tight truncate">
          Unclassified ARRs Data Management System
        </p>
      </div>
    </div>
  );
}
