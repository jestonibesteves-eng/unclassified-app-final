import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";
import * as XLSX from "xlsx";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionUser = token ? await verifySessionToken(token) : null;
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const search = searchParams.get("search") ?? "";
  const match = searchParams.get("match") ?? "";
  const provinceParam = searchParams.get("province") ?? "";

  const scopedProvince =
    sessionUser.office_level === "regional"
      ? (provinceParam || null)
      : sessionUser.province ?? null;
  const scopedMunicipality =
    sessionUser.office_level === "municipal" ? sessionUser.municipality ?? null : null;

  // Resolve seqnos for match filter
  let matchSeqnos: string[] | null = null;
  if (match === "matched" || match === "mismatched") {
    const rows = await prisma.$queryRaw<{ seqno_darro: string; total: number; validated: number | null }[]>`
      SELECT l.seqno_darro,
             COALESCE(SUM(CASE WHEN a.area_allocated LIKE '%*' THEN 0 ELSE CAST(a.area_allocated AS REAL) END), 0) AS total,
             COALESCE(l.amendarea_validated, l.amendarea) AS validated
      FROM Landholding l
      JOIN Arb a ON a.seqno_darro = l.seqno_darro
      GROUP BY l.seqno_darro
    `;
    matchSeqnos = rows
      .filter((r: { seqno_darro: string; total: number; validated: number | null }) => {
        if (r.validated == null) return false;
        const isMatch = parseFloat(Number(r.total).toFixed(4)) === parseFloat(Number(r.validated).toFixed(4));
        return match === "matched" ? isMatch : !isMatch;
      })
      .map((r: { seqno_darro: string; total: number; validated: number | null }) => r.seqno_darro);
  }

  const arbs = await prisma.arb.findMany({
    where: {
      landholding: {
        ...(scopedProvince ? { province_edited: scopedProvince } : {}),
        ...(scopedMunicipality ? { municipality: { contains: scopedMunicipality } } : {}),
        ...(search
          ? {
              OR: [
                { seqno_darro: { contains: search } },
                { landowner: { contains: search } },
                { clno: { contains: search } },
              ],
            }
          : {}),
        ...(matchSeqnos ? { seqno_darro: { in: matchSeqnos } } : {}),
      },
    },
    select: {
      seqno_darro: true,
      arb_name: true,
      arb_id: true,
      ep_cloa_no: true,
      carpable: true,
      area_allocated: true,
      allocated_condoned_amount: true,
      eligibility: true,
      eligibility_reason: true,
      date_encoded: true,
      date_distributed: true,
      remarks: true,
      uploaded_by: true,
      created_at: true,
      landholding: {
        select: {
          clno: true,
          landowner: true,
          province_edited: true,
          municipality: true,
          claimclass: true,
          status: true,
          amendarea_validated: true,
          amendarea: true,
        },
      },
    },
    orderBy: [{ seqno_darro: "asc" }, { id: "asc" }],
  });

  const rows = arbs.map((a: typeof arbs[number]) => ({
    "SEQNO_DARRO": a.seqno_darro,
    "CLNO": a.landholding.clno ?? "",
    "LANDOWNER": a.landholding.landowner ?? "",
    "PROVINCE": a.landholding.province_edited ?? "",
    "MUNICIPALITY": a.landholding.municipality ?? "",
    "CLASS": a.landholding.claimclass ?? "",
    "LANDHOLDING_STATUS": a.landholding.status ?? "",
    "AMENDAREA_VALIDATED": a.landholding.amendarea_validated ?? a.landholding.amendarea ?? "",
    "ARB_NAME": a.arb_name ?? "",
    "ARB_ID": a.arb_id ?? "",
    "EP_CLOA_NO": a.ep_cloa_no ?? "",
    "CARPABLE": a.carpable ?? "",
    "AREA_ALLOCATED": a.area_allocated ?? "",
    "ALLOCATED_CONDONED_AMOUNT": a.allocated_condoned_amount ?? "",
    "ELIGIBILITY": a.eligibility ?? "",
    "ELIGIBILITY_REASON": a.eligibility_reason ?? "",
    "DATE_ENCODED": a.date_encoded ?? "",
    "DATE_DISTRIBUTED": a.date_distributed ?? "",
    "REMARKS": a.remarks ?? "",
    "UPLOADED_BY": a.uploaded_by ?? "",
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "ARBs");

  if (rows.length > 0) {
    ws["!cols"] = Object.keys(rows[0]).map((key) => ({
      wch: Math.max(key.length, ...rows.map((r) => String(r[key as keyof typeof r] ?? "").length)),
    }));
  }

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  // Build filename
  const parts: string[] = ["ARBs"];
  const scopeLabel = scopedMunicipality
    ? scopedMunicipality.replace(/\s+/g, "-")
    : scopedProvince
    ? scopedProvince.replace(/\s+/g, "-")
    : null;
  if (scopeLabel) parts.push(scopeLabel);
  if (match) parts.push(match.charAt(0).toUpperCase() + match.slice(1));
  if (search) parts.push(`Search-${search.replace(/\s+/g, "-")}`);
  parts.push(new Date().toISOString().slice(0, 10));
  const filename = `${parts.join("_")}.xlsx`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
