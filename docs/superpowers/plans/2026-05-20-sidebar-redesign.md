# Sidebar Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the sidebar to the L3-A "Rich Header" aesthetic — forest green gradient header, color-coded icon chips, collapsible desktop rail (256px ↔ 52px), and a mobile slide-in drawer.

**Architecture:** Extend `SidebarContext` with `collapsed` state (persisted to `localStorage`), rewrite `Sidebar.tsx` with the new design and collapsed/expanded variants, update `AppShell.tsx` to drive the content spacer width from context, and restyle `MobileHeader.tsx` to match the green palette.

**Tech Stack:** Next.js 16 (app router), React 19, Tailwind CSS v4, `next/font/google` (JetBrains Mono), CSS transitions (no animation libraries)

> **⚠️ Next.js note:** Per AGENTS.md, this project runs a potentially non-standard Next.js version. Before touching anything Next.js-specific (e.g., `next/font`), check `node_modules/next/dist/docs/` for current API.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `components/SidebarContext.tsx` | Modify | Add `collapsed` boolean + `toggleCollapsed()` + localStorage persistence |
| `components/AppShell.tsx` | Modify | Drive spacer `width` from sidebar collapsed state |
| `app/layout.tsx` | Modify | Add JetBrains Mono via `next/font/google` |
| `app/globals.css` | Modify | Register `--font-jetbrains` CSS variable in `@theme` |
| `components/Sidebar.tsx` | Full rewrite | New visual design, expanded + collapsed states, icon chips, tooltips |
| `components/MobileHeader.tsx` | Modify | Update palette to match green header |

---

## Task 1: Add JetBrains Mono font

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Add JetBrains Mono import to layout**

In `app/layout.tsx`, add `JetBrains_Mono` alongside the existing `IBM_Plex_Sans` import and apply the variable to `<html>`:

```tsx
import type { Metadata } from "next";
import { IBM_Plex_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/AppShell";
import { ToastProvider } from "@/components/Toast";
import { UserProvider } from "@/components/UserContext";
import { SidebarProvider } from "@/components/SidebarContext";
import SessionExpiryWarning from "@/components/SessionExpiryWarning";

const ibmPlex = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ibm",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-jetbrains",
});

export const metadata: Metadata = {
  title: "Unclassified ARRs Data Management System",
  description: "DAR Region V - LTID Group",
  icons: {
    icon: "/dar-logo-square.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${ibmPlex.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <body className="font-ibm bg-gray-50">
        <UserProvider>
          <SidebarProvider>
            <ToastProvider>
              <AppShell>{children}</AppShell>
              <SessionExpiryWarning />
            </ToastProvider>
          </SidebarProvider>
        </UserProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Register font variable in globals.css**

In `app/globals.css`, add `--font-jetbrains` to the `@theme` block:

```css
@theme {
  --font-ibm: var(--font-ibm);
  --font-jetbrains: var(--font-jetbrains);

  /* Typography scale — used consistently across all modules */
  --text-page-title: 1.375rem;
  --text-section: 0.875rem;
  --text-body: 0.875rem;
  --text-label: 0.75rem;
  --text-mono: 0.8125rem;
}
```

- [ ] **Step 3: Verify font loads**

Run `npm run dev`. Open the app, open DevTools → Network → filter by `jetbrains`. Confirm the font file is fetched. No console errors.

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx app/globals.css
git commit -m "feat: add JetBrains Mono font for sidebar redesign"
```

---

## Task 2: Extend SidebarContext with collapsed state

**Files:**
- Modify: `components/SidebarContext.tsx`

- [ ] **Step 1: Rewrite SidebarContext with collapsed state**

Replace the entire file with:

```tsx
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
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
npx tsc --noEmit
```

Expected: no errors related to `SidebarContext`.

- [ ] **Step 3: Verify context still works**

Run `npm run dev`. Confirm the existing app still loads and the sidebar opens/closes on mobile. The new `collapsed` field defaults to `false` — nothing should visually change yet.

