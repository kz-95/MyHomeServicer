/*
  Warnings:

  - You are about to drop the column `auto_accept_message` on the `merchant_services` table. All the data in the column will be lost.
  - You are about to drop the column `listing_mode` on the `merchant_services` table. All the data in the column will be lost.
  - You are about to drop the column `listing_id` on the `quote_proposals` table. All the data in the column will be lost.

*/
-- AlterEnum
ALTER TYPE "QuoteStatus" ADD VALUE 'pending_payment';

-- AlterTable
ALTER TABLE "invoices" ALTER COLUMN "due_date" SET DEFAULT (now() + interval '14 days');

-- AlterTable
-- IF EXISTS guards: this migration sits between one that adds these columns and
-- one that re-adds them. The guards make a fresh replay order-independent and
-- prevent P3006 ("column does not exist") on clean rebuilds / CI shadow DB.
ALTER TABLE "merchant_services" DROP COLUMN IF EXISTS "auto_accept_message",
DROP COLUMN IF EXISTS "listing_mode";

-- AlterTable
ALTER TABLE "quote_proposals" DROP COLUMN IF EXISTS "listing_id";

-- DropEnum
DROP TYPE IF EXISTS "ListingMode";
