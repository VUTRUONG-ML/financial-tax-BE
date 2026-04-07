/*
  Warnings:

  - You are about to drop the column `tax_group_id` on the `specific_industries` table. All the data in the column will be lost.
  - You are about to drop the column `revenue_tier` on the `tax_configurations` table. All the data in the column will be lost.
  - Added the required column `tax_group_id` to the `tax_configurations` table without a default value. This is not possible if the table is not empty.
  - Added the required column `min_revenue` to the `tax_groups` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "specific_industries" DROP CONSTRAINT "specific_industries_tax_group_id_fkey";

-- AlterTable
ALTER TABLE "specific_industries" DROP COLUMN "tax_group_id";

-- AlterTable
ALTER TABLE "tax_configurations" DROP COLUMN "revenue_tier",
ADD COLUMN     "tax_group_id" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "tax_groups" ADD COLUMN     "description" TEXT,
ADD COLUMN     "max_revenue" DECIMAL(18,4),
ADD COLUMN     "min_revenue" DECIMAL(18,4) NOT NULL;

-- DropEnum
DROP TYPE "RevenueTier";

-- AddForeignKey
ALTER TABLE "tax_configurations" ADD CONSTRAINT "tax_configurations_tax_group_id_fkey" FOREIGN KEY ("tax_group_id") REFERENCES "tax_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
