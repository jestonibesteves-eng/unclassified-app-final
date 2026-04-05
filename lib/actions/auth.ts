"use server";

import { signIn } from "@/auth";
import { AuthError } from "next-auth";

export async function loginAction(username: string, password: string) {
  try {
    await signIn("credentials", { username, password, redirectTo: "/" });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Invalid username or password." };
    }
    // Re-throw redirect — Next.js handles it automatically
    throw error;
  }
}
