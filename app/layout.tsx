import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/AppShell";
import { ToastProvider } from "@/components/Toast";
import { UserProvider } from "@/components/UserContext";
import { SidebarProvider } from "@/components/SidebarContext";

const ibmPlex = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ibm",
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
    <html lang="en" className={ibmPlex.variable} suppressHydrationWarning>
      <body className="font-ibm bg-gray-50">
        <UserProvider>
          <SidebarProvider>
            <ToastProvider>
              <AppShell>{children}</AppShell>
            </ToastProvider>
          </SidebarProvider>
        </UserProvider>
      </body>
    </html>
  );
}
