/*
  Warnings:

  - Made the column `mapped_tax_id` on table `ui_popular_tags` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "ui_popular_tags" DROP CONSTRAINT "ui_popular_tags_mapped_tax_id_fkey";

-- AlterTable
ALTER TABLE "ui_popular_tags" ALTER COLUMN "mapped_tax_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "ui_popular_tags" ADD CONSTRAINT "ui_popular_tags_mapped_tax_id_fkey" FOREIGN KEY ("mapped_tax_id") REFERENCES "tax_categories_dictionary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
