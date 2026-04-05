-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Landholding" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "seqno_darro" TEXT NOT NULL,
    "lbp_seqno" TEXT,
    "clno" TEXT,
    "claim_no" TEXT,
    "class_field" TEXT,
    "claimclass" TEXT,
    "landowner" TEXT,
    "lo" TEXT,
    "province" TEXT,
    "province_edited" TEXT,
    "location" TEXT,
    "dateap" TEXT,
    "datebk" TEXT,
    "aoc" REAL,
    "fssc" REAL,
    "amendarea" REAL,
    "arr_area" REAL,
    "area" REAL,
    "osarea" REAL,
    "net_of_reval" REAL,
    "net_of_reval_no_neg" REAL,
    "year" TEXT,
    "fo2_area" REAL,
    "fo2" TEXT,
    "epcloa_is_area" REAL,
    "epcloa_is" TEXT,
    "split_area" REAL,
    "split" TEXT,
    "optool_area" REAL,
    "optool" TEXT,
    "fo3_area" REAL,
    "fo3" TEXT,
    "dar_match_status" TEXT,
    "source" TEXT,
    "duplicate_clno" TEXT,
    "cross_province" TEXT,
    "data_flags" TEXT,
    "status" TEXT DEFAULT 'For Further Validation',
    "condoned_amount" REAL,
    "amendarea_validated" REAL,
    "remarks" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_Landholding" ("amendarea", "amendarea_validated", "aoc", "area", "arr_area", "claim_no", "claimclass", "class_field", "clno", "condoned_amount", "created_at", "cross_province", "dar_match_status", "data_flags", "dateap", "datebk", "duplicate_clno", "epcloa_is", "epcloa_is_area", "fo2", "fo2_area", "fo3", "fo3_area", "fssc", "id", "landowner", "lbp_seqno", "lo", "location", "net_of_reval", "net_of_reval_no_neg", "optool", "optool_area", "osarea", "province", "province_edited", "remarks", "seqno_darro", "source", "split", "split_area", "status", "updated_at", "year") SELECT "amendarea", "amendarea_validated", "aoc", "area", "arr_area", "claim_no", "claimclass", "class_field", "clno", "condoned_amount", "created_at", "cross_province", "dar_match_status", "data_flags", "dateap", "datebk", "duplicate_clno", "epcloa_is", "epcloa_is_area", "fo2", "fo2_area", "fo3", "fo3_area", "fssc", "id", "landowner", "lbp_seqno", "lo", "location", "net_of_reval", "net_of_reval_no_neg", "optool", "optool_area", "osarea", "province", "province_edited", "remarks", "seqno_darro", "source", "split", "split_area", "status", "updated_at", "year" FROM "Landholding";
DROP TABLE "Landholding";
ALTER TABLE "new_Landholding" RENAME TO "Landholding";
CREATE UNIQUE INDEX "Landholding_seqno_darro_key" ON "Landholding"("seqno_darro");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
