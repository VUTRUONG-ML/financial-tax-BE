-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'STAFF');

-- CreateEnum
CREATE TYPE "RevenueTier" AS ENUM ('TIER_1', 'TIER_2', 'TIER_3', 'TIER_4');

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
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_groups" (
    "id" SERIAL NOT NULL,
    "group_name" TEXT NOT NULL,

    CONSTRAINT "tax_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "specific_industries" (
    "id" SERIAL NOT NULL,
    "tax_group_id" INTEGER NOT NULL,
    "industry_code" TEXT,
    "industry_name" TEXT NOT NULL,
    "vat_rate" DECIMAL(5,4) NOT NULL,
    "pit_rate" DECIMAL(5,4) NOT NULL,
    "is_vat_reducible" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "specific_industries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_configurations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "industry_id" INTEGER NOT NULL,
    "revenue_tier" "RevenueTier" NOT NULL,
    "apply_from_date" TIMESTAMP(3) NOT NULL,
    "apply_to_date" TIMESTAMP(3),
    "vat_rate_snapshot" DECIMAL(5,4) NOT NULL,
    "pit_rate_snapshot" DECIMAL(5,4) NOT NULL,
    "is_vat_reducible" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tax_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_number_key" ON "users"("phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "users_tax_code_key" ON "users"("tax_code");

-- CreateIndex
CREATE UNIQUE INDEX "users_cccd_number_key" ON "users"("cccd_number");

-- CreateIndex
CREATE UNIQUE INDEX "specific_industries_industry_code_key" ON "specific_industries"("industry_code");

-- CreateIndex
CREATE INDEX "tax_configurations_user_id_apply_to_date_idx" ON "tax_configurations"("user_id", "apply_to_date");

-- AddForeignKey
ALTER TABLE "specific_industries" ADD CONSTRAINT "specific_industries_tax_group_id_fkey" FOREIGN KEY ("tax_group_id") REFERENCES "tax_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_configurations" ADD CONSTRAINT "tax_configurations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_configurations" ADD CONSTRAINT "tax_configurations_industry_id_fkey" FOREIGN KEY ("industry_id") REFERENCES "specific_industries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
