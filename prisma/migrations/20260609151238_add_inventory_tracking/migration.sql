-- CreateEnum
CREATE TYPE "SourceDocumentType" AS ENUM ('INBOUND_INVOICE', 'OUTBOUND_INVOICE', 'PRODUCTION_ORDER');

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('OPENING', 'PURCHASE_IN', 'SALE_OUT', 'PRODUCTION_IN', 'PRODUCTION_OUT', 'ADJUSTMENT');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "is_inventory_tracked" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "tax_category_id" INTEGER;

-- CreateTable
CREATE TABLE "opening_inventory_balances" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "period_year" INTEGER NOT NULL,
    "opening_quantity" INTEGER NOT NULL,
    "opening_unit_cost" DECIMAL(18,4) NOT NULL,
    "opening_value" DECIMAL(18,4) NOT NULL,
    "source_note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opening_inventory_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "product_id" INTEGER NOT NULL,
    "period_id" INTEGER NOT NULL,
    "movement_type" "InventoryMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_cost" DECIMAL(18,4) NOT NULL,
    "total_value" DECIMAL(18,4) NOT NULL,
    "source_document_type" "SourceDocumentType",
    "source_document_id" INTEGER,
    "movement_date" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "opening_inventory_balances_product_id_idx" ON "opening_inventory_balances"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "opening_inventory_balances_product_id_period_year_key" ON "opening_inventory_balances"("product_id", "period_year");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_movements_public_id_key" ON "inventory_movements"("public_id");

-- CreateIndex
CREATE INDEX "inventory_movements_product_id_idx" ON "inventory_movements"("product_id");

-- CreateIndex
CREATE INDEX "inventory_movements_period_id_idx" ON "inventory_movements"("period_id");

-- CreateIndex
CREATE INDEX "inventory_movements_movement_date_idx" ON "inventory_movements"("movement_date");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_tax_category_id_fkey" FOREIGN KEY ("tax_category_id") REFERENCES "tax_categories_dictionary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_inventory_balances" ADD CONSTRAINT "opening_inventory_balances_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "financial_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
