-- CreateEnum
CREATE TYPE "S2cExpenseMapping" AS ENUM ('ITEM_A', 'ITEM_B', 'ITEM_C', 'ITEM_D', 'ITEM_E', 'ITEM_F', 'NONE');

-- AlterTable
ALTER TABLE "voucher_categories" ADD COLUMN     "s2c_expense_mapping" "S2cExpenseMapping" NOT NULL DEFAULT 'NONE';
