import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";

type ArbInput = {
  arb_name: string;
  arb_no?: string;
  ep_cloa_no?: string;
  carpable?: string;
  area_allocated: string;
  remarks?: string;
};

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionUser = token ? await verifySessionToken(token) : null;
  if (!sessionUser || !["super_admin", "admin", "editor"].includes(sessionUser.role))
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const body = await req.json();
  const { seqno_darro, arbs, mode } = body as {
    seqno_darro: string;
    arbs: ArbInput[];
    mode: "append" | "replace";
  };

  if (!seqno_darro?.trim()) {
    return NextResponse.json({ error: "SEQNO_DARRO is required." }, { status: 400 });
  }
  if (!arbs || arbs.length === 0) {
    return NextResponse.json({ error: "At least one ARB entry is required." }, { status: 400 });
  }

  const landholding = await prisma.landholding.findUnique({
    where: { seqno_darro: seqno_darro.trim() },
    select: { seqno_darro: true, landowner: true, province_edited: true },
  });

  if (!landholding) {
    return NextResponse.json({ error: `SEQNO_DARRO "${seqno_darro}" not found in the masterlist.` }, { status: 404 });
  }

  // Provincial/municipal users can only update ARBs within their province
  if (
    sessionUser.office_level !== "regional" &&
    sessionUser.province &&
    landholding.province_edited !== sessionUser.province
  ) {
    return NextResponse.json(
      { error: `This landholding belongs to ${landholding.province_edited ?? "another province"} and is outside your jurisdiction.` },
      { status: 403 }
    );
  }

  // Validate area_allocated: must be a number with optional trailing "*"
  const areaPattern = /^\d+(\.\d+)?\*?$/;
  const invalidArea = arbs.find((a) => a.area_allocated && !areaPattern.test(a.area_allocated.trim()));
  if (invalidArea) {
    return NextResponse.json(
      { error: `Invalid area value "${invalidArea.area_allocated}". Use a number like "0.5000" or "0.5000*" for Collective CLOA.` },
      { status: 400 }
    );
  }

  const valid = arbs.filter((a) => a.arb_name?.trim());
  if (valid.length === 0) {
    return NextResponse.json({ error: "All entries are missing ARB Name." }, { status: 400 });
  }

  const missingCarpable = valid.find((a) => {
    const v = a.carpable?.toUpperCase().replace(/\s+/g, "") ?? "";
    return v !== "CARPABLE" && v !== "NON-CARPABLE";
  });
  if (missingCarpable) {
    return NextResponse.json({ error: `CARPable/Non-CARPable is required for all entries (missing on: ${missingCarpable.arb_name}).` }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    if (mode === "replace") {
      await tx.arb.deleteMany({ where: { seqno_darro: seqno_darro.trim() } });
    }
    for (const a of valid) {
      await tx.arb.create({
        data: {
          seqno_darro: seqno_darro.trim().toUpperCase(),
          arb_name: a.arb_name.trim().toUpperCase(),
          arb_no: a.arb_no?.trim().toUpperCase() || null,
          ep_cloa_no: a.ep_cloa_no?.trim().toUpperCase() || null,
          carpable: (() => { const v = a.carpable?.toUpperCase().replace(/\s+/g, "") ?? ""; return (v === "CARPABLE" || v === "NON-CARPABLE") ? v : null; })(),
          area_allocated: a.area_allocated ?? null,
          remarks: a.remarks?.trim() || null,
          uploaded_by: "Manual",
        },
      });
    }
  });

  return NextResponse.json({ saved: valid.length });
}

// Lookup SEQNO
export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionUser = token ? await verifySessionToken(token) : null;
  if (!sessionUser || !["super_admin", "admin", "editor"].includes(sessionUser.role))
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const seqno = req.nextUrl.searchParams.get("seqno")?.trim();
  if (!seqno) return NextResponse.json({ error: "No SEQNO provided." }, { status: 400 });

  const lh = await prisma.landholding.findUnique({
    where: { seqno_darro: seqno },
    select: {
      seqno_darro: true, landowner: true, province_edited: true,
      clno: true, claimclass: true, osarea: true,
      _count: { select: { arbs: true } },
    },
  });

  if (!lh) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // Provincial/municipal users can only look up landholdins within their province
  if (
    sessionUser.office_level !== "regional" &&
    sessionUser.province &&
    lh.province_edited !== sessionUser.province
  ) {
    return NextResponse.json(
      { error: `This landholding belongs to ${lh.province_edited ?? "another province"} and is outside your jurisdiction.` },
      { status: 403 }
    );
  }

  return NextResponse.json(lh);
}
