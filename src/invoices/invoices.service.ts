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
import { Invoice, InvoiceStatus, Prisma, Product } from '@prisma/client';
import { VouchersService } from '../vouchers/vouchers.service';
import { ProductsService } from '../products/products.service';
import { mapToDto } from '../common/utils/mapper.util';
import { InvoiceResponseDto } from './dto/response-invoice.dto';
import { CreateInvoiceDetailDto } from './dto/create-invoice-detail.dto';
import { Decimal } from '@prisma/client/runtime/client';

@Injectable()
export class InvoicesService {
  private readonly log = new AppLogger(InvoicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly taxAuthorityService: TaxAuthorityService,
    private readonly voucherService: VouchersService,
    private readonly productService: ProductsService,
  ) {}

  private async validateStockAvailability(
    userId: string,
    items: CreateInvoiceDetailDto[],
  ) {
    const itemMap = new Map<string, number>();
    for (const i of items) {
      itemMap.set(
        i.productPublicId,
        (itemMap.get(i.productPublicId) ?? 0) + i.quantity,
      );
    }
    const publicIds = Array.from(itemMap.keys());
    const products = await this.prisma.product.findMany({
      where: { publicId: { in: publicIds }, userId },
    });
    const productMap = new Map(products.map((p) => [p.publicId, p]));
    let totalPayment = 0;
    const resolvedItems: {
      product: Product;
      lineTotal: Decimal;
      quantity: number;
    }[] = [];
    for (const [productPublicId, quantity] of itemMap) {
      const product = productMap.get(productPublicId);
      if (!product) {
        this.log.warn('VALIDATE_STOCK', {
          status: LOG_STATUS.FAILED,
          reason: 'PRODUCT_NOT_FOUND',
          userId,
          productPublicId: productPublicId,
        });
        throw new NotFoundException(`Product not found: ${productPublicId}`);
      }
      if (product.currentStock < quantity) {
        this.log.warn('VALIDATE_STOCK', {
          status: LOG_STATUS.FAILED,
          reason: 'OUT_OF_STOCK',
          userId,
          productPublicId: productPublicId,
        });
        throw new BadRequestException(
          `Insufficient stock for product: ${product.productName}. ` +
            `Available: ${product.currentStock}, Requested: ${quantity}`,
        );
      }
      const lineTotal = product.sellingPrice.mul(quantity);
      totalPayment += Number(lineTotal);
      resolvedItems.push({ product, lineTotal, quantity });
    }
    return { totalPayment, resolvedItems };
  }
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
    const invoice = await this.prisma.invoice.findUnique({
      where: {
        publicId: publicId,
      },
    });

