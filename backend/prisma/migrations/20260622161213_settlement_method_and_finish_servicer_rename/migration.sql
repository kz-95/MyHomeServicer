-- AlterTable
ALTER TABLE "invoices" ALTER COLUMN "due_date" SET DEFAULT (now() + interval '14 days');

-- AlterTable
ALTER TABLE "quote_requests" ADD COLUMN     "settlement_method" "SettlementMethod";

-- AlterTable
ALTER TABLE "servicer_credit_logs" RENAME CONSTRAINT "merchant_credit_logs_pkey" TO "servicer_credit_logs_pkey";

-- AlterTable
ALTER TABLE "servicer_deposits" RENAME CONSTRAINT "merchant_deposits_pkey" TO "servicer_deposits_pkey";

-- AlterTable
ALTER TABLE "servicer_documents" RENAME CONSTRAINT "merchant_documents_pkey" TO "servicer_documents_pkey";

-- AlterTable
ALTER TABLE "servicer_proposal_presets" RENAME CONSTRAINT "merchant_proposal_presets_pkey" TO "servicer_proposal_presets_pkey";

-- AlterTable
ALTER TABLE "servicer_schedules" RENAME CONSTRAINT "merchant_schedules_pkey" TO "servicer_schedules_pkey";

-- AlterTable
ALTER TABLE "servicer_services" RENAME CONSTRAINT "merchant_services_pkey" TO "servicer_services_pkey";

-- AlterTable
ALTER TABLE "servicer_withdrawals" RENAME CONSTRAINT "merchant_withdrawals_pkey" TO "servicer_withdrawals_pkey";

-- AlterTable
ALTER TABLE "servicers" RENAME CONSTRAINT "merchants_pkey" TO "servicers_pkey";

-- RenameForeignKey
ALTER TABLE "bookings" RENAME CONSTRAINT "bookings_merchant_id_fkey" TO "bookings_servicer_id_fkey";

-- RenameForeignKey
ALTER TABLE "category_requests" RENAME CONSTRAINT "category_requests_merchant_id_fkey" TO "category_requests_servicer_id_fkey";

-- RenameForeignKey
ALTER TABLE "invoices" RENAME CONSTRAINT "invoices_merchant_id_fkey" TO "invoices_servicer_id_fkey";

-- RenameForeignKey
ALTER TABLE "notifications" RENAME CONSTRAINT "notifications_merchant_id_fkey" TO "notifications_servicer_id_fkey";

-- RenameForeignKey
ALTER TABLE "penalty_appeals" RENAME CONSTRAINT "penalty_appeals_merchant_id_fkey" TO "penalty_appeals_servicer_id_fkey";

-- RenameForeignKey
ALTER TABLE "penalty_logs" RENAME CONSTRAINT "penalty_logs_merchant_id_fkey" TO "penalty_logs_servicer_id_fkey";

-- RenameForeignKey
ALTER TABLE "pricing_modules" RENAME CONSTRAINT "pricing_modules_merchant_id_fkey" TO "pricing_modules_servicer_id_fkey";

-- RenameForeignKey
ALTER TABLE "quote_broadcasts" RENAME CONSTRAINT "quote_broadcasts_merchant_id_fkey" TO "quote_broadcasts_servicer_id_fkey";

-- RenameForeignKey
ALTER TABLE "quote_proposals" RENAME CONSTRAINT "quote_proposals_merchant_id_fkey" TO "quote_proposals_servicer_id_fkey";

-- RenameForeignKey
ALTER TABLE "refresh_tokens" RENAME CONSTRAINT "refresh_tokens_merchant_id_fkey" TO "refresh_tokens_servicer_id_fkey";

-- RenameForeignKey
ALTER TABLE "servicer_credit_logs" RENAME CONSTRAINT "merchant_credit_logs_merchant_id_fkey" TO "servicer_credit_logs_servicer_id_fkey";

-- RenameForeignKey
ALTER TABLE "servicer_deposits" RENAME CONSTRAINT "merchant_deposits_merchant_id_fkey" TO "servicer_deposits_servicer_id_fkey";

-- RenameForeignKey
ALTER TABLE "servicer_documents" RENAME CONSTRAINT "merchant_documents_merchant_id_fkey" TO "servicer_documents_servicer_id_fkey";

-- RenameForeignKey
ALTER TABLE "servicer_identity_change_requests" RENAME CONSTRAINT "servicer_identity_change_requests_merchant_id_fkey" TO "servicer_identity_change_requests_servicer_id_fkey";

-- RenameForeignKey
ALTER TABLE "servicer_proposal_presets" RENAME CONSTRAINT "merchant_proposal_presets_merchant_id_fkey" TO "servicer_proposal_presets_servicer_id_fkey";

