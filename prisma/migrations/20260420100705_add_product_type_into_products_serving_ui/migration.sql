/*
  Warnings:

  - Added the required column `product_type` to the `products` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('FINISHED_GOOD', 'RAW_MATERIAL', 'SERVICE');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "product_type" "ProductType" NOT NULL;
