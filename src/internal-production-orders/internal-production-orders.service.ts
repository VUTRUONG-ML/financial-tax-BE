import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import {
  AuditLogService,
  tableWrite,
} from '../core/audit-log/audit-log.service';
import { AppLogger } from '../common/logger/app-logger.service';
import { CreateProductionOrderDto } from './dto/create-production-order.dto';
import { UpdateProductionOrderDto } from './dto/update-production-order.dto';
import { GetProductionOrdersQueryDto } from './dto/get-production-orders-query.dto';
import { generateMonthlySequenceCode } from '../common/utils/code-generator.util';
import {
  LOG_ACTIONS,
  LOG_STATUS,
} from '../common/constants/log-events.constant';
import {
  ProductionStatus,
  ProductType,
  ProductionTransactionType,
  Prisma,
  StockIssueType,
  StockIssueDocument,
  StockReceiptSourceType,
  StockIssueStatus,
  StockReceiptStatus,
} from '@prisma/client';
import { mapToDto } from 'src/common/utils/mapper.util';
import { ProductionOrderResponseDto } from './dto/response-production.dto';
import { StocksService } from '../stocks/stocks.service';

@Injectable()
export class InternalProductionOrdersService {
  private readonly log = new AppLogger(InternalProductionOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly stocksService: StocksService,
  ) { }

  async create(
    userId: string,
    createDto: CreateProductionOrderDto,
    periodId: number,
  ) {
    const materialPublicIds = createDto.materials.map((m) => m.productPublicId);
    const productPublicIds = createDto.products.map((p) => p.productPublicId);
    const allPublicIds = Array.from(
      new Set([...materialPublicIds, ...productPublicIds]),
    );

    const products = await this.prisma.product.findMany({
      where: { publicId: { in: allPublicIds } },
    });

    const productsMap = new Map(products.map((p) => [p.publicId, p]));

    if (products.length !== allPublicIds.length) {
      throw new NotFoundException('One or more products not found.');
    }

    // Validation
    for (const mat of createDto.materials) {
      const product = productsMap.get(mat.productPublicId)!;
      if (product.userId !== userId) {
        throw new ForbiddenException(
          `You do not have access to product: ${product.productName}`,
        );
      }
      if (product.productType === ProductType.SERVICE) {
        throw new BadRequestException(
          `Product ${product.productName} is a SERVICE and cannot be used as raw material.`,
        );
      }
      if (product.currentStock < mat.quantity) {
        throw new BadRequestException(
          `Insufficient stock for product: ${product.productName}. Current stock is ${product.currentStock}.`,
        );
      }
    }

    for (const prod of createDto.products) {
      const product = productsMap.get(prod.productPublicId)!;
      if (product.userId !== userId) {
        throw new ForbiddenException(
          `You do not have access to product: ${product.productName}`,
        );
      }
      if (product.productType === ProductType.SERVICE) {
        throw new BadRequestException(
          `Product ${product.productName} is a SERVICE and cannot be produced.`,
        );
      }
    }

    // Map input to details array to keep the rest of the costing calculation logic unchanged
    const details = [
      ...createDto.materials.map((m) => ({
        productPublicId: m.productPublicId,
        transactionType: ProductionTransactionType.ISSUE_MATERIAL,
        quantity: m.quantity,
      })),
      ...createDto.products.map((p) => ({
        productPublicId: p.productPublicId,
        transactionType: ProductionTransactionType.RECEIVE_PRODUCT,
        quantity: p.quantity,
      })),
    ];

    const result = await this.prisma.$transaction(
      async (tx) => {
        // Lock user row to prevent race conditions during sequence generation
        await tx.$executeRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;

        const transactionDate = new Date();
        const mm = (transactionDate.getMonth() + 1).toString().padStart(2, '0');
        const yy = transactionDate.getFullYear().toString().slice(-2);
        const mmyy = `${mm}${yy}`;
        const prefix = 'LSX';

        const lastOrder = await tx.internalProductionOrder.findFirst({
          where: { userId, orderCode: { startsWith: `${prefix}-${mmyy}-` } },
          select: { orderCode: true },
          orderBy: { id: 'desc' },
        });

        let lastCode: string | undefined;
        if (lastOrder) {
          lastCode = lastOrder.orderCode;
        }

        const orderCode = generateMonthlySequenceCode(
          prefix,
          transactionDate,
          lastCode,
        );

        // Create Order and Details
        const order = await tx.internalProductionOrder.create({
          data: {
            userId,
            orderCode,
            notes: createDto.notes,
            transactionAt: createDto.transactionAt
              ? new Date(createDto.transactionAt)
              : new Date(),
            details: {
              create: details.map((detail) => {
                const product = productsMap.get(detail.productPublicId)!;
                return {
                  productId: product.id,
                  transactionType: detail.transactionType,
                  quantity: detail.quantity,
                };
              }),
            },
          },
          include: {
            details: {
              include: {
                product: {
                  select: { publicId: true, skuCode: true, productName: true },
                },
              },
            },
          },
        });

        // Create StockIssue (xuất nguyên liệu) via StocksService
        const materials = createDto.materials;
        if (materials && materials.length > 0) {
          await this.stocksService.createStockIssue(
            userId,
            {
              issueType: StockIssueType.PRODUCTION,
              issueDate: order.transactionAt.toISOString(),
              sourceDocumentType: StockIssueDocument.PRODUCTION_ORDER,
              sourceDocumentId: order.id,
              products: materials.map((m) => ({
                productPublicId: m.productPublicId,
                quantity: m.quantity,
              })),
            },
            periodId,
            tx,
          );
        }

        // Create StockReceipt (nhập thành phẩm) via StocksService
        const producedGoods = createDto.products;
        if (producedGoods && producedGoods.length > 0) {
          await this.stocksService.createStockReceipt(
            userId,
            {
              sourceType: StockReceiptSourceType.PRODUCTION,
              receiptDate: order.transactionAt.toISOString(),
              sourceInvoiceNo: orderCode,
              products: producedGoods.map((p) => ({
                productPublicId: p.productPublicId,
                quantity: p.quantity,
                unitCost: 0,
              })),
            },
            periodId,
            tx,
          );
        }

        await this.auditLog.logChange(
          tx,
          userId,
          'CREATE',
          tableWrite.internal_production_orders,
          order.id,
          null,
          order,
        );

        return order;
      },
      {
        maxWait: 5000,
        timeout: 15000,
      },
    );

    this.log.log(LOG_ACTIONS.CREATE_PRODUCTION_ORDER, {
      status: LOG_STATUS.SUCCESS,
      userId,
      orderId: result.id,
      orderCode: result.orderCode,
    });
    productsMap.clear();
    return mapToDto(ProductionOrderResponseDto, result);
  }

