import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";

type Params = { params: Promise<{ seqno: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionUser = token ? await verifySessionToken(token) : null;
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { seqno } = await params;

  const record = await prisma.landholding.findUnique({
    where: { seqno_darro: seqno },
    include: { arbs: { orderBy: { id: "asc" } } },
  });

  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (sessionUser.office_level !== "regional" && sessionUser.province &&
      record.province_edited !== sessionUser.province)
    return NextResponse.json({ error: "Outside your jurisdiction." }, { status: 403 });

  if (sessionUser.office_level === "municipal" && sessionUser.municipality &&
      record.municipality && !record.municipality.toLowerCase().includes(sessionUser.municipality.toLowerCase()))
    return NextResponse.json({ error: "Outside your jurisdiction." }, { status: 403 });

  return NextResponse.json(record);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionUser = token ? await verifySessionToken(token) : null;
  if (!sessionUser || !["super_admin", "admin", "editor"].includes(sessionUser.role))
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const { seqno } = await params;
  const body = await req.json();

  const existing = await prisma.landholding.findUnique({
    where: { seqno_darro: seqno },
    select: { status: true, condoned_amount: true, amendarea_validated: true, remarks: true, municipality: true, barangay: true },
  });

  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const fullRecord = await prisma.landholding.findUnique({
    where: { seqno_darro: seqno },
    select: { province_edited: true, municipality: true },
  });
  if (sessionUser.office_level !== "regional" && sessionUser.province &&
      fullRecord?.province_edited !== sessionUser.province)
    return NextResponse.json({ error: "Outside your jurisdiction." }, { status: 403 });

  if (sessionUser.office_level === "municipal" && sessionUser.municipality &&
      fullRecord?.municipality && !fullRecord.municipality.toLowerCase().includes(sessionUser.municipality.toLowerCase()))
    return NextResponse.json({ error: "Outside your jurisdiction." }, { status: 403 });

  const updateData: { status?: string | null; condoned_amount?: number | null; amendarea_validated?: number | null; remarks?: string | null; municipality?: string | null; barangay?: string | null } = {};
  if ("status" in body) updateData.status = typeof body.status === "string" ? body.status : null;
  if ("condoned_amount" in body) updateData.condoned_amount = body.condoned_amount == null ? null : Number(body.condoned_amount);
  if ("amendarea_validated" in body) updateData.amendarea_validated = body.amendarea_validated == null ? null : Number(body.amendarea_validated);
  if ("remarks" in body) updateData.remarks = typeof body.remarks === "string" ? body.remarks : null;
  if ("municipality" in body) updateData.municipality = typeof body.municipality === "string" && body.municipality.trim() ? body.municipality.trim() : null;
  if ("barangay" in body) updateData.barangay = typeof body.barangay === "string" && body.barangay.trim() ? body.barangay.trim() : null;

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.landholding.update({
        where: { seqno_darro: seqno },
        data: { ...updateData, updated_at: new Date() },
      });

      const auditEntries = (Object.keys(updateData) as (keyof typeof updateData)[]).map((key) => ({
        seqno_darro: seqno,
        action: "RECORD_UPDATE",
        field_changed: key,
        old_value: String(existing[key] ?? ""),
        new_value: String(updateData[key] ?? ""),
        changed_by: sessionUser.username,
      }));

      if (auditEntries.length > 0) {
        await tx.auditLog.createMany({ data: auditEntries });
      }

      return result;
    });

    return NextResponse.json(updated);
  } catch (e) {
    console.error("PATCH /api/records/[seqno] error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
