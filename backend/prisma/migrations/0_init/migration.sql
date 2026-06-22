-- CreateEnum
CREATE TYPE "Role" AS ENUM ('customer', 'admin');

-- CreateEnum
CREATE TYPE "TimeSlot" AS ENUM ('morning', 'noon', 'afternoon', 'evening', 'night');

-- CreateEnum
CREATE TYPE "Weekday" AS ENUM ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun');

-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('ios', 'android', 'web');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('password_reset', 'phone_verify');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "PriceType" AS ENUM ('fixed', 'hourly', 'quote');

-- CreateEnum
CREATE TYPE "TaxMode" AS ENUM ('inclusive', 'exclusive', 'none');

-- CreateEnum
CREATE TYPE "PenaltyType" AS ENUM ('noshow', 'cancel');

-- CreateEnum
CREATE TYPE "PenaltyCalcMode" AS ENUM ('fixed', 'percentage');

-- CreateEnum
CREATE TYPE "PenaltyStatus" AS ENUM ('applied', 'reversed');

-- CreateEnum
CREATE TYPE "AppealStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "DeadlineMode" AS ENUM ('fcfs', 'fixed_time');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('pay_now', 'pay_later', 'cash');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('open', 'matched', 'expired', 'cancelled', 'reposted');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('submitted', 'selected', 'rejected');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('pending_confirm', 'confirmed', 'in_progress', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "MutualCancelStatus" AS ENUM ('pending', 'accepted', 'rejected');

-- CreateEnum
CREATE TYPE "TipStatus" AS ENUM ('pending', 'paid');

