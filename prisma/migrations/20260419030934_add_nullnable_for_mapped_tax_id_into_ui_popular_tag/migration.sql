-- DropForeignKey
ALTER TABLE "ui_popular_tags" DROP CONSTRAINT "ui_popular_tags_mapped_tax_id_fkey";

-- AlterTable
ALTER TABLE "tax_categories_dictionary" ADD COLUMN     "is_vat_reducible" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ui_popular_tags" ALTER COLUMN "mapped_tax_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "ui_popular_tags" ADD CONSTRAINT "ui_popular_tags_mapped_tax_id_fkey" FOREIGN KEY ("mapped_tax_id") REFERENCES "tax_categories_dictionary"("id") ON DELETE SET NULL ON UPDATE CASCADE;
