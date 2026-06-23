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
import { StockSummaryResponseDto } from './dto/stock-summary-response.dto';
import { StockReceiptListItemResponseDto } from './dto/stock-receipt-list-item-response.dto';
import { StockIssueListItemResponseDto } from './dto/stock-issue-list-item-response.dto';
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
import { VouchersService } from '../vouchers/vouchers.service';
import { InboundResponseDto } from '../inbound-invoices/dto/response-inbound-invoice.dto';

@Injectable()
export class StocksService {
  private readonly log = new AppLogger(StocksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly inventoryMovementsService: InventoryMovementsService,
    private readonly voucherService: VouchersService,
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

      const transactionDate = moment(createDto.receiptDate).toDate();
      const mm = (transactionDate.getMonth() + 1).toString().padStart(2, '0');
      const yy = transactionDate.getFullYear().toString().slice(-2);
      const mmyy = `${mm}${yy}`;
      const prefix = 'PNK';

      // Get last receipt of user in month to generate sequence
      const lastReceipt = await client.stockReceipt.findFirst({
        where: {
          userId,
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
          userId,
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
        } else if (createDto.sourceType === StockReceiptSourceType.OPENING) {
          movementType = InventoryMovementType.OPENING;
        } else {
          movementType = InventoryMovementType.ADJUST_IN;
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
          userId,
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
      // Hủy các phiếu chi liên quan
      await this.voucherService.bulkCancelByStockReceipt(
        client,
        userId,
        current.id,
      );
      const updateReceipt = await client.stockReceipt.updateMany({
        where: {
          receiptCode,
          userId,
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

        const movementType = InventoryMovementType.ADJUST_OUT;
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

      const transactionDate = moment(createDto.issueDate).toDate();
      const mm = (transactionDate.getMonth() + 1).toString().padStart(2, '0');
      const yy = transactionDate.getFullYear().toString().slice(-2);
      const mmyy = `${mm}${yy}`;
      const prefix = 'PXK';

      const lastIssue = await client.stockIssue.findFirst({
        where: {
          userId,
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
          userId,
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
        const itemCost = new Decimal(0);
        const itemTotal = itemQty.mul(itemCost);

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
          movementType = InventoryMovementType.ADJUST_OUT;
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
            unitCost: itemCost,
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

      // Calculate and update cumulative revenue in RevenueTracker
      if (createDto.issueType === StockIssueType.SALE) {
        let totalRevenue = new Decimal(0);
        for (const productEntity of products) {
          const quantity = qtyDetailMap.get(productEntity.publicId) ?? 0;
          const sellingPrice = new Decimal(productEntity.sellingPrice);
          totalRevenue = totalRevenue.add(sellingPrice.mul(quantity));
        }

        const year = transactionDate.getFullYear();
        await client.revenueTracker.upsert({
          where: {
            userId_year: { userId, year },
          },
          update: {
            revenueYtd: { increment: totalRevenue },
          },
          create: {
            userId,
            year,
            revenueYtd: totalRevenue,
          },
        });
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
          userId,
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
          userId,
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

        const movementType = InventoryMovementType.ADJUST_IN;
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

      // Decrement cumulative revenue in RevenueTracker for SALE issue type
      if (current.issueType === StockIssueType.SALE) {
        const productIds = current.details.map((d) => d.productId);
        const products = await client.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, sellingPrice: true },
        });
        const productPriceMap = new Map<number, Decimal>();
        for (const p of products) {
          productPriceMap.set(p.id, new Decimal(p.sellingPrice));
        }

        let totalRevenue = new Decimal(0);
        for (const detail of current.details) {
          const sellingPrice = productPriceMap.get(detail.productId) ?? new Decimal(0);
          totalRevenue = totalRevenue.add(sellingPrice.mul(detail.quantity));
        }

        const year = current.issueDate.getFullYear();
        await client.revenueTracker.updateMany({
          where: {
            userId,
            year,
            revenueYtd: { gte: totalRevenue },
          },
          data: {
            revenueYtd: { decrement: totalRevenue },
          },
        });
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

  async getSummary(userId: string) {
    const LOW_STOCK_THRESHOLD = 15;

    // Find the currently applied financial period (OPEN first, otherwise latest)
    let currentPeriod = await this.prisma.financialPeriod.findFirst({
      where: { userId, status: 'OPEN' },
      orderBy: { startDate: 'desc' },
    });

    if (!currentPeriod) {
      currentPeriod = await this.prisma.financialPeriod.findFirst({
        where: { userId },
        orderBy: { startDate: 'desc' },
      });
    }

    if (!currentPeriod) {
      return mapToDto(StockSummaryResponseDto, {
        endingInventoryValue: 0,
        trackedItemsCount: 0,
        lowStockItemsCount: 0,
      });
    }

    const [totalTrackedProducts, lowStockProducts, sqlResult] =
      await Promise.all([
        this.prisma.product.count({
          where: { userId, isInventoryTracked: true },
        }),
        this.prisma.product.count({
          where: {
            userId,
            isInventoryTracked: true,
            productType: { not: 'SERVICE' },
            currentStock: { lt: LOW_STOCK_THRESHOLD },
          },
        }),
        this.prisma.$queryRaw<[{ ending_inventory_value: number | null }]>`
          SELECT 
            SUM(
              CASE 
                WHEN im.movement_type IN ('OPENING', 'PURCHASE_IN', 'PRODUCTION_IN', 'ADJUST_IN') THEN im.total_value 
                ELSE -im.total_value 
              END
            ) as ending_inventory_value
          FROM inventory_movements im
          JOIN products p ON im.product_id = p.id
          WHERE p.user_id = ${userId} AND p.product_type != 'SERVICE' AND im.period_id = ${currentPeriod.id}
        `,
      ]);

    const endingInventoryValue = Number(sqlResult[0]?.ending_inventory_value || 0);

    const summaryData = {
      endingInventoryValue: endingInventoryValue,
      trackedItemsCount: totalTrackedProducts,
      lowStockItemsCount: lowStockProducts,
    };

    return mapToDto(StockSummaryResponseDto, summaryData);
  }

  async calculatePeriodInventorySummary(
    userId: string,
    periodId: number,
  ): Promise<{
    openingValue: number;
    importedValue: number;
    exportedValue: number;
    closingValue: number;
  }> {
    const [openingDetails, importedDetails, exportedResult] = await Promise.all(
      [
        this.prisma.stockReceiptDetail.aggregate({
          where: {
            receipt: {
              periodId,
              userId,
              status: 'APPROVED',
              sourceType: 'OPENING',
            },
            product: {
              productType: { not: 'SERVICE' },
            },
          },
          _sum: {
            totalValue: true,
          },
        }),
        this.prisma.stockReceiptDetail.aggregate({
          where: {
            receipt: {
              periodId,
              userId,
              status: 'APPROVED',
              sourceType: { not: 'OPENING' },
            },
            product: {
              productType: { not: 'SERVICE' },
            },
          },
          _sum: {
            totalValue: true,
          },
        }),
        this.prisma.$queryRaw<{ exportedValue: number | null }[]>`
          SELECT COALESCE(
            SUM(
              sd.quantity * COALESCE(sd.final_weighted_unit_cost, sd.provisional_unit_cost, 0)
            ), 0
          )::double precision as "exportedValue"
          FROM stock_issue_details sd
          JOIN stock_issues s ON sd.issue_id = s.id
          JOIN products p ON sd.product_id = p.id
          WHERE s.period_id = ${periodId}
            AND s.user_id = ${userId}
            AND s.status = 'APPROVED'
            AND p.product_type != 'SERVICE'
        `,
      ],
    );

    const openingValue = openingDetails._sum.totalValue?.toNumber() ?? 0;
    const importedValue = importedDetails._sum.totalValue?.toNumber() ?? 0;
    const exportedValue = exportedResult[0]?.exportedValue ?? 0;

    const closingValue = openingValue + importedValue - exportedValue;

    return {
      openingValue,
      importedValue,
      exportedValue,
      closingValue,
    };
  }

  async getProductPeriodInventorySummary(
    userId: string,
    periodId: number,
    productId: number,
  ): Promise<{
    stockStartPeriod: number;
    valueStartPeriod: number;
    receiptQuantity: number;
    receiptValue: number;
    issueQuantity: number;
    issueValue: number;
    stockToEndPeriod: number;
    valueToEndPeriod: number;
  }> {
    const [openingResult, receiptResult, issueResult] = await Promise.all([
      this.prisma.stockReceiptDetail.aggregate({
        where: {
          productId,
          receipt: {
            periodId,
            userId,
            status: 'APPROVED',
            sourceType: 'OPENING',
          },
        },
        _sum: {
          quantity: true,
          totalValue: true,
        },
      }),
      this.prisma.stockReceiptDetail.aggregate({
        where: {
          productId,
          receipt: {
            periodId,
            userId,
            status: 'APPROVED',
            sourceType: { not: 'OPENING' },
          },
        },
        _sum: {
          quantity: true,
          totalValue: true,
        },
      }),
      this.prisma.$queryRaw<
        { issueQuantity: number | null; issueValue: number | null }[]
      >`
        SELECT 
          COALESCE(SUM(sid.quantity), 0)::double precision as "issueQuantity",
          COALESCE(SUM(sid.quantity * COALESCE(sid.final_weighted_unit_cost, sid.provisional_unit_cost, 0)), 0)::double precision as "issueValue"
        FROM stock_issue_details sid
        JOIN stock_issues si ON sid.issue_id = si.id
        WHERE si.period_id = ${periodId}
          AND si.user_id = ${userId}
          AND sid.product_id = ${productId}
          AND si.status = 'APPROVED'
      `,
    ]);

    const stockStartPeriod = openingResult._sum.quantity?.toNumber() ?? 0;
    const valueStartPeriod = openingResult._sum.totalValue?.toNumber() ?? 0;
    const receiptQuantity = receiptResult._sum.quantity?.toNumber() ?? 0;
    const receiptValue = receiptResult._sum.totalValue?.toNumber() ?? 0;

    const issueQuantity = issueResult[0]?.issueQuantity ?? 0;
    const issueValue = issueResult[0]?.issueValue ?? 0;

    const stockToEndPeriod = stockStartPeriod + receiptQuantity - issueQuantity;
    const valueToEndPeriod = valueStartPeriod + receiptValue - issueValue;

    return {
      stockStartPeriod,
      valueStartPeriod,
      receiptQuantity,
      receiptValue,
      issueQuantity,
      issueValue,
      stockToEndPeriod,
      valueToEndPeriod,
    };
  }

  async findAllReceipts(
    userId: string,
    page: number = 1,
    limit: number = 20,
    sourceType?: string,
  ) {
    const skip = (page - 1) * limit;

    const where: Prisma.StockReceiptWhereInput = {
      userId,
    };

    if (sourceType) {
      const upperSourceType = sourceType.trim().toUpperCase();
      if (['PURCHASE', 'PRODUCTION', 'ADJUSTMENT'].includes(upperSourceType)) {
        where.sourceType = upperSourceType as StockReceiptSourceType;
      }
    }

    const [total, receipts] = await Promise.all([
      this.prisma.stockReceipt.count({ where }),
      this.prisma.stockReceipt.findMany({
        where,
        take: limit,
        skip,
        orderBy: { createdAt: 'desc' },
        include: {
          vouchers: {
            where: { status: 'ACTIVE' },
            select: { paymentMethod: true },
          },
        },
      }),
    ]);

    return {
      data: mapToDto(StockReceiptListItemResponseDto, receipts),
      meta: {
        total,
        page,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  async findAllIssues(
    userId: string,
    page: number = 1,
    limit: number = 20,
    sourceType?: string,
  ) {
    const skip = (page - 1) * limit;

    const where: Prisma.StockIssueWhereInput = {
      userId,
    };

    if (sourceType) {
      const upperSourceType = sourceType.trim().toUpperCase();
      if (['INVOICE', 'PRODUCTION_ORDER'].includes(upperSourceType)) {
        where.sourceDocumentType = upperSourceType as StockIssueDocument;
      } else if (['SALE', 'PRODUCTION', 'ADJUSTMENT'].includes(upperSourceType)) {
        where.issueType = upperSourceType as StockIssueType;
      }
    }

    const [total, issues] = await Promise.all([
      this.prisma.stockIssue.count({ where }),
      this.prisma.stockIssue.findMany({
        where,
        take: limit,
        skip,
        orderBy: { createdAt: 'desc' },
        include: {
          details: {
            select: {
              quantity: true,
              provisionalUnitCost: true,
              finalWeightedUnitCost: true,
            },
          },
        },
      }),
    ]);

    // Fetch related invoice symbols
    const invoiceIds = issues
      .filter((i) => i.sourceDocumentType === 'INVOICE' && i.sourceDocumentId !== null)
      .map((i) => i.sourceDocumentId as number);

    const invoices =
      invoiceIds.length > 0
        ? await this.prisma.invoice.findMany({
          where: { id: { in: invoiceIds } },
          select: { id: true, invoiceSymbol: true },
        })
        : [];
    const invoiceMap = new Map(
      invoices.map((inv) => [inv.id, inv.invoiceSymbol]),
    );

    // Fetch related internal production orders
    const orderIds = issues
      .filter(
        (i) =>
          i.sourceDocumentType === 'PRODUCTION_ORDER' &&
          i.sourceDocumentId !== null,
      )
      .map((i) => i.sourceDocumentId as number);

    const productionOrders =
      orderIds.length > 0
        ? await this.prisma.internalProductionOrder.findMany({
            where: { id: { in: orderIds } },
            select: { id: true, orderCode: true },
          })
        : [];
    const orderMap = new Map(
      productionOrders.map((ord) => [ord.id, ord.orderCode]),
    );

    const mappedRaw = issues.map((i) => {
      let description = 'Phiếu xuất kho khác';
      let sourceDocumentCode = '';

      if (i.sourceDocumentType === 'INVOICE' && i.sourceDocumentId) {
        const symbol = invoiceMap.get(i.sourceDocumentId) || '';
        description = `Phiếu xuất kho cho hóa đơn${symbol ? ` ${symbol}` : ''}`;
        sourceDocumentCode = symbol;
      } else if (
        i.sourceDocumentType === 'PRODUCTION_ORDER' &&
        i.sourceDocumentId
      ) {
        const code = orderMap.get(i.sourceDocumentId) || '';
        description = `Phiếu xuất kho cho lệnh sản xuất${code ? ` ${code}` : ''}`;
        sourceDocumentCode = code;
      } else if (i.issueType === 'SALE') {
        description = 'Phiếu xuất kho bán hàng';
      } else if (i.issueType === 'PRODUCTION') {
        description = 'Phiếu xuất kho sản xuất';
      } else if (i.issueType === 'ADJUSTMENT') {
        description = 'Phiếu xuất kho hiệu chỉnh';
      }

      const totalValue = i.details.reduce((sum, d) => {
        const qty = Number(d.quantity || 0);
        const cost = Number(d.finalWeightedUnitCost ?? d.provisionalUnitCost ?? 0);
        return sum + qty * cost;
      }, 0);

      const isAutomatic = i.sourceDocumentType !== null;

      return {
        ...i,
        description,
        totalValue,
        isAutomatic,
        sourceDocumentCode,
      };
    });

    return {
      data: mapToDto(StockIssueListItemResponseDto, mappedRaw),
      meta: {
        total,
        page,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  async linkInvoice(
    userId: string,
    receiptCode: string,
    invoicePublicId: string,
  ) {
    return await this.prisma.$transaction(async (tx) => {
      // 1. Kiểm tra StockReceipt tồn tại và thuộc user
      const receipt = await tx.stockReceipt.findFirst({
        where: { receiptCode, userId },
        include: { period: true, details: true },
      });
      if (!receipt) {
        throw new NotFoundException(
          'Stock receipt not found or access denied.',
        );
      }

      // 2. Kiểm tra InboundInvoice tồn tại và thuộc user
      const invoice = await tx.inboundInvoice.findUnique({
        where: { publicId: invoicePublicId, userId },
        include: { details: true },
      });
      if (!invoice) {
        throw new NotFoundException(
          'Inbound invoice not found or access denied.',
        );
      }

      // 3. Kiểm tra xem đã liên kết chưa
      const existingLink = await tx.stockReceiptInvoice.findUnique({
        where: {
          receiptId_invoiceId: {
            receiptId: receipt.id,
            invoiceId: invoice.id,
          },
        },
      });
      if (existingLink) {
        throw new BadRequestException(
          'This stock receipt and invoice are already linked.',
        );
      }

      // 4. Tạo liên kết
      const link = await tx.stockReceiptInvoice.create({
        data: {
          receiptId: receipt.id,
          invoiceId: invoice.id,
        },
      });

      // điều chỉnh Giá trị
      const invoiceDetailsMap = new Map<number, { unitCost: Decimal }>();
      for (const d of invoice.details) {
        invoiceDetailsMap.set(d.productId, {
          unitCost: new Decimal(d.unitCost),
        });
      }

      let isAdjusted = false;

      for (const recDetail of receipt.details) {
        const invDetail = invoiceDetailsMap.get(recDetail.productId);
        if (invDetail) {
          // Compare unit cost (we don't change quantity as requested by user)
          if (!new Decimal(recDetail.unitCost).equals(invDetail.unitCost)) {
            const newTotalValue = new Decimal(recDetail.quantity).mul(
              invDetail.unitCost,
            );

            // Cập nhật StockReceiptDetail
            await tx.stockReceiptDetail.update({
              where: { id: recDetail.id },
              data: {
                unitCost: invDetail.unitCost,
                totalValue: newTotalValue,
              },
            });
            isAdjusted = true;

            // Cập nhật InventoryMovement tương ứng
            await tx.inventoryMovement.updateMany({
              where: {
                sourceDocumentId: receipt.id,
                productId: recDetail.productId,
                movementType: { in: ['PURCHASE_IN', 'OPENING', 'ADJUST_IN', 'PRODUCTION_IN'] }
              },
              data: {
                unitCost: invDetail.unitCost,
                totalValue: newTotalValue,
              },
            });
          }
        }
      }

      // Cập nhật lại tổng tiền phiếu nhập kho nếu có điều chỉnh
      if (isAdjusted) {
        const updatedDetails = await tx.stockReceiptDetail.findMany({
          where: { receiptId: receipt.id },
        });
        const newReceiptTotal = updatedDetails.reduce(
          (acc, curr) => acc.add(new Decimal(curr.totalValue)),
          new Decimal(0),
        );
        await tx.stockReceipt.update({
          where: { id: receipt.id },
          data: { totalValue: newReceiptTotal },
        });
      }

      return {
        message:
          'Linked stock receipt to invoice successfully' +
          (isAdjusted ? ' and adjusted inventory values.' : '.'),
        data: link,
      };
    });
  }

  async unlinkInvoice(userId: string, receiptCode: string, invoicePublicId: string) {
    return await this.prisma.$transaction(async (tx) => {
      // 1. Kiểm tra StockReceipt tồn tại và thuộc user
      const receipt = await tx.stockReceipt.findFirst({
        where: { receiptCode, userId },
        include: { period: true },
      });
      if (!receipt) {
        throw new NotFoundException(
          'Stock receipt not found or access denied.',
        );
      }

      // 2. Kiểm tra InboundInvoice tồn tại và thuộc user
      const invoice = await tx.inboundInvoice.findUnique({
        where: { publicId: invoicePublicId },
      });
      if (!invoice || invoice.userId !== userId) {
        throw new NotFoundException(
          'Inbound invoice not found or access denied.',
        );
      }

      // 3. Kiểm tra liên kết tồn tại
      const link = await tx.stockReceiptInvoice.findUnique({
        where: {
          receiptId_invoiceId: {
            receiptId: receipt.id,
            invoiceId: invoice.id,
          },
        },
      });
      if (!link) {
        throw new NotFoundException('Link not found.');
      }

      // 4. Xóa liên kết
      await tx.stockReceiptInvoice.delete({
        where: {
          receiptId_invoiceId: {
            receiptId: receipt.id,
            invoiceId: invoice.id,
          },
        },
      });

      return {
        message: 'Unlinked stock receipt from invoice successfully.',
      };
    });
  }

  async getLinkedInvoices(userId: string, receiptCode: string) {
    // 1. Kiểm tra StockReceipt tồn tại và thuộc user
    const receipt = await this.prisma.stockReceipt.findFirst({
      where: { receiptCode, userId },
      include: { period: true },
    });
    if (!receipt) {
      throw new NotFoundException('Stock receipt not found or access denied.');
    }

    // 2. Lấy danh sách hóa đơn liên kết
    const links = await this.prisma.stockReceiptInvoice.findMany({
      where: { receiptId: receipt.id },
      include: {
        invoice: {
          include: {
            details: {
              include: {
                product: {
                  select: { publicId: true },
                },
              },
            },
          },
        },
      },
    });

    return mapToDto(
      InboundResponseDto,
      links.map((l) => l.invoice),
    );
  }

  async reconcileReceipt(userId: string, receiptCode: string) {
    const receipt = await this.prisma.stockReceipt.findUnique({
      where: {
        userId_receiptCode: {
          userId,
          receiptCode,
        },
      },
      include: {
        details: {
          include: {
            product: {
              select: { publicId: true, productName: true, skuCode: true },
            },
          },
        },
        period: { select: { userId: true, periodName: true } },
      },
    });

    if (!receipt) {
      throw new NotFoundException('Stock receipt not found or access denied.');
    }

    const link = await this.prisma.stockReceiptInvoice.findFirst({
      where: { receiptId: receipt.id },
      include: {
        invoice: {
          include: {
            details: {
              include: {
                product: {
                  select: { publicId: true, productName: true, skuCode: true },
                },
              },
            },
          },
        },
      },
    });

    const invoice = link?.invoice || null;
    const warnings: any[] = [];
    let status = 'SUCCESS';

    if (invoice) {
      const invoiceTotal = Number(invoice.totalAmount);
      const receiptTotal = Number(receipt.totalValue);
      if (Math.abs(invoiceTotal - receiptTotal) > 0.01) {
        warnings.push({
          code: 'TOTAL_AMOUNT_MISMATCH',
          severity: 'WARNING',
          message: 'Receipt total differs from linked invoice total.',
        });
      }

      const invoiceDetailsMap = new Map<
        number,
        { quantity: number; unitCost: number }
      >();
      for (const d of invoice.details) {
        invoiceDetailsMap.set(d.productId, {
          quantity: d.quantity,
          unitCost: Number(d.unitCost),
        });
      }

      const receiptDetailsMap = new Map<
        number,
        { quantity: number; unitCost: number }
      >();
      for (const d of receipt.details) {
        receiptDetailsMap.set(d.productId, {
          quantity: Number(d.quantity),
          unitCost: Number(d.unitCost),
        });
      }

      for (const [productId, invDetail] of invoiceDetailsMap.entries()) {
        if (!receiptDetailsMap.has(productId)) {
          warnings.push({
            code: 'PRODUCT_MISSING',
            severity: 'WARNING',
            message: 'Invoice product does not exist in receipt.',
          });
          continue;
        }

        const recDetail = receiptDetailsMap.get(productId)!;

        if (Math.abs(invDetail.quantity - recDetail.quantity) > 0.001) {
          warnings.push({
            code: 'QUANTITY_MISMATCH',
            severity: 'WARNING',
            message: 'Receipt quantity differs from invoice quantity.',
          });
        }

        const costDiff = Math.abs(invDetail.unitCost - recDetail.unitCost);
        if (costDiff > 100) {
          warnings.push({
            code: 'UNIT_COST_MISMATCH',
            severity: 'WARNING',
            message: 'Receipt unit cost differs from invoice unit cost.',
          });
        } else if (costDiff > 0.01) {
          warnings.push({
            code: 'UNIT_COST_MISMATCH',
            severity: 'INFO',
            message: 'Receipt unit cost differs from invoice unit cost.',
          });
        }
      }

      const hasWarning = warnings.some((w) => w.severity === 'WARNING');
      const hasInfo = warnings.some((w) => w.severity === 'INFO');
      if (hasWarning) {
        status = 'WARNING';
      } else if (hasInfo) {
        status = 'INFO';
      }
    }

    return {
      receipt: mapToDto(StockReceiptResponseDto, receipt),
      invoice: invoice ? mapToDto(InboundResponseDto, invoice) : null,
      validation: {
        status,
        warnings,
      },
    };
  }
}
