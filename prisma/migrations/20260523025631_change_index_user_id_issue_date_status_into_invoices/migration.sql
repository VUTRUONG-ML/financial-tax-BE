-- DropIndex
DROP INDEX "invoices_user_id_issue_date_idx";

-- DropIndex
DROP INDEX "invoices_user_id_status_idx";

-- CreateIndex
CREATE INDEX "invoices_user_id_issue_date_status_idx" ON "invoices"("user_id", "issue_date", "status");
