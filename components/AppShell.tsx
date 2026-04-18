"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import MobileHeader from "@/components/MobileHeader";

const NO_SHELL_EXACT = ["/login", "/change-password"];
const NO_SHELL_PREFIX = ["/view/"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
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
        <div className="hidden md:block w-64 flex-shrink-0" aria-hidden="true" />
        <main className="flex-1 min-w-0 min-h-dvh bg-gray-50 flex flex-col">
          <MobileHeader />
          <div className="flex-1 p-6">{children}</div>
        </main>
      </div>
    </>
  );
}
