import { NextRequest, NextResponse } from "next/server";
import { prisma, rawDb } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";
import { computeAndUpdateStatus } from "@/lib/computeStatus";

type ArbInput = {
  arb_name: string;
  arb_id?: string;
  ep_cloa_no?: string;
  carpable?: string;
  area_allocated: string;
  allocated_condoned_amount?: string;
  eligibility?: string;
  eligibility_reason?: string;
  date_encoded?: string;
  date_distributed?: string;
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
    select: { seqno_darro: true, landowner: true, province_edited: true, status: true },
  });

  if (!landholding) {
    return NextResponse.json({ error: `SEQNO_DARRO "${seqno_darro}" not found in the masterlist.` }, { status: 404 });
  }

  const LOCKED_STATUSES = ["For Encoding", "Partially Encoded", "Fully Encoded", "Partially Distributed", "Fully Distributed", "Not Eligible for Encoding"];
  if (LOCKED_STATUSES.includes(landholding.status ?? "")) {
    return NextResponse.json({ error: `This landholding is locked (status: "${landholding.status}"). ARB data cannot be appended or replaced at this stage.` }, { status: 403 });
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

  const missingArbId = valid.find((a) => !a.arb_id?.trim());
  if (missingArbId) {
    return NextResponse.json({ error: `ARB ID is required for all entries (missing on: ${missingArbId.arb_name}).` }, { status: 400 });
  }

  // Check for duplicate ARB_IDs within the submitted batch
  const arbIdsSeen = new Set<string>();
  for (const a of valid) {
    const id = a.arb_id!.trim().toUpperCase();
    if (arbIdsSeen.has(id)) {
      return NextResponse.json({ error: `Duplicate ARB ID "${id}" in this batch. Each ARB must have a unique ID.` }, { status: 400 });
    }
    arbIdsSeen.add(id);
  }

  // Check for ARB_IDs that already exist in DB
  const arbIdsToCheck = [...arbIdsSeen];
  const existingArbIds = await prisma.arb.findMany({
    where: { arb_id: { in: arbIdsToCheck } },
    select: { arb_id: true, seqno_darro: true },
  });
  // In replace mode, ignore conflicts within the same SEQNO (they'll be deleted first)
  const conflicting = existingArbIds.filter((e) => !(mode === "replace" && e.seqno_darro === seqno_darro.trim().toUpperCase()));
  if (conflicting.length > 0) {
    const ids = conflicting.map((e) => `"${e.arb_id}" (in ${e.seqno_darro})`).join(", ");
    return NextResponse.json({ error: `ARB ID already exists: ${ids}. ARB IDs must be globally unique.` }, { status: 400 });
  }

  const missingCarpable = valid.find((a) => {
    const v = a.carpable?.toUpperCase().replace(/\s+/g, "") ?? "";
    return v !== "CARPABLE" && v !== "NON-CARPABLE";
  });
  if (missingCarpable) {
    return NextResponse.json({ error: `CARPable/Non-CARPable is required for all entries (missing on: ${missingCarpable.arb_name}).` }, { status: 400 });
  }

  const missingCondoned = valid.find((a) => !a.allocated_condoned_amount?.trim());
  if (missingCondoned) {
    return NextResponse.json({ error: `Allocated Condoned Amount is required for all entries (missing on: ${missingCondoned.arb_name}).` }, { status: 400 });
  }

  const missingEligibility = valid.find((a) => !["Eligible", "Not Eligible"].includes(a.eligibility?.trim() ?? ""));
  if (missingEligibility) {
    return NextResponse.json({ error: `Eligibility is required for all entries (missing or invalid on: ${missingEligibility.arb_name}).` }, { status: 400 });
  }

  const missingReason = valid.find((a) => a.eligibility?.trim() === "Not Eligible" && !a.eligibility_reason?.trim());
  if (missingReason) {
    return NextResponse.json({ error: `A reason is required when eligibility is "Not Eligible" (missing on: ${missingReason.arb_name}).` }, { status: 400 });
  }

  const datePattern = /^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}$/;
  const badDate = valid.find((a) =>
    (a.date_encoded?.trim() && !datePattern.test(a.date_encoded.trim())) ||
    (a.date_distributed?.trim() && !datePattern.test(a.date_distributed.trim()))
  );
  if (badDate) {
    return NextResponse.json({ error: `Date fields must be in mm/dd/yyyy format (error on: ${badDate.arb_name}).` }, { status: 400 });
  }
  const distWithoutEnc = valid.find((a) => a.date_distributed?.trim() && !a.date_encoded?.trim());
  if (distWithoutEnc) {
    return NextResponse.json({ error: `Date Encoded is required before setting Date Distributed (missing on: ${distWithoutEnc.arb_name}).` }, { status: 400 });
  }

  const normalizedSeqno = seqno_darro.trim().toUpperCase();
  const deleteStmt = rawDb.prepare(`DELETE FROM "Arb" WHERE seqno_darro = ?`);
  const insertStmt = rawDb.prepare(
    `INSERT INTO "Arb" (seqno_darro, arb_name, arb_id, ep_cloa_no, carpable, area_allocated, allocated_condoned_amount, eligibility, eligibility_reason, date_encoded, date_distributed, remarks, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  );

  const doWrites = rawDb.transaction(() => {
    if (mode === "replace") {
      deleteStmt.run(normalizedSeqno);
    }
    for (const a of valid) {
      const elig = a.eligibility!.trim();
      const carp = (() => { const v = a.carpable?.toUpperCase().replace(/\s+/g, "") ?? ""; return (v === "CARPABLE" || v === "NON-CARPABLE") ? v : null; })();
      insertStmt.run(
        normalizedSeqno, a.arb_name.trim().toUpperCase(),
        a.arb_id?.trim().toUpperCase() || null, a.ep_cloa_no?.trim().toUpperCase() || null,
        carp, a.area_allocated ?? null, a.allocated_condoned_amount!.trim(),
        elig, elig === "Not Eligible" ? a.eligibility_reason!.trim() : null,
        (elig === "Not Eligible" || carp === "NON-CARPABLE") ? null : (a.date_encoded?.trim() || null),
        (elig === "Not Eligible" || carp === "NON-CARPABLE") ? null : (a.date_distributed?.trim() || null),
        a.remarks?.trim() || null, "Manual"
      );
    }
  });
  doWrites();

  rawDb.prepare(
    `INSERT INTO "AuditLog" (seqno_darro, action, field_changed, old_value, new_value, changed_by, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  ).run(
    normalizedSeqno, "ARB_SAVE", "arbs",
    mode === "replace" ? "Replaced existing ARBs" : "Appended to existing ARBs",
    `${valid.length} ARB(s) saved`,
    sessionUser.username, "arb_manual"
  );

  await computeAndUpdateStatus(normalizedSeqno);
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
      municipality: true, clno: true,
      amendarea_validated: true, amendarea: true,
      condoned_amount: true, net_of_reval_no_neg: true,
      status: true,
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
