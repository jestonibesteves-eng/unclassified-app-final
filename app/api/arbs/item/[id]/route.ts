import { NextRequest, NextResponse } from "next/server";
import { prisma, rawDb } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";
import { computeAndUpdateStatus } from "@/lib/computeStatus";

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
  const { arb_name, arb_id, ep_cloa_no, carpable, area_allocated,
          allocated_condoned_amount, eligibility, eligibility_reason,
          date_encoded, date_distributed, remarks } = body;

  if (!arb_name?.trim())
    return NextResponse.json({ error: "ARB Name is required." }, { status: 400 });

  if (!carpable || !["CARPABLE", "NON-CARPABLE"].includes(String(carpable).toUpperCase().replace(/\s+/g, "")))
    return NextResponse.json({ error: "CARPable/Non-CARPable is required." }, { status: 400 });

  const areaPattern = /^\d+(\.\d+)?\*?$/;
  if (area_allocated && !areaPattern.test(String(area_allocated).trim()))
    return NextResponse.json({ error: `Invalid area value. Use a number like "0.5000" or "0.5000*" for Collective CLOA.` }, { status: 400 });

  if (!allocated_condoned_amount?.trim())
    return NextResponse.json({ error: "Allocated Condoned Amount is required." }, { status: 400 });

  const normalizedEligibility = eligibility?.trim();
  if (!normalizedEligibility || !["Eligible", "Not Eligible"].includes(normalizedEligibility))
    return NextResponse.json({ error: "Eligibility must be 'Eligible' or 'Not Eligible'." }, { status: 400 });

  if (normalizedEligibility === "Not Eligible" && !eligibility_reason?.trim())
    return NextResponse.json({ error: "A reason is required when eligibility is 'Not Eligible'." }, { status: 400 });

  const datePattern = /^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}$/;
  if (date_encoded?.trim() && !datePattern.test(date_encoded.trim()))
    return NextResponse.json({ error: "Date Encoded must be in mm/dd/yyyy format." }, { status: 400 });
  if (date_distributed?.trim() && !datePattern.test(date_distributed.trim()))
    return NextResponse.json({ error: "Date Distributed must be in mm/dd/yyyy format." }, { status: 400 });
  if (date_distributed?.trim() && !date_encoded?.trim())
    return NextResponse.json({ error: "Date Encoded is required before setting Date Distributed." }, { status: 400 });

  const normalizedCarpable = carpable
    ? (() => { const v = String(carpable).toUpperCase().replace(/\s+/g, ""); return (v === "CARPABLE" || v === "NON-CARPABLE") ? v : null; })()
    : null;

  const newArbName = arb_name.trim().toUpperCase();
  const newArbId = arb_id?.trim().toUpperCase() || null;
  const newEpCloaNo = ep_cloa_no?.trim().toUpperCase() || null;
  const newAreaAllocated = area_allocated?.trim() || null;
  const datesBlocked = normalizedEligibility === "Not Eligible" || normalizedCarpable === "NON-CARPABLE";
  const newDateEncoded = datesBlocked ? null : (date_encoded?.trim() || null);
  const newDateDistributed = (datesBlocked || !newDateEncoded) ? null : (date_distributed?.trim() || null);

  rawDb.prepare(
    `UPDATE "Arb" SET arb_name = ?, arb_id = ?, ep_cloa_no = ?, carpable = ?, area_allocated = ?,
     allocated_condoned_amount = ?, eligibility = ?, eligibility_reason = ?,
     date_encoded = ?, date_distributed = ?, remarks = ? WHERE id = ?`
  ).run(
    newArbName, newArbId, newEpCloaNo, normalizedCarpable, newAreaAllocated,
    allocated_condoned_amount.trim(), normalizedEligibility,
    normalizedEligibility === "Not Eligible" ? eligibility_reason.trim() : null,
    newDateEncoded, newDateDistributed, remarks?.trim() || null,
    arbId
  );
  rawDb.prepare(
    `INSERT INTO "AuditLog" (seqno_darro, action, field_changed, old_value, new_value, changed_by, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  ).run(
    arb.seqno_darro, "ARB_EDIT", "arb",
    JSON.stringify({ arb_name: arb.arb_name, arb_id: arb.arb_id, ep_cloa_no: arb.ep_cloa_no, carpable: arb.carpable, area_allocated: arb.area_allocated }),
    JSON.stringify({ arb_name: newArbName, arb_id: newArbId, ep_cloa_no: newEpCloaNo, carpable: normalizedCarpable, area_allocated: newAreaAllocated }),
    sessionUser.username, "arb_modal"
  );
  await computeAndUpdateStatus(arb.seqno_darro);

  const updated = await prisma.arb.findUnique({ where: { id: arbId } });
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

  rawDb.prepare(`DELETE FROM "Arb" WHERE id = ?`).run(arbId);
  rawDb.prepare(
    `INSERT INTO "AuditLog" (seqno_darro, action, field_changed, old_value, new_value, changed_by, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  ).run(
    arb.seqno_darro, "ARB_DELETE", "arb",
    JSON.stringify({ arb_name: arb.arb_name, arb_id: arb.arb_id, ep_cloa_no: arb.ep_cloa_no }),
    null, sessionUser.username, "arb_modal"
  );
  await computeAndUpdateStatus(arb.seqno_darro);

  return NextResponse.json({ deleted: arbId });
}
