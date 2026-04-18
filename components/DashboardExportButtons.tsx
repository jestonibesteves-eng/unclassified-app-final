"use client";

import { useState } from "react";

export default function DashboardExportButtons() {
  const [exporting, setExporting] = useState<"image" | "pdf" | null>(null);

  async function capture() {
    const el = document.getElementById("dashboard-content");
    if (!el) throw new Error("Dashboard content not found");
    const { toPng } = await import("html-to-image");
    const fullWidth  = el.scrollWidth;
    const fullHeight = el.scrollHeight;
    // Double-render to ensure fonts/icons are loaded
    await toPng(el, { pixelRatio: 2, backgroundColor: "#f9fafb", width: fullWidth, height: fullHeight });
    return toPng(el, { pixelRatio: 2, backgroundColor: "#f9fafb", width: fullWidth, height: fullHeight });
  }

  async function handleImage() {
    setExporting("image");
    try {
      const dataUrl = await capture();
      const link = document.createElement("a");
      link.download = `dashboard-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = dataUrl;
      link.click();
    } finally {
      setExporting(null);
    }
  }

  async function handlePDF() {
    setExporting("pdf");
    try {
      const { default: jsPDF } = await import("jspdf");
      const dataUrl = await capture();
      const img = new Image();
      img.src = dataUrl;
      await new Promise((res) => { img.onload = res; });
      const w = img.width / 2;
      const h = img.height / 2;
      const pdf = new jsPDF({ orientation: w > h ? "landscape" : "portrait", unit: "px", format: [w, h] });
      pdf.addImage(dataUrl, "PNG", 0, 0, w, h);
      pdf.save(`dashboard-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleImage}
        disabled={!!exporting}
        title="Export as PNG"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="1" width="10" height="10" rx="1.5" />
          <path d="M1 8l2.5-2.5 2 2L8 5l3 3" />
          <circle cx="8.5" cy="3.5" r="0.8" fill="currentColor" stroke="none" />
        </svg>
        {exporting === "image" ? "Exporting…" : "PNG"}
      </button>

      <button
        onClick={handlePDF}
        disabled={!!exporting}
        title="Export as PDF"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 1h5.5L10 3.5V11H2V1z" />
          <path d="M7 1v3h3" />
          <line x1="4" y1="6" x2="8" y2="6" />
          <line x1="4" y1="8" x2="7" y2="8" />
        </svg>
        {exporting === "pdf" ? "Exporting…" : "PDF"}
      </button>
    </div>
  );
}
