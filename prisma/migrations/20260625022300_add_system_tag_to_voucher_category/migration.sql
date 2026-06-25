-- AlterTable
ALTER TABLE "voucher_categories" ADD COLUMN     "system_tag" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "voucher_categories_system_tag_key" ON "voucher_categories"("system_tag");