  async cancel(userId: string, orderCode: string, periodId: number) {
    return await this.prisma.$transaction(async (tx) => {
      const current = await tx.internalProductionOrder.findUnique({
        where: { userId_orderCode: { userId, orderCode } },
        include: {
          details: {
            include: {
              product: true,
            },
          },
        },
      });
      if (!current) {
        this.log.warn(LOG_ACTIONS.CANCEL_PRODUCTION_ORDER, {
          status: LOG_STATUS.FAILED,
          reason: 'PRODUCT_ORDER_NOT_FOUND',
          userId,
          orderCode,
        });
        throw new NotFoundException('Product order not found.');
      }
      if (current.status === ProductionStatus.CANCELED) {
        this.log.warn(LOG_ACTIONS.CANCEL_PRODUCTION_ORDER, {
          status: LOG_STATUS.FAILED,
          reason: 'PRODUCT_ORDER_CANCELED',
          userId,
          orderCode,
        });
        throw new BadRequestException('Product order cancelled.');
      }

      // Find associated StockIssue and StockReceipt
      const stockIssue = await tx.stockIssue.findFirst({
        where: {
          sourceDocumentType: StockIssueDocument.PRODUCTION_ORDER,
          sourceDocumentId: current.id,
          status: { not: StockIssueStatus.CANCELLED },
        },
      });

      const stockReceipt = await tx.stockReceipt.findFirst({
        where: {
          sourceInvoiceNo: current.orderCode,
          sourceType: StockReceiptSourceType.PRODUCTION,
          status: { not: StockReceiptStatus.CANCELLED },
        },
      });

      if (stockReceipt) {
        await this.stocksService.cancelReceipt(
          userId,
          periodId,
          stockReceipt.receiptCode,
          tx,
        );
      }

      if (stockIssue) {
        await this.stocksService.cancelIssue(
          userId,
          periodId,
          stockIssue.issueCode,
          true, // system action
          tx,
        );
      }

      // Mark the production order as canceled
      const updatedOrder = await tx.internalProductionOrder.update({
        where: { id: current.id },
        data: { status: ProductionStatus.CANCELED },
        include: {
          details: {
            include: {
              product: {
                select: { publicId: true, skuCode: true, productName: true },
              },
            },
          },
        },
      });

      // Audit Log the change
      await this.auditLog.logChange(
        tx,
        userId,
        'UPDATE',
        tableWrite.internal_production_orders,
        current.id,
        current,
        updatedOrder,
      );

      return mapToDto(ProductionOrderResponseDto, updatedOrder);
    });
  }

