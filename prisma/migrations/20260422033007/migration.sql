-- AlterTable
ALTER TABLE "vouchers" ADD COLUMN     "outbound_invoice_id" INTEGER;

-- CreateIndex
CREATE INDEX "vouchers_outbound_invoice_id_idx" ON "vouchers"("outbound_invoice_id");

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_outbound_invoice_id_fkey" FOREIGN KEY ("outbound_invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
