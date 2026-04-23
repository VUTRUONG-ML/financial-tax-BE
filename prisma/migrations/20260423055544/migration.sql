-- AlterTable
ALTER TABLE "inbound_invoices" ADD COLUMN     "is_paid" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paid_amount" DECIMAL(18,4) NOT NULL DEFAULT 0;
