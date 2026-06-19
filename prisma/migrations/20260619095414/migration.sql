/*
  Warnings:

  - You are about to drop the column `is_synced_to_inventory` on the `inbound_invoices` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "inbound_invoices" DROP COLUMN "is_synced_to_inventory",
ADD COLUMN     "pdf_file_url" TEXT,
ADD COLUMN     "xml_file_url" TEXT;

-- CreateTable
CREATE TABLE "stock_receipt_invoices" (
    "id" SERIAL NOT NULL,
    "receipt_id" INTEGER NOT NULL,
    "invoice_id" INTEGER NOT NULL,
    "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_receipt_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stock_receipt_invoices_receipt_id_invoice_id_key" ON "stock_receipt_invoices"("receipt_id", "invoice_id");

-- AddForeignKey
ALTER TABLE "stock_receipt_invoices" ADD CONSTRAINT "stock_receipt_invoices_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "stock_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_receipt_invoices" ADD CONSTRAINT "stock_receipt_invoices_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "inbound_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
