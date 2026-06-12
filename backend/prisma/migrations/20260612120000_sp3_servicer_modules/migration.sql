-- AlterTable: SP-3 listing fields on merchant_services
ALTER TABLE "merchant_services" ADD COLUMN "image_url" TEXT;
ALTER TABLE "merchant_services" ADD COLUMN "published" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable: SP-3 servicer modules (reusable priced item library)
CREATE TABLE "business_modules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "servicer_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "sku" TEXT,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "service_chargeable" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_modules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "business_modules_servicer_id_idx" ON "business_modules"("servicer_id");

-- AddForeignKey
ALTER TABLE "business_modules" ADD CONSTRAINT "business_modules_servicer_id_fkey" FOREIGN KEY ("servicer_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
