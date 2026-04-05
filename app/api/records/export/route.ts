import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session";
import * as XLSX from "xlsx";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionUser = token ? await verifySessionToken(token) : null;
  if (!sessionUser) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const search = searchParams.get("search") ?? "";
  const province = searchParams.get("province") ?? "";
  const municipality = searchParams.get("municipality") ?? "";
  const source = searchParams.get("source") ?? "";
  const flag = searchParams.get("flag") ?? "";
  const status = searchParams.get("status") ?? "";
  const type = searchParams.get("type") === "full" ? "full" : "simplified";

  const scopedProvince =
    sessionUser.office_level === "regional"
      ? province
      : sessionUser.province ?? province;

  const scopedMunicipality =
    sessionUser.office_level === "municipal"
      ? sessionUser.municipality ?? municipality
      : municipality;

  const where: Prisma.LandholdingWhereInput = {
    AND: [
      search
        ? {
            OR: [
              { seqno_darro: { contains: search } },
              { clno: { contains: search } },
              { landowner: { contains: search } },
              { claim_no: { contains: search } },
            ],
          }
        : {},
      scopedProvince ? { province_edited: scopedProvince } : {},
      scopedMunicipality ? { municipality: { contains: scopedMunicipality } } : {},
      source ? { source } : {},
      flag === "none"
        ? {
            AND: [
              { OR: [{ amendarea_validated: { gt: 0 } }, { AND: [{ amendarea_validated: null }, { amendarea: { gt: 0 } }] }] },
              { OR: [{ condoned_amount: { gt: 0 } }, { AND: [{ condoned_amount: null }, { net_of_reval_no_neg: { gt: 0 } }] }] },
            ],
          }
        : flag === "zero_amendarea"
        ? {
            OR: [
              { amendarea_validated: { lte: 0 } },
              { AND: [{ amendarea_validated: null }, { amendarea: { lte: 0 } }] },
              { AND: [{ amendarea_validated: null }, { amendarea: null }] },
            ],
          }
        : flag === "zero_condoned"
        ? {
            OR: [
              { condoned_amount: { lte: 0 } },
              { AND: [{ condoned_amount: null }, { net_of_reval_no_neg: { lte: 0 } }] },
            ],
          }
        : flag === "cross_province"
        ? { cross_province: { not: null } }
        : flag
        ? {
            data_flags: { contains: flag },
            NOT: { condoned_amount: { gt: 0 } },
          }
        : {},
      status ? { status } : {},
    ],
  };

  const records = await prisma.landholding.findMany({
    where,
    select: {
      seqno_darro: true,
      lbp_seqno: true,
      clno: true,
      claim_no: true,
      class_field: true,
      claimclass: true,
      landowner: true,
      lo: true,
      province: true,
      province_edited: true,
      location: true,
      municipality: true,
      barangay: true,
      source: true,
      dateap: true,
      datebk: true,
      aoc: true,
      fssc: true,
      amendarea: true,
      arr_area: true,
      area: true,
      osarea: true,
      amendarea_validated: true,
      net_of_reval: true,
      net_of_reval_no_neg: true,
      condoned_amount: true,
      year: true,
      fo2_area: true,
      fo2: true,
      epcloa_is_area: true,
      epcloa_is: true,
      split_area: true,
      split: true,
      optool_area: true,
      optool: true,
      fo3_area: true,
      fo3: true,
      dar_match_status: true,
      duplicate_clno: true,
      cross_province: true,
      data_flags: true,
      status: true,
      remarks: true,
      _count: { select: { arbs: true } },
    },
    orderBy: { seqno_darro: "asc" },
  });

  type RecordRow = Record<string, string | number>;

  let rows: RecordRow[];

  if (type === "simplified") {
    rows = records.map((r) => ({
      "SEQNO_DARRO": r.seqno_darro,
      "CLNO": r.clno ?? "",
      "LANDOWNER": r.landowner ?? "",
      "PROVINCE": r.province_edited ?? "",
      "MUNICIPALITY": r.municipality ?? "",
      "CLASS": r.claimclass ?? "",
      "SOURCE": r.source ?? "",
      "AMENDAREA_VALIDATED": r.amendarea_validated ?? r.amendarea ?? "",
      "CONDONED_AMOUNT": r.condoned_amount ?? r.net_of_reval_no_neg ?? "",
      "DATA_FLAGS": r.data_flags ?? "",
      "STATUS": r.status ?? "",
      "REASON_FOR_NON_ELIGIBILITY": r.status === "Not Eligible for Encoding" ? (r.remarks ?? "") : "",
      "ARB_COUNT": r._count.arbs,
    }));
  } else {
    rows = records.map((r) => ({
      "SEQNO_DARRO": r.seqno_darro,
      "LBP_SEQNO": r.lbp_seqno ?? "",
      "CLNO": r.clno ?? "",
      "CLAIM_NO": r.claim_no ?? "",
      "CLASS_FIELD": r.class_field ?? "",
      "CLAIMCLASS": r.claimclass ?? "",
      "LANDOWNER": r.landowner ?? "",
      "LO": r.lo ?? "",
      "PROVINCE_ORIGINAL": r.province ?? "",
      "PROVINCE": r.province_edited ?? "",
      "LOCATION": r.location ?? "",
      "MUNICIPALITY": r.municipality ?? "",
      "BARANGAY": r.barangay ?? "",
      "SOURCE": r.source ?? "",
      "DATE_AP": r.dateap ?? "",
      "DATE_BK": r.datebk ?? "",
      "YEAR": r.year ?? "",
      "AOC": r.aoc ?? "",
      "FSSC": r.fssc ?? "",
      "AMENDAREA": r.amendarea ?? "",
      "AMENDAREA_VALIDATED": r.amendarea_validated ?? r.amendarea ?? "",
      "ARR_AREA": r.arr_area ?? "",
      "AREA": r.area ?? "",
      "OSAREA": r.osarea ?? "",
      "NET_OF_REVAL": r.net_of_reval ?? "",
      "NET_OF_REVAL_NO_NEG": r.net_of_reval_no_neg ?? "",
      "CONDONED_AMOUNT": r.condoned_amount ?? r.net_of_reval_no_neg ?? "",
      "FO2": r.fo2 ?? "",
      "FO2_AREA": r.fo2_area ?? "",
      "EP_CLOA_IS": r.epcloa_is ?? "",
      "EP_CLOA_IS_AREA": r.epcloa_is_area ?? "",
      "SPLIT": r.split ?? "",
      "SPLIT_AREA": r.split_area ?? "",
      "OPTOOL": r.optool ?? "",
      "OPTOOL_AREA": r.optool_area ?? "",
      "FO3": r.fo3 ?? "",
      "FO3_AREA": r.fo3_area ?? "",
      "DAR_MATCH_STATUS": r.dar_match_status ?? "",
      "DUPLICATE_CLNO": r.duplicate_clno ?? "",
      "CROSS_PROVINCE": r.cross_province ?? "",
      "DATA_FLAGS": r.data_flags ?? "",
      "STATUS": r.status ?? "",
      "REASON_FOR_NON_ELIGIBILITY": r.status === "Not Eligible for Encoding" ? (r.remarks ?? "") : "",
      "REMARKS": r.status === "Not Eligible for Encoding" ? "" : (r.remarks ?? ""),
      "ARB_COUNT": r._count.arbs,
    }));
  }

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Records");

  // Auto-width columns
  if (rows.length > 0) {
    const colWidths = Object.keys(rows[0]).map((key) => ({
      wch: Math.max(key.length, ...rows.map((r) => String(r[key] ?? "").length)),
    }));
    ws["!cols"] = colWidths;
  }

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  // Build filename from active filters
  const parts: string[] = ["Records", type === "full" ? "Full" : "Simplified"];
  const scopeLabel = scopedMunicipality
    ? scopedMunicipality.replace(/\s+/g, "-")
    : scopedProvince
    ? scopedProvince.replace(/\s+/g, "-")
    : null;
  if (scopeLabel) parts.push(scopeLabel);
  if (status) parts.push(status.replace(/\s+/g, "-"));
  if (source) parts.push(source.replace(/\s+/g, "-"));
  if (flag && flag !== "none") parts.push(flag.replace(/\s+/g, "-"));
  else if (flag === "none") parts.push("No-Issues");
  if (search) parts.push(`Search-${search.replace(/\s+/g, "-")}`);
  const today = new Date().toISOString().slice(0, 10);
  parts.push(today);
  const filename = `${parts.join("_")}.xlsx`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
