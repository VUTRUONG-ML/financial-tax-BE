-- AlterTable
ALTER TABLE "vouchers" ADD COLUMN     "stock_receipt_id" INTEGER;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_stock_receipt_id_fkey" FOREIGN KEY ("stock_receipt_id") REFERENCES "stock_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
