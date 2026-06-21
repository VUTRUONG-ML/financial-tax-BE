-- DropIndex
DROP INDEX "stock_issues_issue_code_key";

-- DropIndex
DROP INDEX "stock_receipts_receipt_code_key";

-- AlterTable
ALTER TABLE "stock_issues" ADD COLUMN     "user_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "stock_receipts" ADD COLUMN     "user_id" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "stock_issues_user_id_idx" ON "stock_issues"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_issues_user_id_issue_code_key" ON "stock_issues"("user_id", "issue_code");

-- CreateIndex
CREATE INDEX "stock_receipts_user_id_idx" ON "stock_receipts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_receipts_user_id_receipt_code_key" ON "stock_receipts"("user_id", "receipt_code");

-- AddForeignKey
ALTER TABLE "stock_receipts" ADD CONSTRAINT "stock_receipts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_issues" ADD CONSTRAINT "stock_issues_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
