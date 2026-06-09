-- AlterTable
ALTER TABLE "inbound_invoices" ALTER COLUMN "issue_date" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "invoices" ALTER COLUMN "issue_date" SET DATA TYPE TIMESTAMPTZ(3);
