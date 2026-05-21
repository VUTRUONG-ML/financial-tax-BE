-- AlterTable
ALTER TABLE "internal_production_orders" ADD COLUMN     "transaction_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "internal_production_orders_user_id_transaction_at_idx" ON "internal_production_orders"("user_id", "transaction_at");
