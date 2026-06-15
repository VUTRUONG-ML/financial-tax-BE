-- AlterEnum
BEGIN;
CREATE TYPE "InventoryMovementType_new" AS ENUM ('OPENING', 'CARRY_FORWARD', 'PURCHASE_IN', 'PRODUCTION_IN', 'SALE_OUT', 'PRODUCTION_OUT', 'ADJUST_IN', 'ADJUST_OUT');
ALTER TABLE "inventory_movements" ALTER COLUMN "movement_type" TYPE "InventoryMovementType_new" USING (
  CASE "movement_type"::text
    WHEN 'ADJUSTMENT_INCREASE' THEN 'ADJUST_IN'::"InventoryMovementType_new"
    WHEN 'ADJUSTMENT_DECREASE' THEN 'ADJUST_OUT'::"InventoryMovementType_new"
    ELSE "movement_type"::text::"InventoryMovementType_new"
  END
);
DROP TYPE "InventoryMovementType";
ALTER TYPE "InventoryMovementType_new" RENAME TO "InventoryMovementType";
COMMIT;
