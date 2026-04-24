import { Prisma } from '@prisma/client';
import { AppLogger } from '../../common/logger/app-logger.service';
import { LOG_STATUS } from 'src/common/constants/log-events.constant';
interface item {
  productId: number;
  _sum: {
    quantity: number | null;
  };
}
export const refundQuantityProduct = async (
  tx: Prisma.TransactionClient,
  log: AppLogger,
  userId: string,
  invoiceId: number,
  details: item[],
) => {
  for (const d of details) {
    const quantity = d._sum.quantity ?? 0;
    if (quantity <= 0) continue;
    await tx.product.update({
      where: { id: d.productId },
      data: {
        currentStock: { increment: quantity },
      },
    });
  }
  log.debug('REFUND_PRODUCT', {
    status: LOG_STATUS.SUCCESS,
    userId,
    invoiceId,
  });
};
