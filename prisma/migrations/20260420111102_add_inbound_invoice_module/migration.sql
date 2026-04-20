-- CreateTable
CREATE TABLE "inbound_invoices" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "seller_name" TEXT NOT NULL,
    "seller_tax_code" TEXT,
    "invoice_no" TEXT,
    "issue_date" TIMESTAMP(3),
    "total_amount" DECIMAL(18,4) NOT NULL,
    "attachment_url" TEXT,
    "is_synced_to_inventory" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inbound_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbound_invoice_details" (
    "id" SERIAL NOT NULL,
    "inbound_invoice_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_cost" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "inbound_invoice_details_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inbound_invoices_public_id_key" ON "inbound_invoices"("public_id");

-- CreateIndex
CREATE INDEX "inbound_invoices_user_id_idx" ON "inbound_invoices"("user_id");

-- CreateIndex
CREATE INDEX "inbound_invoices_public_id_idx" ON "inbound_invoices"("public_id");

-- CreateIndex
CREATE INDEX "inbound_invoice_details_inbound_invoice_id_idx" ON "inbound_invoice_details"("inbound_invoice_id");

-- CreateIndex
CREATE INDEX "inbound_invoice_details_product_id_idx" ON "inbound_invoice_details"("product_id");

-- AddForeignKey
ALTER TABLE "inbound_invoices" ADD CONSTRAINT "inbound_invoices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_invoice_details" ADD CONSTRAINT "inbound_invoice_details_inbound_invoice_id_fkey" FOREIGN KEY ("inbound_invoice_id") REFERENCES "inbound_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_invoice_details" ADD CONSTRAINT "inbound_invoice_details_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
