/*
  Warnings:

  - You are about to drop the column `total_amount` on the `inbound_invoices` table. All the data in the column will be lost.
  - Added the required column `total_payment` to the `inbound_invoices` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "inbound_invoices" RENAME COLUMN "total_amount" TO "total_payment";
