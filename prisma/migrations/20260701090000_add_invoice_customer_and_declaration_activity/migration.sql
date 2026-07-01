-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('WALK_IN', 'ONLINE');

-- CreateEnum
CREATE TYPE "DeclarationActivityType" AS ENUM ('FIXED_LOCATION', 'ECOM_NO_ORDER_PAYMENT', 'PER_OCCURRENCE');

-- AlterTable
ALTER TABLE "invoices"
ADD COLUMN "buyer_phone" TEXT,
ADD COLUMN "buyer_note" TEXT,
ADD COLUMN "customer_type" "CustomerType" NOT NULL DEFAULT 'WALK_IN',
ADD COLUMN "declaration_activity_type" "DeclarationActivityType" NOT NULL DEFAULT 'FIXED_LOCATION',
ADD COLUMN "business_location_code" TEXT,
ADD COLUMN "business_location_name" TEXT;

-- CreateIndex
CREATE INDEX "invoices_declaration_activity_type_cqt_code_idx" ON "invoices"("declaration_activity_type", "cqt_code");
