-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'urgent_fee';

-- AlterTable
ALTER TABLE "invoices" ALTER COLUMN "due_date" SET DEFAULT (now() + interval '14 days');