-- CreateEnum
CREATE TYPE "EscrowStatus" AS ENUM ('held', 'released', 'refunded');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('escrow_hold', 'escrow_release', 'refund', 'tip', 'penalty', 'deposit', 'discount', 'platform_fee', 'promo_payback', 'withdrawal', 'gateway_payment', 'deposit_topup');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('pending', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('percent', 'fixed');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('open', 'resolved');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('queued', 'active', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "ChatContextType" AS ENUM ('general', 'booking_support', 'quote_help');

-- CreateEnum
CREATE TYPE "ChatRole" AS ENUM ('user', 'assistant');

-- CreateEnum
CREATE TYPE "CreditLogType" AS ENUM ('promo_payback', 'withdrawal', 'manual_adjustment');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('pending', 'approved', 'paid', 'rejected');

-- CreateEnum
CREATE TYPE "CategoryRequestStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "PromotionOwnerType" AS ENUM ('platform', 'merchant');

-- CreateEnum
CREATE TYPE "PromotionScope" AS ENUM ('all', 'category', 'service');

-- CreateEnum
CREATE TYPE "DocType" AS ENUM ('ic_front', 'ic_back', 'selfie', 'supporting');

-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('pending', 'confirmed');

-- CreateEnum
CREATE TYPE "OrderHistoryType" AS ENUM ('service', 'category');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('sole_proprietorship', 'partnership', 'enterprise', 'sdn_bhd');

-- CreateEnum
CREATE TYPE "PaymentTiming" AS ENUM ('pay_now', 'pay_later');

-- CreateEnum
CREATE TYPE "SettlementMethod" AS ENUM ('gateway', 'credit', 'cash');

-- CreateEnum
CREATE TYPE "IdentityRequestStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "role" "Role" NOT NULL DEFAULT 'customer',
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "password_hash" TEXT,
    "google_id" TEXT,
    "contact_name" TEXT,
    "contact_number" TEXT,
    "preferred_time_slot" "TimeSlot",
    "action_pin_hash" TEXT,
    "credit_balance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "notification_prefs" JSONB,
    "bio" TEXT,
    "avatar_url" TEXT,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "password_changed_at" TIMESTAMP(3),
    "backup_email" TEXT,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "chat_banned" BOOLEAN NOT NULL DEFAULT false,
    "chat_strike_count" INTEGER NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deactivation_count" INTEGER NOT NULL DEFAULT 0,
    "deactivated_at" TIMESTAMP(3),
    "reset_token" TEXT,
    "reset_token_expiry" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_addresses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "property_type" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "postcode" TEXT,
    "district" TEXT,
    "state" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_presets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "label" TEXT,
    "contact_name" TEXT NOT NULL,
    "contact_number" TEXT NOT NULL,
    "address_id" UUID NOT NULL,
    "instruction" TEXT,
    "preferred_time_slot" "TimeSlot",
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quote_presets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_devices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "device_token" TEXT NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "merchant_id" UUID,
    "token_hash" TEXT NOT NULL,
    "device_id" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "merchant_id" UUID,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link_url" TEXT,
    "category" TEXT,
    "link_quote_list" TEXT,
    "link_reorder" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "password_hash" TEXT,
    "pin_hash" TEXT,
    "show_email_public" BOOLEAN NOT NULL DEFAULT false,
    "show_phone_public" BOOLEAN NOT NULL DEFAULT false,
    "invoice_content" TEXT,
    "invoice_suffix" TEXT,
    "google_id" TEXT,
    "business_name" TEXT NOT NULL,
    "bio" TEXT,
    "logo_url" TEXT,
    "is_company" BOOLEAN NOT NULL DEFAULT false,
    "tax_number" TEXT,
    "business_registration_number" TEXT,
    "entityType" "EntityType",
    "sst_registered" BOOLEAN NOT NULL DEFAULT false,
    "sst_number" TEXT,
    "service_charge_rate" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "tax_inclusive" BOOLEAN NOT NULL DEFAULT false,
    "service_areas" TEXT[],
    "operating_hours" JSONB NOT NULL DEFAULT '[]',
    "category_id" UUID NOT NULL,
    "is_online" BOOLEAN NOT NULL DEFAULT true,
    "kyc_status" "KycStatus" NOT NULL DEFAULT 'approved',
    "bank_name" TEXT,
    "bank_account" TEXT,
    "onboarded" BOOLEAN NOT NULL DEFAULT false,
    "credit_balance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "max_auto_accepts" INTEGER NOT NULL DEFAULT 3,
    "invoice_prefix" TEXT NOT NULL DEFAULT 'INV',
    "invoice_year_format" TEXT NOT NULL DEFAULT 'YYYY',
    "invoice_separator" TEXT NOT NULL DEFAULT '-',
    "invoice_padding" INTEGER NOT NULL DEFAULT 4,
    "invoice_next_number" INTEGER NOT NULL DEFAULT 1,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "is_banned" BOOLEAN NOT NULL DEFAULT false,
    "weekly_noshow" INTEGER NOT NULL DEFAULT 0,
    "consecutive_noshow" INTEGER NOT NULL DEFAULT 0,
    "notification_prefs" JSONB,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deactivation_count" INTEGER NOT NULL DEFAULT 0,
    "deactivated_at" TIMESTAMP(3),
    "reset_token" TEXT,
    "reset_token_expiry" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_deposits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "merchant_id" UUID NOT NULL,
    "total_deposited" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "current_balance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "minimum_required" DECIMAL(10,2) NOT NULL DEFAULT 100,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchant_deposits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "merchant_id" UUID NOT NULL,
    "doc_type" "DocType" NOT NULL,
    "file_id" UUID NOT NULL,
    "status" "KycStatus" NOT NULL DEFAULT 'pending',
    "admin_note" TEXT,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchant_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_schedules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "merchant_id" UUID NOT NULL,
    "weekday" "Weekday" NOT NULL,
    "time_slot" "TimeSlot" NOT NULL,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merchant_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_services" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "merchant_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "merchant_sku" TEXT,
    "base_price" DECIMAL(10,2) NOT NULL,
    "price_type" "PriceType" NOT NULL DEFAULT 'fixed',
    "modifiers" JSONB,
    "tax_mode" "TaxMode" NOT NULL DEFAULT 'none',
    "tax_name" TEXT,
    "tax_rate" DECIMAL(5,2),
    "estimated_duration_minutes" INTEGER NOT NULL DEFAULT 60,
    "travel_fee" DECIMAL(10,2),
    "supplies_fee" DECIMAL(10,2),
    "requires_inspection" BOOLEAN NOT NULL DEFAULT false,
    "procedure" TEXT,
    "auto_accept" BOOLEAN NOT NULL DEFAULT false,
    "auto_accept_conditions" JSONB,
    "auto_accept_preset_id" UUID,
    "field_requirements" JSONB,
    "module_refs" JSONB NOT NULL DEFAULT '[]',
    "service_charge_rate" DECIMAL(5,4),
    "tax_inclusive" BOOLEAN,
    "sst_applies" BOOLEAN,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchant_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_modules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "merchant_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "default_price" DECIMAL(10,2) NOT NULL,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "service_chargeable" BOOLEAN NOT NULL DEFAULT true,
    "category_id" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pricing_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "icon" TEXT,
    "image_url" TEXT,
    "parent_category_id" UUID,
    "default_price_suggestion" DECIMAL(10,2),
    "default_estimated_duration_minutes" INTEGER,
    "question_schema" JSONB,
    "allowed_time_slots" TEXT[] DEFAULT ARRAY['morning', 'noon', 'afternoon', 'evening', 'night']::TEXT[],
    "deleted_at" TIMESTAMP(3),
    "published" BOOLEAN NOT NULL DEFAULT false,
    "banner_url" TEXT,
    "card_color" TEXT,
    "description" TEXT,
    "travel_fee_baseline" DECIMAL(10,2),
    "supplies_fee_baseline" DECIMAL(10,2),
    "requires_inspection" BOOLEAN NOT NULL DEFAULT false,
    "procedure" TEXT,
    "photos_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "penalty_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" "PenaltyType" NOT NULL,
    "calc_mode" "PenaltyCalcMode" NOT NULL DEFAULT 'fixed',
    "amount" DECIMAL(10,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "penalty_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "penalty_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "rule_id" UUID,
    "type" "PenaltyType" NOT NULL,
    "amount_deducted" DECIMAL(10,2) NOT NULL,
    "customer_refund" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "transaction_id" UUID,
    "status" "PenaltyStatus" NOT NULL DEFAULT 'applied',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "penalty_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "penalty_appeals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "penalty_log_id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "AppealStatus" NOT NULL DEFAULT 'pending',
    "admin_note" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "penalty_appeals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "address_id" UUID NOT NULL,
    "contact_name" TEXT NOT NULL,
    "contact_number" TEXT NOT NULL,
    "time_slot" "TimeSlot" NOT NULL,
    "preferred_date" TIMESTAMP(3) NOT NULL,
    "property_type" TEXT,
    "budget_min" DECIMAL(10,2),
    "budget_max" DECIMAL(10,2),
    "payment_mode" "PaymentMode" NOT NULL,
    "tip_amount" DECIMAL(10,2),
    "deadline_mode" "DeadlineMode" NOT NULL,
    "proposal_deadline" TIMESTAMP(3) NOT NULL,
    "merchant_deadline" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "promo_code" TEXT,
    "service_details" JSONB,
    "status" "QuoteStatus" NOT NULL DEFAULT 'open',
    "parent_quote_id" UUID,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quote_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_proposals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "quote_request_id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "proposed_price" DECIMAL(10,2) NOT NULL,
    "line_items" JSONB NOT NULL DEFAULT '[]',
    "module_refs" JSONB NOT NULL DEFAULT '[]',
    "message" TEXT,
    "eta_minutes" INTEGER,
    "preset_id" UUID,
    "is_auto" BOOLEAN NOT NULL DEFAULT false,
    "status" "ProposalStatus" NOT NULL DEFAULT 'submitted',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quote_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_broadcasts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "quote_request_id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opened_at" TIMESTAMP(3),
    "declined_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_broadcasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_number" SERIAL NOT NULL,
    "quote_request_id" UUID NOT NULL,
    "proposal_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'pending_confirm',
    "price" DECIMAL(10,2) NOT NULL,
    "payment_mode" "PaymentMode" NOT NULL,
    "payment_timing" "PaymentTiming",
    "settlement_method" "SettlementMethod",
    "line_items" JSONB NOT NULL DEFAULT '[]',
    "scheduled_date" TIMESTAMP(3) NOT NULL,
    "time_slot" "TimeSlot" NOT NULL,
    "arrive_photo_url" TEXT,
    "done_photo_url" TEXT,
    "notes" TEXT,
    "cash_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "cash_confirmed_at" TIMESTAMP(3),
    "mutual_cancel_requested" BOOLEAN NOT NULL DEFAULT false,
    "mutual_cancel_status" "MutualCancelStatus",
    "mutual_cancel_reason" TEXT,
    "cancel_requested_at" TIMESTAMP(3),
    "cancel_confirmed_at" TIMESTAMP(3),
    "cancelled_by" TEXT,
    "cancel_reason" TEXT,
    "tip_status" "TipStatus",
    "tip_amount" DECIMAL(10,2),
    "tip_paid_at" TIMESTAMP(3),
    "confirmed_at" TIMESTAMP(3),
    "arrived_at" TIMESTAMP(3),
    "travel_fee" DECIMAL(10,2),
    "inspection_fee" DECIMAL(10,2),
    "is_inspection" BOOLEAN NOT NULL DEFAULT false,
    "done_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" "OrderHistoryType" NOT NULL,
    "booking_id" UUID,
    "merchant_id" UUID,
    "category_id" UUID,
    "snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_type" TEXT NOT NULL,
    "owner_id" UUID,
    "uploader_user_id" UUID,
    "uploader_merchant_id" UUID,
    "purpose" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "s3_key" TEXT NOT NULL,
    "url" TEXT,
    "status" "FileStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escrows" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "platform_fee_base" DECIMAL(10,2),
    "tip_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "status" "EscrowStatus" NOT NULL DEFAULT 'held',
    "held_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_at" TIMESTAMP(3),
    "refunded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "escrows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" "TransactionType" NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'completed',
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MYR',
    "booking_id" UUID,
    "merchant_id" UUID,
    "user_id" UUID,
    "escrow_id" UUID,
    "reference" TEXT,
    "idempotency_key" TEXT,
    "stripe_payment_intent_id" TEXT,
    "stripe_session_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discount_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "quote_request_id" UUID,
    "discount_type" "DiscountType" NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "is_used" BOOLEAN NOT NULL DEFAULT false,
    "used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discount_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID,
    "user_id" UUID NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'open',
    "admin_note" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_user_id" UUID,
    "actor_type" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "old_value" JSONB,
    "new_value" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flags" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_fallback" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "response_status" INTEGER,
    "response_body" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_fallback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_queue" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "job_name" TEXT NOT NULL,
    "job_key" TEXT,
    "payload" JSONB NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "run_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "context_type" "ChatContextType" NOT NULL,
    "context_id" UUID,
    "dify_conversation_id" TEXT,
    "total_tokens_used" INTEGER,
    "last_read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "role" "ChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "tokens_used" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faqs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "category" TEXT,
    "tier" TEXT NOT NULL DEFAULT 'guest',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "faqs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_proposal_presets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "merchant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "price_offset" DECIMAL(10,2),
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchant_proposal_presets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_credit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "merchant_id" UUID NOT NULL,
    "type" "CreditLogType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "balance_after" DECIMAL(10,2) NOT NULL,
    "reference_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merchant_credit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_withdrawals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "merchant_id" UUID NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "bank_name" TEXT NOT NULL,
    "bank_account" TEXT NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'pending',
    "admin_note" TEXT,
    "idempotency_key" TEXT,
    "approved_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchant_withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "merchant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "parent_category_id" UUID,
    "description" TEXT,
    "status" "CategoryRequestStatus" NOT NULL DEFAULT 'pending',
    "admin_note" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_category_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "servicer_identity_change_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "merchant_id" UUID NOT NULL,
    "status" "IdentityRequestStatus" NOT NULL DEFAULT 'pending',
    "proposed" JSONB NOT NULL,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "servicer_identity_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "label" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "triggerType" TEXT NOT NULL,
    "valueType" TEXT NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "conditions" JSONB NOT NULL DEFAULT '{}',
    "targetRole" TEXT NOT NULL DEFAULT 'all',
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "max_uses" INTEGER,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "max_per_user" INTEGER DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_redemptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "promotion_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "booking_id" UUID,
    "amount_discounted" DECIMAL(10,2) NOT NULL,
    "paid_to_merchant_via_credit" BOOLEAN NOT NULL DEFAULT false,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotion_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_marketing_budgets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "total_budget" DECIMAL(10,2) NOT NULL,
    "spent_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_marketing_budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_tiers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "min_points" INTEGER NOT NULL,
    "bonus_percent" INTEGER NOT NULL DEFAULT 0,
    "badge_color" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loyalty_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_points" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "lifetime_earned" INTEGER NOT NULL DEFAULT 0,
    "lifetime_spent" INTEGER NOT NULL DEFAULT 0,
    "last_rewards_visit" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "points_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "points_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rewards" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "pointCost" INTEGER NOT NULL,
    "discountType" TEXT NOT NULL,
    "discountValue" DECIMAL(10,2) NOT NULL,
    "maxDiscount" DECIMAL(10,2),
    "minTopup" DECIMAL(10,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "redemptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "reward_id" UUID NOT NULL,
    "voucher_code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "sequence_number" INTEGER NOT NULL,
    "line_items" JSONB NOT NULL DEFAULT '[]',
    "subtotal" DECIMAL(10,2),
    "promo_discount" DECIMAL(10,2),
    "service_charge_rate" DECIMAL(5,4),
    "service_charge_amount" DECIMAL(10,2),
    "sst_applies" BOOLEAN,
    "tax_inclusive" BOOLEAN,
    "tax_rate" DECIMAL(5,4),
    "tax_amount" DECIMAL(10,2),
    "tip_amount" DECIMAL(10,2),
    "total" DECIMAL(10,2),
    "platform_fee" DECIMAL(10,2),
    "currency" TEXT NOT NULL DEFAULT 'MYR',
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_date" TIMESTAMP(3) DEFAULT (now() + interval '14 days'),
    "paid_at" TIMESTAMP(3),
    "pdf_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banned_emails" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "reason" TEXT,
    "banned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "banned_by" TEXT,
    "deactivations" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "banned_emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "llm_api_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "label" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'generic',
    "model" TEXT NOT NULL DEFAULT '',
    "encrypted_value" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "auth_tag" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_fallback" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "llm_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_otp" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "otp_hash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_otp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "postcodes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "postcode" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "postcodes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_reset_token_key" ON "users"("reset_token");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "user_addresses_user_id_idx" ON "user_addresses"("user_id");

-- CreateIndex
CREATE INDEX "quote_presets_user_id_idx" ON "quote_presets"("user_id");

-- CreateIndex
CREATE INDEX "user_devices_user_id_idx" ON "user_devices"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_merchant_id_idx" ON "refresh_tokens"("merchant_id");

-- CreateIndex
CREATE INDEX "otp_codes_user_id_purpose_idx" ON "otp_codes"("user_id", "purpose");

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_idx" ON "notifications"("user_id", "is_read");

-- CreateIndex
CREATE INDEX "notifications_merchant_id_is_read_idx" ON "notifications"("merchant_id", "is_read");

-- CreateIndex
CREATE UNIQUE INDEX "merchants_email_key" ON "merchants"("email");

-- CreateIndex
CREATE UNIQUE INDEX "merchants_google_id_key" ON "merchants"("google_id");

-- CreateIndex
CREATE UNIQUE INDEX "merchants_reset_token_key" ON "merchants"("reset_token");

-- CreateIndex
CREATE INDEX "merchants_email_idx" ON "merchants"("email");

-- CreateIndex
CREATE INDEX "merchants_is_online_is_banned_idx" ON "merchants"("is_online", "is_banned");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_deposits_merchant_id_key" ON "merchant_deposits"("merchant_id");

-- CreateIndex
CREATE INDEX "merchant_documents_merchant_id_idx" ON "merchant_documents"("merchant_id");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_schedules_merchant_id_weekday_time_slot_key" ON "merchant_schedules"("merchant_id", "weekday", "time_slot");

-- CreateIndex
CREATE INDEX "merchant_services_category_id_idx" ON "merchant_services"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_services_merchant_id_merchant_sku_key" ON "merchant_services"("merchant_id", "merchant_sku");

-- CreateIndex
CREATE INDEX "pricing_modules_merchant_id_idx" ON "pricing_modules"("merchant_id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "penalty_logs_merchant_id_idx" ON "penalty_logs"("merchant_id");

-- CreateIndex
CREATE UNIQUE INDEX "penalty_appeals_penalty_log_id_key" ON "penalty_appeals"("penalty_log_id");

-- CreateIndex
CREATE INDEX "penalty_appeals_status_idx" ON "penalty_appeals"("status");

-- CreateIndex
CREATE INDEX "quote_requests_user_id_status_idx" ON "quote_requests"("user_id", "status");

-- CreateIndex
CREATE INDEX "quote_requests_category_id_status_idx" ON "quote_requests"("category_id", "status");

-- CreateIndex
CREATE INDEX "quote_proposals_merchant_id_idx" ON "quote_proposals"("merchant_id");

-- CreateIndex
CREATE UNIQUE INDEX "quote_proposals_quote_request_id_merchant_id_key" ON "quote_proposals"("quote_request_id", "merchant_id");

-- CreateIndex
CREATE INDEX "quote_broadcasts_merchant_id_idx" ON "quote_broadcasts"("merchant_id");

-- CreateIndex
CREATE UNIQUE INDEX "quote_broadcasts_quote_request_id_merchant_id_key" ON "quote_broadcasts"("quote_request_id", "merchant_id");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_order_number_key" ON "bookings"("order_number");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_quote_request_id_key" ON "bookings"("quote_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_proposal_id_key" ON "bookings"("proposal_id");

-- CreateIndex
CREATE INDEX "bookings_user_id_status_idx" ON "bookings"("user_id", "status");

-- CreateIndex
CREATE INDEX "bookings_merchant_id_status_idx" ON "bookings"("merchant_id", "status");

-- CreateIndex
CREATE INDEX "order_history_user_id_idx" ON "order_history"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "escrows_booking_id_key" ON "escrows"("booking_id");

-- CreateIndex
CREATE INDEX "transactions_booking_id_idx" ON "transactions"("booking_id");

-- CreateIndex
CREATE INDEX "transactions_merchant_id_idx" ON "transactions"("merchant_id");

-- CreateIndex
CREATE INDEX "transactions_type_idx" ON "transactions"("type");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_stripe_payment_intent_id_key" ON "transactions"("stripe_payment_intent_id");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_stripe_session_id_key" ON "transactions"("stripe_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "discount_codes_code_key" ON "discount_codes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "discount_codes_quote_request_id_key" ON "discount_codes"("quote_request_id");

-- CreateIndex
CREATE INDEX "discount_codes_user_id_idx" ON "discount_codes"("user_id");

-- CreateIndex
CREATE INDEX "reports_status_idx" ON "reports"("status");

-- CreateIndex
CREATE UNIQUE INDEX "platform_settings_key_key" ON "platform_settings"("key");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_idx" ON "audit_logs"("actor_user_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE UNIQUE INDEX "feature_flags_key_key" ON "feature_flags"("key");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_fallback_owner_id_idempotency_key_key" ON "idempotency_fallback"("owner_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "job_queue_job_name_status_idx" ON "job_queue"("job_name", "status");

-- CreateIndex
CREATE INDEX "chat_sessions_user_id_idx" ON "chat_sessions"("user_id");

-- CreateIndex
CREATE INDEX "chat_messages_session_id_idx" ON "chat_messages"("session_id");

-- CreateIndex
CREATE INDEX "merchant_proposal_presets_merchant_id_idx" ON "merchant_proposal_presets"("merchant_id");

-- CreateIndex
CREATE INDEX "merchant_credit_logs_merchant_id_idx" ON "merchant_credit_logs"("merchant_id");

-- CreateIndex
CREATE INDEX "merchant_withdrawals_merchant_id_status_idx" ON "merchant_withdrawals"("merchant_id", "status");

-- CreateIndex
CREATE INDEX "category_requests_status_idx" ON "category_requests"("status");

-- CreateIndex
CREATE INDEX "servicer_identity_change_requests_merchant_id_status_idx" ON "servicer_identity_change_requests"("merchant_id", "status");

-- CreateIndex
CREATE INDEX "promotion_redemptions_promotion_id_idx" ON "promotion_redemptions"("promotion_id");

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_tiers_name_key" ON "loyalty_tiers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "customer_points_user_id_key" ON "customer_points"("user_id");

-- CreateIndex
CREATE INDEX "points_transactions_user_id_created_at_idx" ON "points_transactions"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "redemptions_voucher_code_key" ON "redemptions"("voucher_code");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_booking_id_key" ON "invoices"("booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "invoices"("invoice_number");

-- CreateIndex
CREATE UNIQUE INDEX "banned_emails_email_key" ON "banned_emails"("email");

-- CreateIndex
CREATE UNIQUE INDEX "postcodes_postcode_key" ON "postcodes"("postcode");

-- AddForeignKey
ALTER TABLE "user_addresses" ADD CONSTRAINT "user_addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_presets" ADD CONSTRAINT "quote_presets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_presets" ADD CONSTRAINT "quote_presets_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "user_addresses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_devices" ADD CONSTRAINT "user_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otp_codes" ADD CONSTRAINT "otp_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_deposits" ADD CONSTRAINT "merchant_deposits_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_documents" ADD CONSTRAINT "merchant_documents_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_schedules" ADD CONSTRAINT "merchant_schedules_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_services" ADD CONSTRAINT "merchant_services_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_services" ADD CONSTRAINT "merchant_services_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_modules" ADD CONSTRAINT "pricing_modules_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_category_id_fkey" FOREIGN KEY ("parent_category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "penalty_logs" ADD CONSTRAINT "penalty_logs_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "penalty_logs" ADD CONSTRAINT "penalty_logs_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "penalty_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "penalty_logs" ADD CONSTRAINT "penalty_logs_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "penalty_appeals" ADD CONSTRAINT "penalty_appeals_penalty_log_id_fkey" FOREIGN KEY ("penalty_log_id") REFERENCES "penalty_logs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "penalty_appeals" ADD CONSTRAINT "penalty_appeals_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_requests" ADD CONSTRAINT "quote_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_requests" ADD CONSTRAINT "quote_requests_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_requests" ADD CONSTRAINT "quote_requests_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "user_addresses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_requests" ADD CONSTRAINT "quote_requests_parent_quote_id_fkey" FOREIGN KEY ("parent_quote_id") REFERENCES "quote_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_proposals" ADD CONSTRAINT "quote_proposals_quote_request_id_fkey" FOREIGN KEY ("quote_request_id") REFERENCES "quote_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_proposals" ADD CONSTRAINT "quote_proposals_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_broadcasts" ADD CONSTRAINT "quote_broadcasts_quote_request_id_fkey" FOREIGN KEY ("quote_request_id") REFERENCES "quote_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_broadcasts" ADD CONSTRAINT "quote_broadcasts_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_quote_request_id_fkey" FOREIGN KEY ("quote_request_id") REFERENCES "quote_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "quote_proposals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_history" ADD CONSTRAINT "order_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escrows" ADD CONSTRAINT "escrows_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_codes" ADD CONSTRAINT "discount_codes_quote_request_id_fkey" FOREIGN KEY ("quote_request_id") REFERENCES "quote_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_proposal_presets" ADD CONSTRAINT "merchant_proposal_presets_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_credit_logs" ADD CONSTRAINT "merchant_credit_logs_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_withdrawals" ADD CONSTRAINT "merchant_withdrawals_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_requests" ADD CONSTRAINT "category_requests_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servicer_identity_change_requests" ADD CONSTRAINT "servicer_identity_change_requests_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_redemptions" ADD CONSTRAINT "promotion_redemptions_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_points" ADD CONSTRAINT "customer_points_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "points_transactions" ADD CONSTRAINT "points_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_reward_id_fkey" FOREIGN KEY ("reward_id") REFERENCES "rewards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

