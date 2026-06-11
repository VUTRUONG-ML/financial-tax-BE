/*
  Warnings:

  - The values [ADJUSTMENT] on the enum `InventoryMovementType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "InventoryMovementType_new" AS ENUM ('OPENING', 'PURCHASE_IN', 'SALE_OUT', 'PRODUCTION_IN', 'PRODUCTION_OUT', 'ADJUSTMENT_INCREASE', 'ADJUSTMENT_DECREASE');
ALTER TABLE "inventory_movements" ALTER COLUMN "movement_type" TYPE "InventoryMovementType_new" USING ("movement_type"::text::"InventoryMovementType_new");
ALTER TYPE "InventoryMovementType" RENAME TO "InventoryMovementType_old";
ALTER TYPE "InventoryMovementType_new" RENAME TO "InventoryMovementType";
DROP TYPE "public"."InventoryMovementType_old";
COMMIT;