- [ ] **Step 4: Commit**

```bash
git add components/SidebarContext.tsx
git commit -m "feat: extend SidebarContext with collapsible state + localStorage persistence"
```

---

## Task 3: Update AppShell spacer to respond to collapsed state

**Files:**
- Modify: `components/AppShell.tsx`

- [ ] **Step 1: Rewrite AppShell**

Replace the entire file with:

```tsx
"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import MobileHeader from "@/components/MobileHeader";
import { useSidebar } from "@/components/SidebarContext";

const NO_SHELL_EXACT = ["/login", "/change-password"];
const NO_SHELL_PREFIX = ["/view/", "/unsubscribe"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { collapsed } = useSidebar();

  const isNoShell =
    NO_SHELL_EXACT.some((p) => pathname === p) ||
    NO_SHELL_PREFIX.some((p) => pathname.startsWith(p));

  if (isNoShell) {
    return <>{children}</>;
  }

  return (
    <>
      <Sidebar />
      <div className="flex flex-1 min-h-dvh">
        {/* Spacer mirrors sidebar width — transitions in sync with sidebar */}
        <div
          className="hidden md:block flex-shrink-0"
          style={{
            width: collapsed ? "52px" : "256px",
            transition: "width 250ms ease",
          }}
          aria-hidden="true"
        />
        <main className="flex-1 min-w-0 min-h-dvh bg-gray-50 flex flex-col">
          <MobileHeader />
          <div className="flex-1 p-6">{children}</div>
        </main>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add components/AppShell.tsx
git commit -m "feat: drive AppShell spacer width from sidebar collapsed state"
```

---

## Task 4: Rewrite Sidebar.tsx — new design + collapsible behavior

**Files:**
- Full rewrite: `components/Sidebar.tsx`

This is the main task. The new sidebar has:
- Forest green gradient header with logo chip, badge, and toggle button
- Color-coded icon chips per nav group
- Smooth width transition (256px ↔ 52px)
- Text/labels hidden when collapsed; icon chips + dividers remain
- Tooltips (`title` attribute) on nav items when collapsed
- Mobile: full overlay drawer unchanged in behavior

- [ ] **Step 1: Write the new Sidebar.tsx**

Replace the entire file with:

```tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useUser } from "@/components/UserContext";
import { useSidebar } from "@/components/SidebarContext";

/* ─── Chip color map ─── */
type ChipColor = "green" | "blue" | "amber" | "rose" | "violet";

const CHIP_CLASSES: Record<ChipColor, string> = {
  green:  "bg-[#dcfce7] text-[#15803d]",
  blue:   "bg-[#dbeafe] text-[#1d4ed8]",
  amber:  "bg-[#fef3c7] text-[#d97706]",
  rose:   "bg-[#fce7f3] text-[#be185d]",
  violet: "bg-[#ede9fe] text-[#7c3aed]",
};

function IconChip({ color, children, className = "" }: { color: ChipColor; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`flex-shrink-0 w-[18px] h-[18px] rounded-[5px] flex items-center justify-center text-[8px] ${CHIP_CLASSES[color]} ${className}`}
    >
      {children}
    </span>
  );
}

/* ─── SVG icons (10×10 for chip) ─── */
function IconDashboard() {
  return (
    <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="1" width="5" height="5" rx="1" />
      <rect x="8" y="1" width="5" height="5" rx="1" />
      <rect x="1" y="8" width="5" height="5" rx="1" />
      <rect x="8" y="8" width="5" height="5" rx="1" />
    </svg>
  );
}
function IconRecords() {
  return (
    <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="1.5" width="12" height="11" rx="1.5" />
      <line x1="1" y1="5" x2="13" y2="5" />
      <line x1="4" y1="8" x2="10" y2="8" />
      <line x1="4" y1="10.5" x2="8" y2="10.5" />
    </svg>
  );
}
function IconBatch() {
  return (
    <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="1.5" width="12" height="11" rx="1.5" />
      <line x1="1" y1="5" x2="13" y2="5" />
      <line x1="3.5" y1="8" x2="7.5" y2="8" />
      <line x1="3.5" y1="10.5" x2="6" y2="10.5" />
      <path d="M10 7.5 L11.5 9 L10 10.5" />
    </svg>
  );
}
function IconARB() {
  return (
    <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="4.5" r="2.5" />
      <path d="M1.5 13c0-3.04 2.46-5 5.5-5s5.5 1.96 5.5 5" />
      <polyline points="9.5 1.5 11.5 3.5 9.5 5.5" />
      <line x1="8" y1="3.5" x2="11.5" y2="3.5" />
    </svg>
  );
}
function IconAudit() {
  return (
    <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="7" r="5.5" />
      <polyline points="7 4 7 7.5 9.5 9" />
    </svg>
  );
}
function IconUsers() {
  return (
    <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5" cy="4" r="2.5" />
      <path d="M1 12c0-2.21 1.79-4 4-4s4 1.79 4 4" />
      <circle cx="11" cy="5" r="1.75" />
      <path d="M13 12c0-1.66-1.34-3-3-3" />
    </svg>
  );
}
function IconBackup() {
  return (
    <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="7" cy="4" rx="5" ry="2" />
      <path d="M2 4v3c0 1.1 2.24 2 5 2s5-.9 5-2V4" />
      <path d="M2 7v3c0 1.1 2.24 2 5 2s5-.9 5-2V7" />
    </svg>
  );
}
function IconActivity() {
  return (
    <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 9 3.5 5.5 5.5 7.5 8 3.5 10.5 6.5 13 2" />
      <line x1="1" y1="12" x2="13" y2="12" />
    </svg>
  );
}
function IconTarget() {
  return (
    <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="7" r="5.5" />
      <circle cx="7" cy="7" r="2.5" />
      <line x1="7" y1="1.5" x2="7" y2="3" />
      <line x1="7" y1="11" x2="7" y2="12.5" />
      <line x1="1.5" y1="7" x2="3" y2="7" />
      <line x1="11" y1="7" x2="12.5" y2="7" />
    </svg>
  );
}
function IconDigest() {
  return (
    <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="2.5" width="12" height="9" rx="1.5" />
      <polyline points="1 2.5 7 8 13 2.5" />
    </svg>
  );
}
function IconSignOut() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 2H2.5A1.5 1.5 0 001 3.5v7A1.5 1.5 0 002.5 12H5" />
      <polyline points="9.5 9.5 13 7 9.5 4.5" />
      <line x1="13" y1="7" x2="5" y2="7" />
    </svg>
  );
}
function IconChevronLeft() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 2 4 7 9 12" />
    </svg>
  );
}
function IconChevronRight() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="5 2 10 7 5 12" />
    </svg>
  );
}
function IconClose() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="3" y1="3" x2="13" y2="13" />
      <line x1="13" y1="3" x2="3" y2="13" />
    </svg>
  );
}

/* ─── Nav structure ─── */
type NavItem = {
  href: string;
  label: string;
  Icon: () => React.ReactElement;
  chip: ChipColor;
  children?: { href: string; label: string }[];
  superAdminOnly?: boolean;
};
type NavGroup = {
  label: string | null;
  items: NavItem[];
  minRole?: "editor" | "admin";
};

const ALL_NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [
      { href: "/",        label: "Dashboard",      Icon: IconDashboard, chip: "green" },
      { href: "/records", label: "Records Browser", Icon: IconRecords,   chip: "green" },
    ],
  },
  {
    label: "Operations",
    minRole: "editor",
    items: [
      {
        href: "/batch/lh-info",
        label: "Batch Update (LH)",
        Icon: IconBatch,
        chip: "blue",
        children: [
          { href: "/batch/lh-info",     label: "LH Info Update" },
          { href: "/batch/area-amount", label: "Area & Amount Confirmation" },
        ],
      },
      {
        href: "/arbs/upload",
        label: "ARB Batch Update",
        Icon: IconARB,
        chip: "blue",
        children: [
          { href: "/arbs/upload",     label: "ARB Upload & Viewer" },
          { href: "/arbs/info-update", label: "ARB Info Update" },
        ],
      },
    ],
  },
  {
    label: "Analytics",
    minRole: "admin",
    items: [
      { href: "/audit", label: "Audit Log", Icon: IconAudit, chip: "rose" },
    ],
  },
  {
    label: "Admin",
    minRole: "admin",
    items: [
      { href: "/users",                    label: "User Management",     Icon: IconUsers,    chip: "amber"  },
      { href: "/admin/commitment-targets", label: "Commitment Targets",  Icon: IconTarget,   chip: "violet", superAdminOnly: true },
      { href: "/admin/activity",           label: "DARPO Activity",      Icon: IconActivity, chip: "violet", superAdminOnly: true },
      { href: "/digest",                   label: "Weekly Digest",       Icon: IconDigest,   chip: "violet", superAdminOnly: true },
      { href: "/admin/backup",             label: "Backup",              Icon: IconBackup,   chip: "violet", superAdminOnly: true },
    ],
  },
];

/* ─── Sidebar ─── */
export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const { user, isAdmin, isEditor } = useUser();
  const isSuperAdmin = user?.role === "super_admin";
  const { open, close, collapsed, toggleCollapsed } = useSidebar();

  useEffect(() => {
    close();
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  function canSeeGroup(group: NavGroup) {
    if (!group.minRole) return true;
    if (group.minRole === "admin") return isAdmin;
    if (group.minRole === "editor") return isEditor;
    return true;
  }

  const NAV_GROUPS = ALL_NAV_GROUPS.map((g) => {
    if (g.label === "Operations") {
      const items = isEditor ? g.items : g.items.filter((i) => i.href === "/arbs/upload");
      return { ...g, items, minRole: undefined };
    }
    if (g.label === "Admin") {
      const items = g.items.filter((i) => !i.superAdminOnly || isSuperAdmin);
      return { ...g, items };
    }
    return g;
  }).filter((g) => g.items.length > 0 && canSeeGroup(g));

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  /* User initials for avatar */
  const initials = user?.full_name
    ?.split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase() ?? "?";

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={`fixed inset-0 z-30 bg-black/50 md:hidden transition-opacity duration-300 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={close}
        aria-hidden="true"
      />

      <aside
        className={`
          fixed inset-y-0 left-0 z-40
          flex flex-col overflow-hidden
          bg-white border-r border-slate-200
          transition-transform duration-300 ease-in-out
          ${open ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
        style={{
          width: collapsed ? "52px" : "256px",
          transition: "width 250ms ease, transform 300ms ease-in-out",
        }}
      >
        {/* ── Header ── */}
        <div
          className="relative flex-shrink-0 overflow-hidden"
          style={{
            background: "linear-gradient(135deg, #14532d 0%, #15803d 60%, #16a34a 100%)",
            padding: collapsed ? "14px 0 12px" : "14px 12px 12px",
            transition: "padding 250ms ease",
          }}
        >
          {/* Shine overlay */}
          <div
            className="absolute pointer-events-none"
            style={{
              top: -20, right: -20, width: 90, height: 90,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%)",
            }}
          />

          {collapsed ? (
            /* Collapsed header: logo only + expand button */
            <div className="flex flex-col items-center gap-2 relative z-10">
              <div
                className="w-[26px] h-[26px] rounded-[7px] flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
                style={{ background: "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.25)" }}
              >
                D
              </div>
              <button
                onClick={toggleCollapsed}
                className="w-[20px] h-[20px] rounded-[5px] flex items-center justify-center text-white/70 hover:text-white hover:bg-white/20 transition-all duration-150"
                style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)" }}
                aria-label="Expand sidebar"
              >
                <IconChevronRight />
              </button>
            </div>
          ) : (
            /* Expanded header */
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-[26px] h-[26px] rounded-[7px] flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
                  style={{ background: "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.25)" }}
                >
                  D
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[8px] font-bold text-white/95 leading-tight" style={{ fontFamily: "var(--font-jetbrains)" }}>
                    DAR · Bicol Region
                  </p>
                  <p className="text-[5.5px] text-white/50">ARR System</p>
                </div>
                {/* Desktop collapse button */}
                <button
                  onClick={toggleCollapsed}
                  className="hidden md:flex w-[20px] h-[20px] rounded-[5px] items-center justify-center text-white/70 hover:text-white hover:bg-white/20 transition-all duration-150 flex-shrink-0"
                  style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)" }}
                  aria-label="Collapse sidebar"
                >
                  <IconChevronLeft />
                </button>
                {/* Mobile close button */}
                <button
                  onClick={close}
                  className="md:hidden flex w-[20px] h-[20px] rounded-[5px] items-center justify-center text-white/70 hover:text-white hover:bg-white/20 transition-all duration-150 flex-shrink-0"
                  style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)" }}
                  aria-label="Close navigation"
                >
                  <IconClose />
                </button>
              </div>
              {/* Online badge */}
              <div
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[5.5px] text-white/75"
                style={{ background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.2)" }}
              >
                <span className="w-[4px] h-[4px] rounded-full bg-[#4ade80] flex-shrink-0" style={{ boxShadow: "0 0 4px #4ade80" }} />
                Online · v{process.env.NEXT_PUBLIC_GIT_VERSION}
              </div>
            </div>
          )}
        </div>

        {/* ── Navigation ── */}
        <nav
          className="flex-1 overflow-y-auto overflow-x-hidden"
          style={{ padding: collapsed ? "8px 0" : "8px 0" }}
        >
          {NAV_GROUPS.map((group, gi) => (
            <div key={gi}>
              {/* Section label — hidden when collapsed */}
              {group.label && !collapsed && (
                <p
                  className="text-[5px] font-semibold uppercase tracking-[0.2em] text-slate-400 px-3 pt-5 pb-1"
                  style={{ fontFamily: "var(--font-jetbrains)" }}
                >
                  {group.label}
                </p>
              )}
              {/* Divider between groups when collapsed */}
              {group.label && collapsed && gi > 0 && (
                <div className="mx-auto my-2 h-px bg-slate-100" style={{ width: 24 }} />
              )}

              <div className={collapsed ? "flex flex-col items-center gap-0.5 px-0" : "space-y-0.5 px-2"}>
                {group.items.map(({ href, label, Icon, chip, children }) => {
                  const parentActive = children
                    ? children.some((c) => pathname === c.href)
                    : pathname === href;

                  return (
                    <div key={href}>
                      {collapsed ? (
                        /* Collapsed: chip-only button */
                        <Link
                          href={href}
                          title={label}
                          className={`
                            w-[34px] h-[34px] rounded-[8px] flex items-center justify-center relative
                            transition-all duration-150
                            ${parentActive ? "bg-[#f0fdf4]" : "hover:bg-slate-50"}
                          `}
                        >
                          {parentActive && (
                            <span className="absolute left-0 top-[20%] bottom-[20%] w-[2px] bg-[#16a34a] rounded-r-[2px]" />
                          )}
                          <IconChip color={chip} className={parentActive ? "opacity-100" : "opacity-50"}>
                            <Icon />
                          </IconChip>
                        </Link>
                      ) : (
                        /* Expanded: full item */
                        <Link
                          href={href}
                          className={`
                            group flex items-center gap-2 px-2.5 py-[5px] rounded-[7px]
                            transition-all duration-150 relative
                            ${parentActive
                              ? "bg-[#f0fdf4] text-[#14532d] font-semibold"
                              : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                            }
                          `}
                          style={{ fontFamily: "var(--font-jetbrains)", fontSize: "7.5px" }}
                        >
                          {parentActive && (
                            <span className="absolute left-0 top-0 bottom-0 w-[2px] bg-[#16a34a] rounded-r-[2px]" />
                          )}
                          <IconChip color={chip} className={parentActive ? "opacity-100" : "opacity-50"}>
                            <Icon />
                          </IconChip>
                          <span className="flex-1 truncate">{label}</span>
                        </Link>
                      )}

                      {/* Child items — only shown when expanded */}
                      {children && !collapsed && (
                        <div className="ml-4 mt-0.5 mb-0.5 pl-3 space-y-0.5 border-l border-slate-100">
                          {children.map((child) => {
                            const childActive = pathname === child.href;
                            return (
                              <Link
                                key={child.href}
                                href={child.href}
                                className={`
                                  flex items-center gap-2 px-2 py-1.5 rounded-[6px]
                                  transition-all duration-150
                                  ${childActive
                                    ? "text-[#14532d] font-semibold bg-[#f0fdf4]"
                                    : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                                  }
                                `}
                                style={{ fontFamily: "var(--font-jetbrains)", fontSize: "7px" }}
                              >
                                <span className={`w-1 h-1 rounded-full flex-shrink-0 ${childActive ? "bg-[#16a34a]" : "bg-slate-300"}`} />
                                <span className="flex-1 truncate">{child.label}</span>
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* ── Footer ── */}
        <div
          className="flex-shrink-0 border-t border-slate-100 bg-[#fafafa]"
          style={{ padding: collapsed ? "8px 0" : "8px 10px" }}
        >
          {collapsed ? (
            /* Collapsed footer: avatar only */
            <div className="flex flex-col items-center gap-2">
              <div
                title={user?.full_name ?? ""}
                className="w-[26px] h-[26px] rounded-[8px] flex items-center justify-center text-[10px] font-bold text-white"
                style={{ background: "linear-gradient(135deg, #16a34a, #4ade80)" }}
              >
                {initials}
              </div>
            </div>
          ) : (
            /* Expanded footer */
            <>
              {user && (
                <div className="flex items-center gap-2 px-1 py-1.5 rounded-[8px] mb-1">
                  <div
                    className="w-[22px] h-[22px] rounded-[7px] flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                    style={{ background: "linear-gradient(135deg, #16a34a, #4ade80)" }}
                  >
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-[6.5px] font-semibold text-slate-800 truncate"
                      style={{ fontFamily: "var(--font-jetbrains)" }}
                    >
                      {user.full_name}
                    </p>
                    <p
                      className="text-[5.5px] text-slate-400 capitalize"
                      style={{ fontFamily: "var(--font-jetbrains)" }}
                    >
                      {user.role.replace("_", " ")}
                    </p>
                  </div>
                </div>
              )}
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-[7px] text-red-400/70 hover:text-red-500 hover:bg-red-50 transition-all duration-150 disabled:opacity-50"
                style={{ fontFamily: "var(--font-jetbrains)", fontSize: "7.5px" }}
              >
                <IconSignOut />
                {loggingOut ? "Signing out…" : "Sign Out"}
              </button>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
npx tsc --noEmit
```

Fix any type errors before proceeding.

- [ ] **Step 3: Manual verification — visual**

Run `npm run dev`. Check:
- Sidebar renders with green gradient header ✓
- Color-coded chips visible next to each nav item ✓
- Active route shows green left border + `#f0fdf4` background ✓
- JetBrains Mono used in nav text ✓
- Online badge with green dot in header ✓

- [ ] **Step 4: Manual verification — collapse (desktop)**

On desktop (≥768px):
- Click `‹` toggle button → sidebar collapses to 52px icon rail ✓
- Content spacer narrows in sync (250ms) ✓
- Icon chips visible, labels hidden ✓
- Section dividers appear between groups ✓
- Click `›` → sidebar expands back to 256px ✓
- Reload page → collapsed state preserved from localStorage ✓
- Hover a collapsed nav item → browser tooltip shows item label ✓

- [ ] **Step 5: Manual verification — mobile**

At viewport < 768px:
- Sidebar hidden by default ✓
- Hamburger in top bar opens drawer ✓
- Clicking backdrop closes drawer ✓
- Navigating to a route closes drawer ✓
- Collapse toggle button not visible on mobile ✓

- [ ] **Step 6: Commit**

```bash
git add components/Sidebar.tsx
git commit -m "feat: rewrite Sidebar with L3-A design, collapsible rail, color-coded chips"
```

---

## Task 5: Update MobileHeader to match green palette

**Files:**
- Modify: `components/MobileHeader.tsx`

- [ ] **Step 1: Rewrite MobileHeader**

Replace the entire file with:

```tsx
"use client";

import { useSidebar } from "@/components/SidebarContext";

function HamburgerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="2" y1="4.5" x2="16" y2="4.5" />
      <line x1="2" y1="9" x2="16" y2="9" />
      <line x1="2" y1="13.5" x2="16" y2="13.5" />
    </svg>
  );
}

export default function MobileHeader() {
  const { toggle } = useSidebar();
  return (
    <div className="md:hidden sticky top-0 z-30 flex items-center gap-3 h-12 px-4 bg-white/95 backdrop-blur-sm border-b border-slate-100">
      <button
        onClick={toggle}
        className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 hover:bg-slate-100 active:scale-95 transition-all duration-150"
        aria-label="Toggle navigation"
      >
        <HamburgerIcon />
      </button>
      {/* Logo chip */}
      <div
        className="w-[22px] h-[22px] rounded-[6px] flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
        style={{ background: "linear-gradient(135deg, #14532d, #16a34a)" }}
      >
        D
      </div>
      <span
        className="text-[8px] font-semibold text-slate-700 tracking-tight truncate"
        style={{ fontFamily: "var(--font-jetbrains)" }}
      >
        Unclassified ARRs
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Manual verification**

On mobile viewport:
- Header shows hamburger + green logo chip + title ✓
- Tapping hamburger opens the sidebar drawer ✓
- Title uses JetBrains Mono ✓

- [ ] **Step 3: Commit**

```bash
git add components/MobileHeader.tsx
git commit -m "feat: update MobileHeader palette and logo chip to match new sidebar"
```

---

## Task 6: Cross-browser and responsive verification

No code changes — this is a verification-only task.

- [ ] **Step 1: Desktop wide (≥1280px)**
  - Expanded sidebar: all text visible, header gradient renders cleanly
  - Collapsed sidebar: 52px rail, chips visible, content fills remaining space
  - Toggle persists across page navigations

- [ ] **Step 2: Tablet (768px–1279px)**
  - Sidebar starts expanded (not auto-collapsed)
  - Toggle button functional
  - Content area not squeezed below usable width

- [ ] **Step 3: Mobile (375px)**
  - MobileHeader visible, sidebar hidden
  - Drawer slides in from left, backdrop darkens page
  - Tap backdrop or navigate → drawer closes
  - No horizontal scroll on the page

- [ ] **Step 4: Nested nav items**
  - Navigate to `/batch/lh-info` → parent "Batch Update (LH)" shows active, children visible
  - Navigate to `/arbs/upload` → ARB Batch parent active, children visible
  - Collapse sidebar → child items hidden, parent chip shows active state

- [ ] **Step 5: Role-based rendering**
  - Log in as viewer → only Dashboard + Records visible
  - Log in as editor → Operations group visible
  - Log in as admin → Analytics + Admin groups visible
  - Log in as super_admin → all items including Targets, Activity, Digest, Backup

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: sidebar redesign complete — L3-A Rich Header with collapsible rail"
```
