-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'STAFF');

-- CreateEnum
CREATE TYPE "PitMethod" AS ENUM ('EXEMPT', 'PERCENTAGE', 'PROFIT_15', 'PROFIT_17', 'PROFIT_20');

-- CreateEnum
CREATE TYPE "ActionWrite" AS ENUM ('CREATE', 'UPDATE', 'DELETE');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'SYNC_FAILED', 'CANCELED');

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
    "chosen_pit_method" "PitMethod" NOT NULL,
    "apply_from_date" TIMESTAMP(3) NOT NULL,
    "apply_to_date" TIMESTAMP(3),
    "vat_rate_snapshot" DECIMAL(5,4) NOT NULL,
    "pit_rate_snapshot" DECIMAL(5,4) NOT NULL,
    "is_vat_reducible" BOOLEAN NOT NULL DEFAULT false,
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
CREATE INDEX "products_public_id_idx" ON "products"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_public_id_key" ON "invoices"("public_id");

-- CreateIndex
CREATE INDEX "invoices_user_id_status_idx" ON "invoices"("user_id", "status");

-- CreateIndex
CREATE INDEX "invoices_public_id_idx" ON "invoices"("public_id");

-- CreateIndex
CREATE INDEX "invoice_details_invoice_id_idx" ON "invoice_details"("invoice_id");

-- CreateIndex
CREATE INDEX "invoice_details_product_id_idx" ON "invoice_details"("product_id");

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
