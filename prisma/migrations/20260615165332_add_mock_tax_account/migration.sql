-- CreateTable
CREATE TABLE "MockTaxAccount" (
    "id" TEXT NOT NULL,
    "taxCode" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "cashRegisterCode" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "isEinvoiceRegistered" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MockTaxAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MockTaxAccount_taxCode_key" ON "MockTaxAccount"("taxCode");
