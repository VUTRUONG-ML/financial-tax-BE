import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { AppLogger } from '../common/logger/app-logger.service';
import {
  AuditLogService,
  tableWrite,
} from '../core/audit-log/audit-log.service';
import {
  LOG_ACTIONS,
  LOG_STATUS,
} from '../common/constants/log-events.constant';
import { generateInvoiceSymbol } from '../common/utils/invoice-symbol.util';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { TaxAuthorityService } from '../tax-authority/tax-authority.service';

@Injectable()
export class InvoicesService {
  private readonly log = new AppLogger(InvoicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly taxAuthorityService: TaxAuthorityService,
  ) {}

  private validateInvoiceB2C(
    isB2C?: boolean,
    buyerTaxCode?: string,
    buyerAddress?: string,
    buyerName?: string,
  ) {
    if (!isB2C && (!buyerAddress || !buyerName || !buyerTaxCode))
      throw new BadRequestException('Business information is required.');
  }

  private async validateInvoiceAccess(
    publicId: string,
    userId: string,
    action: 'UPDATE' | 'VIEW',
  ) {
    // 1. Tìm hóa đơn và kiểm tra quyền sở hữu ngay trong câu query
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        publicId: publicId,
        userId: userId,
      },
    });

    // Nếu không tìm thấy hoặc không đúng chủ sở hữu
    if (!invoice) {
      throw new NotFoundException(
        'The invoice does not exist or you do not have access to it.',
      );
    }

    // 2. Kiểm tra trạng thái nếu là hành động ghi (Update/Delete)
    // Như trong tài liệu đặt tả nếu trạng thái đã là ISSUED thì khóa cứng không ghi được nữa
    if (action !== 'VIEW') {
      if (invoice.status === 'ISSUED') {
        this.log.warn('VALIDATE_ACCESS', {
          status: LOG_STATUS.FAILED,
          reason: 'INVOICE_ISSUED',
          userId,
          invoicePublicId: publicId,
        });
        throw new ForbiddenException(
          'The invoice has been issued and assigned a tax authority code.',
        );
      }

      if (invoice.status === 'CANCELED') {
        this.log.warn('VALIDATE_ACCESS', {
          status: LOG_STATUS.FAILED,
          reason: 'INVOICE_CANCELED',
          userId,
          invoicePublicId: publicId,
        });
        throw new ForbiddenException('The invoice has been canceled');
      }
    }

    return invoice;
  }

  async lockInvoice(publicId: string, userId: string, cqtCode?: string) {
    return await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const updatedInvoice = await tx.invoice.update({
        where: { publicId, userId, status: { in: ['DRAFT', 'SYNC_FAILED'] } },
        data: {
          status: 'ISSUED',
          cqtCode,
          issuedAt: now,
        },
      });

      await this.auditLog.logChange(
        tx,
        userId,
        'UPDATE',
        tableWrite.invoices,
        updatedInvoice.id,
        { status: 'DRAFT', cqtCode: null, issuedAt: null },
        { status: 'ISSUED', cqtCode, issuedAt: now },
      );

      this.log.log(LOG_ACTIONS.UPDATE_INVOICE, {
        status: LOG_STATUS.SUCCESS,
        userId,
        invoicePublicId: updatedInvoice.publicId,
      });

      // GHI VAO SỔ S01 (doanh thu) ------------------
      // Trừ kho (Sổ S05): Ghi nhận việc hàng đã rời kho
      return updatedInvoice;
    });
  }

  async createInvoice(userId: string, dto: CreateInvoiceDto) {
    // ─── PRE-FLIGHT CHECKS (Ngoài Transaction để tránh giữ lock DB) ──────────
    this.validateInvoiceB2C(
      dto.isB2C,
      dto.buyerTaxCode,
      dto.buyerAddress,
      dto.buyerName,
    );

    let totalPayment = 0;

    // Tra cứu tất cả sản phẩm một lần, validate ownership & stock
    const resolvedItems = await Promise.all(
      dto.details.map(async (item) => {
        const product = await this.prisma.product.findUnique({
          where: { publicId: item.productPublicId },
        });

        if (!product) {
          this.log.warn(LOG_ACTIONS.CREATE_INVOICE, {
            status: LOG_STATUS.FAILED,
            reason: 'PRODUCT_NOT_FOUND',
            userId,
            productPublicId: item.productPublicId,
          });
          throw new NotFoundException(
            `Product not found: ${item.productPublicId}`,
          );
        }

        // Kiểm tra ownership — chỉ được dùng sản phẩm của chính mình
        if (product.userId !== userId) {
          this.log.warn(LOG_ACTIONS.CREATE_INVOICE, {
            status: LOG_STATUS.FAILED,
            reason: 'PRODUCT_OWNERSHIP_VIOLATION',
            userId,
            productPublicId: item.productPublicId,
          });
          throw new ForbiddenException(
            `You do not have access to product: ${item.productPublicId}`,
          );
        }

        // Kiểm tra tồn kho trước khi vào Transaction
        if (product.currentStock < item.quantity) {
          this.log.warn(LOG_ACTIONS.CREATE_INVOICE, {
            status: LOG_STATUS.FAILED,
            reason: 'OUT_OF_STOCK',
            userId,
            productPublicId: item.productPublicId,
            requested: item.quantity,
            available: product.currentStock,
          });
          throw new BadRequestException(
            `Insufficient stock for product: ${product.productName}. ` +
              `Available: ${product.currentStock}, Requested: ${item.quantity}`,
          );
        }

        const lineTotal = Number(product.sellingPrice) * item.quantity;
        totalPayment += lineTotal;

        return { product, quantity: item.quantity, lineTotal };
      }),
    );

    // ─── TRANSACTION — 3 bước ACID ────────────────────────────────────────────
    return this.prisma.$transaction(async (tx) => {
      // 1. Tạo Invoice header
      const invoiceSymbol = generateInvoiceSymbol();

      const invoice = await tx.invoice.create({
        data: {
          userId,
          invoiceSymbol,
          isB2C: dto.isB2C ?? true,
          buyerName: dto.buyerName,
          buyerTaxCode: dto.buyerTaxCode,
          buyerAddress: dto.buyerAddress,
          totalPayment,
          // status mặc định DRAFT, isPaid mặc định false (từ schema)
        },
      });

      // 2. Tạo các InvoiceDetail (line items) với snapshot bất biến
      await tx.invoiceDetail.createMany({
        data: resolvedItems.map(({ product, quantity, lineTotal }) => ({
          invoiceId: invoice.id,
          productId: product.id,
          // SNAPSHOT: ghi chết tên & giá tại thời điểm bán
          productNameSnapshot: product.productName,
          unitPrice: product.sellingPrice,
          quantity,
          totalAmount: lineTotal,
        })),
      });

      // 3. Trừ currentStock — Optimistic Locking chống race condition
      for (const { product, quantity } of resolvedItems) {
        const updateResult = await tx.product.updateMany({
          where: {
            id: product.id,
            // ĐIỀU KIỆN SỐNG CÒN: chỉ trừ nếu stock vẫn đủ
            currentStock: { gte: quantity },
          },
          data: { currentStock: { decrement: quantity } },
        });

        if (updateResult.count === 0) {
          this.log.warn(LOG_ACTIONS.CREATE_INVOICE, {
            status: LOG_STATUS.FAILED,
            reason: 'STOCK_CHANGED_CONCURRENTLY',
            userId,
            productId: product.id,
            invoiceSymbol,
          });
          // Ném lỗi → Prisma tự động rollback toàn bộ transaction
          throw new ConflictException(
            `Stock for "${product.productName}" changed during processing. Please retry.`,
          );
        }
      }

      // 4. Ghi AuditLog trong cùng Transaction
      await this.auditLog.logChange(
        tx,
        userId,
        'CREATE',
        tableWrite.invoices,
        invoice.id,
        null,
        {
          invoiceSymbol,
          totalPayment,
          isB2C: dto.isB2C,
          itemCount: resolvedItems.length,
        },
      );

      // 5. Log nghiệp vụ
      this.log.log(LOG_ACTIONS.CREATE_INVOICE, {
        status: LOG_STATUS.SUCCESS,
        userId,
        invoiceId: invoice.publicId,
        invoiceSymbol,
        totalPayment,
        itemCount: resolvedItems.length,
      });

      // Return kèm details để FE không cần query thêm
      return {
        ...invoice,
        details: resolvedItems.map(({ product, quantity, lineTotal }) => ({
          productPublicId: product.publicId,
          productNameSnapshot: product.productName,
          unitPrice: product.sellingPrice,
          quantity,
          totalAmount: lineTotal,
        })),
      };
    });
  }

  // service cấp phát mã
  async publishInvoice(publicId: string, userId: string) {
    // Kiểm tra quyền sở hữu và trạng thái (chỉ DRAFT hoặc SYNC_FAILED mới được làm)
    await this.validateInvoiceAccess(publicId, userId, 'UPDATE');

    // Gọi Mock API
    const result = await this.taxAuthorityService.requestTaxCode(publicId);

    if (result.success) {
      // Nếu thành công -> Chạy hàm lockInvoice
      return await this.lockInvoice(publicId, userId, result.cqtCode);
    } else {
      // Nếu thất bại -> Cập nhật trạng thái SYNC_FAILED để người dùng bấm 'Retry'
      return await this.prisma.invoice.update({
        where: { publicId, userId },
        data: { status: 'SYNC_FAILED' },
      });
    }
  }

  async findAll(userId: string) {
    return await this.prisma.invoice.findMany({
      where: { userId },
    });
  }

  async detailInvoice(userId: string, invPublicId: string) {
    const invoice = await this.validateInvoiceAccess(
      invPublicId,
      userId,
      'VIEW',
    );
    const details = await this.prisma.invoiceDetail.findMany({
      where: { invoiceId: invoice.id },
    });
    this.log.log('Get detail invoice.', {
      status: LOG_STATUS.SUCCESS,
      userId,
      invoicePublicId: invPublicId,
    });
    return {
      ...invoice,
      details,
    };
  }

  // Huy hoa don
  async canceledInvoice(invPublicId: string, userId: string) {
    // Kiem tra own
    const invoice = await this.validateInvoiceAccess(
      invPublicId,
      userId,
      'UPDATE',
    );
    // Lấy ra danh sách sản phẩm của invoice đó thông qua details
    // duyệt qua toàn bộ thông tin detail hoàn trả lại số lượng
    const result = await this.prisma.$transaction(async (tx) => {
      const updatedInvoice = await tx.invoice.updateMany({
        where: { id: invoice.id, status: { in: ['DRAFT', 'SYNC_FAILED'] } },
        data: { status: 'CANCELED' },
      });
      if (updatedInvoice.count === 0) {
        this.log.warn(LOG_ACTIONS.CANCEL_INVOICE, {
          status: LOG_STATUS.FAILED,
          reason: 'RACE_CONDITION',
          invoicePublicId: invPublicId,
          userId,
        });
        throw new BadRequestException('Invoice already CANCELED.');
      }
      const details = await tx.invoiceDetail.groupBy({
        by: ['productId'],
        where: { invoiceId: invoice.id },
        _sum: { quantity: true },
      });
      for (const d of details) {
        await tx.product.update({
          where: { id: d.productId },
          data: {
            currentStock: { increment: d._sum.quantity ?? 0 },
          },
        });
      }
      return { ...invoice, status: 'CANCELED' };
    });
    // Trừ đi doanh thu trong sổ s01 thông qua invoice.totalPayment---------------------------
    // Hoàn lại tồn kho trong sổ s05 thong qua details.d._sum.quantity---------------------------
    this.log.log(LOG_ACTIONS.CANCEL_INVOICE, {
      status: LOG_STATUS.SUCCESS,
      userId,
      invoicePublicId: invPublicId,
    });
    return result;
  }
}