-- RenameForeignKey
ALTER TABLE "servicer_schedules" RENAME CONSTRAINT "merchant_schedules_merchant_id_fkey" TO "servicer_schedules_servicer_id_fkey";

-- RenameForeignKey
ALTER TABLE "servicer_services" RENAME CONSTRAINT "merchant_services_category_id_fkey" TO "servicer_services_category_id_fkey";

-- RenameForeignKey
ALTER TABLE "servicer_services" RENAME CONSTRAINT "merchant_services_merchant_id_fkey" TO "servicer_services_servicer_id_fkey";

-- RenameForeignKey
ALTER TABLE "servicer_withdrawals" RENAME CONSTRAINT "merchant_withdrawals_merchant_id_fkey" TO "servicer_withdrawals_servicer_id_fkey";

-- RenameForeignKey
ALTER TABLE "servicers" RENAME CONSTRAINT "merchants_category_id_fkey" TO "servicers_category_id_fkey";

-- RenameIndex
ALTER INDEX "bookings_merchant_id_status_idx" RENAME TO "bookings_servicer_id_status_idx";

-- RenameIndex
ALTER INDEX "notifications_merchant_id_is_read_idx" RENAME TO "notifications_servicer_id_is_read_idx";

-- RenameIndex
ALTER INDEX "penalty_logs_merchant_id_idx" RENAME TO "penalty_logs_servicer_id_idx";

-- RenameIndex
ALTER INDEX "pricing_modules_merchant_id_idx" RENAME TO "pricing_modules_servicer_id_idx";

-- RenameIndex
ALTER INDEX "quote_broadcasts_merchant_id_idx" RENAME TO "quote_broadcasts_servicer_id_idx";

-- RenameIndex
ALTER INDEX "quote_broadcasts_quote_request_id_merchant_id_key" RENAME TO "quote_broadcasts_quote_request_id_servicer_id_key";

-- RenameIndex
ALTER INDEX "quote_proposals_merchant_id_idx" RENAME TO "quote_proposals_servicer_id_idx";

-- RenameIndex
ALTER INDEX "quote_proposals_quote_request_id_merchant_id_key" RENAME TO "quote_proposals_quote_request_id_servicer_id_key";

-- RenameIndex
ALTER INDEX "refresh_tokens_merchant_id_idx" RENAME TO "refresh_tokens_servicer_id_idx";

-- RenameIndex
ALTER INDEX "merchant_credit_logs_merchant_id_idx" RENAME TO "servicer_credit_logs_servicer_id_idx";

-- RenameIndex
ALTER INDEX "merchant_deposits_merchant_id_key" RENAME TO "servicer_deposits_servicer_id_key";

-- RenameIndex
ALTER INDEX "merchant_documents_merchant_id_idx" RENAME TO "servicer_documents_servicer_id_idx";

-- RenameIndex
ALTER INDEX "servicer_identity_change_requests_merchant_id_status_idx" RENAME TO "servicer_identity_change_requests_servicer_id_status_idx";

-- RenameIndex
ALTER INDEX "merchant_proposal_presets_merchant_id_idx" RENAME TO "servicer_proposal_presets_servicer_id_idx";

-- RenameIndex
ALTER INDEX "merchant_schedules_merchant_id_weekday_time_slot_key" RENAME TO "servicer_schedules_servicer_id_weekday_time_slot_key";

-- RenameIndex
ALTER INDEX "merchant_services_category_id_idx" RENAME TO "servicer_services_category_id_idx";

-- RenameIndex
ALTER INDEX "merchant_services_merchant_id_merchant_sku_key" RENAME TO "servicer_services_servicer_id_servicer_sku_key";

-- RenameIndex
ALTER INDEX "merchant_withdrawals_merchant_id_status_idx" RENAME TO "servicer_withdrawals_servicer_id_status_idx";

-- RenameIndex
ALTER INDEX "merchants_email_idx" RENAME TO "servicers_email_idx";

-- RenameIndex
ALTER INDEX "merchants_email_key" RENAME TO "servicers_email_key";

-- RenameIndex
ALTER INDEX "merchants_google_id_key" RENAME TO "servicers_google_id_key";

-- RenameIndex
ALTER INDEX "merchants_is_online_is_banned_idx" RENAME TO "servicers_is_online_is_banned_idx";

-- RenameIndex
ALTER INDEX "merchants_reset_token_key" RENAME TO "servicers_reset_token_key";

-- RenameIndex
ALTER INDEX "transactions_merchant_id_idx" RENAME TO "transactions_servicer_id_idx";
