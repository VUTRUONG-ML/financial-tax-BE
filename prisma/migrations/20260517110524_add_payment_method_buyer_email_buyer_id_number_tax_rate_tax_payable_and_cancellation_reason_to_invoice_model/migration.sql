/*
  Warnings:

  - Added the required column `product_type` to the `invoice_details` table without a default value. This is not possible if the table is not empty.
  - Added the required column `unit` to the `invoice_details` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "invoice_details" ADD COLUMN     "product_type" "ProductType" NOT NULL,
ADD COLUMN     "unit" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "buyer_email" TEXT,
ADD COLUMN     "buyer_id_number" TEXT,
ADD COLUMN     "cancellation_reason" TEXT,
ADD COLUMN     "payment_method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
ADD COLUMN     "tax_payable" DECIMAL(18,4) NOT NULL DEFAULT 0,
ADD COLUMN     "tax_rate" DECIMAL(5,4) NOT NULL DEFAULT 0;
