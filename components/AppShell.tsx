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
