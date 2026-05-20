-- DropIndex
DROP INDEX "tax_configurations_user_id_apply_to_date_idx";

-- CreateIndex
CREATE INDEX "tax_configurations_user_id_apply_from_date_apply_to_date_idx" ON "tax_configurations"("user_id", "apply_from_date", "apply_to_date");
