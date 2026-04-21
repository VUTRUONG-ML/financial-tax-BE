/*
  Warnings:

  - Made the column `issue_date` on table `inbound_invoices` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "inbound_invoices" ALTER COLUMN "issue_date" SET NOT NULL;
