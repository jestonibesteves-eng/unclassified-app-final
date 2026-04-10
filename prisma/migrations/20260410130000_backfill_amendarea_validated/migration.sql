UPDATE "Landholding" SET amendarea_validated = amendarea WHERE amendarea_validated IS NULL AND amendarea IS NOT NULL;
