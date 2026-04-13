import { SignJWT, jwtVerify } from "jose";

const authSecret = process.env.AUTH_SECRET;
if (!authSecret) throw new Error("AUTH_SECRET environment variable is required but not set.");
const SECRET = new TextEncoder().encode(authSecret);

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
    .setExpirationTime("1h")
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
