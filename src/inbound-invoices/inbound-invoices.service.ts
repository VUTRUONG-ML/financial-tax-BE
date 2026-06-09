import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { AppLogger } from '../common/logger/app-logger.service';
import { CreateInboundInvoiceDto } from './dto/create-inbound-invoice.dto';
import {
  LOG_ACTIONS,
  LOG_STATUS,
} from '../common/constants/log-events.constant';
import {
  AuditLogService,
  tableWrite,
} from '../core/audit-log/audit-log.service';
import { VouchersService } from '../vouchers/vouchers.service';
import { ProductsService } from '../products/products.service';
import { mapToDto } from 'src/common/utils/mapper.util';
import { InboundResponseDto } from './dto/response-inbound-invoice.dto';
import { InboundInvoiceStatus, Prisma } from '@prisma/client';
import { UpdateInboundInvoiceDto } from './dto/update-inbound-invoice.dto';

@Injectable()
export class InboundInvoicesService {
  private readonly log = new AppLogger(InboundInvoicesService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly voucherService: VouchersService,
    private readonly productService: ProductsService,
  ) { }

  async findAllInboundInvoices(
    userId: string,
    page: number = 1,
    limit: number = 20,
    type?: string,
  ) {
    const skip = (page - 1) * limit;

    const where: Prisma.InboundInvoiceWhereInput = { userId };

    if (type) {
      const upperType = type.toUpperCase();
      if (upperType === 'UNSYNCED' || upperType === 'CHUA_DONG_BO') {
        where.isSyncedToInventory = false;
      } else if (upperType === 'SYNCED' || upperType === 'DA_NHAP_KHO') {
        where.isSyncedToInventory = true;
      } else if (upperType === 'UNPAID' || upperType === 'CHUA_THANH_TOAN') {
        where.vouchers = {
          none: {
            voucherType: 'PAYMENT',
            status: 'ACTIVE',
          },
        };
      }
    }

    const [total, inboundInvoices] = await Promise.all([
      this.prisma.inboundInvoice.count({
        where,
      }),
      this.prisma.inboundInvoice.findMany({
        where,
        take: limit,
        skip,
        include: {
          details: {
            include: {
              product: {
                select: { publicId: true },
              },
            },
          },
        },
        orderBy: { issueDate: 'desc' }
      }),
    ]);
    return {
      data: mapToDto(InboundResponseDto, inboundInvoices),
      meta: { total, page, lastPage: Math.ceil(total / limit) },
    };
  }

  async detailInboundInvoice(publicId: string, userId: string) {
    const inInvoice = await this.prisma.inboundInvoice.findFirst({
      where: { publicId, userId },
    });
    if (!inInvoice) throw new NotFoundException('Inbound invoice not found.');
    const items = await this.prisma.inboundInvoiceDetail.findMany({
      where: { inboundInvoiceId: inInvoice.id },
      include: {
        product: {
          select: { publicId: true },
        },
      },
    });
    return mapToDto(InboundResponseDto, {
      ...inInvoice,
      details: items,
    });
  }

  async create(userId: string, dto: CreateInboundInvoiceDto) {
    let calculatedTotalAmount = 0;
    const itemsWithInternalId = await Promise.all(
      dto.items.map(async (item) => {
        const product = await this.prisma.product.findUnique({
          where: { publicId: item.productPublicId },
          select: {
            id: true,
            userId: true,
            publicId: true,
            productType: true,
            currentStock: true,
            openingStockUnitCost: true,
          },
        });

        if (!product)
          throw new NotFoundException(
            `Product ${item.productPublicId} not found.`,
          );

        if (userId !== product.userId) {
          throw new ForbiddenException(
            `You do not have access product ${product.publicId}.`,
          );
        }

        calculatedTotalAmount += item.quantity * item.unitCost;
        return {
          productId: product.id,
          quantity: item.quantity,
          unitCost: item.unitCost,
          productType: product.productType,
          currentStock: product.currentStock,
          openingStockUnitCost: Number(product.openingStockUnitCost || 0),
        };
      }),
    );
    // 1. Khởi tạo DB Transaction để đảm bảo tính ACID
    return await this.prisma.$transaction(async (tx) => {
      // 2. Tạo Hóa đơn đầu vào (Master)
      const inboundInvoice = await tx.inboundInvoice.create({
        data: {
          userId,
          sellerName: dto.sellerName,
          sellerTaxCode: dto.sellerTaxCode,
          invoiceNo: dto.invoiceNo, // Mã hóa đơn của nhà cung cấp
          issueDate: new Date(dto.issueDate), // Chuyển sang Date object
          totalAmount: calculatedTotalAmount,
          attachmentUrl: dto.attachmentUrl,
          isSyncedToInventory: dto.isSyncedToInventory, // Lưu trạng thái checkbox sync kho

          // 3. Tạo chi tiết mặt hàng (Line Items)
          details: {
            create: itemsWithInternalId.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitCost: item.unitCost,
            })),
          },
        },
        include: { details: true },
      });

