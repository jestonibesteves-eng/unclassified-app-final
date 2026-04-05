-- CreateTable
CREATE TABLE "Landholding" (
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
    "status" TEXT DEFAULT 'Untagged',
    "condoned_amount" REAL,
    "remarks" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Arb" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "seqno_darro" TEXT NOT NULL,
    "arb_name" TEXT,
    "arb_no" TEXT,
    "ep_cloa_no" TEXT,
    "area_allocated" REAL,
    "municipality" TEXT,
    "barangay" TEXT,
    "remarks" TEXT,
    "uploaded_by" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Arb_seqno_darro_fkey" FOREIGN KEY ("seqno_darro") REFERENCES "Landholding" ("seqno_darro") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "seqno_darro" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "field_changed" TEXT,
    "old_value" TEXT,
    "new_value" TEXT,
    "changed_by" TEXT DEFAULT 'System',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_seqno_darro_fkey" FOREIGN KEY ("seqno_darro") REFERENCES "Landholding" ("seqno_darro") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Landholding_seqno_darro_key" ON "Landholding"("seqno_darro");
