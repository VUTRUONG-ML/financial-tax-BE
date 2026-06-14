import { Injectable } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { AppLogger } from '../common/logger/app-logger.service';
import { LOG_ACTIONS, LOG_STATUS } from '../common/constants/log-events.constant';
import {
  Prisma,
  InventoryMovementType,
  StockIssueStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/client';

@Injectable()
export class CostEngineService {
  private readonly log = new AppLogger(CostEngineService.name);

  constructor(private readonly prisma: PrismaService) { }

  async calculateAndApplyWeightedAverageCosts(
    userId: string,
    periodId: number,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    this.log.log(LOG_ACTIONS.RUN_COST_ENGINE, {
      status: LOG_STATUS.START,
      userId,
      periodId,
    });

    try {
      const period = await tx.financialPeriod.findUnique({
        where: { id: periodId },
      });

      if (!period) {
        throw new Error(`Financial period with id ${periodId} not found.`);
      }

      const periodYear = period.startDate.getFullYear();

      const openingBalances = await tx.openingInventoryBalance.findMany({
        where: {
          periodYear,
          product: { userId },
        },
        select: { productId: true },
      });

      const movements = await tx.inventoryMovement.findMany({
        where: {
          periodId,
          product: { userId },
        },
        select: { productId: true },
      });

      // 4. Hợp nhất danh sách productId duy nhất
      const uniqueProductIds = Array.from(
        new Set([
          ...openingBalances.map((ob) => ob.productId),
          ...movements.map((m) => m.productId),
        ]),
      );

      this.log.log(LOG_ACTIONS.RUN_COST_ENGINE, {
        message: `Found ${uniqueProductIds.length} products to process cost calculation.`,
        userId,
        periodId,
        productCount: uniqueProductIds.length,
      });

      for (const productId of uniqueProductIds) {
        // Lấy số lượng và giá trị tồn đầu kỳ
        const openingBalance = await tx.openingInventoryBalance.findUnique({
          where: {
            productId_periodYear: {
              productId,
              periodYear,
            },
          },
        });

        const openingQty = openingBalance ? openingBalance.openingQuantity : 0;
        const openingVal = openingBalance ? openingBalance.openingValue : new Decimal(0);

        // Lấy toàn bộ giao dịch nhập kho phát sinh trong kỳ
        const inboundMovements = await tx.inventoryMovement.findMany({
          where: {
            productId,
            periodId,
            movementType: {
              in: [
                InventoryMovementType.PURCHASE_IN,
                InventoryMovementType.PRODUCTION_IN,
                InventoryMovementType.ADJUSTMENT_INCREASE,
              ],
            },
          },
        });

        let inboundQty = 0;
        let inboundVal = new Decimal(0);

        for (const m of inboundMovements) {
          inboundQty += m.quantity;
          inboundVal = inboundVal.add(m.totalValue);
        }

        const totalQty = openingQty + inboundQty;
        const totalVal = openingVal.add(inboundVal);

        let weightedAverageUnitCost = new Decimal(0);
        if (totalQty > 0) {
          weightedAverageUnitCost = totalVal.div(totalQty);
        }

        // Cập nhật Stock_Issue_Details cho kỳ này
        const issueDetails = await tx.stockIssueDetail.findMany({
          where: {
            productId,
            issue: {
              periodId,
              status: { not: StockIssueStatus.CANCELLED },
            },
          },
        });

        for (const detail of issueDetails) {
          const finalCogsValue = new Decimal(detail.quantity).mul(weightedAverageUnitCost);
          await tx.stockIssueDetail.update({
            where: { id: detail.id },
            data: {
              finalWeightedUnitCost: weightedAverageUnitCost,
              finalCogsValue,
            },
          });
        }

        // Cập nhật Inventory_Movements xuất kho cho kỳ này
        const outboundMovements = await tx.inventoryMovement.findMany({
          where: {
            productId,
            periodId,
            movementType: {
              in: [
                InventoryMovementType.SALE_OUT,
                InventoryMovementType.PRODUCTION_OUT,
                InventoryMovementType.ADJUSTMENT_DECREASE,
              ],
            },
          },
        });

        for (const m of outboundMovements) {
          const totalValue = new Decimal(m.quantity).mul(weightedAverageUnitCost);
          await tx.inventoryMovement.update({
            where: { id: m.id },
            data: {
              unitCost: weightedAverageUnitCost,
              totalValue,
            },
          });
        }
      }

      this.log.log(LOG_ACTIONS.RUN_COST_ENGINE, {
        status: LOG_STATUS.SUCCESS,
        userId,
        periodId,
        productCount: uniqueProductIds.length,
      });
    } catch (error) {
      this.log.warn(LOG_ACTIONS.RUN_COST_ENGINE, {
        status: LOG_STATUS.FAILED,
        reason: error.message || 'UNKNOWN_ERROR',
        userId,
        periodId,
      });
      throw error;
    }
  }
}
