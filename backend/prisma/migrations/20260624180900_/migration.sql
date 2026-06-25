-- AlterTable
ALTER TABLE "business_modules" ADD COLUMN     "duration_min" INTEGER,
ADD COLUMN     "option_value" TEXT,
ADD COLUMN     "question_key" TEXT;

-- AlterTable
ALTER TABLE "invoices" ALTER COLUMN "due_date" SET DEFAULT (now() + interval '14 days');
