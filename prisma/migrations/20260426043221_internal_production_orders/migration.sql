-- CreateEnum
CREATE TYPE "ProductionTransactionType" AS ENUM ('ISSUE_MATERIAL', 'RECEIVE_PRODUCT');

-- CreateTable
CREATE TABLE "internal_production_orders" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "order_code" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "internal_production_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_details" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "transaction_type" "ProductionTransactionType" NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "production_details_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "internal_production_orders_public_id_key" ON "internal_production_orders"("public_id");

-- CreateIndex
CREATE INDEX "internal_production_orders_user_id_created_at_idx" ON "internal_production_orders"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "internal_production_orders_user_id_order_code_key" ON "internal_production_orders"("user_id", "order_code");

-- CreateIndex
CREATE INDEX "production_details_order_id_idx" ON "production_details"("order_id");

-- CreateIndex
CREATE INDEX "production_details_product_id_idx" ON "production_details"("product_id");

-- AddForeignKey
ALTER TABLE "internal_production_orders" ADD CONSTRAINT "internal_production_orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_details" ADD CONSTRAINT "production_details_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "internal_production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_details" ADD CONSTRAINT "production_details_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
