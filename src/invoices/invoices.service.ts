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

@Injectable()
export class InvoicesService {
  private readonly log = new AppLogger(InvoicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  private validateInvoice(
    isB2C?: boolean,
    buyerTaxCode?: string,
    buyerAddress?: string,
    buyerName?: string,
  ) {
    if (!isB2C && (!buyerAddress || !buyerName || !buyerTaxCode))
      throw new BadRequestException('Business information is required.');
  }

  async createInvoice(userId: string, dto: CreateInvoiceDto) {
    // ─── PRE-FLIGHT CHECKS (Ngoài Transaction để tránh giữ lock DB) ──────────
    this.validateInvoice(
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
}
