"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useUser } from "@/components/UserContext";
import { useSidebar } from "@/components/SidebarContext";

/* ─── Thin-stroke SVG icon set (1.25px, rounded caps) ─── */
function IconDashboard() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="1" width="5" height="5" rx="1" />
      <rect x="8" y="1" width="5" height="5" rx="1" />
      <rect x="1" y="8" width="5" height="5" rx="1" />
      <rect x="8" y="8" width="5" height="5" rx="1" />
    </svg>
  );
}
function IconRecords() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="1.5" width="12" height="11" rx="1.5" />
      <line x1="1" y1="5" x2="13" y2="5" />
      <line x1="4" y1="8" x2="10" y2="8" />
      <line x1="4" y1="10.5" x2="8" y2="10.5" />
    </svg>
  );
}
function IconBatch() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
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
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="4.5" r="2.5" />
      <path d="M1.5 13c0-3.04 2.46-5 5.5-5s5.5 1.96 5.5 5" />
      <polyline points="9.5 1.5 11.5 3.5 9.5 5.5" />
      <line x1="8" y1="3.5" x2="11.5" y2="3.5" />
    </svg>
  );
}
function IconAudit() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="7" r="5.5" />
      <polyline points="7 4 7 7.5 9.5 9" />
    </svg>
  );
}
function IconUsers() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5" cy="4" r="2.5" />
      <path d="M1 12c0-2.21 1.79-4 4-4s4 1.79 4 4" />
      <circle cx="11" cy="5" r="1.75" />
      <path d="M13 12c0-1.66-1.34-3-3-3" />
    </svg>
  );
}
function IconClose() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="3" y1="3" x2="13" y2="13" />
      <line x1="13" y1="3" x2="3" y2="13" />
    </svg>
  );
}

/* ─── Nav structure (role-filtered at render time) ─── */
type NavItem = { href: string; label: string; Icon: () => React.ReactElement };
type NavGroup = { label: string | null; items: NavItem[]; minRole?: "editor" | "admin" };

const ALL_NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [
      { href: "/",        label: "Dashboard",       Icon: IconDashboard },
      { href: "/records", label: "Records Browser",  Icon: IconRecords   },
    ],
  },
  {
    label: "Operations",
    minRole: "editor",
    items: [
      { href: "/batch", label: "Batch Update (LH)", Icon: IconBatch },
      { href: "/arbs",  label: "ARB Viewer",   Icon: IconARB   },
    ],
  },
  {
    label: "Analytics",
    minRole: "admin",
    items: [
      { href: "/audit", label: "Audit Log",      Icon: IconAudit },
    ],
  },
  {
    label: "Admin",
    minRole: "admin",
    items: [
      { href: "/users", label: "User Management", Icon: IconUsers },
    ],
  },
];

/* ─── Sidebar ─── */
export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const { user, isAdmin, isEditor } = useUser();
  const { open, close } = useSidebar();

  // Close sidebar on route change (mobile UX)
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
      const items = isEditor
        ? g.items
        : g.items.filter((i) => i.href === "/arbs");
      return { ...g, items, minRole: undefined };
    }
    return g;
  }).filter((g) => g.items.length > 0 && canSeeGroup(g));

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

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
          w-64 flex flex-col overflow-y-auto
          transition-transform duration-300 ease-in-out
          ${open ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
        style={{
          background:
            "radial-gradient(ellipse 140% 35% at 50% 0%, rgba(74,222,128,0.07) 0%, transparent 65%)," +
            "linear-gradient(180deg, #14532d 0%, #0f3d21 55%, #092918 100%)",
        }}
      >
        {/* Grain texture — fixed, non-interactive */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            opacity: 0.035,
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
            backgroundSize: "160px 160px",
          }}
        />

        {/* ── Brand header ── */}
        <div
          className="relative px-5 pt-6 pb-5 flex-shrink-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
        >
          <div className="flex items-center gap-3.5 mb-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/dar-logo.svg"
              alt="DAR Bicol Region — Unclassified ARRs"
              className="flex-shrink-0 w-11 h-11 rounded-full"
              style={{ boxShadow: "0 0 0 1.5px rgba(212,175,55,0.4), 0 3px 10px rgba(0,0,0,0.4)" }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-green-400 leading-none mb-1">
                DAR · Bicol Region
              </p>
              <h1 className="text-[12px] font-bold text-white/90 leading-snug tracking-tight">
                Unclassified ARRs
              </h1>
              <p className="text-[10px] text-green-500/60 leading-none mt-0.5">
                Data Management System
              </p>
            </div>

            {/* Mobile close button */}
            <button
              onClick={close}
              className="md:hidden flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-lg text-green-400/60 hover:text-green-200 hover:bg-white/10 transition-all duration-150"
              aria-label="Close navigation"
            >
              <IconClose />
            </button>
          </div>
        </div>

        {/* ── Navigation ── */}
        <nav className="flex-1 px-3 py-4 space-y-4 relative">
          {NAV_GROUPS.map((group, gi) => (
            <div key={gi}>
              {group.label && (
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-green-700 mb-1.5 px-2.5">
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map(({ href, label, Icon }) => {
                  const active = pathname === href;
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={`
                        group flex items-center gap-2.5 px-2.5 py-2 rounded-[10px]
                        text-[12.5px] font-medium tracking-tight
                        transition-all duration-200
                        ${active
                          ? "text-white"
                          : "text-green-400/60 hover:text-green-100 hover:bg-white/[0.04]"
                        }
                      `}
                      style={active ? {
                        background: "rgba(255,255,255,0.09)",
                        boxShadow:
                          "inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.1), 0 2px 8px rgba(0,0,0,0.2)",
                      } : {}}
                    >
                      <span
                        className={`flex-shrink-0 transition-colors duration-200 ${
                          active
                            ? "text-green-300"
                            : "text-green-700 group-hover:text-green-400"
                        }`}
                      >
                        <Icon />
                      </span>

                      <span className="flex-1 truncate">{label}</span>

                      {active && (
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0 opacity-80" />
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* ── Footer ── */}
        <div
          className="relative px-4 py-4 flex-shrink-0 space-y-3"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
        >
          {user && (
            <div className="px-2.5 py-2 rounded-[10px] bg-white/[0.04] mb-1">
              <p className="text-[12px] font-semibold text-white/80 truncate">{user.full_name}</p>
              <p className="text-[10px] text-green-500/60 capitalize">{user.role.replace("_", " ")} · {user.office_level}</p>
            </div>
          )}
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] text-[12.5px] font-medium text-red-400/70 hover:text-red-300 hover:bg-red-500/10 transition-all duration-200 disabled:opacity-50"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 2H2.5A1.5 1.5 0 001 3.5v7A1.5 1.5 0 002.5 12H5" />
              <polyline points="9.5 9.5 13 7 9.5 4.5" />
              <line x1="13" y1="7" x2="5" y2="7" />
            </svg>
            {loggingOut ? "Signing out…" : "Sign Out"}
          </button>
          <div>
            <p className="text-[10px] font-semibold text-green-700 px-2.5">
              LTID Group &copy; {new Date().getFullYear()}
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
