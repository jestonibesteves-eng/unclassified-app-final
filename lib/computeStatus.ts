import { prisma, rawDb } from "@/lib/db";

function parseArea(val: string | null | undefined): number {
  if (!val) return 0;
  const s = String(val);
  if (s.endsWith("*")) return 0;
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

async function resolveStatus(seqno: string): Promise<string | null> {
  const lh = await prisma.landholding.findUnique({
    where: { seqno_darro: seqno },
    select: {
      status: true,
      amendarea_validated: true,
      amendarea: true,
      condoned_amount: true,
      net_of_reval_no_neg: true,
      amendarea_validated_confirmed: true,
      condoned_amount_confirmed: true,
    },
  });

  if (!lh) return null;
  if (lh.status === "Not Eligible for Encoding") return "Not Eligible for Encoding";

  const arbs = await prisma.arb.findMany({
    where: { seqno_darro: seqno },
    select: { area_allocated: true, allocated_condoned_amount: true, date_encoded: true, date_distributed: true, eligibility: true },
  });

  if (arbs.length === 0) {
    const eitherConfirmed = (lh.amendarea_validated_confirmed ?? false) || (lh.condoned_amount_confirmed ?? false);
    return eitherConfirmed ? "For Further Validation" : "For Initial Validation";
  }

  const totalArea = arbs.reduce((s, a) => s + parseArea(a.area_allocated), 0);
  const validatedArea = lh.amendarea_validated ?? lh.amendarea;
  const areaMatch =
    validatedArea != null &&
    parseFloat(totalArea.toFixed(4)) === parseFloat(validatedArea.toFixed(4));

  if (!areaMatch) return "For Further Validation";

  const bothConfirmed = (lh.amendarea_validated_confirmed ?? false) && (lh.condoned_amount_confirmed ?? false);
  if (!bothConfirmed) return "For Further Validation";

  const eligibleArbs = arbs.filter((a) => a.eligibility === "Eligible");
  const eligibleTotal = eligibleArbs.length;

  if (eligibleTotal > 0) {
    const encodedCount = eligibleArbs.filter((a) => a.date_encoded).length;
    const distributedCount = eligibleArbs.filter((a) => a.date_encoded && a.date_distributed).length;

    if (distributedCount === eligibleTotal) return "Fully Distributed";
    if (distributedCount > 0) return "Partially Distributed";
    if (encodedCount === eligibleTotal) return "Fully Encoded";
    if (encodedCount > 0) return "Partially Encoded";
  }

  return "For Encoding";
}

export async function computeAndUpdateStatus(seqno: string): Promise<void> {
  const newStatus = await resolveStatus(seqno);
  if (newStatus === null) return;
  rawDb.prepare(`UPDATE "Landholding" SET status = ? WHERE seqno_darro = ?`).run(newStatus, seqno);
}
