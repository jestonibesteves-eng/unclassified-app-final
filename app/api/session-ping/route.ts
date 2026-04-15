import { NextResponse } from "next/server";

// Lightweight endpoint whose only purpose is to pass through the middleware,
// which reissues a fresh session token on every authenticated request.
export async function GET() {
  return NextResponse.json({ ok: true });
}
