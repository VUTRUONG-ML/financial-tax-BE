/*
  Warnings:

  - You are about to drop the column `public_id` on the `internal_production_orders` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "internal_production_orders_public_id_key";

-- AlterTable
ALTER TABLE "internal_production_orders" DROP COLUMN "public_id";
