/*
  Warnings:

  - Added the required column `status` to the `inbound_invoices` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "InboundInvoiceStatus" AS ENUM ('CANCELED', 'ACTIVE');

-- AlterTable
ALTER TABLE "inbound_invoices" ADD COLUMN     "status" "InboundInvoiceStatus" NOT NULL;
