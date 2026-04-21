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

@Injectable()
export class InboundInvoicesService {
  private readonly log = new AppLogger(InboundInvoicesService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async findAllInboundInvoices(userId: string) {
    return await this.prisma.inboundInvoice.findMany({
      where: { userId },
      omit: { id: true },
    });
  }

  async detailInboundInvoice(publicId: string, userId: string) {
    const inInvoice = await this.prisma.inboundInvoice.findFirst({
      where: { publicId, userId },
    });
    if (!inInvoice) throw new NotFoundException('Inbound invoice not found.');
    const items = await this.prisma.inboundInvoiceDetail.findMany({
      where: { inboundInvoiceId: inInvoice?.id },
    });
    return {
      ...inInvoice,
      details: items,
    };
  }

  async create(userId: string, dto: CreateInboundInvoiceDto) {
    let calculatedTotalAmount = 0;
    const itemsWithInternalId = await Promise.all(
      dto.items.map(async (item) => {
        const product = await this.prisma.product.findUnique({
          where: { publicId: item.productPublicId },
          select: { id: true },
        });

        if (!product)
          throw new NotFoundException(
            `Product ${item.productPublicId} not found.`,
          );

        calculatedTotalAmount += item.quantity * item.unitCost;
        return {
          productId: product.id,
          quantity: item.quantity,
          unitCost: item.unitCost,
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
          await tx.product.update({
            where: { id: item.productId, userId },
            data: {
              currentStock: {
                increment: item.quantity,
              },
            },
          });
        }
      }

      const { details, ...newValue } = inboundInvoice;
      await this.auditLog.logChange(
        tx,
        userId,
        'CREATE',
        tableWrite.inboundInvoice,
        inboundInvoice.id,
        null,
        { newValue, itemCount: details.length },
      );

      // 5. Trả về kết quả sau khi commit thành công
      const { id, ...result } = inboundInvoice;
      const cleanDetails = inboundInvoice.details.map((detail) => {
        const { inboundInvoiceId, productId, ...item } = detail;
        return item;
      });
      return { ...result, details: cleanDetails };
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

      if (currentInvoice.isSyncedToInventory) {
        const details = await tx.inboundInvoiceDetail.findMany({
          where: { inboundInvoiceId: currentInvoice.id },
        });
        for (const item of details) {
          const result = await tx.product.updateMany({
            where: {
              id: item.productId,
              currentStock: { gte: item.quantity },
              userId,
            },
            data: { currentStock: { decrement: item.quantity } },
          });
          if (result.count === 0) {
            this.log.warn(LOG_ACTIONS.CREATE_INBOUND_INVOICE, {
              status: LOG_STATUS.FAILED,
              reason: 'OUT_OF_STOCK',
              userId,
              publicId,
            });
            throw new ConflictException(
              'The product may have sold out or may no longer be available.',
            );
          }
        }
      }

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
        currentInvoice,
        { ...currentInvoice, status: 'CANCELED' },
      );

      this.log.log(LOG_ACTIONS.CANCEL_INBOUND_INVOICE, {
        status: LOG_STATUS.SUCCESS,
        userId,
        publicId,
      });
      const { id, ...res } = currentInvoice;
      return {
        ...res,
        status: 'CANCELED',
      };
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
        include: { details: true },
      });

      if (!invoice) throw new NotFoundException('Inbound invoice not found.');
      // 3. Thực hiện cộng dồn tồn kho
      for (const item of invoice.details) {
        await tx.product.update({
          where: { id: item.productId, userId },
          data: {
            currentStock: {
              increment: item.quantity,
            },
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
      const { id, ...result } = invoice;
      const cleanDetails = result.details.map((item) => {
        const { productId, inboundInvoiceId, ...res } = item;
        return res;
      });
      return {
        ...result,
        details: cleanDetails,
      };
    });
  }
}
