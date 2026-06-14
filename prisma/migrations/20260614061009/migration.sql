-- AlterTable
ALTER TABLE "tax_configurations" ALTER COLUMN "apply_from_date" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "apply_to_date" SET DATA TYPE TIMESTAMPTZ(3);
