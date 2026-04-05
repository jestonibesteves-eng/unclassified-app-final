"use client";

import { createContext, useContext, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";

type ToastType = "success" | "error" | "info" | "warning";

type Toast = {
  id: number;
  message: string;
  type: ToastType;
};

type ToastContextValue = {
  toast: (message: string, type?: ToastType) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx.toast;
}

const ICONS: Record<ToastType, string> = {
  success: "✓",
  error: "✕",
  warning: "!",
  info: "i",
};

const STYLES: Record<ToastType, { bg: string; icon: string; text: string; close: string }> = {
  success: {
    bg: "bg-emerald-600",
    icon: "bg-emerald-500 text-white",
    text: "text-white",
    close: "text-emerald-200 hover:text-white",
  },
  error: {
    bg: "bg-red-600",
    icon: "bg-red-500 text-white",
    text: "text-white",
    close: "text-red-200 hover:text-white",
  },
  warning: {
    bg: "bg-amber-500",
    icon: "bg-amber-400 text-white",
    text: "text-white",
    close: "text-amber-100 hover:text-white",
  },
  info: {
    bg: "bg-blue-600",
    icon: "bg-blue-500 text-white",
    text: "text-white",
    close: "text-blue-200 hover:text-white",
  },
};

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: number) => void }) {
  const s = STYLES[toast.type];
  return (
    <div
      className={`flex items-center gap-3 ${s.bg} rounded-xl shadow-lg overflow-hidden w-80 pointer-events-auto px-4 py-3`}
      style={{ animation: "toast-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) both" }}
    >
      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${s.icon}`}>
        {ICONS[toast.type]}
      </div>
      <p className={`flex-1 text-[13px] font-semibold leading-snug ${s.text}`}>
        {toast.message}
      </p>
      <button
        onClick={() => onRemove(toast.id)}
        className={`flex-shrink-0 transition-colors text-lg leading-none ${s.close}`}
      >
        ×
      </button>
    </div>
  );
}

function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: number) => void }) {
  if (toasts.length === 0) return null;
  return createPortal(
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateX(100%); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onRemove={onRemove} />
      ))}
    </div>,
    document.body
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, type: ToastType = "info") => {
    const id = ++counter.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => remove(id), 4000);
  }, [remove]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={remove} />
    </ToastContext.Provider>
  );
}
