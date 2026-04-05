import type { NextAuthConfig } from "next-auth";

// Lightweight config — no Prisma/Node.js imports — safe for Edge runtime (middleware)
export const authConfig: NextAuthConfig = {
  secret: process.env.AUTH_SECRET,
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;

      const isLoginPage = pathname === "/login";
      const isPublicApi = pathname.startsWith("/api/auth");

      if (isPublicApi) return true;
      if (!isLoggedIn && !isLoginPage) return false; // redirect to /login
      if (isLoggedIn && isLoginPage) {
        return Response.redirect(new URL("/", request.nextUrl.origin));
      }

      // Force password change on first login
      const mustChange = (auth?.user as { must_change_password?: boolean })?.must_change_password;
      if (isLoggedIn && mustChange && pathname !== "/change-password") {
        return Response.redirect(new URL("/change-password", request.nextUrl.origin));
      }

      return true;
    },
  },
  providers: [], // filled in by auth.ts
};
