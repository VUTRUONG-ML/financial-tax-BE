-- CreateTable
CREATE TABLE "tax_form_exports" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "form_type" TEXT NOT NULL,
    "period_id" INTEGER NOT NULL,
    "tax_year" INTEGER NOT NULL,
    "xml_content" TEXT NOT NULL,
    "pdf_url" TEXT,
    "export_status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_form_exports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tax_form_exports_public_id_key" ON "tax_form_exports"("public_id");

-- AddForeignKey
ALTER TABLE "tax_form_exports" ADD CONSTRAINT "tax_form_exports_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "financial_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_form_exports" ADD CONSTRAINT "tax_form_exports_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
