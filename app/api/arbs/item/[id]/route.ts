import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionUser = token ? await verifySessionToken(token) : null;
  if (!sessionUser || !["super_admin", "admin", "editor"].includes(sessionUser.role))
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const { id } = await params;
  const arbId = parseInt(id);
  if (isNaN(arbId)) return NextResponse.json({ error: "Invalid ID." }, { status: 400 });

  const arb = await prisma.arb.findUnique({
    where: { id: arbId },
    include: { landholding: { select: { province_edited: true } } },
  });
  if (!arb) return NextResponse.json({ error: "ARB not found." }, { status: 404 });

  // Province scoping
  if (
    sessionUser.office_level !== "regional" &&
    sessionUser.province &&
    arb.landholding.province_edited !== sessionUser.province
  ) {
    return NextResponse.json({ error: "Outside your jurisdiction." }, { status: 403 });
  }

  const body = await req.json();
  const { arb_name, arb_no, ep_cloa_no, carpable, area_allocated, remarks } = body;

  if (!arb_name?.trim())
    return NextResponse.json({ error: "ARB Name is required." }, { status: 400 });

  if (!carpable || !["CARPABLE", "NON-CARPABLE"].includes(String(carpable).toUpperCase().replace(/\s+/g, "")))
    return NextResponse.json({ error: "CARPable/Non-CARPable is required." }, { status: 400 });

  const areaPattern = /^\d+(\.\d+)?\*?$/;
  if (area_allocated && !areaPattern.test(String(area_allocated).trim()))
    return NextResponse.json({ error: `Invalid area value. Use a number like "0.5000" or "0.5000*" for Collective CLOA.` }, { status: 400 });

  const normalizedCarpable = carpable
    ? (() => { const v = String(carpable).toUpperCase().replace(/\s+/g, ""); return (v === "CARPABLE" || v === "NON-CARPABLE") ? v : null; })()
    : null;

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.arb.update({
      where: { id: arbId },
      data: {
        arb_name: arb_name.trim().toUpperCase(),
        arb_no: arb_no?.trim().toUpperCase() || null,
        ep_cloa_no: ep_cloa_no?.trim().toUpperCase() || null,
        carpable: normalizedCarpable,
        area_allocated: area_allocated?.trim() || null,
        remarks: remarks?.trim() || null,
      },
    });
    await tx.auditLog.create({
      data: {
        seqno_darro: arb.seqno_darro,
        action: "ARB_EDIT",
        field_changed: "arb",
        old_value: JSON.stringify({ arb_name: arb.arb_name, arb_no: arb.arb_no, ep_cloa_no: arb.ep_cloa_no, carpable: arb.carpable, area_allocated: arb.area_allocated }),
        new_value: JSON.stringify({ arb_name: result.arb_name, arb_no: result.arb_no, ep_cloa_no: result.ep_cloa_no, carpable: result.carpable, area_allocated: result.area_allocated }),
        changed_by: sessionUser.username,
      },
    });
    return result;
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionUser = token ? await verifySessionToken(token) : null;
  if (!sessionUser || !["super_admin", "admin", "editor"].includes(sessionUser.role))
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const { id } = await params;
  const arbId = parseInt(id);
  if (isNaN(arbId)) return NextResponse.json({ error: "Invalid ID." }, { status: 400 });

  const arb = await prisma.arb.findUnique({
    where: { id: arbId },
    include: { landholding: { select: { province_edited: true } } },
  });
  if (!arb) return NextResponse.json({ error: "ARB not found." }, { status: 404 });

  if (sessionUser.office_level !== "regional" && sessionUser.province &&
      arb.landholding.province_edited !== sessionUser.province)
    return NextResponse.json({ error: "Outside your jurisdiction." }, { status: 403 });

  await prisma.$transaction([
    prisma.arb.delete({ where: { id: arbId } }),
    prisma.auditLog.create({
      data: {
        seqno_darro: arb.seqno_darro,
        action: "ARB_DELETE",
        field_changed: "arb",
        old_value: JSON.stringify({ arb_name: arb.arb_name, arb_no: arb.arb_no, ep_cloa_no: arb.ep_cloa_no }),
        new_value: null,
        changed_by: sessionUser.username,
      },
    }),
  ]);

  return NextResponse.json({ deleted: arbId });
}
