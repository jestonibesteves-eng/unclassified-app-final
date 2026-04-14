"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import MobileHeader from "@/components/MobileHeader";

const AUTH_PATHS = ["/login", "/change-password"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuth = AUTH_PATHS.some((p) => pathname === p);

  if (isAuth) {
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
