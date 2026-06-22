-- AlterTable
ALTER TABLE "invoices" ALTER COLUMN "due_date" SET DEFAULT (now() + interval '14 days');

-- AlterTable
ALTER TABLE "merchants" ADD COLUMN     "chat_banned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "chat_strike_count" INTEGER NOT NULL DEFAULT 0;
