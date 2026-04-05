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
    <div className="md:hidden sticky top-0 z-30 flex items-center gap-3 h-12 px-4 bg-white/95 backdrop-blur-sm border-b border-gray-100">
      <button
        onClick={toggle}
        className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-600 hover:bg-gray-100 active:scale-95 transition-all duration-150"
        aria-label="Toggle navigation"
      >
        <HamburgerIcon />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/dar-logo.svg" alt="" className="w-6 h-6 rounded-full flex-shrink-0" />
      <span className="text-[12px] font-semibold text-gray-700 tracking-tight truncate">
        Unclassified ARRs
      </span>
    </div>
  );
}
