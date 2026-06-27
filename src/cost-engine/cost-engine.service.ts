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
  StockIssueDocument,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/client';
import { FinancialPeriodsService } from '../financial-periods/financial-periods.service';
import { StocksService } from '../stocks/stocks.service';

interface CostInfo {
  unitCost: Decimal;
  endingQty: number;
}

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
   * Tính toán đơn giá bình quân gia quyền và kết quả tồn kho cuối kỳ cho danh sách sản phẩm trong kỳ.
   */
  private async calculateCostsForProducts(
    userId: string,
    targetProductIds: number[],
    periodId: number,
    isPhase2: boolean,
    tx: Prisma.TransactionClient,
  ): Promise<Map<number, CostInfo>> {
    const costMap = new Map<number, CostInfo>();
    if (targetProductIds.length === 0) {
      return costMap;
    }

    // 1. Query opening stock aggregates in bulk
    const openingAggregates: any[] = await tx.$queryRawUnsafe(
      `
        SELECT
          product_id as "productId",
          SUM(quantity) as "quantity",
          SUM(total_value) as "totalValue"
        FROM inventory_movements
        WHERE period_id = $1
          AND product_id IN (${targetProductIds.join(', ')})
          AND movement_type = 'OPENING'
        GROUP BY product_id
      `,
      periodId,
    );

    const openingMap = new Map<number, { qty: number; val: Decimal }>();
    for (const agg of openingAggregates) {
      const pId = Number(agg.productId);
      const qty = agg.quantity ? Number(agg.quantity) : 0;
      const val = agg.totalValue ? new Decimal(agg.totalValue) : new Decimal(0);
      openingMap.set(pId, { qty, val });
    }

    // 2. Lấy tổng nhập kho hợp lệ theo sản phẩm (từ StocksService)
    const sourceTypes = isPhase2
      ? [
          StockReceiptSourceType.PRODUCTION,
          StockReceiptSourceType.PURCHASE,
          StockReceiptSourceType.ADJUSTMENT,
        ]
      : [StockReceiptSourceType.PURCHASE, StockReceiptSourceType.ADJUSTMENT];

    const receiptMap = await this.stocksService.getReceiptAggregatesByProduct(
      periodId,
      sourceTypes,
      targetProductIds,
      tx,
    );

    // 3. Lấy tổng xuất kho hợp lệ theo sản phẩm (từ StocksService)
    const outboundMap = await this.stocksService.getIssueAggregatesByProduct(
      periodId,
      targetProductIds,
      tx,
    );

    // 4. Compute weighted average cost and endingQty for each product
    const validCosts: [number, Decimal][] = [];
    for (const productId of targetProductIds) {
      const opening = openingMap.get(productId) || { qty: 0, val: new Decimal(0) };
      const inbound = receiptMap.get(productId) || { qty: 0, val: new Decimal(0) };
      const outboundQty = outboundMap.get(productId) || 0;

      const totalQty = opening.qty + inbound.qty;
      const totalVal = opening.val.add(inbound.val);

      let weightedAverageUnitCost = new Decimal(0);
      if (totalQty > 0) {
        weightedAverageUnitCost = totalVal.div(totalQty);
      }

      const endingQty = totalQty - outboundQty;

      costMap.set(productId, {
        unitCost: weightedAverageUnitCost,
        endingQty,
      });

      validCosts.push([productId, weightedAverageUnitCost]);
    }

    // 5. Bulk updates using raw SQL
    if (validCosts.length > 0) {
      const valuesStr = validCosts
        .map(
          ([prodId, cost]) =>
            `(${prodId}::integer, ${cost.toString()}::numeric)`,
        )
        .join(', ');

      // Bulk update stock_issue_details
      const updateIssuesSql = `
        UPDATE stock_issue_details AS d
        SET
          final_weighted_unit_cost = v.unit_cost,
          final_cogs_value = d.quantity * v.unit_cost
        FROM (VALUES ${valuesStr}) AS v(product_id, unit_cost)
        WHERE d.product_id = v.product_id
          AND d.issue_id IN (
            SELECT id FROM stock_issues WHERE period_id = $1 AND status = 'APPROVED'
          )
      `;
      await tx.$executeRawUnsafe(updateIssuesSql, periodId);

      // Bulk update inventory_movements
      const updateMovementsSql = `
        UPDATE inventory_movements AS m
        SET
          unit_cost = v.unit_cost,
          total_value = m.quantity * v.unit_cost
        FROM (VALUES ${valuesStr}) AS v(product_id, unit_cost)
        WHERE m.product_id = v.product_id
          AND m.period_id = $1
          AND m.movement_type IN ('SALE_OUT', 'PRODUCTION_OUT', 'ADJUST_OUT')
      `;
      await tx.$executeRawUnsafe(updateMovementsSql, periodId);
    }

    return costMap;
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

      const allCosts = new Map<number, CostInfo>();

      // 4. Thực thi Phase 1: Tính giá xuất kho cho nguyên vật liệu/mua hàng/khác
      const phase1Costs = await this.calculateCostsForProducts(
        userId,
        phase1ProductIds,
        periodId,
        false,
        tx,
      );
      for (const [prodId, costInfo] of phase1Costs.entries()) {
        allCosts.set(prodId, costInfo);
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
        // Tính tổng chi phí nguyên vật liệu (StockIssue) của lệnh sản xuất
        const materialCostResult: any[] = await tx.$queryRawUnsafe(
          `
            SELECT COALESCE(SUM(d.final_cogs_value), 0) AS "totalMaterialCost"
            FROM stock_issue_details d
            JOIN stock_issues i ON d.issue_id = i.id
            WHERE i.source_document_type = 'PRODUCTION_ORDER'
              AND i.source_document_id = $1
              AND i.status = 'APPROVED'
          `,
          order.id,
        );

        const totalMaterialCost = materialCostResult[0]?.totalMaterialCost
          ? new Decimal(materialCostResult[0].totalMaterialCost)
          : new Decimal(0);

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
      const phase2Costs = await this.calculateCostsForProducts(
        userId,
        phase2ProductIds,
        periodId,
        true,
        tx,
      );
      for (const [prodId, costInfo] of phase2Costs.entries()) {
        allCosts.set(prodId, costInfo);
      }

      // 7. Cập nhật tồn kho kỳ tiếp theo
      if (nextPeriod && allActiveProductIds.length > 0) {
        // Find all active products details
        const activeProducts = await tx.product.findMany({
          where: { id: { in: allActiveProductIds } },
          select: { id: true, publicId: true },
        });
        const activeProductsMap = new Map(activeProducts.map((p) => [p.id, p]));

        // a. Xóa cũ và Revert currentStock trong kỳ tiếp theo
        const existingDetails = await tx.stockReceiptDetail.findMany({
          where: {
            productId: { in: allActiveProductIds },
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

        const detailsByReceiptId = new Map<number, typeof existingDetails>();
        if (existingDetails.length > 0) {
          const revertMap = new Map<number, number>();
          for (const d of existingDetails) {
            const qty = Math.round(d.quantity.toNumber());
            revertMap.set(d.productId, (revertMap.get(d.productId) || 0) + qty);

            const list = detailsByReceiptId.get(d.receiptId) || [];
            list.push(d);
            detailsByReceiptId.set(d.receiptId, list);
          }

          const revertValues = Array.from(revertMap.entries())
            .map(([pId, qty]) => `(${pId}::integer, ${qty}::integer)`)
            .join(', ');

          const updateProductsSql = `
            UPDATE products AS p
            SET current_stock = p.current_stock - v.qty
            FROM (VALUES ${revertValues}) AS v(product_id, qty)
            WHERE p.id = v.product_id
              AND p.product_type != 'SERVICE'
              AND p.current_stock >= v.qty
          `;
          await tx.$executeRawUnsafe(updateProductsSql);
        }

        // Xóa receipt details / receipts của kỳ tiếp theo
        for (const [receiptId, detailsToDelete] of detailsByReceiptId.entries()) {
          const receipt = detailsToDelete[0].receipt; // receipt gốc trong db
          const totalDetailsCount = receipt.details.length; // tổng số lượng item detail thực chất trong receipt này
          const deleteCount = detailsToDelete.length; // tổng số lượng item detail hoạt động trong kì đang muốn chốt này.

          if (totalDetailsCount === deleteCount) {
            await tx.stockReceipt.delete({
              where: { id: receiptId },
            });
          } else {
            const detailIds = detailsToDelete.map((d) => d.id);
            await tx.stockReceiptDetail.deleteMany({
              where: { id: { in: detailIds } },
            });

            const deletedValue = detailsToDelete.reduce(
              (sum, d) => sum.add(d.totalValue),
              new Decimal(0),
            );
            const newTotalValue = new Decimal(receipt.totalValue).sub(deletedValue);
            await tx.stockReceipt.update({
              where: { id: receiptId },
              data: {
                totalValue: newTotalValue,
              },
            });
          }
        }

        // Xóa inventoryMovement kỳ tiếp theo
        await tx.inventoryMovement.deleteMany({
          where: {
            productId: { in: allActiveProductIds },
            periodId: nextPeriod.id,
            movementType: InventoryMovementType.OPENING,
          },
        });

        // b. Tạo mới
        const nextPeriodProductsToCreate: {
          productPublicId: string;
          quantity: number;
          unitCost: number;
        }[] = [];
        for (const [productId, info] of allCosts.entries()) {
          if (info.endingQty > 0) {
            const product = activeProductsMap.get(productId);
            if (product) {
              nextPeriodProductsToCreate.push({
                productPublicId: product.publicId,
                quantity: info.endingQty,
                unitCost: Number(info.unitCost),
              });
            }
          }
        }

        if (nextPeriodProductsToCreate.length > 0) {
          await this.stocksService.createStockReceipt(
            userId,
            {
              sourceType: StockReceiptSourceType.OPENING,
              receiptDate: nextPeriod.startDate.toISOString(),
              products: nextPeriodProductsToCreate,
              note: 'The system has automatically transferred the financial period.',
            },
            nextPeriod.id,
            tx,
          );
        }
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
