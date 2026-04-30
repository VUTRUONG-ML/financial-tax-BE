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
import { generateMonthlySequenceCode } from '../common/utils/code-generator.util';
import {
  LOG_ACTIONS,
  LOG_STATUS,
} from '../common/constants/log-events.constant';
import { ProductionTransactionType, ProductType } from '@prisma/client';
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
    const productPublicIds = createDto.details.map((d) => d.productPublicId);

    const products = await this.prisma.product.findMany({
      where: { publicId: { in: productPublicIds } },
    });

    const productsMap = new Map(products.map((p) => [p.publicId, p]));

    if (products.length !== productPublicIds.length) {
      throw new NotFoundException('One or more products not found.');
    }

    let countFinish = 0; // Đếm số lượng thành phẩm
    let countRaw = 0; // Đến số lượng nguyên liệu
    // Validation
    for (const detail of createDto.details) {
      const product = productsMap.get(detail.productPublicId);

      if (!product) {
        throw new NotFoundException(
          `Product not found: ${detail.productPublicId}`,
        );
      }

      if (product.userId !== userId) {
        throw new ForbiddenException(
          `You do not have access to product: ${product.productName}`,
        );
      }

      if (detail.transactionType === ProductionTransactionType.ISSUE_MATERIAL) {
        if (product.productType !== ProductType.RAW_MATERIAL) {
          throw new BadRequestException(
            `Product ${product.productName} must be a RAW_MATERIAL to issue.`,
          );
        }
        if (product.currentStock < detail.quantity) {
          throw new BadRequestException(
            `Insufficient stock for product: ${product.productName}. Current stock is ${product.currentStock}.`,
          );
        }
        ++countRaw;
      }

      if (
        detail.transactionType === ProductionTransactionType.RECEIVE_PRODUCT
      ) {
        if (product.productType !== ProductType.FINISHED_GOOD) {
          throw new BadRequestException(
            `Product ${product.productName} must be a FINISHED_GOOD to receive.`,
          );
        }
        ++countFinish;
      }
    }
    if (!countRaw || !countFinish) {
      this.log.warn(LOG_ACTIONS.CREATE_PRODUCTION_ORDER, {
        reason: 'FINISH_GOOD_OR_RAW_MATERIAL_EMPTY',
        userId,
      });
      throw new BadRequestException(
        'Finished products and raw materials are required.',
      );
    }

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

        const orderCode = generateMonthlySequenceCode(prefix, lastCode);

        // Deduct/Increment stocks
        for (const detail of createDto.details) {
          const product = productsMap.get(detail.productPublicId)!;

          if (
            detail.transactionType === ProductionTransactionType.ISSUE_MATERIAL
          ) {
            await tx.product.updateMany({
              where: { id: product.id, currentStock: { gte: detail.quantity } },
              data: { currentStock: { decrement: detail.quantity } },
            });
          } else if (
            detail.transactionType === ProductionTransactionType.RECEIVE_PRODUCT
          ) {
            await tx.product.update({
              where: { id: product.id },
              data: { currentStock: { increment: detail.quantity } },
            });
          }
        }

        // Create Order and Details
        const order = await tx.internalProductionOrder.create({
          data: {
            userId,
            orderCode,
            notes: createDto.notes,
            details: {
              create: createDto.details.map((detail) => {
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

  async findAll(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const [total, data] = await Promise.all([
      this.prisma.internalProductionOrder.count({
        where: { userId },
      }),
      this.prisma.internalProductionOrder.findMany({
        where: { userId },
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
      data,
      meta: {
        total,
        page,
        lastPage: Math.ceil(total / limit),
      },
    };
  }
}
