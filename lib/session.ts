import { SignJWT, jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? "dar-region5-fallback-secret"
);

export type SessionUser = {
  id: string;
  username: string;
  full_name: string;
  role: string;
  office_level: string;
  province: string | null;
  municipality: string | null;
  must_change_password: boolean;
};

export const SESSION_COOKIE = "dar_session";

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({ user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(SECRET);
}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return (payload as { user: SessionUser }).user;
  } catch {
    return null;
  }
}
