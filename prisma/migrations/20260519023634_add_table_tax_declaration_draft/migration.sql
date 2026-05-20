-- CreateTable
CREATE TABLE "tax_declaration_drafts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "financial_period_id" INTEGER NOT NULL,
    "current_step" INTEGER NOT NULL DEFAULT 1,
    "step_1_data" JSONB,
    "step_2_data" JSONB,
    "step_3_data" JSONB,
    "step_4_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_declaration_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tax_declaration_drafts_financial_period_id_key" ON "tax_declaration_drafts"("financial_period_id");

-- AddForeignKey
ALTER TABLE "tax_declaration_drafts" ADD CONSTRAINT "tax_declaration_drafts_financial_period_id_fkey" FOREIGN KEY ("financial_period_id") REFERENCES "financial_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_declaration_drafts" ADD CONSTRAINT "tax_declaration_drafts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
