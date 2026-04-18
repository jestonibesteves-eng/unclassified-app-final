import { prisma } from "@/lib/db";

const TOKEN_KEY = "public_dashboard_token";

export async function validatePublicToken(candidate: string): Promise<boolean> {
  const setting = await prisma.setting.findUnique({ where: { key: TOKEN_KEY } });
  return !!setting && setting.value === candidate;
}
