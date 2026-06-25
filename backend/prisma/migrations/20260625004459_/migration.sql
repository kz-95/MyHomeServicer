-- AlterTable
ALTER TABLE "invoices" ALTER COLUMN "due_date" SET DEFAULT (now() + interval '14 days');

-- AlterTable
ALTER TABLE "servicer_services" ADD COLUMN     "label" TEXT,
ADD COLUMN     "proposal_preset" TEXT;