    // Nếu không tìm thấy hoặc không đúng chủ sở hữu
    if (!invoice || invoice.userId !== userId) {
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

  async lockInvoice(
    invoice: Invoice,
    tx: Prisma.TransactionClient,
    cqtCode?: string,
  ) {
    /**
     * Khóa trạng thái invoice là issued khi đã được cơ quan thuế cấp mã
     */
    const { id: internalId, publicId, userId, status } = invoice;

    const now = new Date();
    const updatedInvoice = await tx.invoice.updateMany({
      where: { publicId, userId, status: { in: ['DRAFT', 'SYNC_FAILED'] } },
      data: {
        status: 'ISSUED',
        cqtCode,
        issuedAt: now,
      },
    });

    if (updatedInvoice.count === 0) {
      this.log.log(LOG_ACTIONS.UPDATE_INVOICE, {
        status: LOG_STATUS.FAILED,
        reason: 'LOCK_INVOICE_FAILED',
        userId,
        invoicePublicId: publicId,
      });
      throw new BadRequestException(
        'Invoice not found or invalid status invoice.',
      );
    }

    await this.auditLog.logChange(
      tx,
      userId,
      'UPDATE',
      tableWrite.invoices,
      internalId,
      { status, cqtCode: null, issuedAt: null },
      { status: 'ISSUED', cqtCode, issuedAt: now },
    );

    this.log.log(LOG_ACTIONS.UPDATE_INVOICE, {
      status: LOG_STATUS.SUCCESS,
      userId,
      invoicePublicId: publicId,
    });

    // GHI VAO SỔ S01 (doanh thu) ------------------
    // Trừ kho (Sổ S05): Ghi nhận việc hàng đã rời kho
    return { ...invoice, status: 'ISSUED', cqtCode, issuedAt: now };
  }

  async createInvoice(userId: string, dto: CreateInvoiceDto) {
    // ─── PRE-FLIGHT CHECKS (Ngoài Transaction để tránh giữ lock DB) ──────────
    this.validateInvoiceB2C(
      dto.isB2C,
      dto.buyerTaxCode,
      dto.buyerAddress,
      dto.buyerName,
    );
    // // Tra cứu tất cả sản phẩm một lần, validate ownership & stock
    const { totalPayment, resolvedItems } =
      await this.validateStockAvailability(userId, dto.details);

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

      const details = await tx.invoiceDetail.findMany({
        where: { invoiceId: invoice.id },
        include: {
          product: {
            select: { publicId: true },
          },
        },
      });
      return mapToDto(InvoiceResponseDto, {
        ...invoice,
        details,
      });
    });
  }

  // service cấp phát mã
  async publishInvoice(publicId: string, userId: string) {
    // Kiểm tra quyền sở hữu và trạng thái (chỉ DRAFT hoặc SYNC_FAILED mới được làm)
    const invoice = await this.validateInvoiceAccess(
      publicId,
      userId,
      'UPDATE',
    );

    // Gọi Mock API
    const result = await this.taxAuthorityService.requestTaxCode(publicId);

    if (result.success) {
      return this.prisma.$transaction(async (tx) => {
        // Nếu thành công -> Chạy hàm lockInvoice
        const res = await this.lockInvoice(invoice, tx, result.cqtCode);
        const year = res.issuedAt.getFullYear();
        // Tính vào doanh thu năm
        await tx.revenueTracker.upsert({
          where: {
            userId_year: { userId, year },
          },
          update: {
            revenueYtd: { increment: res.totalPayment },
          },
          create: {
            userId,
            year,
            revenueYtd: res.totalPayment,
          },
        });
        return mapToDto(InvoiceResponseDto, res);
      });
    } else {
      // Nếu thất bại -> Cập nhật trạng thái SYNC_FAILED để người dùng bấm 'Retry'
      const res = await this.prisma.invoice.update({
        where: { publicId },
        data: { status: 'SYNC_FAILED' },
        omit: { id: true },
      });
      return mapToDto(InvoiceResponseDto, res);
    }
  }

  async findAll(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [total, data] = await Promise.all([
      this.prisma.invoice.count({ where: { userId } }),
      this.prisma.invoice.findMany({
        where: { userId },
        take: limit, // LIMIT
        skip: skip, // OFFSET
        orderBy: { createdAt: 'desc' },
        include: {
          details: {
            include: {
              product: { select: { publicId: true } },
            },
          },
        },
      }),
    ]);

    return {
      data: mapToDto(InvoiceResponseDto, data),
      meta: {
        total,
        page,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  async detailInvoice(userId: string, invPublicId: string) {
    const current = await this.validateInvoiceAccess(
      invPublicId,
      userId,
      'VIEW',
    );
    const response = await this.prisma.invoice.findMany({
      where: { id: current.id },
      orderBy: { createdAt: 'desc' },
      include: {
        details: {
          include: {
            product: { select: { publicId: true } },
          },
        },
      },
    });
    this.log.log('Get detail invoice.', {
      status: LOG_STATUS.SUCCESS,
      userId,
      invoicePublicId: invPublicId,
    });
    return mapToDto(InvoiceResponseDto, response);
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
    // hủy bỏ toàn bộ phiếu thu đối với invoice này
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

      // refund quantity product
      const item = await tx.invoiceDetail.findMany({
        where: { invoiceId: invoice.id },
        select: { productId: true, quantity: true },
      });
      await this.productService.updateStockFromCanceledInvoice(
        tx,
        userId,
        item,
        'INCREMENT',
        invoice.id,
      );

      // Hủy các phiếu thu liên quan
      await this.voucherService.bulkCancelByInvoice(
        tx,
        userId,
        invoice.id,
        'OUTBOUND',
      );

      await this.auditLog.logChange(
        tx,
        userId,
        'UPDATE',
        tableWrite.invoices,
        invoice.id,
        { status: invoice.status },
        { status: 'CANCELED' },
      );
      return mapToDto(InvoiceResponseDto, {
        ...invoice,
        status: InvoiceStatus.CANCELED,
      });
    });
    // Hoàn lại tồn kho trong sổ s05 thong qua details.d._sum.quantity---------------------------
    this.log.log(LOG_ACTIONS.CANCEL_INVOICE, {
      status: LOG_STATUS.SUCCESS,
      userId,
      invoicePublicId: invPublicId,
    });
    return result;
  }
}
