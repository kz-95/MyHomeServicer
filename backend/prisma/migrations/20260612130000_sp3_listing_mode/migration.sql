-- SP-3 Phase 2: listing mode (simple/advanced) + auto-accept message on listings.
CREATE TYPE "ListingMode" AS ENUM ('simple', 'advanced');

ALTER TABLE "merchant_services" ADD COLUMN "listing_mode" "ListingMode" NOT NULL DEFAULT 'simple';
ALTER TABLE "merchant_services" ADD COLUMN "auto_accept_message" TEXT;
