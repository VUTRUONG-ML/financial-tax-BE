import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import {
  AuditLogService,
  tableWrite,
} from '../core/audit-log/audit-log.service';
import { AppLogger } from '../common/logger/app-logger.service';
import { CreateStockReceiptDto } from './dto/create-stock-receipt.dto';
import { StockReceiptResponseDto } from './dto/stock-receipt-response.dto';
import { generateMonthlySequenceCode } from '../common/utils/code-generator.util';
import {
  LOG_ACTIONS,
  LOG_STATUS,
} from '../common/constants/log-events.constant';
import {
  Prisma,
  ProductType,
  StockReceiptSourceType,
  StockReceiptStatus,
  InventoryMovementType,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/client';
import { mapToDto } from 'src/common/utils/mapper.util';
import { InventoryMovementsService } from '../inventory-movements/inventory-movements.service';

@Injectable()
export class StocksService {
  private readonly log = new AppLogger(StocksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly inventoryMovementsService: InventoryMovementsService,
  ) {}

  async createStockReceipt(
    userId: string,
    createDto: CreateStockReceiptDto,
    periodId: number,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<StockReceiptResponseDto> {
    const run = async (client: Prisma.TransactionClient) => {
      // 1. Kiểm tra kì tài chính
      const period = await client.financialPeriod.findUnique({
        where: { id: periodId },
      });

      if (!period || period.userId !== userId) {
        throw new NotFoundException(
          'Financial period not found or access denied.',
        );
      }

      // 2. Kiểm tra danh sách sản phẩm
      const productPublicIds = createDto.products.map((p) => p.productPublicId);
      const uniqueProductPublicIds = Array.from(new Set(productPublicIds));

      if (productPublicIds.length !== uniqueProductPublicIds.length) {
        this.log.warn(LOG_ACTIONS.CREATE_STOCK_RECEIPT, {
          status: LOG_STATUS.FAILED,
          reason: 'DUPLICATE_PRODUCTS',
          userId,
        });
        throw new BadRequestException(
          'Duplicate products detected in the receipt.',
        );
      }

      const products = await client.product.findMany({
        where: {
          publicId: { in: uniqueProductPublicIds },
          userId,
        },
      });

      const productsMap = new Map(products.map((p) => [p.publicId, p]));

      if (products.length !== uniqueProductPublicIds.length) {
        this.log.warn(LOG_ACTIONS.CREATE_STOCK_RECEIPT, {
          status: LOG_STATUS.FAILED,
          reason: 'PRODUCTS_NOT_FOUND',
          userId,
        });
        throw new NotFoundException(
          'One or more products not found or access denied.',
        );
      }

      // Check if any product is SERVICE type
      for (const p of products) {
        if (p.productType === ProductType.SERVICE) {
          this.log.warn(LOG_ACTIONS.CREATE_STOCK_RECEIPT, {
            status: LOG_STATUS.FAILED,
            reason: 'PRODUCT_IS_SERVICE',
            userId,
            productName: p.productName,
          });
          throw new BadRequestException(
            `Product ${p.productName} is a SERVICE and cannot be added to a stock receipt.`,
          );
        }
      }

      // Calculate total value
      let totalValue = new Decimal(0);
      for (const item of createDto.products) {
        const itemTotal = new Decimal(item.quantity).mul(
          new Decimal(item.unitCost),
        );
        totalValue = totalValue.add(itemTotal);
      }

      // 3. Lock user row
      await client.user.update({
        where: { id: userId },
        data: {},
      });

      const transactionDate = new Date(createDto.receiptDate);
      const mm = (transactionDate.getMonth() + 1).toString().padStart(2, '0');
      const yy = transactionDate.getFullYear().toString().slice(-2);
      const mmyy = `${mm}${yy}`;
      const prefix = 'PNK';

      // Get last receipt of user in month to generate sequence
      const lastReceipt = await client.stockReceipt.findFirst({
        where: {
          period: { userId },
          receiptCode: { startsWith: `${prefix}-${mmyy}-` },
        },
        orderBy: { id: 'desc' },
        select: { receiptCode: true },
      });

      const lastCode = lastReceipt?.receiptCode;
      const receiptCode = generateMonthlySequenceCode(
        prefix,
        transactionDate,
        lastCode,
      );

      // 4. Create StockReceipt
      const receipt = await client.stockReceipt.create({
        data: {
          receiptCode,
          receiptDate: transactionDate,
          sourceType: createDto.sourceType,
          supplierName: createDto.supplierName || null,
          sourceInvoiceNo: createDto.sourceInvoiceNo || null,
          sourceDocumentUrl: createDto.sourceDocumentUrl || null,
          totalValue,
          status: StockReceiptStatus.APPROVED,
          periodId: period.id,
        },
      });

      // 5. Create details, inventory movements via injected service, and update product stocks
      for (const item of createDto.products) {
        const productEntity = productsMap.get(item.productPublicId)!;
        const itemQty = new Decimal(item.quantity);
        const itemCost = new Decimal(item.unitCost);
        const itemTotal = itemQty.mul(itemCost);

        // Create StockReceiptDetail
        await client.stockReceiptDetail.create({
          data: {
            receiptId: receipt.id,
            productId: productEntity.id,
            quantity: itemQty,
            unitCost: itemCost,
            totalValue: itemTotal,
            taxCategoryIdSnapshot: productEntity.taxCategoryId,
          },
        });

        // Determine inventory movement type
        let movementType: InventoryMovementType;
        if (createDto.sourceType === StockReceiptSourceType.PURCHASE) {
          movementType = InventoryMovementType.PURCHASE_IN;
        } else if (createDto.sourceType === StockReceiptSourceType.PRODUCTION) {
          movementType = InventoryMovementType.PRODUCTION_IN;
        } else {
          movementType = InventoryMovementType.ADJUSTMENT;
        }

        // Create InventoryMovement via injected service
        await this.inventoryMovementsService.createInventoryMovement(
          {
            productId: productEntity.id,
            periodId: period.id,
            movementType,
            quantity: Math.round(item.quantity),
            unitCost: itemCost,
            totalValue: itemTotal,
            movementDate: transactionDate,
          },
          client,
        );

        // Update product stock using updateMany (not service)
        await client.product.updateMany({
          where: {
            id: productEntity.id,
            productType: { not: ProductType.SERVICE },
          },
          data: {
            currentStock: { increment: Math.round(item.quantity) },
          },
        });
      }

      // Fetch the full receipt with details and products for mapping DTO
      const finalReceipt = await client.stockReceipt.findUnique({
        where: { id: receipt.id },
        include: {
          details: {
            include: {
              product: {
                select: { publicId: true, productName: true, skuCode: true },
              },
            },
          },
        },
      });

      // Audit Log change
      await this.auditLog.logChange(
        client,
        userId,
        'CREATE',
        tableWrite.stockReceipts,
        receipt.id,
        null,
        finalReceipt,
      );

      this.log.log(LOG_ACTIONS.CREATE_STOCK_RECEIPT, {
        status: LOG_STATUS.SUCCESS,
        userId,
        receiptId: receipt.id,
        receiptCode: receipt.receiptCode,
      });

      return mapToDto(StockReceiptResponseDto, finalReceipt);
    };

    if (tx !== (this.prisma as unknown as Prisma.TransactionClient)) {
      return run(tx);
    }
    return this.prisma.$transaction(run);
  }
}
