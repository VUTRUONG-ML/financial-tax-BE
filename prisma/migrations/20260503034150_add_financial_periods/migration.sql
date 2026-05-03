-- CreateEnum
CREATE TYPE "PeriodStatus" AS ENUM ('OPEN', 'CLOSED');

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
    "tax_amount" DECIMAL(18,4) NOT NULL,
    "actual_payment_date" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "financial_periods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "financial_periods_public_id_key" ON "financial_periods"("public_id");

-- CreateIndex
CREATE INDEX "financial_periods_user_id_status_idx" ON "financial_periods"("user_id", "status");

-- CreateIndex
CREATE INDEX "financial_periods_user_id_start_date_end_date_idx" ON "financial_periods"("user_id", "start_date", "end_date");

-- AddForeignKey
ALTER TABLE "financial_periods" ADD CONSTRAINT "financial_periods_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
