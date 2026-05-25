// app/api/admin/batch-unconfirm/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma, rawDb } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";
import { computeAndUpdateStatus } from "@/lib/computeStatus";

type UnconfirmType = "area" | "amount" | "both";

type PreviewRow = {
  seqno_darro: string;
  landowner: string | null;
  province: string | null;
  clno: string | null;
  area_confirmed: boolean;
  amount_confirmed: boolean;
  action: "unconfirm" | "skip";
  reason: string | null;
};

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    const sessionUser = token ? await verifySessionToken(token) : null;
    if (!sessionUser)
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    if (sessionUser.role !== "super_admin")
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });

    const body = await req.json() as { seqnos?: unknown; type?: unknown; preview?: unknown };

    const rawSeqnos = Array.isArray(body.seqnos) ? body.seqnos : [];
    const seqnos = rawSeqnos
      .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
      .map((s) => s.trim().toUpperCase());

    const type: UnconfirmType | null =
      body.type === "area" || body.type === "amount" || body.type === "both"
        ? (body.type as UnconfirmType)
        : null;

    const isPreview = Boolean(body.preview);

    if (!seqnos.length)
      return NextResponse.json({ error: "No SEQNOs provided." }, { status: 400 });
    if (!type)
      return NextResponse.json(
        { error: "type must be \"area\", \"amount\", or \"both\"." },
        { status: 400 }
      );

    const unconfirmArea   = type === "area"   || type === "both";
    const unconfirmAmount = type === "amount" || type === "both";

    // Fetch current confirmation state for all requested SEQNOs
    const records = await prisma.landholding.findMany({
      where: { seqno_darro: { in: seqnos } },
      select: {
        seqno_darro: true,
        landowner: true,
        province_edited: true,
        clno: true,
        amendarea_validated_confirmed: true,
        condoned_amount_confirmed: true,
      },
    });

    const foundMap = Object.fromEntries(records.map((r) => [r.seqno_darro, r]));

    // Build per-row preview analysis
    const previewRows: PreviewRow[] = seqnos.map((seqno) => {
      const rec = foundMap[seqno];
      if (!rec) {
        return {
          seqno_darro: seqno,
          landowner: null,
          province: null,
          clno: null,
          area_confirmed: false,
          amount_confirmed: false,
          action: "skip" as const,
          reason: "Not found",
        };
      }
      const areaWillChange   = unconfirmArea   && (rec.amendarea_validated_confirmed ?? false);
      const amountWillChange = unconfirmAmount && (rec.condoned_amount_confirmed     ?? false);
      const willChange = areaWillChange || amountWillChange;
      return {
        seqno_darro: seqno,
        landowner: rec.landowner,
        province: rec.province_edited,
        clno: rec.clno,
        area_confirmed:   rec.amendarea_validated_confirmed ?? false,
        amount_confirmed: rec.condoned_amount_confirmed     ?? false,
        action:  willChange ? "unconfirm" : "skip",
        reason:  willChange ? null        : "Already unconfirmed",
      };
    });

    // Preview mode — return analysis without writing anything
    if (isPreview) {
      return NextResponse.json({ rows: previewRows });
    }

    // Execute mode
    const insertAudit = rawDb.prepare(
      `INSERT INTO "AuditLog" (seqno_darro, action, field_changed, old_value, new_value, changed_by, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    );

    const toUpdate = previewRows.filter((r) => r.action === "unconfirm");
    const skipped  = previewRows
      .filter((r) => r.action === "skip")
      .map((r) => ({ seqno_darro: r.seqno_darro, reason: r.reason ?? "Already unconfirmed" }));

    // Process sequentially — avoids SQLite contention on large batches
    for (const row of toUpdate) {
      const rec = foundMap[row.seqno_darro];
      const sets: string[] = [];

      rawDb.transaction(() => {
        if (unconfirmArea && (rec.amendarea_validated_confirmed ?? false)) {
          sets.push('"amendarea_validated_confirmed" = 0');
          insertAudit.run(
            row.seqno_darro, "RECORD_UPDATE", "amendarea_validated_confirmed",
            "true", "false", sessionUser.username, "admin_batch_unconfirm"
          );
        }
        if (unconfirmAmount && (rec.condoned_amount_confirmed ?? false)) {
          sets.push('"condoned_amount_confirmed" = 0');
          insertAudit.run(
            row.seqno_darro, "RECORD_UPDATE", "condoned_amount_confirmed",
            "true", "false", sessionUser.username, "admin_batch_unconfirm"
          );
        }
        if (sets.length > 0) {
          rawDb
            .prepare(
              `UPDATE "Landholding" SET ${sets.join(", ")}, "updated_at" = datetime('now') WHERE seqno_darro = ?`
            )
            .run(row.seqno_darro);
        }
      })();

      // Status recompute runs outside the transaction — it uses Prisma async queries
      await computeAndUpdateStatus(row.seqno_darro);
    }

    return NextResponse.json({ updated: toUpdate.length, skipped });
  } catch (err) {
    console.error("[batch-unconfirm] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error." },
      { status: 500 }
    );
  }
}
