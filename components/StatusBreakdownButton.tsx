"use client";

import { useState } from "react";
import { StatusBreakdownModal } from "@/components/StatusBreakdownModal";

type Props = {
  selectedProvinces?: string[];
  publicToken?: string;
  hideExport?: boolean;
};

export function StatusBreakdownButton({ selectedProvinces, publicToken, hideExport }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="View as status breakdown table"
        aria-label="View as status breakdown table"
        className="w-7 h-7 flex items-center justify-center rounded-md bg-white border border-green-200 shadow-sm hover:bg-green-50 transition-colors"
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#059669"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="3" y1="15" x2="21" y2="15" />
          <line x1="9" y1="3" x2="9" y2="21" />
          <line x1="15" y1="3" x2="15" y2="21" />
        </svg>
      </button>
      <StatusBreakdownModal
        open={open}
        onClose={() => setOpen(false)}
        selectedProvinces={selectedProvinces}
        publicToken={publicToken}
        hideExport={hideExport}
      />
    </>
  );
}
