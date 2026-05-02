-- Recreate CommitmentTarget: drop year, add target_date
-- Safe to recreate because the table was empty when first created.
DROP TABLE IF EXISTS "CommitmentTarget";

CREATE TABLE "CommitmentTarget" (
    "id"          INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "region"      TEXT    NOT NULL,
    "province"    TEXT,
    "committed"   INTEGER NOT NULL DEFAULT 0,
    "target_date" TEXT    NOT NULL DEFAULT '2026-06-15'
);

CREATE INDEX "CommitmentTarget_region_idx" ON "CommitmentTarget"("region");
