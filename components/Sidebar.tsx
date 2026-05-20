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
          { href: "/batch/lh-info",      label: "LH Info Update" },
          { href: "/batch/area-amount",  label: "Area & Amount Confirmation" },
        ],
      },
      {
        href: "/arbs/upload",
        label: "ARB Batch Update",
        Icon: IconARB,
        chip: "blue",
        children: [
          { href: "/arbs/upload",      label: "ARB Upload & Viewer" },
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
      { href: "/users",                    label: "User Management",    Icon: IconUsers,    chip: "amber"                   },
      { href: "/admin/commitment-targets", label: "Commitment Targets", Icon: IconTarget,   chip: "violet", superAdminOnly: true },
      { href: "/admin/activity",           label: "DARPO Activity",     Icon: IconActivity, chip: "violet", superAdminOnly: true },
      { href: "/digest",                   label: "Weekly Digest",      Icon: IconDigest,   chip: "violet", superAdminOnly: true },
      { href: "/admin/backup",             label: "Backup",             Icon: IconBackup,   chip: "violet", superAdminOnly: true },
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
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2">
          {NAV_GROUPS.map((group, gi) => (
            <div key={gi}>
              {group.label && !collapsed && (
                <p
                  className="text-[5px] font-semibold uppercase tracking-[0.2em] text-slate-400 px-3 pt-5 pb-1"
                  style={{ fontFamily: "var(--font-jetbrains)" }}
                >
                  {group.label}
                </p>
              )}
              {group.label && collapsed && gi > 0 && (
                <div className="mx-auto my-2 h-px bg-slate-100" style={{ width: 24 }} />
              )}

              <div className={collapsed ? "flex flex-col items-center gap-0.5" : "space-y-0.5 px-2"}>
                {group.items.map(({ href, label, Icon, chip, children }) => {
                  const parentActive = children
                    ? children.some((c) => pathname === c.href)
                    : pathname === href;

                  return (
                    <div key={href}>
                      {collapsed ? (
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
