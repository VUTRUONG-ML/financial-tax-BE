-- CreateEnum
CREATE TYPE "StockReceiptSourceType" AS ENUM ('PURCHASE', 'PRODUCTION', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "StockReceiptStatus" AS ENUM ('DRAFT', 'APPROVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StockIssueType" AS ENUM ('SALE', 'PRODUCTION', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "StockIssueStatus" AS ENUM ('DRAFT', 'APPROVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CogsPostedStatus" AS ENUM ('PENDING', 'POSTED', 'FAILED');

-- AlterTable
ALTER TABLE "inventory_movements" ADD COLUMN     "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "stock_receipts" (
    "id" SERIAL NOT NULL,
    "receipt_code" VARCHAR(50) NOT NULL,
    "receipt_date" TIMESTAMPTZ(3) NOT NULL,
    "source_type" "StockReceiptSourceType" NOT NULL,
    "supplier_name" VARCHAR(255),
    "source_invoice_no" VARCHAR(50),
    "source_document_url" VARCHAR(512),
    "total_value" DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    "status" "StockReceiptStatus" NOT NULL DEFAULT 'DRAFT',
    "period_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stock_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_receipt_details" (
    "id" SERIAL NOT NULL,
    "receipt_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit_cost" DECIMAL(15,2) NOT NULL,
    "total_value" DECIMAL(15,2) NOT NULL,
    "tax_category_id_snapshot" INTEGER,

    CONSTRAINT "stock_receipt_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_issues" (
    "id" SERIAL NOT NULL,
    "issue_code" VARCHAR(50) NOT NULL,
    "issue_date" TIMESTAMPTZ(3) NOT NULL,
    "issue_type" "StockIssueType" NOT NULL,
    "source_document_type" VARCHAR(50),
    "source_document_id" INTEGER,
    "status" "StockIssueStatus" NOT NULL DEFAULT 'DRAFT',
    "period_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stock_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_issue_details" (
    "id" SERIAL NOT NULL,
    "issue_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "provisional_unit_cost" DECIMAL(15,2) DEFAULT 0.00,
    "final_weighted_unit_cost" DECIMAL(15,2),
    "final_cogs_value" DECIMAL(15,2),
    "cogs_posted_to_s2c" "CogsPostedStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "stock_issue_details_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stock_receipts_receipt_code_key" ON "stock_receipts"("receipt_code");

-- CreateIndex
CREATE INDEX "stock_receipts_period_id_idx" ON "stock_receipts"("period_id");

-- CreateIndex
CREATE INDEX "stock_receipt_details_receipt_id_idx" ON "stock_receipt_details"("receipt_id");

-- CreateIndex
CREATE INDEX "stock_receipt_details_product_id_idx" ON "stock_receipt_details"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_issues_issue_code_key" ON "stock_issues"("issue_code");

-- CreateIndex
CREATE INDEX "stock_issues_period_id_idx" ON "stock_issues"("period_id");

-- CreateIndex
CREATE INDEX "stock_issue_details_issue_id_idx" ON "stock_issue_details"("issue_id");

-- CreateIndex
CREATE INDEX "stock_issue_details_product_id_idx" ON "stock_issue_details"("product_id");

-- AddForeignKey
ALTER TABLE "stock_receipts" ADD CONSTRAINT "stock_receipts_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "financial_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_receipt_details" ADD CONSTRAINT "stock_receipt_details_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "stock_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_receipt_details" ADD CONSTRAINT "stock_receipt_details_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_issues" ADD CONSTRAINT "stock_issues_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "financial_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_issue_details" ADD CONSTRAINT "stock_issue_details_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "stock_issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_issue_details" ADD CONSTRAINT "stock_issue_details_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
