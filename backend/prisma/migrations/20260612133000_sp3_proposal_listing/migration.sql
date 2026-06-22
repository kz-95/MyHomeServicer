-- SP-3 Phase 2: link a proposal to the listing it derives from (breakdown + add-ons).
ALTER TABLE "quote_proposals" ADD COLUMN "listing_id" UUID;
