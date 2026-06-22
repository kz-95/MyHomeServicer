-- CreateTable (idempotent — these tables were added after the initial Railway DB was provisioned)
CREATE TABLE IF NOT EXISTS "banned_emails" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "reason" TEXT,
    "banned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "banned_by" TEXT,
    "deactivations" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "banned_emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "llm_api_keys" (
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
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "llm_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "admin_otp" (
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
CREATE TABLE IF NOT EXISTS "postcodes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "postcode" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "postcodes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (IF NOT EXISTS so this is safe to run on DBs that already have these tables)
CREATE UNIQUE INDEX IF NOT EXISTS "banned_emails_email_key" ON "banned_emails"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "postcodes_postcode_key" ON "postcodes"("postcode");
