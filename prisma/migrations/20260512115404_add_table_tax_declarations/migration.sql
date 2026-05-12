-- CreateTable
CREATE TABLE "tax_declarations" (
    "id" SERIAL NOT NULL,
    "period_id" INTEGER NOT NULL,
    "declared_revenue" DECIMAL(18,4) NOT NULL,
    "declared_expense" DECIMAL(18,4) NOT NULL,
    "vat_tax_amount" DECIMAL(18,4) NOT NULL,
    "pit_tax_amount" DECIMAL(18,4) NOT NULL,
    "total_tax_amount" DECIMAL(18,4) NOT NULL,
    "chosen_pit_method" "PitMethod" NOT NULL,
    "xml_content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tax_declarations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tax_declarations_period_id_key" ON "tax_declarations"("period_id");

-- AddForeignKey
ALTER TABLE "tax_declarations" ADD CONSTRAINT "tax_declarations_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "financial_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