  async findOne(userId: string, orderCode: string) {
    const order = await this.prisma.internalProductionOrder.findUnique({
      where: { userId_orderCode: { userId, orderCode } },
      include: {
        details: {
          include: {
            product: {
              select: { publicId: true, skuCode: true, productName: true },
            },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Product order not found.');
    }

    return mapToDto(ProductionOrderResponseDto, order);
  }

  async getSummary(userId: string) {
    const [totalOrders, completedOrders, canceledOrders] = await Promise.all([
      this.prisma.internalProductionOrder.count({
        where: { userId },
      }),
      this.prisma.internalProductionOrder.count({
        where: { userId, status: ProductionStatus.ACTIVE },
      }),
      this.prisma.internalProductionOrder.count({
        where: { userId, status: ProductionStatus.CANCELED },
      }),
    ]);

    return {
      totalOrders,
      completedOrders,
      canceledOrders,
    };
  }

  async update(
    userId: string,
    orderCode: string,
    updateDto: UpdateProductionOrderDto,
    periodId: number,
  ) {
    return await this.prisma.$transaction(
      async (tx) => {
        // Lock user row
        await tx.$executeRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;

        const existing = await tx.internalProductionOrder.findUnique({
          where: { userId_orderCode: { userId, orderCode } },
          include: {
            details: {
              include: {
                product: true,
              },
            },
          },
        });

        if (!existing) {
          throw new NotFoundException('Product order not found.');
        }

        if (existing.status === ProductionStatus.CANCELED) {
          throw new BadRequestException(
            'Cannot update a canceled production order.',
          );
        }

        const hasDetailsUpdate =
          updateDto.materials !== undefined || updateDto.products !== undefined;
        if (hasDetailsUpdate) {
          if (!updateDto.materials || !updateDto.products) {
            throw new BadRequestException(
              'Both materials and products arrays are required when updating production order details.',
            );
          }

          // Map the materials and products arrays to updateDetails array
          const updateDetails = [
            ...updateDto.materials.map((m) => ({
              productPublicId: m.productPublicId,
              transactionType: ProductionTransactionType.ISSUE_MATERIAL,
              quantity: m.quantity,
            })),
            ...updateDto.products.map((p) => ({
              productPublicId: p.productPublicId,
              transactionType: ProductionTransactionType.RECEIVE_PRODUCT,
              quantity: p.quantity,
            })),
          ];

          // 1. REVERT: Find and cancel old stock receipt and stock issue
          const stockIssue = await tx.stockIssue.findFirst({
            where: {
              sourceDocumentType: StockIssueDocument.PRODUCTION_ORDER,
              sourceDocumentId: existing.id,
              status: { not: StockIssueStatus.CANCELLED },
            },
          });

          const stockReceipt = await tx.stockReceipt.findFirst({
            where: {
              sourceInvoiceNo: existing.orderCode,
              sourceType: StockReceiptSourceType.PRODUCTION,
              status: { not: StockReceiptStatus.CANCELLED },
            },
          });

          if (stockReceipt) {
            await this.stocksService.cancelReceipt(
              userId,
              periodId,
              stockReceipt.receiptCode,
              tx,
            );
          }

          if (stockIssue) {
            await this.stocksService.cancelIssue(
              userId,
              periodId,
              stockIssue.issueCode,
              true, // system action
              tx,
            );
          }

          // 2. APPLY: Validate and apply new details
          const newProductPublicIds = updateDetails.map(
            (d) => d.productPublicId,
          );
          const newProducts = await tx.product.findMany({
            where: { publicId: { in: newProductPublicIds } },
          });
          const newProductsMap = new Map(
            newProducts.map((p) => [p.publicId, p]),
          );

          if (newProducts.length !== newProductPublicIds.length) {
            throw new NotFoundException(
              'One or more products in the new details not found.',
            );
          }

          // Check if user owns all new products and validate types
          for (const detail of updateDetails) {
            const product = newProductsMap.get(detail.productPublicId)!;

            if (product.userId !== userId) {
              throw new ForbiddenException(
                `You do not have access to product: ${product.productName}`,
              );
            }

            if (product.productType === ProductType.SERVICE) {
              throw new BadRequestException(
                `Product ${product.productName} is a SERVICE and cannot be used in a production order.`,
              );
            }
          }

          // Replace details: delete old, create new
          await tx.productionDetail.deleteMany({
            where: { orderId: existing.id },
          });

          await tx.productionDetail.createMany({
            data: updateDetails.map((detail) => {
              const product = newProductsMap.get(detail.productPublicId)!;
              return {
                orderId: existing.id,
                productId: product.id,
                transactionType: detail.transactionType,
                quantity: detail.quantity,
              };
            }),
          });

          // Create new StockIssue and StockReceipt via StocksService
          const transactionAt = updateDto.transactionAt
            ? new Date(updateDto.transactionAt)
            : existing.transactionAt;

          if (updateDto.materials.length > 0) {
            await this.stocksService.createStockIssue(
              userId,
              {
                issueType: StockIssueType.PRODUCTION,
                issueDate: transactionAt.toISOString(),
                sourceDocumentType: StockIssueDocument.PRODUCTION_ORDER,
                sourceDocumentId: existing.id,
                products: updateDto.materials.map((m) => ({
                  productPublicId: m.productPublicId,
                  quantity: m.quantity,
                })),
              },
              periodId,
              tx,
            );
          }

          if (updateDto.products.length > 0) {
            await this.stocksService.createStockReceipt(
              userId,
              {
                sourceType: StockReceiptSourceType.PRODUCTION,
                receiptDate: transactionAt.toISOString(),
                sourceInvoiceNo: existing.orderCode,
                products: updateDto.products.map((p) => ({
                  productPublicId: p.productPublicId,
                  quantity: p.quantity,
                  unitCost: 0,
                })),
              },
              periodId,
              tx,
            );
          }
        }

        // Update the order itself (notes, transactionAt)
        const updateOrderData: Prisma.InternalProductionOrderUpdateInput = {};
        if (updateDto.notes !== undefined) {
          updateOrderData.notes = updateDto.notes;
        }
        if (updateDto.transactionAt !== undefined) {
          updateOrderData.transactionAt = new Date(updateDto.transactionAt);
        }

        const updatedOrder = await tx.internalProductionOrder.update({
          where: { id: existing.id },
          data: updateOrderData,
          include: {
            details: {
              include: {
                product: {
                  select: { publicId: true, skuCode: true, productName: true },
                },
              },
            },
          },
        });

        // Audit Log the update
        await this.auditLog.logChange(
          tx,
          userId,
          'UPDATE',
          tableWrite.internal_production_orders,
          existing.id,
          existing,
          updatedOrder,
        );

        this.log.log(LOG_ACTIONS.UPDATE_PRODUCTION_ORDER, {
          status: LOG_STATUS.SUCCESS,
          userId,
          orderCode,
        });

        return updatedOrder;
      },
      {
        maxWait: 5000,
        timeout: 15000,
      },
    );
  }

  async findAll(userId: string, queryDto: GetProductionOrdersQueryDto) {
    const page = queryDto.page ?? 1;
    const limit = queryDto.limit ?? 20;
    const skip = (page - 1) * limit;

    const statusQuery = queryDto.status || queryDto.type;
    let statusFilter: ProductionStatus | undefined = undefined;

    if (statusQuery) {
      const upper = statusQuery.toUpperCase();
      if (
        upper === 'ACTIVE' ||
        upper === 'COMPLETED' ||
        upper === 'HOÀN TẤT' ||
        upper === 'HOAN TAT'
      ) {
        statusFilter = ProductionStatus.ACTIVE;
      } else if (
        upper === 'CANCELED' ||
        upper === 'CANCELLED' ||
        upper === 'ĐÃ HỦY' ||
        upper === 'DA HUY'
      ) {
        statusFilter = ProductionStatus.CANCELED;
      }
    }

    const where: Prisma.InternalProductionOrderWhereInput = {
      userId,
      ...(statusFilter && { status: statusFilter }),
    };

    const [total, data] = await Promise.all([
      this.prisma.internalProductionOrder.count({ where }),
      this.prisma.internalProductionOrder.findMany({
        where,
        take: limit,
        skip,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: {
          details: {
            include: {
              product: {
                select: { productName: true, publicId: true, skuCode: true },
              },
            },
          },
        },
      }),
    ]);

    return {
      data: mapToDto(ProductionOrderResponseDto, data),
      meta: {
        total,
        page,
        lastPage: Math.ceil(total / limit) || 1,
      },
    };
  }
}
