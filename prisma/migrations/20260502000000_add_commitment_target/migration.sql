-- CreateTable
CREATE TABLE "CommitmentTarget" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "year" INTEGER NOT NULL,
    "region" TEXT NOT NULL,
    "province" TEXT,
    "committed" INTEGER NOT NULL DEFAULT 0
);

-- CreateIndex
CREATE INDEX "CommitmentTarget_year_region_idx" ON "CommitmentTarget"("year", "region");
