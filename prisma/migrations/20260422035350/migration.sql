-- DropIndex
DROP INDEX "inbound_invoices_public_id_idx";

-- DropIndex
DROP INDEX "invoices_public_id_idx";

-- DropIndex
DROP INDEX "products_public_id_idx";

-- AlterTable
ALTER TABLE "vouchers" ALTER COLUMN "is_deductible_expense" SET DEFAULT false;
