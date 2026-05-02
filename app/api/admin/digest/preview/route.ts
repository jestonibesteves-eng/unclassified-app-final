import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";
import { getDigestData, getWeekBounds } from "@/lib/digest";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const user  = token ? await verifySessionToken(token) : null;
  if (!user || user.role !== "super_admin")
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const { searchParams } = req.nextUrl;
  const level    = searchParams.get("level");
  const province = searchParams.get("province");

  if (!level || !["regional", "provincial"].includes(level))
    return NextResponse.json({ error: "Query param 'level' must be 'regional' or 'provincial'." }, { status: 400 });
  if (level === "provincial" && !province)
    return NextResponse.json({ error: "Query param 'province' is required when level=provincial." }, { status: 400 });

  const { weekStart, weekEnd } = getWeekBounds();
  const data = await getDigestData(
    weekStart,
    weekEnd,
    level === "provincial" ? { level: "provincial", province: province! } : { level: "regional" }
  );

  return NextResponse.json({ weekStart, weekEnd, data });
}
