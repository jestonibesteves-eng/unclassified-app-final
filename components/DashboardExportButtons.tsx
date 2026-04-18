"use client";

import { useState } from "react";

export default function DashboardExportButtons() {
  const [exporting, setExporting] = useState<"image" | "pdf" | null>(null);

  async function capture() {
    const el = document.getElementById("dashboard-content");
    if (!el) throw new Error("Dashboard content not found");
    const { toPng } = await import("html-to-image");
    const pixelRatio = 2;
    const pad = 40; // CSS px of whitespace on each edge
    const fullWidth  = el.scrollWidth;
    const fullHeight = el.scrollHeight;
    // Double-render to ensure fonts/icons are loaded
    await toPng(el, { pixelRatio, backgroundColor: "#f9fafb", width: fullWidth, height: fullHeight });
    const raw = await toPng(el, { pixelRatio, backgroundColor: "#f9fafb", width: fullWidth, height: fullHeight });

    // Draw onto a padded canvas
    const img = new Image();
    img.src = raw;
    await new Promise<void>((res) => { img.onload = () => res(); });
    const canvas = document.createElement("canvas");
    const scaledPad = pad * pixelRatio;
    canvas.width  = img.width  + scaledPad * 2;
    canvas.height = img.height + scaledPad * 2;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#f9fafb";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, scaledPad, scaledPad);
    return canvas.toDataURL("image/png");
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

  /* Shared download arrow icon */
  const IconDownload = () => (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5.5" y1="1" x2="5.5" y2="7" />
      <polyline points="3 4.5 5.5 7 8 4.5" />
      <line x1="1.5" y1="10" x2="9.5" y2="10" />
    </svg>
  );

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-gray-400 font-medium mr-0.5">Export:</span>

      <button
        onClick={handleImage}
        disabled={!!exporting}
        title="Export dashboard as PNG image"
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
      >
        <IconDownload />
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="1" width="10" height="10" rx="1.5" />
          <path d="M1 8l2.5-2.5 2 2L8 5l3 3" />
          <circle cx="8.5" cy="3.5" r="0.8" fill="currentColor" stroke="none" />
        </svg>
        {exporting === "image" ? "Exporting…" : "PNG"}
      </button>

      <button
        onClick={handlePDF}
        disabled={!!exporting}
        title="Export dashboard as PDF"
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
      >
        <IconDownload />
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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
