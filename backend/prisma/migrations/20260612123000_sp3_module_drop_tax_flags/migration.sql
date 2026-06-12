-- SP-3: ServicerModule carries no per-item tax flags (flat tax from business profile).
-- Drop the columns added in 20260612120000_sp3_servicer_modules.
ALTER TABLE "business_modules" DROP COLUMN IF EXISTS "taxable";
ALTER TABLE "business_modules" DROP COLUMN IF EXISTS "service_chargeable";
