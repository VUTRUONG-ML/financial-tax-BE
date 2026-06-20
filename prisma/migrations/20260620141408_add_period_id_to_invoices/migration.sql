/*
  Warnings:

  - Added the required column `period_id` to the `invoices` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "period_id" INTEGER NOT NULL;

-- CreateIndex
CREATE INDEX "invoices_period_id_idx" ON "invoices"("period_id");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "financial_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
