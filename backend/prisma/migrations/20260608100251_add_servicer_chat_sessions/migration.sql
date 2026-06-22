-- DropForeignKey
ALTER TABLE "chat_sessions" DROP CONSTRAINT "chat_sessions_user_id_fkey";

-- AlterTable
ALTER TABLE "chat_sessions" ADD COLUMN     "servicer_id" UUID,
ALTER COLUMN "user_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "invoices" ALTER COLUMN "due_date" SET DEFAULT (now() + interval '14 days');

-- CreateIndex
CREATE INDEX "chat_sessions_servicer_id_idx" ON "chat_sessions"("servicer_id");

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_servicer_id_fkey" FOREIGN KEY ("servicer_id") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
