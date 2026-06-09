/*
  Warnings:

  - The values [RAW_MATERIAL] on the enum `ProductType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ProductType_new" AS ENUM ('FINISHED_GOOD', 'SERVICE');
ALTER TABLE "products" ALTER COLUMN "product_type" TYPE "ProductType_new" USING ("product_type"::text::"ProductType_new");
ALTER TABLE "invoice_details" ALTER COLUMN "product_type" TYPE "ProductType_new" USING ("product_type"::text::"ProductType_new");
ALTER TYPE "ProductType" RENAME TO "ProductType_old";
ALTER TYPE "ProductType_new" RENAME TO "ProductType";
DROP TYPE "public"."ProductType_old";
COMMIT;
