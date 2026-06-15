-- AlterTable
ALTER TABLE "stock_receipts" ADD COLUMN     "is_paid" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paid_amount" DECIMAL(15,2) NOT NULL DEFAULT 0.00;
