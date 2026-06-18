import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { AppLogger } from '../common/logger/app-logger.service';
import { LOG_ACTIONS, LOG_STATUS } from '../common/constants/log-events.constant';
import {
  Prisma,
  InventoryMovementType,
  StockIssueStatus,
  SourceDocumentType,
  StockReceiptStatus,
  StockReceiptSourceType,
  ProductionStatus,
  ProductType,
  StockIssueDocument,
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

  /**
   * Helper để tính toán đơn giá bình quan và cập nhật giá xuất kho cho từng sản phẩm.
   */
  private async calculateProductCost(
    userId: string,
    productId: number,
    periodId: number,
    isPhase2: boolean,
    nextPeriod: any,
    tx: Prisma.TransactionClient,
  ): Promise<Decimal> {
    // tồn đầu kì
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

    // nhập trong kì
    const sourceTypes = isPhase2
      ? [
          StockReceiptSourceType.PRODUCTION,
          StockReceiptSourceType.PURCHASE,
          StockReceiptSourceType.ADJUSTMENT,
        ]
      : [StockReceiptSourceType.PURCHASE, StockReceiptSourceType.ADJUSTMENT];

    const inboundDetails = await tx.stockReceiptDetail.findMany({
      where: {
        productId,
        receipt: {
          periodId,
          status: StockReceiptStatus.APPROVED,
          sourceType: { in: sourceTypes },
        },
      },
    });

    let inboundQty = 0;
    let inboundVal = new Decimal(0);

    for (const d of inboundDetails) {
      inboundQty += d.quantity.toNumber();
      inboundVal = inboundVal.add(d.totalValue);
    }

    const totalQty = openingQty + inboundQty;
    const totalVal = openingVal.add(inboundVal);

    let weightedAverageUnitCost = new Decimal(0);
    if (totalQty > 0) {
      weightedAverageUnitCost = totalVal.div(totalQty);
    }

    // cập nhật
    const issueDetails = await tx.stockIssueDetail.findMany({
      where: {
        productId,
        issue: {
          periodId,
          status: StockIssueStatus.APPROVED,
        },
      },
    });

    for (const detail of issueDetails) {
      const finalCogsValue = detail.quantity.mul(weightedAverageUnitCost);
      await tx.stockIssueDetail.update({
        where: { id: detail.id },
        data: {
          finalWeightedUnitCost: weightedAverageUnitCost,
          finalCogsValue,
        },
      });
    }

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
      const totalValue = new Decimal(m.quantity).mul(weightedAverageUnitCost);
      outboundQty += m.quantity;
      await tx.inventoryMovement.update({
        where: { id: m.id },
        data: {
          unitCost: weightedAverageUnitCost,
          totalValue,
        },
      });
    }

    // tính tồn cho đầu kì sau
    const endingQty = totalQty - outboundQty;

    if (nextPeriod) {
      //  xóa cũ
      const existingDetails = await tx.stockReceiptDetail.findMany({
        where: {
          productId,
          receipt: {
            periodId: nextPeriod.id,
            sourceType: StockReceiptSourceType.OPENING,
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
            productType: { not: ProductType.SERVICE },
            currentStock: { gte: Math.round(Number(detail.quantity)) },
          },
          data: {
            currentStock: { decrement: Math.round(Number(detail.quantity)) },
          },
        });

        const receipt = detail.receipt;
        if (receipt.details.length === 1) {
          // Chỉ có 1 sản phẩm trong phiếu, xóa luôn phiếu nhập
          await tx.stockReceipt.delete({
            where: { id: receipt.id },
          });
        } else {
          // Nhiều sản phẩm trong phiếu, chỉ xóa chi tiết của sản phẩm này
          await tx.stockReceiptDetail.delete({
            where: { id: detail.id },
          });
          // Cập nhật lại tổng giá trị của phiếu nhập
          const newTotalValue = new Decimal(receipt.totalValue).sub(
            new Decimal(detail.totalValue),
          );
          await tx.stockReceipt.update({
            where: { id: receipt.id },
            data: {
              totalValue: newTotalValue,
            },
          });
        }
      }

      // Xóa inventoryMovement kỳ tiếp theo
      await tx.inventoryMovement.deleteMany({
        where: {
          productId,
          periodId: nextPeriod.id,
          movementType: InventoryMovementType.OPENING,
        },
      });

      // Tạo mới
      if (endingQty > 0) {
        const product = await tx.product.findUnique({
          where: { id: productId },
          select: { publicId: true },
        });
        if (product) {
          await this.stocksService.createStockReceipt(
            userId,
            {
              sourceType: StockReceiptSourceType.OPENING,
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

    return weightedAverageUnitCost;
  }

  /**
   * Tính toán và áp dụng giá xuất kho theo phương pháp bình quân gia quyền.
   * Quá trình chạy gồm 2 Phase:
   * - Phase 1: Tính toán cho các sản phẩm không sản xuất (nguyên vật liệu/mua hàng)
   * - Intermediate: Tính tổng giá trị nguyên liệu xuất cho từng lệnh sản xuất, áp vào phiếu nhập thành phẩm tương ứng
   * - Phase 2: Tính toán cho các sản phẩm sản xuất (thành phẩm)
   */
  async calculateAndApplyWeightedAverageCosts(
    userId: string,
    periodId: number,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    this.log.debug(LOG_ACTIONS.RUN_COST_ENGINE, {
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

      // 1. Tìm toàn bộ sản phẩm có phát sinh hoạt động trong kỳ này
      const activeMovements = await tx.inventoryMovement.findMany({
        where: {
          periodId,
          product: { userId },
        },
        select: { productId: true },
      });
      const allActiveProductIds = Array.from(
        new Set(activeMovements.map((m) => m.productId)),
      );

      // 2. Tìm toàn bộ sản phẩm được nhập từ sản xuất trong kỳ này (Phase 2 candidate)
      const producedReceiptDetails = await tx.stockReceiptDetail.findMany({
        where: {
          receipt: {
            periodId,
            status: StockReceiptStatus.APPROVED,
            sourceType: StockReceiptSourceType.PRODUCTION,
          },
          product: { userId },
        },
        select: { productId: true },
      });
      const phase2ProductIds = Array.from(
        new Set(producedReceiptDetails.map((d) => d.productId)),
      );

      // 3. Phân loại sản phẩm thành 2 phase (Phase 1 = Active - Phase 2)
      const phase1ProductIds = allActiveProductIds.filter(
        (id) => !phase2ProductIds.includes(id),
      );

      this.log.debug(LOG_ACTIONS.RUN_COST_ENGINE, {
        message: `Found ${allActiveProductIds.length} active products. Phase 1: ${phase1ProductIds.length}, Phase 2: ${phase2ProductIds.length}`,
        userId,
        periodId,
      });

      // 4. Thực thi Phase 1: Tính giá xuất kho cho nguyên vật liệu/mua hàng/khác
      for (const productId of phase1ProductIds) {
        await this.calculateProductCost(
          userId,
          productId,
          periodId,
          false,
          nextPeriod,
          tx,
        );
      }

      // 5. Thực thi Intermediate Phase: Tính toán chi phí nguyên liệu cho lệnh sản xuất
      // và cập nhật giá trị/đơn giá cho các phiếu nhập kho thành phẩm sản xuất tương ứng
      const activeProductionOrders = await tx.internalProductionOrder.findMany({
        where: {
          userId,
          status: ProductionStatus.ACTIVE,
          transactionAt: {
            gte: period.startDate,
            lte: period.endDate,
          },
        },
      });

      for (const order of activeProductionOrders) {
        // Tìm phiếu xuất nguyên vật liệu (StockIssue) của lệnh sản xuất này
        const stockIssue = await tx.stockIssue.findFirst({
          where: {
            sourceDocumentType: StockIssueDocument.PRODUCTION_ORDER,
            sourceDocumentId: order.id,
            status: StockIssueStatus.APPROVED,
          },
          include: {
            details: true,
          },
        });

        let totalMaterialCost = new Decimal(0);
        if (stockIssue) {
          for (const detail of stockIssue.details) {
            totalMaterialCost = totalMaterialCost.add(
              detail.finalCogsValue ?? 0,
            );
          }
        }

        // Tìm phiếu nhập kho thành phẩm (StockReceipt) của lệnh sản xuất này
        const stockReceipt = await tx.stockReceipt.findFirst({
          where: {
            sourceInvoiceNo: order.orderCode,
            sourceType: StockReceiptSourceType.PRODUCTION,
            status: StockReceiptStatus.APPROVED,
          },
          include: {
            details: true,
          },
        });

        if (stockReceipt && stockReceipt.details.length > 0) {
          const detail = stockReceipt.details[0];
          const qty = detail.quantity.toNumber();

          if (qty > 0) {
            const unitCost = totalMaterialCost.div(qty);

            await tx.stockReceiptDetail.update({
              where: { id: detail.id },
              data: {
                unitCost,
                totalValue: totalMaterialCost,
              },
            });

            // Cập nhật InventoryMovement (PRODUCTION_IN)
            await tx.inventoryMovement.updateMany({
              where: {
                sourceDocumentId: stockReceipt.id,
                sourceDocumentType: SourceDocumentType.PRODUCTION_ORDER,
                productId: detail.productId,
                movementType: InventoryMovementType.PRODUCTION_IN,
              },
              data: {
                unitCost,
                totalValue: totalMaterialCost,
              },
            });

            // Cập nhật lại tổng giá trị của phiếu nhập kho thành phẩm
            await tx.stockReceipt.update({
              where: { id: stockReceipt.id },
              data: {
                totalValue: totalMaterialCost,
              },
            });
          }
        }
      }

      // 6. Thực thi Phase 2: Tính giá xuất kho cho thành phẩm sản xuất
      for (const productId of phase2ProductIds) {
        await this.calculateProductCost(
          userId,
          productId,
          periodId,
          true,
          nextPeriod,
          tx,
        );
      }

      this.log.log(LOG_ACTIONS.RUN_COST_ENGINE, {
        status: LOG_STATUS.SUCCESS,
        userId,
        periodId,
        productCount: allActiveProductIds.length,
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
