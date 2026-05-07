-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'STAFF');

-- CreateEnum
CREATE TYPE "PitMethod" AS ENUM ('EXEMPT', 'PERCENTAGE', 'PROFIT_15', 'PROFIT_17', 'PROFIT_20');

-- CreateEnum
CREATE TYPE "ActionWrite" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'STOCK_REVERT_BY_INVOICE_CANCEL');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('FINISHED_GOOD', 'RAW_MATERIAL', 'SERVICE');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'PENDING_ISSUED', 'ISSUED', 'SYNC_FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "InboundInvoiceStatus" AS ENUM ('CANCELED', 'ACTIVE');

-- CreateEnum
CREATE TYPE "VoucherType" AS ENUM ('RECEIPT', 'PAYMENT');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK');

-- CreateEnum
CREATE TYPE "VoucherStatus" AS ENUM ('ACTIVE', 'CANCELED');

-- CreateEnum
CREATE TYPE "ProductionTransactionType" AS ENUM ('ISSUE_MATERIAL', 'RECEIVE_PRODUCT');

-- CreateEnum
CREATE TYPE "ProductionStatus" AS ENUM ('ACTIVE', 'CANCELED');

-- CreateEnum
CREATE TYPE "PeriodStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "FilingPeriod" AS ENUM ('MONTHLY', 'QUARTERLY', 'YEARLY', 'HALF_YEARLY', 'PER_OCCURRENCE');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'ADMIN',
    "tax_code" TEXT NOT NULL,
    "business_name" TEXT NOT NULL,
    "owner_name" TEXT NOT NULL,
    "cccd_number" TEXT NOT NULL,
    "province_city" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "setup_completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "is_revoked" BOOLEAN NOT NULL DEFAULT false,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_groups" (
    "id" SERIAL NOT NULL,
    "group_name" TEXT NOT NULL,
    "min_revenue" DECIMAL(18,4) NOT NULL,
    "max_revenue" DECIMAL(18,4),
    "description" TEXT,
    "allowed_methods" "PitMethod"[] DEFAULT ARRAY['PERCENTAGE']::"PitMethod"[],

    CONSTRAINT "tax_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_categories_dictionary" (
    "id" SERIAL NOT NULL,
    "category_name" TEXT NOT NULL,
    "parent_id" INTEGER,
    "vat_rate" DECIMAL(5,4) NOT NULL,
    "pit_rate" DECIMAL(5,4) NOT NULL,
    "is_vat_reducible" BOOLEAN NOT NULL DEFAULT false,
    "xml_indicator" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tax_categories_dictionary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ui_popular_tags" (
    "id" SERIAL NOT NULL,
    "tag_name" TEXT NOT NULL,
    "icon_name" TEXT,
    "mapped_tax_id" INTEGER NOT NULL,

    CONSTRAINT "ui_popular_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_configurations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "industry_id" INTEGER NOT NULL,
    "tax_group_id" INTEGER NOT NULL,
    "chosen_pit_method" "PitMethod",
    "apply_from_date" TIMESTAMP(3) NOT NULL,
    "apply_to_date" TIMESTAMP(3),
    "vat_rate_snapshot" DECIMAL(5,4) NOT NULL,
    "pit_rate_snapshot" DECIMAL(5,4) NOT NULL,
    "is_vat_reducible" BOOLEAN NOT NULL DEFAULT false,
    "vat_filing_period" "FilingPeriod" NOT NULL DEFAULT 'QUARTERLY',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tax_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "action" "ActionWrite" NOT NULL,
    "table_name" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "old_values" JSONB NOT NULL,
    "new_values" JSONB NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "sku_code" TEXT,
    "product_name" TEXT NOT NULL,
    "product_type" "ProductType" NOT NULL,
    "unit" TEXT NOT NULL,
    "image_url" TEXT,
    "image_public_id" TEXT,
    "selling_price" DECIMAL(18,4) NOT NULL,
    "opening_stock_quantity" INTEGER NOT NULL DEFAULT 0,
    "opening_stock_unit_cost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "opening_stock_value" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "current_stock" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "invoice_symbol" TEXT NOT NULL,
    "is_b2c" BOOLEAN NOT NULL DEFAULT true,
    "buyer_name" TEXT,
    "buyer_tax_code" TEXT,
    "buyer_address" TEXT,
    "total_payment" DECIMAL(18,4) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "is_paid" BOOLEAN NOT NULL DEFAULT false,
    "paid_amount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "cqt_code" TEXT,
    "issued_at" TIMESTAMP(3),

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_details" (
    "id" SERIAL NOT NULL,
    "invoice_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "product_name_snapshot" TEXT NOT NULL,
    "unit_price" DECIMAL(18,4) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "total_amount" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "invoice_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbound_invoices" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "seller_name" TEXT NOT NULL,
    "seller_tax_code" TEXT,
    "invoice_no" TEXT NOT NULL,
    "issue_date" TIMESTAMP(3) NOT NULL,
    "total_amount" DECIMAL(18,4) NOT NULL,
    "attachment_url" TEXT,
    "status" "InboundInvoiceStatus" NOT NULL DEFAULT 'ACTIVE',
    "is_synced_to_inventory" BOOLEAN NOT NULL DEFAULT false,
    "is_paid" BOOLEAN NOT NULL DEFAULT false,
    "paid_amount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inbound_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbound_invoice_details" (
    "id" SERIAL NOT NULL,
    "inbound_invoice_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_cost" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "inbound_invoice_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voucher_categories" (
    "id" SERIAL NOT NULL,
    "user_id" TEXT,
    "type" "VoucherType" NOT NULL,
    "category_name" TEXT NOT NULL,

    CONSTRAINT "voucher_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vouchers" (
    "id" SERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "voucher_code" TEXT NOT NULL,
    "voucher_type" "VoucherType" NOT NULL,
    "transaction_at" TIMESTAMPTZ(3) NOT NULL,
    "category_id" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL,
    "is_deductible_expense" BOOLEAN NOT NULL DEFAULT false,
    "inbound_invoice_id" INTEGER,
    "outbound_invoice_id" INTEGER,
    "status" "VoucherStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "internal_production_orders" (
    "id" SERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "order_code" TEXT NOT NULL,
    "notes" TEXT,
    "status" "ProductionStatus" NOT NULL DEFAULT 'ACTIVE',
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

-- CreateTable
CREATE TABLE "financial_periods" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "period_name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "deadline_date" DATE NOT NULL,
    "status" "PeriodStatus" NOT NULL DEFAULT 'OPEN',
    "tax_amount" DECIMAL(18,4) NOT NULL DEFAULT 0.00,
    "actual_payment_date" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "financial_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revenue_trackers" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "revenue_ytd" DECIMAL(15,2) NOT NULL DEFAULT 0.00,

    CONSTRAINT "revenue_trackers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_number_key" ON "users"("phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "users_tax_code_key" ON "users"("tax_code");

-- CreateIndex
CREATE UNIQUE INDEX "users_cccd_number_key" ON "users"("cccd_number");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_token_hash_idx" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "tax_configurations_user_id_apply_to_date_idx" ON "tax_configurations"("user_id", "apply_to_date");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_public_id_key" ON "products"("public_id");

-- CreateIndex
CREATE INDEX "products_user_id_idx" ON "products"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_public_id_key" ON "invoices"("public_id");

-- CreateIndex
CREATE INDEX "invoices_user_id_status_idx" ON "invoices"("user_id", "status");

-- CreateIndex
CREATE INDEX "invoice_details_invoice_id_idx" ON "invoice_details"("invoice_id");

-- CreateIndex
CREATE INDEX "invoice_details_product_id_idx" ON "invoice_details"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "inbound_invoices_public_id_key" ON "inbound_invoices"("public_id");

-- CreateIndex
CREATE INDEX "inbound_invoices_user_id_idx" ON "inbound_invoices"("user_id");

-- CreateIndex
CREATE INDEX "inbound_invoice_details_inbound_invoice_id_idx" ON "inbound_invoice_details"("inbound_invoice_id");

-- CreateIndex
CREATE INDEX "inbound_invoice_details_product_id_idx" ON "inbound_invoice_details"("product_id");

-- CreateIndex
CREATE INDEX "vouchers_user_id_transaction_at_idx" ON "vouchers"("user_id", "transaction_at");

-- CreateIndex
CREATE INDEX "vouchers_inbound_invoice_id_idx" ON "vouchers"("inbound_invoice_id");

-- CreateIndex
CREATE INDEX "vouchers_outbound_invoice_id_idx" ON "vouchers"("outbound_invoice_id");

-- CreateIndex
CREATE INDEX "vouchers_user_id_voucher_type_idx" ON "vouchers"("user_id", "voucher_type");

-- CreateIndex
CREATE UNIQUE INDEX "vouchers_user_id_voucher_code_key" ON "vouchers"("user_id", "voucher_code");

-- CreateIndex
CREATE INDEX "internal_production_orders_user_id_created_at_idx" ON "internal_production_orders"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "internal_production_orders_user_id_order_code_key" ON "internal_production_orders"("user_id", "order_code");

-- CreateIndex
CREATE INDEX "production_details_order_id_idx" ON "production_details"("order_id");

-- CreateIndex
CREATE INDEX "production_details_product_id_idx" ON "production_details"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "financial_periods_public_id_key" ON "financial_periods"("public_id");

-- CreateIndex
CREATE INDEX "financial_periods_user_id_status_idx" ON "financial_periods"("user_id", "status");

-- CreateIndex
CREATE INDEX "financial_periods_user_id_start_date_end_date_idx" ON "financial_periods"("user_id", "start_date", "end_date");

-- CreateIndex
CREATE UNIQUE INDEX "revenue_trackers_user_id_year_key" ON "revenue_trackers"("user_id", "year");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_categories_dictionary" ADD CONSTRAINT "tax_categories_dictionary_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "tax_categories_dictionary"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ui_popular_tags" ADD CONSTRAINT "ui_popular_tags_mapped_tax_id_fkey" FOREIGN KEY ("mapped_tax_id") REFERENCES "tax_categories_dictionary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_configurations" ADD CONSTRAINT "tax_configurations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_configurations" ADD CONSTRAINT "tax_configurations_industry_id_fkey" FOREIGN KEY ("industry_id") REFERENCES "tax_categories_dictionary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_configurations" ADD CONSTRAINT "tax_configurations_tax_group_id_fkey" FOREIGN KEY ("tax_group_id") REFERENCES "tax_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_details" ADD CONSTRAINT "invoice_details_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_details" ADD CONSTRAINT "invoice_details_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_invoices" ADD CONSTRAINT "inbound_invoices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_invoice_details" ADD CONSTRAINT "inbound_invoice_details_inbound_invoice_id_fkey" FOREIGN KEY ("inbound_invoice_id") REFERENCES "inbound_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_invoice_details" ADD CONSTRAINT "inbound_invoice_details_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_categories" ADD CONSTRAINT "voucher_categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "voucher_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_inbound_invoice_id_fkey" FOREIGN KEY ("inbound_invoice_id") REFERENCES "inbound_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_outbound_invoice_id_fkey" FOREIGN KEY ("outbound_invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_production_orders" ADD CONSTRAINT "internal_production_orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_details" ADD CONSTRAINT "production_details_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "internal_production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_details" ADD CONSTRAINT "production_details_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_periods" ADD CONSTRAINT "financial_periods_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenue_trackers" ADD CONSTRAINT "revenue_trackers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
