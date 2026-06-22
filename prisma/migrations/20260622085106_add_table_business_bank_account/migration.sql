-- CreateEnum
CREATE TYPE "ProviderType" AS ENUM ('BANK', 'E_WALLET');

-- CreateEnum
CREATE TYPE "DeclarationStatus" AS ENUM ('INITIAL_REGISTRATION', 'INFORMATION_UPDATE', 'ACCOUNT_CLOSURE');

-- CreateTable
CREATE TABLE "business_bank_accounts" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider_type" "ProviderType" NOT NULL,
    "provider_name" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "account_holder_name" TEXT NOT NULL,
    "business_location_name" TEXT NOT NULL,
    "business_location_code" TEXT NOT NULL,
    "declaration_status" "DeclarationStatus" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "registered_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "business_bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "business_bank_accounts_public_id_key" ON "business_bank_accounts"("public_id");

-- CreateIndex
CREATE INDEX "business_bank_accounts_user_id_idx" ON "business_bank_accounts"("user_id");

-- AddForeignKey
ALTER TABLE "business_bank_accounts" ADD CONSTRAINT "business_bank_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
