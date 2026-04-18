import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";
import { randomBytes } from "crypto";

const TOKEN_KEY = "public_dashboard_token";

async function getOrCreateToken(): Promise<string> {
  const existing = await prisma.setting.findUnique({ where: { key: TOKEN_KEY } });
  if (existing) return existing.value;
  const token = randomBytes(16).toString("hex");
  await prisma.setting.create({ data: { key: TOKEN_KEY, value: token } });
  return token;
}

// GET — return current token (super_admin only)
export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionUser = token ? await verifySessionToken(token) : null;
  if (!sessionUser || sessionUser.role !== "super_admin")
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const publicToken = await getOrCreateToken();
  return NextResponse.json({ token: publicToken });
}

// POST — regenerate token (super_admin only)
export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionUser = token ? await verifySessionToken(token) : null;
  if (!sessionUser || sessionUser.role !== "super_admin")
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const newToken = randomBytes(16).toString("hex");
  await prisma.setting.upsert({
    where: { key: TOKEN_KEY },
    update: { value: newToken },
    create: { key: TOKEN_KEY, value: newToken },
  });
  return NextResponse.json({ token: newToken });
}

// Exported for use in the public page token validation
export { validatePublicToken } from "@/lib/public-token";
