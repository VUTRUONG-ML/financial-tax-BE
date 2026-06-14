-- AlterEnum
BEGIN;
CREATE TYPE "InventoryMovementType_new" AS ENUM ('OPENING', 'PURCHASE_IN', 'PRODUCTION_IN', 'SALE_OUT', 'PRODUCTION_OUT', 'ADJUST_IN', 'ADJUST_OUT');
ALTER TABLE "inventory_movements" ALTER COLUMN "movement_type" TYPE "InventoryMovementType_new" USING ("movement_type"::text::"InventoryMovementType_new");
DROP TYPE "InventoryMovementType";
ALTER TYPE "InventoryMovementType_new" RENAME TO "InventoryMovementType";
COMMIT;

-- DropForeignKey
ALTER TABLE "opening_inventory_balances" DROP CONSTRAINT IF EXISTS "opening_inventory_balances_product_id_fkey";

-- DropTable
DROP TABLE IF EXISTS "opening_inventory_balances";
