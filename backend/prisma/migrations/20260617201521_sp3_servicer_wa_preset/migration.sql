-- SP-3 dispatch: servicer WhatsApp message presets.
-- Reusable wa.me templates a servicer fires at a customer from a won job card.
-- Body carries {name}/{orderId}/{eta} placeholders interpolated client-side.

-- CreateTable
CREATE TABLE "servicer_wa_presets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "servicer_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "servicer_wa_presets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "servicer_wa_presets_servicer_id_idx" ON "servicer_wa_presets"("servicer_id");

-- AddForeignKey
ALTER TABLE "servicer_wa_presets" ADD CONSTRAINT "servicer_wa_presets_servicer_id_fkey" FOREIGN KEY ("servicer_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
