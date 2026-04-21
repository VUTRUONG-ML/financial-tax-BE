/*
  Warnings:

  - Made the column `invoice_no` on table `inbound_invoices` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "inbound_invoices" ALTER COLUMN "invoice_no" SET NOT NULL;
