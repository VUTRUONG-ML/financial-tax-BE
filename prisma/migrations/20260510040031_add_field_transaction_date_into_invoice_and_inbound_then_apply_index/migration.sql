-- AlterTable
ALTER TABLE "inbound_invoices" ADD COLUMN     "transaction_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "transaction_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "inbound_invoices_user_id_transaction_date_idx" ON "inbound_invoices"("user_id", "transaction_date");

-- CreateIndex
CREATE INDEX "invoices_user_id_transaction_date_idx" ON "invoices"("user_id", "transaction_date");
