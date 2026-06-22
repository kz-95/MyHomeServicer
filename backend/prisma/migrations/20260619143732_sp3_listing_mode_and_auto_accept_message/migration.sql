-- AlterTable
ALTER TABLE "merchant_services" ADD COLUMN     "auto_accept_message" TEXT,
ADD COLUMN     "listing_mode" TEXT NOT NULL DEFAULT 'simple';
