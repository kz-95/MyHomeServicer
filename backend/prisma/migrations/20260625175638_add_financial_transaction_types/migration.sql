-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TransactionType" ADD VALUE 'gateway_fee';
ALTER TYPE "TransactionType" ADD VALUE 'registered_customer_discount';
ALTER TYPE "TransactionType" ADD VALUE 'promo_cost';
ALTER TYPE "TransactionType" ADD VALUE 'points_liability';

-- AlterTable
ALTER TABLE "invoices" ALTER COLUMN "due_date" SET DEFAULT (now() + interval '14 days');
