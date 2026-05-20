/*
  Warnings:

  - You are about to drop the column `transaction_date` on the `inbound_invoices` table. All the data in the column will be lost.
  - You are about to drop the column `issued_at` on the `invoices` table. All the data in the column will be lost.
  - You are about to drop the column `transaction_date` on the `invoices` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "inbound_invoices_user_id_transaction_date_idx";

-- DropIndex
DROP INDEX "invoices_user_id_transaction_date_idx";

-- AlterTable
ALTER TABLE "inbound_invoices" DROP COLUMN "transaction_date";

-- AlterTable
ALTER TABLE "invoices" DROP COLUMN "issued_at",
DROP COLUMN "transaction_date",
ADD COLUMN     "issue_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "inbound_invoices_user_id_issue_date_idx" ON "inbound_invoices"("user_id", "issue_date");

-- CreateIndex
CREATE INDEX "invoices_user_id_issue_date_idx" ON "invoices"("user_id", "issue_date");
