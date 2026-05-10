-- AlterTable
ALTER TABLE "financial_periods" ADD COLUMN     "pit_rate_snapshot" DECIMAL(5,4),
ADD COLUMN     "vat_rate_snapshot" DECIMAL(5,4);
