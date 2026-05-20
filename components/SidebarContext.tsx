"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

type SidebarCtx = {
  open: boolean;
  toggle: () => void;
  close: () => void;
  collapsed: boolean;
  toggleCollapsed: () => void;
};

const SidebarContext = createContext<SidebarCtx>({
  open: false,
  toggle: () => {},
  close: () => {},
  collapsed: false,
  toggleCollapsed: () => {},
});

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Restore collapsed state from localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    const stored = localStorage.getItem("sidebar-collapsed");
    if (stored === "true") setCollapsed(true);
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar-collapsed", String(next));
      return next;
    });
  }

  return (
    <SidebarContext.Provider
      value={{
        open,
        toggle: () => setOpen((v) => !v),
        close: () => setOpen(false),
        collapsed,
        toggleCollapsed,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export const useSidebar = () => useContext(SidebarContext);
