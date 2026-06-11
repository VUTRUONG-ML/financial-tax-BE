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
import { CreateStockIssueDto } from './dto/create-stock-issue.dto';
import { StockIssueResponseDto } from './dto/stock-issue-response.dto';
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
  StockIssueType,
  StockIssueStatus,
  StockIssueDocument,
  SourceDocumentType,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/client';
import { mapToDto } from 'src/common/utils/mapper.util';
import { InventoryMovementsService } from '../inventory-movements/inventory-movements.service';
import { moment } from 'src/common/utils/time.util';

@Injectable()
export class StocksService {
  private readonly log = new AppLogger(StocksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly inventoryMovementsService: InventoryMovementsService,
  ) { }

  async createStockReceipt(
    userId: string,
    createDto: CreateStockReceiptDto,
    periodId: number,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<StockReceiptResponseDto> {
    const run = async (client: Prisma.TransactionClient) => {
      const period = await client.financialPeriod.findUnique({
        where: { id: periodId },
      });

      if (!period || period.userId !== userId) {
        throw new NotFoundException(
          'Financial period not found or access denied.',
        );
      }

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
          status: StockReceiptStatus.APPROVED,
          totalValue,
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
          movementType = InventoryMovementType.ADJUSTMENT_INCREASE;
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
            sourceDocumentId: receipt.id,
            sourceDocumentType:
              movementType === 'PRODUCTION_IN'
                ? 'PRODUCTION_ORDER'
                : movementType === 'PURCHASE_IN'
                  ? 'INBOUND_INVOICE'
                  : undefined,
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
          period: { select: { periodName: true } },
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

  async cancelReceipt(
    userId: string,
    periodId: number,
    receiptCode: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const run = async (client: Prisma.TransactionClient) => {
      const current = await client.stockReceipt.findFirst({
        where: {
          receiptCode,
          period: {
            userId,
          },
        },
        include: { vouchers: true, details: true },
      });
      if (!current) {
        this.log.warn(LOG_ACTIONS.CANCEL_STOCK_RECEIPT, {
          status: LOG_STATUS.FAILED,
          userId,
          reason: 'RECEIPT_NOT_FOUND',
          receiptCode,
        });
        throw new NotFoundException('The warehouse receipt does not exist.');
      }
      if (current.vouchers.length !== 0) {
        this.log.warn(LOG_ACTIONS.CANCEL_STOCK_RECEIPT, {
          status: LOG_STATUS.FAILED,
          userId,
          reason: 'VOUCHER_EXISTING_RELATED',
          receiptCode,
        });
        throw new BadRequestException({
          message: 'The stock receipt has been payed.',
          errorCode: 'VOUCHER_EXISTING_RELATED',
        });
      }
      const updateReceipt = await client.stockReceipt.updateMany({
        where: {
          receiptCode,
          periodId,
          status: { not: StockReceiptStatus.CANCELLED },
        },
        data: {
          status: StockReceiptStatus.CANCELLED,
        },
      });
      if (updateReceipt.count === 0) {
        this.log.warn(LOG_ACTIONS.CANCEL_STOCK_RECEIPT, {
          status: LOG_STATUS.FAILED,
          userId,
          reason: 'RECEIPT_CANCELED',
          receiptCode,
        });
        throw new BadRequestException('The stock receipt has been canceled.');
      }
      const items = current.details;
      const transactionDate = moment().toDate();
      for (const item of items) {
        const itemTotal = item.quantity.mul(item.unitCost);
        // xử lí liên quan tới inventoryMovement và currentStock
        const updateProduct = await client.product.updateMany({
          where: {
            id: item.productId,
            userId,
            currentStock: { gte: Number(item.quantity) },
          },
          data: {
            currentStock: { decrement: Number(item.quantity) },
          },
        });
        if (updateProduct.count === 0) {
          this.log.warn(LOG_ACTIONS.CANCEL_STOCK_RECEIPT, {
            status: LOG_STATUS.FAILED,
            reason: 'INSUFFICIENT_STOCK',
            userId,
            productId: item.productId,
          });
          throw new BadRequestException(
            `Insufficient stock for cancel stock receipt code: ${receiptCode}.`,
          );
        }

        const movementType = InventoryMovementType.ADJUSTMENT_DECREASE;
        let srcType: SourceDocumentType | undefined;
        if (current.sourceType === 'PURCHASE') {
          srcType = SourceDocumentType.INBOUND_INVOICE;
        } else if (current.sourceType === 'PRODUCTION') {
          srcType = SourceDocumentType.PRODUCTION_ORDER;
        }
        await this.inventoryMovementsService.createInventoryMovement(
          {
            productId: item.productId,
            periodId,
            movementType,
            quantity: Number(item.quantity),
            unitCost: item.unitCost,
            totalValue: itemTotal,
            movementDate: transactionDate,
            sourceDocumentType: srcType,
            sourceDocumentId: current.id,
          },
          client,
        );
      }
      await this.auditLog.logChange(
        client,
        userId,
        'UPDATE',
        tableWrite.stockReceipts,
        current.id,
        { status: current.status },
        { status: StockIssueStatus.CANCELLED },
      );

      this.log.log(LOG_ACTIONS.CANCEL_STOCK_RECEIPT, {
        userId,
        receiptCode,
        status: LOG_STATUS.SUCCESS,
      });
      const resReceipt = await client.stockReceipt.findUnique({
        where: { id: current.id },
        include: {
          period: {
            select: { periodName: true },
          },
          details: {
            include: {
              product: {
                select: { publicId: true, productName: true, skuCode: true },
              },
            },
          },
        },
      });
      return mapToDto(StockReceiptResponseDto, resReceipt);
    };
    if (tx !== this.prisma) return run(tx);
    return this.prisma.$transaction(run);
  }
  //----------------------------------------------------------------------

  async createStockIssue(
    userId: string,
    createDto: CreateStockIssueDto,
    periodId: number,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<StockIssueResponseDto> {
    const run = async (client: Prisma.TransactionClient) => {
      const period = await client.financialPeriod.findUnique({
        where: { id: periodId },
      });

      if (!period || period.userId !== userId) {
        throw new NotFoundException(
          'Financial period not found or access denied.',
        );
      }

      const productPublicIds = createDto.products.map((p) => p.productPublicId);
      const uniqueProductPublicIds = Array.from(new Set(productPublicIds));

      const qtyDetailMap = new Map<string, number>();

      for (const item of createDto.products) {
        qtyDetailMap.set(
          item.productPublicId,
          (qtyDetailMap.get(item.productPublicId) ?? 0) + item.quantity,
        );
      }

      const products = await client.product.findMany({
        where: {
          publicId: { in: uniqueProductPublicIds },
          userId,
        },
      });

      if (products.length !== uniqueProductPublicIds.length) {
        this.log.warn(LOG_ACTIONS.CREATE_STOCK_ISSUE, {
          status: LOG_STATUS.FAILED,
          reason: 'PRODUCTS_NOT_FOUND',
          userId,
        });
        throw new NotFoundException(
          'One or more products not found or access denied.',
        );
      }

      for (const p of products) {
        if (p.productType === ProductType.SERVICE || !p.isInventoryTracked) {
          this.log.warn(LOG_ACTIONS.CREATE_STOCK_ISSUE, {
            status: LOG_STATUS.FAILED,
            reason: 'PRODUCT_NOT_TRACKED_OR_SERVICE',
            userId,
            productName: p.productName,
          });
          throw new BadRequestException(
            `Product ${p.productName} is a service or is not inventory tracked.`,
          );
        }
      }

      await client.user.update({
        where: { id: userId },
        data: {},
      });

      // sort để chống deadlock
      products.sort((a, b) => a.id - b.id);

      const transactionDate = new Date(createDto.issueDate);
      const mm = (transactionDate.getMonth() + 1).toString().padStart(2, '0');
      const yy = transactionDate.getFullYear().toString().slice(-2);
      const mmyy = `${mm}${yy}`;
      const prefix = 'PXK';

      const lastIssue = await client.stockIssue.findFirst({
        where: {
          period: { userId },
          issueCode: { startsWith: `${prefix}-${mmyy}-` },
        },
        orderBy: { id: 'desc' },
        select: { issueCode: true },
      });

      const lastCode = lastIssue?.issueCode;
      const issueCode = generateMonthlySequenceCode(
        prefix,
        transactionDate,
        lastCode,
      );

      const issue = await client.stockIssue.create({
        data: {
          issueCode,
          issueDate: transactionDate,
          issueType: createDto.issueType,
          sourceDocumentType: createDto.sourceDocumentType || null,
          sourceDocumentId: createDto.sourceDocumentId || null,
          status: StockIssueStatus.APPROVED,
          periodId: period.id,
        },
      });

      for (const productEntity of products) {
        const quantity = qtyDetailMap.get(productEntity.publicId) ?? 0;
        const itemQty = new Decimal(quantity);
        const provUnitCost = productEntity.openingStockUnitCost;
        const itemTotal = itemQty.mul(provUnitCost);

        // Create StockIssueDetail
        await client.stockIssueDetail.create({
          data: {
            issueId: issue.id,
            productId: productEntity.id,
            quantity: itemQty,
            provisionalUnitCost: provUnitCost,
            finalWeightedUnitCost: null,
            finalCogsValue: null,
            cogsPostedToS2c: 'PENDING',
          },
        });

        // Determine inventory movement type based on issueType
        let movementType: InventoryMovementType;
        if (createDto.issueType === StockIssueType.SALE) {
          movementType = InventoryMovementType.SALE_OUT;
        } else if (createDto.issueType === StockIssueType.PRODUCTION) {
          movementType = InventoryMovementType.PRODUCTION_OUT;
        } else {
          movementType = InventoryMovementType.ADJUSTMENT_DECREASE;
        }

        // Map StockIssueDocument to SourceDocumentType for inventory movements
        let sourceDocType: SourceDocumentType | undefined;
        if (createDto.sourceDocumentType === 'INVOICE') {
          sourceDocType = SourceDocumentType.OUTBOUND_INVOICE;
        } else if (createDto.sourceDocumentType === 'PRODUCTION_ORDER') {
          sourceDocType = SourceDocumentType.PRODUCTION_ORDER;
        }

        // Create InventoryMovement via injected service
        await this.inventoryMovementsService.createInventoryMovement(
          {
            productId: productEntity.id,
            periodId: period.id,
            movementType,
            quantity: Math.round(quantity),
            unitCost: provUnitCost,
            totalValue: itemTotal,
            movementDate: transactionDate,
            sourceDocumentType: sourceDocType,
            sourceDocumentId: issue.id,
          },
          client,
        );

        // Update product stock using updateMany to prevent negative stock
        const qtyToSubtract = Math.round(quantity);
        const updateResult = await client.product.updateMany({
          where: {
            id: productEntity.id,
            productType: { not: ProductType.SERVICE },
            currentStock: { gte: qtyToSubtract },
          },
          data: {
            currentStock: { decrement: qtyToSubtract },
          },
        });

        if (updateResult.count === 0) {
          this.log.warn(LOG_ACTIONS.CREATE_STOCK_ISSUE, {
            status: LOG_STATUS.FAILED,
            reason: 'INSUFFICIENT_STOCK',
            userId,
            productId: productEntity.id,
            productName: productEntity.productName,
          });
          throw new BadRequestException(
            `Insufficient stock for product ${productEntity.productName}. Current stock is less than requested quantity ${qtyToSubtract}.`,
          );
        }
      }

      // Fetch the full issue with details and products for mapping DTO
      const finalIssue = await client.stockIssue.findUnique({
        where: { id: issue.id },
        include: {
          details: {
            include: {
              product: {
                select: { publicId: true, productName: true, skuCode: true },
              },
            },
          },
          period: { select: { periodName: true } },
        },
      });

      // Audit Log change
      await this.auditLog.logChange(
        client,
        userId,
        'CREATE',
        tableWrite.stockIssues,
        issue.id,
        null,
        finalIssue,
      );

      this.log.log(LOG_ACTIONS.CREATE_STOCK_ISSUE, {
        status: LOG_STATUS.SUCCESS,
        userId,
        issueId: issue.id,
        issueCode: issue.issueCode,
      });

      return mapToDto(StockIssueResponseDto, finalIssue);
    };

    if (tx !== (this.prisma as unknown as Prisma.TransactionClient)) {
      return run(tx);
    }
    return this.prisma.$transaction(run);
  }

  async cancelIssue(
    userId: string,
    periodId: number,
    issueCode: string,
    isSystemAction = false, // nếu hủy từ hóa đơn sẽ để là true
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<StockIssueResponseDto> {
    const run = async (client: Prisma.TransactionClient) => {
      const current = await client.stockIssue.findFirst({
        where: {
          issueCode,
          period: {
            userId,
          },
        },
        include: { details: true },
      });

      if (!current) {
        this.log.warn(LOG_ACTIONS.CANCEL_STOCK_ISSUE, {
          status: LOG_STATUS.FAILED,
          userId,
          reason: 'ISSUE_NOT_FOUND',
          issueCode,
        });
        throw new NotFoundException('The stock issue does not exist.');
      }

      if (!isSystemAction) {
        if (current.issueType === StockIssueType.SALE) {
          this.log.warn(LOG_ACTIONS.CANCEL_STOCK_ISSUE, {
            status: LOG_STATUS.FAILED,
            userId,
            reason: 'SALE_ISSUE_CANNOT_BE_CANCELLED',
            issueCode,
          });
          throw new BadRequestException(
            'Cannot cancel stock issues of type SALE.',
          );
        }

        if (current.sourceDocumentType === 'INVOICE') {
          this.log.warn(LOG_ACTIONS.CANCEL_STOCK_ISSUE, {
            status: LOG_STATUS.FAILED,
            userId,
            reason: 'INVOICE_SOURCE_ISSUE_CANNOT_BE_CANCELLED_DIRECTLY',
            issueCode,
          });
          throw new BadRequestException(
            'Cannot cancel stock issues originating from invoices directly.',
          );
        }
      }

      const updateIssue = await client.stockIssue.updateMany({
        where: {
          issueCode,
          periodId,
          status: { not: StockIssueStatus.CANCELLED },
        },
        data: {
          status: StockIssueStatus.CANCELLED,
        },
      });

      if (updateIssue.count === 0) {
        this.log.warn(LOG_ACTIONS.CANCEL_STOCK_ISSUE, {
          status: LOG_STATUS.FAILED,
          userId,
          reason: 'ISSUE_CANCELED',
          issueCode,
        });
        throw new BadRequestException('The stock issue has been canceled.');
      }

      const items = current.details;
      const transactionDate = moment().toDate();

      for (const item of items) {
        const provisionalUnitCost = item.provisionalUnitCost || new Decimal(0);
        const itemTotal = item.quantity.mul(provisionalUnitCost);

        // Update product stock levels by incrementing
        const updateProduct = await client.product.updateMany({
          where: {
            id: item.productId,
            userId,
          },
          data: {
            currentStock: { increment: Number(item.quantity) },
          },
        });

        if (updateProduct.count === 0) {
          this.log.warn(LOG_ACTIONS.CANCEL_STOCK_ISSUE, {
            status: LOG_STATUS.FAILED,
            reason: 'PRODUCT_NOT_FOUND',
            userId,
            productId: item.productId,
          });
          throw new BadRequestException(
            `Product not found for cancel stock issue code: ${issueCode}.`,
          );
        }

        let srcType: SourceDocumentType | undefined;
        if (current.issueType === 'SALE') {
          srcType = SourceDocumentType.OUTBOUND_INVOICE;
        } else if (current.issueType === 'PRODUCTION') {
          srcType = SourceDocumentType.PRODUCTION_ORDER;
        }

        const movementType = InventoryMovementType.ADJUSTMENT_INCREASE;
        await this.inventoryMovementsService.createInventoryMovement(
          {
            productId: item.productId,
            periodId,
            movementType,
            quantity: Number(item.quantity),
            unitCost: provisionalUnitCost,
            totalValue: itemTotal,
            movementDate: transactionDate,
            sourceDocumentType: srcType,
            sourceDocumentId: current.id,
          },
          client,
        );
      }

      await this.auditLog.logChange(
        client,
        userId,
        'UPDATE',
        tableWrite.stockIssues,
        current.id,
        { status: current.status },
        { status: StockIssueStatus.CANCELLED },
      );

      this.log.log(LOG_ACTIONS.CANCEL_STOCK_ISSUE, {
        userId,
        issueCode,
        status: LOG_STATUS.SUCCESS,
      });

      const resIssue = await client.stockIssue.findUnique({
        where: { id: current.id },
        include: {
          period: {
            select: { periodName: true },
          },
          details: {
            include: {
              product: {
                select: { publicId: true, productName: true, skuCode: true },
              },
            },
          },
        },
      });

      return mapToDto(StockIssueResponseDto, resIssue);
    };

    if (tx !== this.prisma) return run(tx);
    return this.prisma.$transaction(run);
  }
}
