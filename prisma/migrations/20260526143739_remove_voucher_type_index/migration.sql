-- DropIndex
DROP INDEX "vouchers_user_id_voucher_type_idx";

-- CreateIndex
CREATE INDEX "vouchers_user_id_payment_method_status_transaction_at_id_idx" ON "vouchers"("user_id", "payment_method", "status", "transaction_at", "id");
