-- Rename "merchant" -> "servicer" across the schema (data-preserving).
-- All renames are non-destructive: ALTER ... RENAME keeps data, FKs, and
-- indexes intact (Postgres tracks them by OID). Column renames are done by
-- column name (table-agnostic) so they cover every table that has the column.
-- Idempotent-ish: table renames use IF EXISTS; column loops only touch columns
-- that still exist under the old name.

-- 1) Stored enum value (PromotionOwnerType.merchant -> servicer)
ALTER TYPE "PromotionOwnerType" RENAME VALUE 'merchant' TO 'servicer';

-- 2) Column renames (by column name, across all public tables)
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT table_name FROM information_schema.columns
           WHERE table_schema = 'public' AND column_name = 'merchant_id' LOOP
    EXECUTE format('ALTER TABLE %I RENAME COLUMN "merchant_id" TO "servicer_id"', r.table_name);
  END LOOP;

  FOR r IN SELECT table_name FROM information_schema.columns
           WHERE table_schema = 'public' AND column_name = 'merchant_sku' LOOP
    EXECUTE format('ALTER TABLE %I RENAME COLUMN "merchant_sku" TO "servicer_sku"', r.table_name);
  END LOOP;

  FOR r IN SELECT table_name FROM information_schema.columns
           WHERE table_schema = 'public' AND column_name = 'uploader_merchant_id' LOOP
    EXECUTE format('ALTER TABLE %I RENAME COLUMN "uploader_merchant_id" TO "uploader_servicer_id"', r.table_name);
  END LOOP;

  FOR r IN SELECT table_name FROM information_schema.columns
           WHERE table_schema = 'public' AND column_name = 'paid_to_merchant_via_credit' LOOP
    EXECUTE format('ALTER TABLE %I RENAME COLUMN "paid_to_merchant_via_credit" TO "paid_to_servicer_via_credit"', r.table_name);
  END LOOP;

  FOR r IN SELECT table_name FROM information_schema.columns
           WHERE table_schema = 'public' AND column_name = 'merchant_deadline' LOOP
    EXECUTE format('ALTER TABLE %I RENAME COLUMN "merchant_deadline" TO "servicer_deadline"', r.table_name);
  END LOOP;
END $$;

-- 3) Table renames (IF EXISTS — older SP-3 tables may already be servicer_*)
ALTER TABLE IF EXISTS "merchants"                  RENAME TO "servicers";
ALTER TABLE IF EXISTS "merchant_deposits"          RENAME TO "servicer_deposits";
ALTER TABLE IF EXISTS "merchant_documents"         RENAME TO "servicer_documents";
ALTER TABLE IF EXISTS "merchant_schedules"         RENAME TO "servicer_schedules";
ALTER TABLE IF EXISTS "merchant_services"          RENAME TO "servicer_services";
ALTER TABLE IF EXISTS "merchant_proposal_presets"  RENAME TO "servicer_proposal_presets";
ALTER TABLE IF EXISTS "merchant_credit_logs"       RENAME TO "servicer_credit_logs";
ALTER TABLE IF EXISTS "merchant_withdrawals"       RENAME TO "servicer_withdrawals";
ALTER TABLE IF EXISTS "merchant_wa_presets"        RENAME TO "servicer_wa_presets";
ALTER TABLE IF EXISTS "merchant_identity_change_requests" RENAME TO "servicer_identity_change_requests";

-- 4) Migrate stored FAQ audience tier value
UPDATE "faqs" SET "tier" = 'servicer' WHERE "tier" = 'merchant';
