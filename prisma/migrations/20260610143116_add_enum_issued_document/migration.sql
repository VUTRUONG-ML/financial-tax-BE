/*
  Warnings:

  - The `source_document_type` column on the `stock_issues` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "StockIssueDocument" AS ENUM ('INVOICE', 'PRODUCTION_ORDER');

-- AlterTable
ALTER TABLE "stock_issues" DROP COLUMN "source_document_type",
ADD COLUMN     "source_document_type" "StockIssueDocument";
