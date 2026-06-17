import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { AppLogger } from '../common/logger/app-logger.service';
import { LOG_ACTIONS, LOG_STATUS } from '../common/constants/log-events.constant';
import {
  Prisma,
  InventoryMovementType,
  StockIssueStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/client';
import { FinancialPeriodsService } from '../financial-periods/financial-periods.service';
import { StocksService } from '../stocks/stocks.service';

@Injectable()
export class CostEngineService {
  private readonly log = new AppLogger(CostEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => FinancialPeriodsService))
    private readonly financialPeriodsService: FinancialPeriodsService,
    private readonly stocksService: StocksService,
  ) { }

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

      const nextPeriodStartDate = new Date(period.endDate.getTime() + 1000);
      const nextPeriod = await this.financialPeriodsService.ensurePeriodExists(
        userId,
        tx,
        nextPeriodStartDate,
      );

      const openingMovements = await tx.inventoryMovement.findMany({
        where: {
          periodId,
          movementType: InventoryMovementType.OPENING,
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

      const uniqueProductIds = Array.from(
        new Set([
          ...openingMovements.map((om) => om.productId),
          ...movements.map((m) => m.productId),
        ]),
      );

      this.log.debug(LOG_ACTIONS.RUN_COST_ENGINE, {
        message: `Found ${uniqueProductIds.length} products to process cost calculation.`,
        userId,
        periodId,
        productCount: uniqueProductIds.length,
      });

      for (const productId of uniqueProductIds) {
        const openingMovementsForProduct = await tx.inventoryMovement.findMany({
          where: {
            productId,
            periodId,
            movementType: InventoryMovementType.OPENING,
          },
        });

        let openingQty = 0;
        let openingVal = new Decimal(0);
        for (const om of openingMovementsForProduct) {
          openingQty += om.quantity;
          openingVal = openingVal.add(om.totalValue);
        }

        // Lấy toàn bộ giao dịch nhập kho phát sinh trong kỳ
        const inboundMovements = await tx.inventoryMovement.findMany({
          where: {
            productId,
            periodId,
            movementType: {
              in: [
                InventoryMovementType.PURCHASE_IN,
                InventoryMovementType.PRODUCTION_IN,
                InventoryMovementType.ADJUST_IN,
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
          const finalCogsValue = new Decimal(detail.quantity).mul(
            weightedAverageUnitCost,
          );
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
                InventoryMovementType.ADJUST_OUT,
              ],
            },
          },
        });

        let outboundQty = 0;
        for (const m of outboundMovements) {
          const totalValue = new Decimal(m.quantity).mul(
            weightedAverageUnitCost,
          );
          outboundQty += m.quantity;
          await tx.inventoryMovement.update({
            where: { id: m.id },
            data: {
              unitCost: weightedAverageUnitCost,
              totalValue,
            },
          });
        }

        const endingQty = totalQty - outboundQty;
        const endingValue =
          endingQty > 0
            ? new Decimal(endingQty).mul(weightedAverageUnitCost)
            : new Decimal(0);

        if (nextPeriod) {
          // Find existing StockReceiptDetails of type OPENING for this product in nextPeriod
          const existingDetails = await tx.stockReceiptDetail.findMany({
            where: {
              productId,
              receipt: {
                periodId: nextPeriod.id,
                sourceType: 'OPENING',
              },
            },
            include: {
              receipt: {
                include: {
                  details: true,
                },
              },
            },
          });

          for (const detail of existingDetails) {
            // Revert product currentStock
            await tx.product.updateMany({
              where: {
                id: detail.productId,
                productType: { not: 'SERVICE' },
              },
              data: {
                currentStock: { decrement: Math.round(Number(detail.quantity)) },
              },
            });

            const receipt = detail.receipt;
            if (receipt.details.length === 1) {
              // Only this product is in the receipt, safe to delete the whole receipt
              await tx.stockReceipt.delete({
                where: { id: receipt.id },
              });
            } else {
              // Multiple products in the receipt, delete only this detail
              await tx.stockReceiptDetail.delete({
                where: { id: detail.id },
              });
              // Update total value of the receipt
              const newTotalValue = new Decimal(receipt.totalValue).sub(new Decimal(detail.totalValue));
              await tx.stockReceipt.update({
                where: { id: receipt.id },
                data: {
                  totalValue: newTotalValue,
                },
              });
            }
          }

          // Also delete the existing inventory movements of type OPENING for this product in nextPeriod (in case any exist)
          await tx.inventoryMovement.deleteMany({
            where: {
              productId,
              periodId: nextPeriod.id,
              movementType: InventoryMovementType.OPENING,
            },
          });

          // Nếu số lượng tồn cuối kỳ > 0, tạo bản ghi OPENING ở kỳ tiếp theo bằng StockReceipt service
          if (endingQty > 0) {
            const product = await tx.product.findUnique({
              where: { id: productId },
              select: { publicId: true },
            });
            if (product) {
              await this.stocksService.createStockReceipt(
                userId,
                {
                  sourceType: 'OPENING',
                  receiptDate: nextPeriod.startDate.toISOString(),
                  products: [
                    {
                      productPublicId: product.publicId,
                      quantity: endingQty,
                      unitCost: Number(weightedAverageUnitCost),
                    },
                  ],
                },
                nextPeriod.id,
                tx,
              );
            }
          }
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
