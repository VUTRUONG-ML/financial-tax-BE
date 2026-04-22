-- CreateEnum
CREATE TYPE "VoucherType" AS ENUM ('RECEIPT', 'PAYMENT');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK');

-- CreateEnum
CREATE TYPE "VoucherStatus" AS ENUM ('ACTIVE', 'CANCELED');

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
    "is_deductible_expense" BOOLEAN NOT NULL,
    "inbound_invoice_id" INTEGER,
    "status" "VoucherStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vouchers_user_id_transaction_at_idx" ON "vouchers"("user_id", "transaction_at");

-- CreateIndex
CREATE INDEX "vouchers_inbound_invoice_id_idx" ON "vouchers"("inbound_invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "vouchers_user_id_voucher_code_key" ON "vouchers"("user_id", "voucher_code");

-- AddForeignKey
ALTER TABLE "voucher_categories" ADD CONSTRAINT "voucher_categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "voucher_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_inbound_invoice_id_fkey" FOREIGN KEY ("inbound_invoice_id") REFERENCES "inbound_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