      // Ghi vào phiếu chi ------------------------------

      // 4. Nếu Checkbox [x] Cập nhật tồn kho được tích
      if (dto.isSyncedToInventory) {
        for (const item of itemsWithInternalId) {
          if (item.productType === 'SERVICE') continue;

          const oldStock = item.currentStock;
          const oldUnitCost = item.openingStockUnitCost;
          const newStock = oldStock + item.quantity;

          let newUnitCost = oldUnitCost;
          if (newStock > 0) {
            newUnitCost = ((oldStock * oldUnitCost) + (item.quantity * item.unitCost)) / newStock;
          }

          await tx.product.update({
            where: { id: item.productId },
            data: {
              currentStock: newStock,
              openingStockUnitCost: newUnitCost,
            },
          });
        }
      }

      const { id, details, ...result } = inboundInvoice;

      await this.auditLog.logChange(
        tx,
        userId,
        'CREATE',
        tableWrite.inboundInvoice,
        inboundInvoice.id,
        null,
        { ...result, itemCount: inboundInvoice.details.length },
      );

      // 5. Trả về kết quả sau khi commit thành công

      return mapToDto(InboundResponseDto, inboundInvoice);
    });
  }

  async cancel(userId: string, publicId: string) {
    return await this.prisma.$transaction(async (tx) => {
      const currentInvoice = await tx.inboundInvoice.findUnique({
        where: { publicId },
      });
      if (!currentInvoice) {
        this.log.warn(LOG_ACTIONS.CREATE_INBOUND_INVOICE, {
          status: LOG_STATUS.FAILED,
          reason: 'INBOUND_INVOICE_NOT_FOUND',
          userId,
          publicId,
        });
        throw new NotFoundException('Inbound invoice not found.');
      }

      if (currentInvoice.userId !== userId) {
        this.log.warn(LOG_ACTIONS.CANCEL_INBOUND_INVOICE, {
          status: LOG_STATUS.FAILED,
          reason: 'INVALID_OWN',
          userId,
          publicId,
        });
        throw new ForbiddenException('You do not have access.');
      }

      if (currentInvoice.status === 'CANCELED') {
        this.log.warn(LOG_ACTIONS.CANCEL_INBOUND_INVOICE, {
          status: LOG_STATUS.FAILED,
          reason: 'INBOUND_INVOICE_CANCELED',
          userId,
          publicId,
        });
        throw new BadRequestException('Inbound invoice canceled.');
      }

      // trừ đi sản phẩm trong kho
      if (currentInvoice.isSyncedToInventory) {
        const details = await tx.inboundInvoiceDetail.findMany({
          where: { inboundInvoiceId: currentInvoice.id },
          select: { productId: true, quantity: true },
        });

        await this.productService.updateStockFromCanceledInvoice(
          tx,
          userId,
          details,
          'DECREMENT',
          currentInvoice.id,
        );
      }

      // Hủy các phiếu thu liên quan
      await this.voucherService.bulkCancelByInvoice(
        tx,
        userId,
        currentInvoice.id,
        'INBOUND',
      );

      const updatedInvoice = await tx.inboundInvoice.updateMany({
        where: { publicId, status: 'ACTIVE' },
        data: { status: 'CANCELED' },
      });
      if (updatedInvoice.count === 0) {
        throw new ConflictException(
          'Invoice has been modified or canceled by another request.',
        );
      }
      await this.auditLog.logChange(
        tx,
        userId,
        'UPDATE',
        tableWrite.inboundInvoice,
        currentInvoice.id,
        { status: currentInvoice.status },
        { status: 'CANCELED' },
      );

      this.log.log(LOG_ACTIONS.CANCEL_INBOUND_INVOICE, {
        status: LOG_STATUS.SUCCESS,
        userId,
        publicId,
      });
      return mapToDto(InboundResponseDto, {
        ...currentInvoice,
        status: InboundInvoiceStatus.CANCELED,
      });
    });
  }

  async syncToInventory(userId: string, publicId: string) {
    return await this.prisma.$transaction(async (tx) => {
      // 1. Tìm và đồng thời kiểm tra điều kiện bằng updateMany (Atomic Check)
      const updateStatus = await tx.inboundInvoice.updateMany({
        where: {
          publicId,
          userId,
          status: 'ACTIVE',
          isSyncedToInventory: false, // CHỈ xử lý nếu chưa được đồng bộ
        },
        data: {
          isSyncedToInventory: true,
        },
      });

      // Nếu count = 0, có thể do hóa đơn đã hủy, không tồn tại, hoặc ĐÃ ĐƯỢC đồng bộ rồi
      if (updateStatus.count === 0) {
        throw new BadRequestException(
          'Invoice cannot be synced (already synced, canceled, or not found).',
        );
      }

      // 2. Lấy lại dữ liệu chi tiết để thực hiện cộng kho
      const invoice = await tx.inboundInvoice.findUnique({
        where: { publicId },
        include: {
          details: {
            include: {
              product: {
                select: {
                  publicId: true,
                  productType: true,
                  currentStock: true,
                  openingStockUnitCost: true,
                },
              },
            },
          },
        },
      });

      if (!invoice) throw new NotFoundException('Inbound invoice not found.');
      // 3. Thực hiện cộng dồn tồn kho và tính lại giá vốn bình quân gia quyền
      for (const item of invoice.details) {
        if (item.product.productType === 'SERVICE') continue;

        const oldStock = item.product.currentStock;
        const oldUnitCost = Number(item.product.openingStockUnitCost || 0);
        const newStock = oldStock + item.quantity;

        let newUnitCost = oldUnitCost;
        if (newStock > 0) {
          newUnitCost = ((oldStock * oldUnitCost) + (item.quantity * Number(item.unitCost || 0))) / newStock;
        }

        await tx.product.update({
          where: { id: item.productId, userId },
          data: {
            currentStock: newStock,
            openingStockUnitCost: newUnitCost,
          },
        });
      }

      // 4. Ghi Audit Log cho hành động quan trọng này
      await this.auditLog.logChange(
        tx,
        userId,
        'UPDATE',
        tableWrite.inboundInvoice,
        invoice.id,
        { isSyncedToInventory: false }, // Old value
        { isSyncedToInventory: true }, // New value
      );

      this.log.log(LOG_ACTIONS.SYNC_INVENTORY, {
        status: LOG_STATUS.SUCCESS,
        userId,
        publicId,
      });
      return mapToDto(InboundResponseDto, invoice);
    });
  }

  async update(userId: string, publicId: string, dto: UpdateInboundInvoiceDto) {
    return await this.prisma.$transaction(async (tx) => {
      const existing = await tx.inboundInvoice.findFirst({
        where: { publicId, userId },
      });
      if (!existing) throw new NotFoundException('Inbound invoice not found.');

      if (existing.isSyncedToInventory) {
        throw new BadRequestException(
          'Inbound invoice already synced to inventory and cannot be updated.',
        );
      }

      let finalTotalAmount = existing.totalAmount;
      let finalIsSynced: boolean = existing.isSyncedToInventory;
      if (dto.isSyncedToInventory !== undefined) {
        finalIsSynced = dto.isSyncedToInventory;
      }

      let itemsWithInternalId: any[] = [];
      let calculatedTotalAmount = 0;

      if (dto.items) {
        // Delete old details
        await tx.inboundInvoiceDetail.deleteMany({
          where: { inboundInvoiceId: existing.id },
        });

        // Resolve and validate new items
        itemsWithInternalId = await Promise.all(
          dto.items.map(async (item) => {
            const product = await tx.product.findUnique({
              where: { publicId: item.productPublicId },
              select: {
                id: true,
                userId: true,
                publicId: true,
                productType: true,
                currentStock: true,
                openingStockUnitCost: true,
              },
            });

            if (!product)
              throw new NotFoundException(
                `Product ${item.productPublicId} not found.`,
              );

            if (userId !== product.userId) {
              throw new ForbiddenException(
                `You do not have access product ${product.publicId}.`,
              );
            }

            calculatedTotalAmount += item.quantity * item.unitCost;
            return {
              productId: product.id,
              quantity: item.quantity,
              unitCost: item.unitCost,
              productType: product.productType,
              currentStock: product.currentStock,
              openingStockUnitCost: Number(product.openingStockUnitCost || 0),
            };
          }),
        );

        // Create new details
        await tx.inboundInvoiceDetail.createMany({
          data: itemsWithInternalId.map((item) => ({
            inboundInvoiceId: existing.id,
            productId: item.productId,
            quantity: item.quantity,
            unitCost: item.unitCost,
          })),
        });

        finalTotalAmount = new Prisma.Decimal(calculatedTotalAmount);
      }

      // Handle stock and average cost update if transitioning to synced
      if (finalIsSynced && !existing.isSyncedToInventory) {
        const itemsToSync = dto.items
          ? itemsWithInternalId
          : await tx.inboundInvoiceDetail.findMany({
            where: { inboundInvoiceId: existing.id },
            include: {
              product: {
                select: {
                  id: true,
                  productType: true,
                  currentStock: true,
                  openingStockUnitCost: true,
                },
              },
            },
          }).then((details) =>
            details.map((d) => ({
              productId: d.productId,
              quantity: d.quantity,
              unitCost: Number(d.unitCost || 0),
              productType: d.product.productType,
              currentStock: d.product.currentStock,
              openingStockUnitCost: Number(d.product.openingStockUnitCost || 0),
            })),
          );

        for (const item of itemsToSync) {
          if (item.productType === 'SERVICE') continue;

          const oldStock = item.currentStock;
          const oldUnitCost = item.openingStockUnitCost;
          const newStock = oldStock + item.quantity;

          let newUnitCost = oldUnitCost;
          if (newStock > 0) {
            newUnitCost =
              (oldStock * oldUnitCost + item.quantity * item.unitCost) /
              newStock;
          }

          await tx.product.update({
            where: { id: item.productId },
            data: {
              currentStock: newStock,
              openingStockUnitCost: newUnitCost,
            },
          });
        }
      }

      const updated = await tx.inboundInvoice.update({
        where: { id: existing.id },
        data: {
          sellerName: dto.sellerName ?? undefined,
          sellerTaxCode: dto.sellerTaxCode !== undefined ? dto.sellerTaxCode : undefined,
          invoiceNo: dto.invoiceNo ?? undefined,
          issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
          attachmentUrl: dto.attachmentUrl !== undefined ? dto.attachmentUrl : undefined,
          isSyncedToInventory: finalIsSynced,
          totalAmount: finalTotalAmount,
        },
        include: { details: true },
      });

      await this.auditLog.logChange(
        tx,
        userId,
        'UPDATE',
        tableWrite.inboundInvoice,
        existing.id,
        existing,
        updated,
      );

      return mapToDto(InboundResponseDto, updated);
    });
  }

  async remove(userId: string, publicId: string) {
    return await this.prisma.$transaction(async (tx) => {
      const existing = await tx.inboundInvoice.findFirst({
        where: { publicId, userId },
      });
      if (!existing) throw new NotFoundException('Inbound invoice not found.');

      if (existing.isSyncedToInventory) {
        throw new BadRequestException(
          'Inbound invoice already synced to inventory and cannot be deleted.',
        );
      }

      await tx.inboundInvoiceDetail.deleteMany({
        where: { inboundInvoiceId: existing.id },
      });

      await tx.inboundInvoice.delete({
        where: { id: existing.id },
      });

      await this.auditLog.logChange(
        tx,
        userId,
        'DELETE',
        tableWrite.inboundInvoice,
        existing.id,
        existing,
        null,
      );

      return { message: 'Inbound invoice deleted successfully.' };
    });
  }

  async getSummary(userId: string) {
    const [tong_so_luong_hoa_don, aggregateActive, aggregateUnpaid] = await Promise.all([
      this.prisma.inboundInvoice.count({
        where: { userId },
      }),
      this.prisma.inboundInvoice.aggregate({
        where: { userId, status: 'ACTIVE' },
        _sum: {
          totalAmount: true,
        },
      }),
      this.prisma.inboundInvoice.aggregate({
        where: { userId, status: 'ACTIVE', isPaid: false },
        _sum: {
          totalAmount: true,
          paidAmount: true,
        },
      }),
    ]);

    const tong_doanh_thu = aggregateActive._sum.totalAmount
      ? Number(aggregateActive._sum.totalAmount)
      : 0;

    const unpaidTotalAmount = aggregateUnpaid._sum.totalAmount
      ? Number(aggregateUnpaid._sum.totalAmount)
      : 0;
    const unpaidPaidAmount = aggregateUnpaid._sum.paidAmount
      ? Number(aggregateUnpaid._sum.paidAmount)
      : 0;
    const tong_chua_thanh_toan = unpaidTotalAmount - unpaidPaidAmount;

    return {
      tong_so_luong_hoa_don,
      tong_doanh_thu,
      tong_chua_thanh_toan,
    };
  }
}
