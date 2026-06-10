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
} from '@prisma/client';
import { mapToDto } from 'src/common/utils/mapper.util';
import { ProductionOrderResponseDto } from './dto/response-production.dto';

@Injectable()
export class InternalProductionOrdersService {
  private readonly log = new AppLogger(InternalProductionOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async create(userId: string, createDto: CreateProductionOrderDto) {
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

        // Auto-Costing: Calculate total raw material value
        let totalRawMaterialValue = 0;
        for (const detail of details) {
          if (
            detail.transactionType === ProductionTransactionType.ISSUE_MATERIAL
          ) {
            const product = productsMap.get(detail.productPublicId)!;
            const unitCost = Number(product.openingStockUnitCost || 0);
            totalRawMaterialValue += detail.quantity * unitCost;
          }
        }

        let totalFinishedQty = 0;
        for (const detail of details) {
          if (
            detail.transactionType === ProductionTransactionType.RECEIVE_PRODUCT
          ) {
            totalFinishedQty += detail.quantity;
          }
        }

        const unitCostOfFinishedProducts =
          totalFinishedQty > 0 ? totalRawMaterialValue / totalFinishedQty : 0;

        // Deduct/Increment stocks and update costing
        for (const detail of details) {
          const product = productsMap.get(detail.productPublicId)!;

          if (
            detail.transactionType === ProductionTransactionType.ISSUE_MATERIAL
          ) {
            const updated = await tx.product.updateMany({
              where: { id: product.id, currentStock: { gte: detail.quantity } },
              data: { currentStock: { decrement: detail.quantity } },
            });
            if (updated.count === 0) {
              throw new BadRequestException(
                `Insufficient stock for product: ${product.productName}.`,
              );
            }
          } else if (
            detail.transactionType === ProductionTransactionType.RECEIVE_PRODUCT
          ) {
            const oldStock = product.currentStock;
            const oldUnitCost = Number(product.openingStockUnitCost || 0);
            const newStock = oldStock + detail.quantity;

            let newUnitCost = oldUnitCost;
            if (newStock > 0) {
              newUnitCost =
                (oldStock * oldUnitCost +
                  detail.quantity * unitCostOfFinishedProducts) /
                newStock;
            }

            await tx.product.update({
              where: { id: product.id },
              data: {
                currentStock: newStock,
                openingStockUnitCost: newUnitCost,
              },
            });
          }
        }

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

  async cancel(userId: string, orderCode: string) {
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

      // Compute raw material value and finished product quantity from current details
      let oldRawMaterialValue = 0;
      let oldFinishedQty = 0;

      for (const d of current.details) {
        if (d.transactionType === ProductionTransactionType.ISSUE_MATERIAL) {
          const unitCost = Number(d.product.openingStockUnitCost || 0);
          oldRawMaterialValue += d.quantity * unitCost;
        } else if (
          d.transactionType === ProductionTransactionType.RECEIVE_PRODUCT
        ) {
          oldFinishedQty += d.quantity;
        }
      }

      const oldFinishedUnitCost =
        oldFinishedQty > 0 ? oldRawMaterialValue / oldFinishedQty : 0;

      // 1. Revert finished goods (deduct stock and revert average cost)
      for (const d of current.details) {
        if (d.transactionType === ProductionTransactionType.RECEIVE_PRODUCT) {
          const product = await tx.product.findUnique({
            where: { id: d.productId },
          });
          if (!product)
            throw new NotFoundException(`Product ${d.productId} not found.`);

          // Check if sufficient stock to deduct
          if (product.currentStock < d.quantity) {
            this.log.warn(LOG_ACTIONS.CANCEL_PRODUCTION_ORDER, {
              status: LOG_STATUS.FAILED,
              reason: 'PRODUCT_OUT_OF_STOCK',
              userId,
              productId: d.productId,
            });
            throw new BadRequestException(
              `Cannot cancel order because product ${product.productName} has insufficient stock to revert the finished goods. Current stock is ${product.currentStock}.`,
            );
          }

          const revertedStock = product.currentStock - d.quantity;
          let revertedCost = Number(product.openingStockUnitCost || 0);

          if (revertedStock > 0) {
            revertedCost =
              (product.currentStock *
                Number(product.openingStockUnitCost || 0) -
                d.quantity * oldFinishedUnitCost) /
              revertedStock;
          }

          await tx.product.update({
            where: { id: product.id },
            data: {
              currentStock: revertedStock,
              openingStockUnitCost: revertedCost,
            },
          });
        }
      }

      // 2. Revert raw materials (refund stock)
      for (const d of current.details) {
        if (d.transactionType === ProductionTransactionType.ISSUE_MATERIAL) {
          const product = await tx.product.findUnique({
            where: { id: d.productId },
          });
          if (!product)
            throw new NotFoundException(`Product ${d.productId} not found.`);

          await tx.product.update({
            where: { id: product.id },
            data: {
              currentStock: product.currentStock + d.quantity,
            },
          });
        }
      }

      // 3. Mark the production order as canceled
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

      // 4. Audit Log the change
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

          // 1. REVERT: Revert old details' stock and costing changes
          const oldDetails = existing.details;

          // 1.1 Compute raw material values in the old details
          let oldRawMaterialValue = 0;
          let oldFinishedQty = 0;

          for (const d of oldDetails) {
            if (
              d.transactionType === ProductionTransactionType.ISSUE_MATERIAL
            ) {
              const unitCost = Number(d.product.openingStockUnitCost || 0);
              oldRawMaterialValue += d.quantity * unitCost;
            } else if (
              d.transactionType === ProductionTransactionType.RECEIVE_PRODUCT
            ) {
              oldFinishedQty += d.quantity;
            }
          }

          const oldFinishedUnitCost =
            oldFinishedQty > 0 ? oldRawMaterialValue / oldFinishedQty : 0;

          // 1.2 Revert finished goods
          for (const d of oldDetails) {
            if (
              d.transactionType === ProductionTransactionType.RECEIVE_PRODUCT
            ) {
              const product = await tx.product.findUnique({
                where: { id: d.productId },
              });
              if (!product)
                throw new NotFoundException(
                  `Product ${d.productId} not found.`,
                );

              // Check if sufficient stock to deduct
              if (product.currentStock < d.quantity) {
                throw new BadRequestException(
                  `Cannot update order because product ${product.productName} has insufficient stock to revert the old finished goods. Current stock is ${product.currentStock}.`,
                );
              }

              const revertedStock = product.currentStock - d.quantity;
              let revertedCost = Number(product.openingStockUnitCost || 0);

              if (revertedStock > 0) {
                revertedCost =
                  (product.currentStock *
                    Number(product.openingStockUnitCost || 0) -
                    d.quantity * oldFinishedUnitCost) /
                  revertedStock;
              }

              await tx.product.update({
                where: { id: product.id },
                data: {
                  currentStock: revertedStock,
                  openingStockUnitCost: revertedCost,
                },
              });
            }
          }

          // 1.3 Revert raw materials
          for (const d of oldDetails) {
            if (
              d.transactionType === ProductionTransactionType.ISSUE_MATERIAL
            ) {
              const product = await tx.product.findUnique({
                where: { id: d.productId },
              });
              if (!product)
                throw new NotFoundException(
                  `Product ${d.productId} not found.`,
                );

              await tx.product.update({
                where: { id: product.id },
                data: {
                  currentStock: product.currentStock + d.quantity,
                },
              });
            }
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

          // Check if user owns all new products and validate types/stocks
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

            if (
              detail.transactionType ===
              ProductionTransactionType.ISSUE_MATERIAL
            ) {
              if (product.currentStock < detail.quantity) {
                throw new BadRequestException(
                  `Insufficient stock for product: ${product.productName}. Current stock is ${product.currentStock}.`,
                );
              }
            }
          }

          // Calculate new raw material values
          let newRawMaterialValue = 0;
          for (const detail of updateDetails) {
            if (
              detail.transactionType ===
              ProductionTransactionType.ISSUE_MATERIAL
            ) {
              const product = newProductsMap.get(detail.productPublicId)!;
              const unitCost = Number(product.openingStockUnitCost || 0);
              newRawMaterialValue += detail.quantity * unitCost;
            }
          }

          let newFinishedQty = 0;
          for (const detail of updateDetails) {
            if (
              detail.transactionType ===
              ProductionTransactionType.RECEIVE_PRODUCT
            ) {
              newFinishedQty += detail.quantity;
            }
          }

          const newFinishedUnitCost =
            newFinishedQty > 0 ? newRawMaterialValue / newFinishedQty : 0;

          // Apply raw material stock deductions
          for (const detail of updateDetails) {
            const product = newProductsMap.get(detail.productPublicId)!;
            if (
              detail.transactionType ===
              ProductionTransactionType.ISSUE_MATERIAL
            ) {
              const updated = await tx.product.updateMany({
                where: {
                  id: product.id,
                  currentStock: { gte: detail.quantity },
                },
                data: { currentStock: { decrement: detail.quantity } },
              });
              if (updated.count === 0) {
                throw new BadRequestException(
                  `Insufficient stock for product: ${product.productName}.`,
                );
              }
            }
          }

          // Apply finished goods stock and cost additions
          for (const detail of updateDetails) {
            const product = newProductsMap.get(detail.productPublicId)!;
            if (
              detail.transactionType ===
              ProductionTransactionType.RECEIVE_PRODUCT
            ) {
              const oldStock = product.currentStock;
              const oldUnitCost = Number(product.openingStockUnitCost || 0);
              const newStock = oldStock + detail.quantity;

              let newUnitCost = oldUnitCost;
              if (newStock > 0) {
                newUnitCost =
                  (oldStock * oldUnitCost +
                    detail.quantity * newFinishedUnitCost) /
                  newStock;
              }

              await tx.product.update({
                where: { id: product.id },
                data: {
                  currentStock: newStock,
                  openingStockUnitCost: newUnitCost,
                },
              });
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

        return updatedOrder;
      },
      {
        maxWait: 5000,
        timeout: 15000,
      },
    );

    this.log.log(LOG_ACTIONS.UPDATE_PRODUCTION_ORDER, {
      status: LOG_STATUS.SUCCESS,
      userId,
      orderCode,
    });
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
