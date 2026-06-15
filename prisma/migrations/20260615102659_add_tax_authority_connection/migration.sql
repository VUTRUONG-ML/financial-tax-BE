-- CreateEnum
CREATE TYPE "TaxAuthorityConnectionStatus" AS ENUM ('PENDING_VERIFY', 'VERIFIED', 'FAILED');

-- CreateTable
CREATE TABLE "tax_authority_connections" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tax_code" TEXT NOT NULL,
    "encrypted_username" TEXT NOT NULL,
    "encrypted_password" TEXT NOT NULL,
    "cash_register_code" TEXT NOT NULL,
    "connection_status" "TaxAuthorityConnectionStatus" NOT NULL DEFAULT 'PENDING_VERIFY',
    "last_verified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tax_authority_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tax_authority_connections_user_id_key" ON "tax_authority_connections"("user_id");

-- AddForeignKey
ALTER TABLE "tax_authority_connections" ADD CONSTRAINT "tax_authority_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
