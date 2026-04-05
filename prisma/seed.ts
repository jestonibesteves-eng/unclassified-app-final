import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import * as XLSX from "xlsx";
import * as path from "path";
import bcrypt from "bcryptjs";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

function toFloat(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  const n = parseFloat(String(val));
  return isNaN(n) ? null : n;
}

function toStr(val: unknown): string | null {
  if (val === null || val === undefined || val === "") return null;
  return String(val).trim();
}

async function main() {
  const filePath = path.resolve(
    __dirname,
    "../../unclassified/Region V Unclassified ARRs - Reconciled Supportlist.xlsx"
  );

  console.log("Reading Excel file...");
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets["Reconciled List"];
  const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws);
  // Trim whitespace from all header keys
  const rows: Record<string, unknown>[] = rawRows.map((r) => {
    const trimmed: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) trimmed[k.trim()] = v;
    return trimmed;
  });
  console.log(`Found ${rows.length} rows. Seeding...`);

  await prisma.arb.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.landholding.deleteMany();

  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH).map((r) => ({
      seqno_darro: String(r["SEQNO_DARRO"] ?? "").trim(),
      lbp_seqno: toStr(r["LBP_SEQNO"]),
      clno: toStr(r["CLNO"]),
      claim_no: toStr(r["CLAIM NO"]),
      class_field: toStr(r["CLASS"]),
      claimclass: toStr(r["CLAIMCLASS"]),
      landowner: toStr(r["LANDOWNER"]),
      lo: toStr(r["LO"]),
      province: toStr(r["PROVINCE"]),
      province_edited: toStr(r["PROVINCE_EDITED"]),
      location: toStr(r["LOCATION"]),
      dateap: toStr(r["DATEAP"]),
      datebk: toStr(r["DATEBK"]),
      aoc: toFloat(r["AOC"]),
      fssc: toFloat(r["FSSC"]),
      amendarea: toFloat(r["AMENDAREA"]),
      arr_area: toFloat(r["ARR_AREA"]),
      area: toFloat(r["AREA"]),
      osarea: toFloat(r["OSAREA"]),
      net_of_reval: toFloat(r["NET_OF_REVAL"]),
      net_of_reval_no_neg: toFloat(r["NET_OF_REVAL_NO_NEGATIVE"]),
      condoned_amount: toFloat(r["NET_OF_REVAL_NO_NEGATIVE"]),
      year: toStr(r["YEAR"]),
      fo2_area: toFloat(r["FO2_Area"]),
      fo2: toStr(r["FO2"]),
      epcloa_is_area: toFloat(r["EP/CLOA IS_Area"]),
      epcloa_is: toStr(r["EP/CLOA IS"]),
      split_area: toFloat(r["SPLIT_Area"]),
      split: toStr(r["SPLIT"]),
      optool_area: toFloat(r["Optool_Area"]),
      optool: toStr(r["Optool"]),
      fo3_area: toFloat(r["FO3_Area"]),
      fo3: toStr(r["FO3"]),
      dar_match_status: toStr(r["DAR_MATCH_STATUS"]),
      source: toStr(r["SOURCE"]),
      duplicate_clno: toStr(r["DUPLICATE_CLNO"]),
      cross_province: toStr(r["CROSS_PROVINCE"]),
      data_flags: toStr(r["DATA_FLAGS"]),
    }));

    await prisma.landholding.createMany({ data: batch });
    console.log(`  Inserted ${Math.min(i + BATCH, rows.length)} / ${rows.length}`);
  }

  // Seed default super admin (skip if already exists)
  const existing = await prisma.user.findUnique({ where: { username: "superadmin" } });
  if (!existing) {
    const hash = await bcrypt.hash("DARRegion5@2025", 12);
    await prisma.user.create({
      data: {
        username: "superadmin",
        password_hash: hash,
        full_name: "Super Administrator",
        role: "super_admin",
        office_level: "regional",
        must_change_password: true,
        is_active: true,
      },
    });
    console.log("Default super admin created: superadmin / DARRegion5@2025");
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
