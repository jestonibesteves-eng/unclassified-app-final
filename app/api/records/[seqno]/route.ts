import { NextRequest, NextResponse } from "next/server";
import { prisma, rawDb } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";
import { computeAndUpdateStatus } from "@/lib/computeStatus";

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
    select: { status: true, condoned_amount: true, net_of_reval_no_neg: true, amendarea_validated: true, amendarea: true, amendarea_validated_confirmed: true, condoned_amount_confirmed: true, asp_status: true, cloa_status: true, remarks: true, non_eligibility_reason: true, municipality: true, barangay: true, province_edited: true },
  });

  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (sessionUser.office_level !== "regional" && sessionUser.province &&
      existing.province_edited !== sessionUser.province)
    return NextResponse.json({ error: "Outside your jurisdiction." }, { status: 403 });

  if (sessionUser.office_level === "municipal" && sessionUser.municipality &&
      existing.municipality && !existing.municipality.toLowerCase().includes(sessionUser.municipality.toLowerCase()))
    return NextResponse.json({ error: "Outside your jurisdiction." }, { status: 403 });

  const CLOA_STATUS_VALUES = [
    "Still CCLOA (SPLIT Target)",
    "Still CCLOA (Not SPLIT Target)",
    "Full — Individual Title (SPLIT)",
    "Partial — Individual Title (SPLIT)",
    "Full — Individual Title (Regular Redoc)",
    "Partial — Individual Title (Regular Redoc)",
  ];

  const ASP_STATUS_VALUES = ["With ASP", "Without ASP"];

  const updateData: { status?: string | null; condoned_amount?: number | null; amendarea_validated?: number | null; amendarea_validated_confirmed?: boolean; condoned_amount_confirmed?: boolean; asp_status?: string | null; cloa_status?: string | null; remarks?: string | null; non_eligibility_reason?: string | null; municipality?: string | null; barangay?: string | null } = {};
  if ("status" in body) updateData.status = typeof body.status === "string" ? body.status : null;
  if ("condoned_amount" in body) {
    const newVal = body.condoned_amount == null ? null : Number(body.condoned_amount);
    updateData.condoned_amount = newVal;
    // Reset confirmation whenever the value changes
    if (newVal !== existing.condoned_amount) updateData.condoned_amount_confirmed = false;
  }
  if ("amendarea_validated" in body) {
    const newVal = body.amendarea_validated == null ? null : Number(body.amendarea_validated);
    updateData.amendarea_validated = newVal;
    // Reset confirmation whenever the value changes
    if (newVal !== existing.amendarea_validated) updateData.amendarea_validated_confirmed = false;
  }
  if ("amendarea_validated_confirmed" in body) {
    const confirming = body.amendarea_validated_confirmed === true;
    if (confirming) {
      const effectiveArea = existing.amendarea_validated ?? existing.amendarea;
      if (effectiveArea == null || effectiveArea <= 0)
        return NextResponse.json({ error: "Cannot confirm: Validated AMENDAREA must be greater than zero." }, { status: 400 });
    }
    updateData.amendarea_validated_confirmed = confirming;
  }
  if ("condoned_amount_confirmed" in body) {
    const confirming = body.condoned_amount_confirmed === true;
    if (confirming) {
      const effectiveCondoned = existing.condoned_amount ?? existing.net_of_reval_no_neg;
      if (effectiveCondoned == null || effectiveCondoned <= 0)
        return NextResponse.json({ error: "Cannot confirm: Validated Condoned Amount must be greater than zero." }, { status: 400 });
    }
    updateData.condoned_amount_confirmed = confirming;
  }
  if ("cloa_status" in body) {
    const val = body.cloa_status;
    if (val === null || val === "") {
      updateData.cloa_status = null;
    } else if (typeof val === "string" && CLOA_STATUS_VALUES.includes(val)) {
      updateData.cloa_status = val;
    } else {
      return NextResponse.json({ error: "Invalid CLOA status value." }, { status: 400 });
    }
  }
  if ("asp_status" in body) {
    const val = body.asp_status;
    if (val === null || val === "") {
      updateData.asp_status = null;
    } else if (typeof val === "string" && ASP_STATUS_VALUES.includes(val)) {
      updateData.asp_status = val;
    } else {
      return NextResponse.json({ error: "Invalid ASP status value." }, { status: 400 });
    }
  }
  if ("remarks" in body) updateData.remarks = typeof body.remarks === "string" ? body.remarks : null;
  if ("non_eligibility_reason" in body) updateData.non_eligibility_reason = typeof body.non_eligibility_reason === "string" ? body.non_eligibility_reason : null;
  if ("municipality" in body) updateData.municipality = typeof body.municipality === "string" && body.municipality.trim() ? body.municipality.trim() : null;
  if ("barangay" in body) updateData.barangay = typeof body.barangay === "string" && body.barangay.trim() ? body.barangay.trim() : null;

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  try {
    // Use rawDb (better-sqlite3 directly) to bypass the Prisma WASM adapter,
    // which causes SocketTimeout on all writes with the better-sqlite3 driver adapter.
    const keys = Object.keys(updateData) as (keyof typeof updateData)[];
    const setClauses = keys.map((k) => `"${k}" = ?`).join(", ");
    const values = keys.map((k) => {
      const v = updateData[k] ?? null;
      return typeof v === "boolean" ? (v ? 1 : 0) : v;
    });
    rawDb
      .prepare(`UPDATE "Landholding" SET ${setClauses}, "updated_at" = datetime('now') WHERE seqno_darro = ?`)
      .run(...values, seqno);

    // Audit log
    const insertAudit = rawDb.prepare(
      `INSERT INTO "AuditLog" (seqno_darro, action, field_changed, old_value, new_value, changed_by, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    );
    for (const key of keys) {
      insertAudit.run(seqno, "RECORD_UPDATE", key, String(existing[key] ?? ""), String(updateData[key] ?? ""), sessionUser.username);
    }

    // Recompute status
    await computeAndUpdateStatus(seqno);

    const updated = await prisma.landholding.findUnique({
      where: { seqno_darro: seqno },
      include: { arbs: { orderBy: { id: "asc" } } },
    });

    return NextResponse.json(updated);
  } catch (e) {
    console.error("PATCH /api/records/[seqno] error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
