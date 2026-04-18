/*
  Warnings:

  - You are about to drop the `specific_industries` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `chosen_pit_method` to the `tax_configurations` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PitMethod" AS ENUM ('EXEMPT', 'PERCENTAGE', 'PROFIT_15', 'PROFIT_17', 'PROFIT_20');

-- DropForeignKey
ALTER TABLE "tax_configurations" DROP CONSTRAINT "tax_configurations_industry_id_fkey";

-- AlterTable
ALTER TABLE "tax_configurations" ADD COLUMN     "chosen_pit_method" "PitMethod" NOT NULL;

-- AlterTable
ALTER TABLE "tax_groups" ADD COLUMN     "allowed_methods" "PitMethod"[] DEFAULT ARRAY['PERCENTAGE']::"PitMethod"[];

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "setup_completed_at" TIMESTAMP(3);

-- DropTable
DROP TABLE "specific_industries";

-- CreateTable
CREATE TABLE "tax_categories_dictionary" (
    "id" SERIAL NOT NULL,
    "category_name" TEXT NOT NULL,
    "parent_id" INTEGER,
    "vat_rate" DECIMAL(5,4) NOT NULL,
    "pit_rate" DECIMAL(5,4) NOT NULL,
    "xml_indicator" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tax_categories_dictionary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ui_popular_tags" (
    "id" SERIAL NOT NULL,
    "tag_name" TEXT NOT NULL,
    "icon_name" TEXT,
    "mapped_tax_id" INTEGER NOT NULL,

    CONSTRAINT "ui_popular_tags_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "tax_categories_dictionary" ADD CONSTRAINT "tax_categories_dictionary_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "tax_categories_dictionary"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ui_popular_tags" ADD CONSTRAINT "ui_popular_tags_mapped_tax_id_fkey" FOREIGN KEY ("mapped_tax_id") REFERENCES "tax_categories_dictionary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_configurations" ADD CONSTRAINT "tax_configurations_industry_id_fkey" FOREIGN KEY ("industry_id") REFERENCES "tax_categories_dictionary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
