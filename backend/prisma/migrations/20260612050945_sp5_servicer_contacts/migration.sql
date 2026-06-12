-- AlterTable
ALTER TABLE "invoices" ALTER COLUMN "due_date" SET DEFAULT (now() + interval '14 days');

-- CreateTable
CREATE TABLE "business_contacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "servicer_id" UUID NOT NULL,
    "contact_person" TEXT NOT NULL,
    "number" TEXT,
    "email" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "visible_to_customer" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "business_contacts_servicer_id_idx" ON "business_contacts"("servicer_id");

-- AddForeignKey
ALTER TABLE "business_contacts" ADD CONSTRAINT "business_contacts_servicer_id_fkey" FOREIGN KEY ("servicer_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: seed one primary ServicerContact per existing servicer from current name/phone/email.
-- visibleToCustomer derived from show_phone_public || show_email_public.
INSERT INTO "business_contacts" ("id", "servicer_id", "contact_person", "number", "email", "is_primary", "visible_to_customer", "created_at", "updated_at")
SELECT
  gen_random_uuid(),
  m.id,
  m.name,
  m.phone,
  NULL, -- Servicer.email is login email, not a business contact email
  TRUE,
  (m.show_phone_public OR m.show_email_public),
  NOW(),
  NOW()
FROM "merchants" m
WHERE NOT EXISTS (
  SELECT 1 FROM "business_contacts" bc WHERE bc."servicer_id" = m.id
);
