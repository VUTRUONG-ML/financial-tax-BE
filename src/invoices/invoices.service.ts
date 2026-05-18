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
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { moment } from '../common/utils/time.util';

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
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const itemMap = new Map<string, number>();
    for (const i of items) {
      itemMap.set(
        i.productPublicId,
        (itemMap.get(i.productPublicId) ?? 0) + i.quantity,
      );
    }
    const publicIds = Array.from(itemMap.keys());
    const products = await tx.product.findMany({
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
      if (
        product.productType !== 'SERVICE' &&
        product.currentStock < quantity
      ) {
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

  /**
   * Hàm validate trạng thái khi thực hiện một hành động nào đó, hành động UPDATE (thêm, sửa, xóa, issued) thì status phải DRAFT/SYNC_FAILED,
   * hành động CANCELED thì trạng thái phải là ISSUED
   * @param publicId
   * @param userId
   * @param action
   * @param tx
   * @returns Invoice
   */
  private async validateInvoiceAccess(
    publicId: string,
    userId: string,
    action?: 'UPDATE' | 'CANCELED',
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. Tìm hóa đơn và kiểm tra quyền sở hữu ngay trong câu query
    const invoice = await tx.invoice.findUnique({
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
    if (action && action === 'UPDATE') {
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

      if (invoice.status === 'PENDING_ISSUED') {
        this.log.warn('VALIDATE_ACCESS', {
          status: LOG_STATUS.FAILED,
          reason: 'INVOICE_PENDING_ISSUED',
          userId,
          invoicePublicId: publicId,
        });
        throw new ForbiddenException(
          'The invoice is pending tax authority code and cannot be modified.',
        );
      }
    }

    if (action && action === 'CANCELED') {
      if (invoice.status !== 'ISSUED') {
        this.log.warn('VALIDATE_ACCESS', {
          status: LOG_STATUS.FAILED,
          reason: 'CANCELED_INVOICE_DIFFERENCE_ISSUED',
          userId,
          invoicePublicId: publicId,
        });
        throw new ForbiddenException(
          'Cancel invoice when the status is different from ISSUED.',
        );
      }
    }
    return invoice;
  }

  /**
   * Hàm cập nhật trạng thái invoice thành ISSUED
   * @param publicId
   * @param userId
   * @param cqtCode
   * @param tx
   * @returns Invoice
   */
  async lockInvoice(
    publicId: string,
    userId: string,
    cqtCode?: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    /**
     * Khóa trạng thái invoice là issued khi đã được cơ quan thuế cấp mã
     */
    const invoice = await tx.invoice.findUnique({
      where: { publicId },
    });
    if (!invoice) {
      this.log.warn('LOCK_INVOICE', {
        status: LOG_STATUS.FAILED,
        reason: 'INVOICE_NOT_FOUND',
        userId,
        publicId,
      });
      throw new NotFoundException('Invoice not found.');
    }

    if (invoice.status !== 'PENDING_ISSUED') {
      this.log.warn('LOCK_INVOICE', {
        status: LOG_STATUS.FAILED,
        reason: 'STATUS_MUST_HAVE_PENDING_ISSUED',
        userId,
        publicId,
      });
    }

    const now = moment().toDate();
    await tx.invoice.update({
      where: {
        publicId,
      },
      data: {
        status: 'ISSUED',
        cqtCode,
      },
    });

    await this.auditLog.logChange(
      tx,
      userId,
      'UPDATE',
      tableWrite.invoices,
      invoice.id,
      { status: invoice.status, cqtCode: null },
      { status: 'ISSUED', cqtCode },
    );

    this.log.log(LOG_ACTIONS.UPDATE_INVOICE, {
      status: LOG_STATUS.SUCCESS,
      userId,
      invoicePublicId: publicId,
    });

    // GHI VAO SỔ S01 (doanh thu) ------------------
    // Trừ kho (Sổ S05): Ghi nhận việc hàng đã rời kho
    return { ...invoice, status: 'ISSUED', cqtCode };
  }

  /**
   * Tạo hóa đơn DRAFT -
   * Chỉ cộng doanh thu -
   * Không trừ tồn kho -
   * @param userId
   * @param dto
   * @returns InvoiceResponseDto
   */
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

      const nowTime = new Date();
      const activeTaxConfig = await tx.taxConfiguration.findFirst({
        where: {
          userId,
          applyFromDate: { lte: nowTime },
          applyToDate: { gte: nowTime },
        },
        orderBy: { applyFromDate: 'desc' },
      });
      const taxRate = activeTaxConfig
        ? activeTaxConfig.vatRateSnapShot
        : new Decimal(0);
      const taxPayable = new Decimal(totalPayment).mul(taxRate);

      const invoice = await tx.invoice.create({
        data: {
          userId,
          invoiceSymbol,
          isB2C: dto.isB2C ?? true,
          buyerName: dto.buyerName,
          buyerTaxCode: dto.buyerTaxCode,
          buyerAddress: dto.buyerAddress,
          buyerEmail: dto.buyerEmail,
          buyerIdNumber: dto.buyerIdNumber,
          paymentMethod: dto.paymentMethod,
          taxRate,
          taxPayable,
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
          unit: product.unit,
          productType: product.productType,
          unitPrice: product.sellingPrice,
          quantity,
          totalAmount: lineTotal,
        })),
      });

      // 3. Cộng doanh thu lũy kế
      const year = new Date().getFullYear();
      await tx.revenueTracker.upsert({
        where: {
          userId_year: { userId, year },
        },
        update: {
          revenueYtd: { increment: invoice.totalPayment },
        },
        create: {
          userId,
          year,
          revenueYtd: invoice.totalPayment,
        },
      });

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

  /**
   * Service phát hành invoice -
   * Ở đây trừ tồn kho gốc
   * @param publicId
   * @param userId
   * @returns InvoiceResponseDto
   */
  async publishInvoice(publicId: string, userId: string) {
    const yearNow = new Date().getFullYear();

    // 1. Cập nhật trạng thái PENDING_ISSUED / trừ tồn kho, cộng doanh thu trước khi gọi api cơ quan thuế
    const phaseFirst = await this.prisma.$transaction(async (tx) => {
      // Kiểm tra quyền sở hữu và invoice phải ở trạng thái khác ISSUED, CANCELED, hoặc PENDING_ISSUED
      const currentInvoice = await this.validateInvoiceAccess(
        publicId,
        userId,
        'UPDATE',
        tx,
      );
      const details = await tx.invoiceDetail.findMany({
        where: { invoiceId: currentInvoice.id },
        include: {
          product: {
            select: { publicId: true },
          },
        },
      });
      // Validate details
      const items = details.map((d) => {
        return { productPublicId: d.product.publicId, quantity: d.quantity };
      });
      const { totalPayment, resolvedItems } =
        await this.validateStockAvailability(userId, items);
      // Cập nhật pending
      const resPending = await tx.invoice.update({
        where: { publicId },
        data: { status: 'PENDING_ISSUED' },
      });
      await this.auditLog.logChange(
        tx,
        userId,
        'UPDATE',
        tableWrite.invoices,
        resPending.id,
        { status: currentInvoice.status },
        { status: resPending.status },
      );
      // Trừ tồn kho
      for (const { product, quantity } of resolvedItems) {
        if (product.productType === 'SERVICE') continue;
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
            invoiceSymbol: currentInvoice.invoiceSymbol,
          });
          throw new ConflictException(
            `Stock for "${product.productName}" changed during processing. Please retry.`,
          );
        }
      }

      this.log.log(LOG_ACTIONS.INVOICE_CQT_ISSUED + '_PHASE1', {
        status: LOG_STATUS.SUCCESS,
        userId,
        publicId,
      });
    });

    // Gọi Mock API
    const result = await this.taxAuthorityService.requestTaxCode(publicId);

    if (result.success) {
      // Nếu thành công -> Chạy hàm lockInvoice
      const phaseSecond = await this.lockInvoice(
        publicId,
        userId,
        result.cqtCode,
      );
      return mapToDto(InvoiceResponseDto, phaseSecond);
    } else if (result.success === false) {
      // Nếu thất bại -> Cập nhật trạng thái SYNC_FAILED, hoàn trả hàng vào kho để người dùng bấm 'Retry'
      const phaseFinally = await this.prisma.$transaction(async (tx) => {
        const currentInvoice = await tx.invoice.findUnique({
          where: { publicId },
        });
        if (!currentInvoice || currentInvoice.status !== 'PENDING_ISSUED') {
          this.log.warn('ROLLBACK_ISSUED', {
            status: LOG_STATUS.FAILED,
            reason: 'INVOICE_NOT_FOUND_OR_INVALID_STATUS',
            userId,
            publicId,
          });
          throw new BadRequestException(
            'Invalid status invoice while rollback process.',
          );
        }
        const rollbackInvoice = await tx.invoice.update({
          where: { publicId },
          data: { status: 'SYNC_FAILED' },
          include: { details: true },
        });
        const details = rollbackInvoice.details;
        // Hoàn trả tồn kho
        for (const item of details) {
          await tx.product.update({
            where: { id: item.productId },
            data: { currentStock: { increment: item.quantity } },
          });
        }
        return rollbackInvoice;
      });
      return mapToDto(InvoiceResponseDto, phaseFinally);
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
    const current = await this.validateInvoiceAccess(invPublicId, userId);
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
  async canceledInvoice(
    invPublicId: string,
    userId: string,
    cancellationReason: string,
  ) {
    // Kiem tra own
    const invoice = await this.validateInvoiceAccess(
      invPublicId,
      userId,
      'CANCELED',
    );
    // Lấy ra danh sách sản phẩm của invoice đó thông qua details
    // duyệt qua toàn bộ thông tin detail hoàn trả lại số lượng
    // hủy bỏ toàn bộ phiếu thu đối với invoice này
    const result = await this.prisma.$transaction(async (tx) => {
      const updatedInvoice = await tx.invoice.updateMany({
        where: { id: invoice.id, status: 'ISSUED' },
        data: { status: 'CANCELED', cancellationReason },
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

      // Hoàn lại tồn kho
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

      // Trừ doanh thu
      await tx.revenueTracker.update({
        where: {
          userId_year: { userId, year: invoice.issueDate.getFullYear() },
        },
        data: { revenueYtd: { decrement: invoice.totalPayment } },
      });

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

  async updateInvoice(publicId: string, userId: string, dto: UpdateInvoiceDto) {
    // 1. Kiểm tra quyền sở hữu và trạng thái
    const invoice = await this.validateInvoiceAccess(
      publicId,
      userId,
      'UPDATE',
    );

    // 2. Validate thông tin B2C/B2B
    this.validateInvoiceB2C(
      dto.isB2C ?? invoice.isB2C,
      dto.buyerTaxCode ?? invoice.buyerTaxCode ?? undefined,
      dto.buyerAddress ?? invoice.buyerAddress ?? undefined,
      dto.buyerName ?? invoice.buyerName ?? undefined,
    );

    return this.prisma.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { publicId },
        data: {},
      });
      let finalTotalPayment = new Decimal(invoice.totalPayment);
      let finalTaxPayable = new Decimal(invoice.taxPayable);
      let finalTaxRate = new Decimal(invoice.taxRate);

      // 3. Nếu có cập nhật chi tiết hàng hóa
      if (dto.details) {
        // Xóa chi tiết cũ
        await tx.invoiceDetail.deleteMany({
          where: { invoiceId: invoice.id },
        });

        // Validate
        const { totalPayment: newTotalPayment, resolvedItems } =
          await this.validateStockAvailability(userId, dto.details, tx);

        const deltaPayment: Decimal = new Decimal(newTotalPayment).sub(
          invoice.totalPayment,
        );

        // Cập nhật doanh thu năm
        if (deltaPayment.gt(0) || deltaPayment.lt(0)) {
          await tx.revenueTracker.updateMany({
            where: {
              userId,
              year: invoice.issueDate.getFullYear(),
              revenueYtd: { gte: deltaPayment },
            },
            data: { revenueYtd: { increment: deltaPayment } },
          });
        }

        // Tạo chi tiết mới
        const nowTime = new Date();
        const activeTaxConfig = await tx.taxConfiguration.findFirst({
          where: {
            userId,
            applyFromDate: { lte: nowTime },
            applyToDate: { gte: nowTime },
          },
          orderBy: { applyFromDate: 'desc' },
        });
        finalTaxRate = activeTaxConfig
          ? activeTaxConfig.vatRateSnapShot
          : new Decimal(0);
        finalTaxPayable = new Decimal(newTotalPayment).mul(finalTaxRate);

        await tx.invoiceDetail.createMany({
          data: resolvedItems.map(({ product, quantity, lineTotal }) => ({
            invoiceId: invoice.id,
            productId: product.id,
            productNameSnapshot: product.productName,
            unit: product.unit,
            productType: product.productType,
            unitPrice: product.sellingPrice,
            quantity,
            totalAmount: lineTotal,
          })),
        });

        finalTotalPayment = new Decimal(newTotalPayment);
      }

      // 4. Cập nhật Invoice Header
      const updatedInvoice = await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          isB2C: dto.isB2C ?? undefined,
          buyerName: dto.buyerName ?? undefined,
          buyerTaxCode: dto.buyerTaxCode ?? undefined,
          buyerAddress: dto.buyerAddress ?? undefined,

          buyerEmail: dto.buyerEmail ?? undefined,
          buyerIdNumber: dto.buyerIdNumber ?? undefined,
          paymentMethod: dto.paymentMethod ?? undefined,

          taxRate: finalTaxRate,
          taxPayable: finalTaxPayable,
          totalPayment: finalTotalPayment,
        },
      });

      // 5. Ghi log audit
      await this.auditLog.logChange(
        tx,
        userId,
        'UPDATE',
        tableWrite.invoices,
        invoice.id,
        {
          isB2C: invoice.isB2C,
          buyerName: invoice.buyerName,
          totalPayment: invoice.totalPayment,
        },
        {
          isB2C: updatedInvoice.isB2C,
          buyerName: updatedInvoice.buyerName,
          totalPayment: updatedInvoice.totalPayment,
        },
      );

      this.log.log(LOG_ACTIONS.UPDATE_INVOICE, {
        status: LOG_STATUS.SUCCESS,
        userId,
        invoiceId: updatedInvoice.publicId,
        invoiceSymbol: updatedInvoice.invoiceSymbol,
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
        ...updatedInvoice,
        details,
      });
    });
  }

  async delete(publicId: string, userId: string) {
    await this.prisma.$transaction(async (tx) => {
      const invoice = await this.validateInvoiceAccess(
        publicId,
        userId,
        'UPDATE',
        tx,
      );
      // Xóa detail
      await tx.invoiceDetail.deleteMany({
        where: { invoiceId: invoice.id },
      });

      // Trừ doanh thu
      await tx.revenueTracker.updateMany({
        where: {
          userId,
          year: invoice.issueDate.getFullYear(),
          revenueYtd: { gte: invoice.totalPayment },
        },
        data: { revenueYtd: { decrement: invoice.totalPayment } },
      });

      // xóa invoice
      await tx.invoice.delete({
        where: { publicId },
      });

      await this.auditLog.logChange(
        tx,
        userId,
        'DELETE',
        tableWrite.invoices,
        invoice.id,
        invoice,
        null,
        'User delete invoice',
      );
      this.log.log(LOG_ACTIONS.DELETE_INVOICE, {
        status: LOG_STATUS.SUCCESS,
        userId,
        invoiceId: invoice.id,
      });
    });
  }
}
