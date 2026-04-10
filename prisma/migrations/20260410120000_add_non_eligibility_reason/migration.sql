-- Add non_eligibility_reason column to Landholding
-- Separates the reason for "Not Eligible for Encoding" from the general remarks field
ALTER TABLE "Landholding" ADD COLUMN "non_eligibility_reason" TEXT;
