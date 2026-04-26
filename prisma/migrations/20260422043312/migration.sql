/*
  Warnings:

  - Added the required column `paid_amount` to the `invoices` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "paid_amount" DECIMAL(18,4) NOT NULL;
