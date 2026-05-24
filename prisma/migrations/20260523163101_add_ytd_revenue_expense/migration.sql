-- AlterTable
ALTER TABLE "tax_declarations" ADD COLUMN     "ytd_expense" DECIMAL(18,4) NOT NULL DEFAULT 0.00,
ADD COLUMN     "ytd_revenue" DECIMAL(18,4) NOT NULL DEFAULT 0.00;
