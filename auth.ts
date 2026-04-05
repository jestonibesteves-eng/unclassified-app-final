import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { authConfig } from "./auth.config";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string;
      role: string;
      office_level: string;
      province: string | null;
      municipality: string | null;
      must_change_password: boolean;
    } & DefaultSession["user"];
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        username: { label: "Username" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        if (!credentials?.username || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { username: credentials.username as string },
        });

        if (!user || !user.is_active) return null;

        const valid = await bcrypt.compare(
          credentials.password as string,
          user.password_hash
        );
        if (!valid) return null;

        return {
          id: String(user.id),
          name: user.full_name,
          username: user.username,
          role: user.role,
          office_level: user.office_level,
          province: user.province,
          municipality: user.municipality,
          must_change_password: user.must_change_password,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        const u = user as Record<string, unknown>;
        token["username"] = u["username"];
        token["role"] = u["role"];
        token["office_level"] = u["office_level"];
        token["province"] = u["province"] ?? null;
        token["municipality"] = u["municipality"] ?? null;
        token["must_change_password"] = u["must_change_password"];
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.sub ?? "";
      session.user.username = (token["username"] as string) ?? "";
      session.user.role = (token["role"] as string) ?? "";
      session.user.office_level = (token["office_level"] as string) ?? "";
      session.user.province = (token["province"] as string | null) ?? null;
      session.user.municipality = (token["municipality"] as string | null) ?? null;
      session.user.must_change_password = (token["must_change_password"] as boolean) ?? false;
      return session;
    },
  },
});
