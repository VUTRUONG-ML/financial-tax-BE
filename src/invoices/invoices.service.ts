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
import {
  InvoiceStatus,
  Prisma,
  Product,
  StockIssueType,
  StockIssueDocument,
} from '@prisma/client';
import { VouchersService } from '../vouchers/vouchers.service';
import { ProductsService } from '../products/products.service';
import { mapToDto } from '../common/utils/mapper.util';
import { InvoiceResponseDto } from './dto/response-invoice.dto';
import { CreateInvoiceDetailDto } from './dto/create-invoice-detail.dto';
import { Decimal } from '@prisma/client/runtime/client';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { moment } from 'src/common/utils/time.util';
import { StocksService } from '../stocks/stocks.service';
import { FinancialPeriodsService } from '../financial-periods/financial-periods.service';
import { TaxAuthorityConnectionsService } from 'src/tax-authority-connections/tax-authority-connections.service';
import { OnboardingService } from '../onboarding/onboarding.service';

@Injectable()
export class InvoicesService {
  private readonly log = new AppLogger(InvoicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly taxConnection: TaxAuthorityConnectionsService,
    private readonly taxAuthorityService: TaxAuthorityService,
    private readonly voucherService: VouchersService,
    private readonly productService: ProductsService,
    private readonly stocksService: StocksService,
    private readonly financialPeriodsService: FinancialPeriodsService,
    private readonly onboardingService: OnboardingService,
  ) { }

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
      include: { taxCategory: true },
    });
    const productMap = new Map(products.map((p) => [p.publicId, p]));
    let totalPayment = 0;
    const resolvedItems: {
      product: any;
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
    action?: 'UPDATE' | 'CANCELED' | 'PUBLISH',
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
      if (
        invoice.status !== 'ISSUED' &&
        invoice.status !== 'SYNC_FAILED' &&
        invoice.status !== 'PENDING_ISSUED'
      ) {
        this.log.warn('VALIDATE_ACCESS', {
          status: LOG_STATUS.FAILED,
          reason: 'CANCELED_INVOICE_DIFFERENCE_ISSUED_OR_SYNC_FAILED',
          userId,
          invoicePublicId: publicId,
        });
        throw new ForbiddenException(
          'Cancel invoice when the status is different from ISSUED or SYNC_FAILED.',
        );
      }
    }

    if (action && action === 'PUBLISH') {
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
    publicId: string,
    userId: string,
    cqtCode?: string,
    txParam?: Prisma.TransactionClient,
  ) {
    const run = async (tx: Prisma.TransactionClient) => {
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
      const updated = await tx.invoice.update({
        where: {
          publicId,
        },
        data: {
          status: 'ISSUED',
          cqtCode,
        },
        include: {
          details: {
            include: {
              product: {
                select: {
                  publicId: true,
                },
              },
            },
          },
        },
      });

      await this.auditLog.logChange(
        tx,
        userId,
        'UPDATE',
        tableWrite.invoices,
        invoice.id,
        {
          status: invoice.status,
          cqtCode: null,
        },
        {
          status: 'ISSUED',
          cqtCode,
        },
      );

      this.log.log('LOCK_INVOICE', {
        status: LOG_STATUS.SUCCESS,
        userId,
        invoicePublicId: publicId,
      });

      // Tăng doanh thu tích lũy trong RevenueTracker YTD của năm cho mọi loại hóa đơn
      const year = updated.issueDate.getFullYear();
      await tx.revenueTracker.upsert({
        where: {
          userId_year: { userId, year },
        },
        update: {
          revenueYtd: { increment: updated.totalPayment },
        },
        create: {
          userId,
          year,
          revenueYtd: updated.totalPayment,
        },
      });

      // Kiểm tra và điều chỉnh TaxGroup dựa trên RevenueTracker YTD của năm
      await this.checkAndAdjustTaxGroup(userId, updated.issueDate, tx);

      return updated;
    };

    if (txParam) {
      return await run(txParam);
    } else {
      return await this.prisma.$transaction(run);
    }
  }

  /**
   * Tự động điều chỉnh nhóm cấu hình thuế của user dựa trên doanh thu lũy kế trong năm (YTD) từ RevenueTracker
   */
  private async checkAndAdjustTaxGroup(
    userId: string,
    invoiceDate: Date,
    tx: Prisma.TransactionClient,
  ) {
    const year = invoiceDate.getFullYear();

    // 1. Tìm cấu hình thuế active hiện tại tại thời điểm hóa đơn kèm thông tin nhóm thuế
    const activeConfig = await tx.taxConfiguration.findFirst({
      where: {
        userId,
        applyFromDate: { lte: invoiceDate },
        applyToDate: { gte: invoiceDate },
      },
      include: {
        taxGroup: true,
      },
    });

    this.log.debug('CHECK_ADJUST_TAX_GROUP',{
        activeConfig
      }
    )
    if (!activeConfig || !activeConfig.taxGroup) return;

    // 2. Lấy doanh thu lũy kế YTD từ RevenueTracker
    const tracker = await tx.revenueTracker.findUnique({
      where: {
        userId_year: { userId, year },
      },
    });

    this.log.debug('CHECK_ADJUST_TAX_GROUP',{
      tracker
    })

    const currentYtdRevenue = tracker?.revenueYtd ? Number(tracker.revenueYtd) : 0;
    const maxRevenue = activeConfig.taxGroup.maxRevenue ? Number(activeConfig.taxGroup.maxRevenue) : null;

    // 3. CHIỀU TĂNG (Upgrade): Doanh thu > maxRevenue của nhóm hiện tại
    if (maxRevenue !== null && currentYtdRevenue > maxRevenue) {
      // Tìm nhóm thuế tiếp theo có dải doanh thu bao phủ currentYtdRevenue
      const nextTaxGroup = await tx.taxGroup.findFirst({
        where: {
          minRevenue: { lte: currentYtdRevenue },
          OR: [
            { maxRevenue: null },
            { maxRevenue: { gte: currentYtdRevenue } },
          ],
        },
        orderBy: { id: 'asc' },
      });

      if (nextTaxGroup && nextTaxGroup.id !== activeConfig.taxGroupId) {
        this.log.debug('CHECK_ADJUST_TAX_GROUP',{
          nextTaxGroup,
        })
        await this.onboardingService.updateTaxConfiguration(
          userId,
          {
            industryId: activeConfig.industryId,
            isOtherIndustry: true,
            taxGroupId: nextTaxGroup.id,
          },
          { isSystemAutoUpgrade: true },
          tx,
        );
        this.log.log('SYSTEM_AUTO_UPGRADE_TAX_GROUP', {
          userId,
          year,
          currentYtdRevenue,
          oldTaxGroupId: activeConfig.taxGroupId,
          newTaxGroupId: nextTaxGroup.id,
        });
      }
    }
  }

  async createInvoice(userId: string, dto: CreateInvoiceDto, periodId: number) {
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

    return this.prisma.$transaction(async (tx) => {
      const invoiceSymbol = generateInvoiceSymbol();

      const targetDate = moment(dto.issueDate).toDate();
      const activeTaxConfig = await tx.taxConfiguration.findFirst({
        where: {
          userId,
          applyFromDate: { lte: targetDate },
          applyToDate: { gte: targetDate },
        },
        orderBy: { applyFromDate: 'desc' },
      });
      const taxRate = activeTaxConfig
        ? activeTaxConfig.vatRateSnapShot
        : new Decimal(0);
      let taxPayableSum = new Decimal(0);
      for (const item of resolvedItems) {
        const itemVatRate = item.product.taxCategory?.vatRate ?? taxRate;
        const itemVat = item.lineTotal.mul(itemVatRate);
        taxPayableSum = taxPayableSum.add(itemVat);
      }
      const taxPayable = taxPayableSum;

      const invoice = await tx.invoice.create({
        data: {
          userId,
          periodId,
          invoiceSymbol,
          isB2C: dto.isB2C ?? true,
          issueDate: new Date(dto.issueDate),
          buyerName: dto.buyerName,
          buyerTaxCode: dto.buyerTaxCode,
          buyerAddress: dto.buyerAddress,
          buyerEmail: dto.buyerEmail,
          buyerIdNumber: dto.buyerIdNumber,
          paymentMethod: dto.paymentMethod,
          taxRate,
          taxPayable,
          totalPayment,
          // status mặc định DRAFT
        },
      });

      // 2. Tạo các InvoiceDetail (line items) với snapshot bất biến
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

      // 3. Draft invoices do not deduct stock (Stock is only deducted on Publish).

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
   * @param publicId
   * @param userId
   * @returns InvoiceResponseDto
   */
  async publishInvoice(
    publicId: string,
    userId: string,
    requestCqtCode?: boolean,
  ) {
    // 1. Cập nhật trạng thái PENDING_ISSUED / trừ tồn kho, cộng doanh thu trước khi gọi api cơ quan thuế
    const currentInvoice = await this.prisma.$transaction(async (tx) => {
      // Kiểm tra quyền sở hữu và invoice phải ở trạng thái khác ISSUED, CANCELED, hoặc PENDING_ISSUED
      const invoice = await this.validateInvoiceAccess(
        publicId,
        userId,
        'PUBLISH',
        tx,
      );
      const details = await tx.invoiceDetail.findMany({
        where: { invoiceId: invoice.id },
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
        { status: invoice.status },
        { status: resPending.status },
      );

      // Trừ tồn kho & Tạo phiếu xuất kho (StockIssue) nếu chưa có
      const existingIssue = await tx.stockIssue.findFirst({
        where: {
          sourceDocumentType: 'INVOICE',
          sourceDocumentId: invoice.id,
          status: { not: 'CANCELLED' },
        },
      });

      if (!existingIssue) {
        const stockItems = resolvedItems.filter(
          ({ product }) =>
            product.productType !== 'SERVICE' && product.isInventoryTracked,
        );

        if (stockItems.length > 0) {
          await this.stocksService.createStockIssue(
            userId,
            {
              issueType: StockIssueType.SALE,
              issueDate: invoice.issueDate.toISOString(),
              sourceDocumentType: StockIssueDocument.INVOICE,
              sourceDocumentId: invoice.id,
              products: stockItems.map(({ product, quantity }) => ({
                productPublicId: product.publicId,
                quantity,
              })),
            },
            invoice.periodId,
            tx,
          );
        }
      }

      // Tự động tạo phiếu thu (Receipt Voucher) nếu chưa tồn tại
      const existingVoucher = await tx.voucher.findFirst({
        where: {
          outboundInvoiceId: invoice.id,
          status: 'ACTIVE',
        },
      });

      if (!existingVoucher) {
        const category = await tx.voucherCategory.findUnique({
          where: {
            systemTag: 'RECEIPT_SALES',
          },
        });
        if (!category) {
          throw new NotFoundException(
            'System voucher category "RECEIPT_SALES" not found',
          );
        }

        await this.voucherService.create(
          userId,
          {
            voucherType: 'RECEIPT',
            categoryId: category.id,
            content: `Thu tiền bán hàng hóa đơn ${invoice.invoiceSymbol}`,
            amount: invoice.totalPayment,
            paymentMethod: invoice.paymentMethod,
            transactionAt: invoice.issueDate.toISOString(),
            contactName: invoice.buyerName || undefined,
            isDeductibleExpense: false,
            outboundInvoicePublicId: invoice.publicId,
          },
          tx,
        );
      }

      this.log.log(LOG_ACTIONS.INVOICE_CQT_ISSUED + '_PHASE1', {
        status: LOG_STATUS.SUCCESS,
        userId,
        publicId,
      });

      return invoice;
    });

    const activeTaxConfig = await this.prisma.taxConfiguration.findFirst({
      where: {
        userId,
        applyFromDate: { lte: currentInvoice.issueDate },
        applyToDate: { gte: currentInvoice.issueDate },
      },
    });
    this.log.debug('PUBLISH_INVOICE', {
      userId,
      activeTaxConfig,
    });
    const taxGroupId = activeTaxConfig?.taxGroupId ?? 1; // 1 là mức miễn thuế
    const needsCqt = taxGroupId !== 1 || !!requestCqtCode;

    if (needsCqt) {
      // Fetch the user's taxCode to pass it as C5_C9
      const infoVerified = await this.taxConnection.verifyConnection(userId);

      this.log.debug('VERIFY_ACCOUNT_PUBLISH_INV',{
        status: LOG_STATUS.SUCCESS,
        publicId,
        userId,
      });

      // Gọi Mock API
      const result = await this.taxAuthorityService.requestTaxCode(
        publicId,
        infoVerified.cashRegisterCode,
      );

      if (result.success) {
        this.log.log(LOG_ACTIONS.INVOICE_CQT_ISSUED + '_RESULT_SUCCESS', {
          status: LOG_STATUS.SUCCESS,
          userId,
          publicId,
        });

        // Nếu thành công -> Chạy hàm lockInvoice
        const phaseSecond = await this.lockInvoice(
          publicId,
          userId,
          result.cqtCode,
        );
        return mapToDto(InvoiceResponseDto, phaseSecond);
      } else {
        this.log.log(LOG_ACTIONS.INVOICE_CQT_ISSUED + '_RESULT_FAILED', {
          status: LOG_STATUS.SUCCESS,
          userId,
          publicId,
        });
        const phaseFinally = await this.prisma.$transaction(async (tx) => {
          const currentInv = await tx.invoice.findUnique({
            where: { publicId },
          });
          if (!currentInv || currentInv.status !== 'PENDING_ISSUED') {
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
          return rollbackInvoice;
        });
        return mapToDto(InvoiceResponseDto, phaseFinally);
      }
    } else {
      // Không cần cấp mã CQT -> Trực tiếp chuyển thành ISSUED
      const phaseSecond = await this.lockInvoice(publicId, userId);
      return mapToDto(InvoiceResponseDto, phaseSecond);
    }
  }

  async findAll(
    userId: string,
    page: number = 1,
    limit: number = 20,
    status?: string,
  ) {
    const skip = (page - 1) * limit;

    const where: Prisma.InvoiceWhereInput = { userId };

    if (status) {
      const upperStatus = status.trim().toUpperCase();
      if (
        upperStatus === 'DRAFT' ||
        upperStatus === 'BAN_NHAP' ||
        upperStatus === 'BẢN NHÁP'
      ) {
        where.status = 'DRAFT';
      } else if (
        upperStatus === 'ISSUED' ||
        upperStatus === 'DA_PHAT_HANH' ||
        upperStatus === 'ĐÃ PHÁT HÀNH'
      ) {
        where.status = 'ISSUED';
      } else if (
        upperStatus === 'SYNC_FAILED' ||
        upperStatus === 'LOI_DONG_BO' ||
        upperStatus === 'LỖI ĐỒNG BỘ'
      ) {
        where.status = 'SYNC_FAILED';
      } else if (
        upperStatus === 'CANCELED' ||
        upperStatus === 'DA_HUY' ||
        upperStatus === 'ĐÃ HỦY'
      ) {
        where.status = 'CANCELED';
      }
    }

    const [total, data] = await Promise.all([
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.findMany({
        where,
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

    console.log('length',data.length);
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

    const result = await this.prisma.$transaction(async (tx) => {
      const updatedInvoice = await tx.invoice.updateMany({
        where: {
          id: invoice.id,
          status: { in: ['ISSUED', 'SYNC_FAILED', 'PENDING_ISSUED'] },
        },
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

      // Hoàn lại tồn kho bằng cách hủy StockIssue
      const stockIssue = await tx.stockIssue.findFirst({
        where: {
          sourceDocumentType: 'INVOICE',
          sourceDocumentId: invoice.id,
          status: { not: 'CANCELLED' },
        },
      });

      if (stockIssue) {
        await this.stocksService.cancelIssue(
          userId,
          stockIssue.periodId,
          stockIssue.issueCode,
          true,
          tx,
        );
      }

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

      // Giảm doanh thu tích lũy trong RevenueTracker YTD của năm khi hủy hóa đơn (chỉ khi hóa đơn trước đó đã ISSUED)
      if (invoice.status === 'ISSUED') {
        const year = invoice.issueDate.getFullYear();
        await tx.revenueTracker.updateMany({
          where: {
            userId,
            year,
            revenueYtd: { gte: invoice.totalPayment },
          },
          data: {
            revenueYtd: { decrement: invoice.totalPayment },
          },
        });
      }

      // Kiểm tra và điều chỉnh TaxGroup dựa trên RevenueTracker YTD của năm
      await this.checkAndAdjustTaxGroup(userId, invoice.issueDate, tx);

      return mapToDto(InvoiceResponseDto, {
        ...invoice,
        status: InvoiceStatus.CANCELED,
      });
    });

    this.log.log(LOG_ACTIONS.CANCEL_INVOICE, {
      status: LOG_STATUS.SUCCESS,
      userId,
      invoicePublicId: invPublicId,
    });
    return result;
  }

  async updateInvoice(
    publicId: string,
    userId: string,
    dto: UpdateInvoiceDto,
    periodId: number,
  ) {
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
      // Hoàn lại tồn kho bằng cách hủy StockIssue nếu có trước khi cập nhật chi tiết mới
      const stockIssue = await tx.stockIssue.findFirst({
        where: {
          sourceDocumentType: 'INVOICE',
          sourceDocumentId: invoice.id,
          status: { not: 'CANCELLED' },
        },
      });

      if (stockIssue) {
        await this.stocksService.cancelIssue(
          userId,
          stockIssue.periodId,
          stockIssue.issueCode,
          true,
          tx,
        );
      }

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

        // Tạo chi tiết mới
        const targetDate = moment(dto.issueDate ?? invoice.issueDate)
          .startOf('day')
          .toDate();
        const activeTaxConfig = await tx.taxConfiguration.findFirst({
          where: {
            userId,
            applyFromDate: { lte: targetDate },
            applyToDate: { gte: targetDate },
          },
          orderBy: { applyFromDate: 'desc' },
        });
        finalTaxRate = activeTaxConfig
          ? activeTaxConfig.vatRateSnapShot
          : new Decimal(0);
        let taxPayableSum = new Decimal(0);
        for (const item of resolvedItems) {
          const itemVatRate = item.product.taxCategory?.vatRate ?? finalTaxRate;
          const itemVat = item.lineTotal.mul(itemVatRate);
          taxPayableSum = taxPayableSum.add(itemVat);
        }
        finalTaxPayable = taxPayableSum;

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
          issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
          periodId: periodId,

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

      // Hoàn lại tồn kho bằng cách hủy StockIssue nếu có trước khi xóa
      const stockIssue = await tx.stockIssue.findFirst({
        where: {
          sourceDocumentType: 'INVOICE',
          sourceDocumentId: invoice.id,
          status: { not: 'CANCELLED' },
        },
      });

      if (stockIssue) {
        await this.stocksService.cancelIssue(
          userId,
          stockIssue.periodId,
          stockIssue.issueCode,
          true,
          tx,
        );
      }

      // Xóa detail
      await tx.invoiceDetail.deleteMany({
        where: { invoiceId: invoice.id },
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

  async getSummary(userId: string) {
    const [tong_hoa_don, aggregateResult] = await Promise.all([
      this.prisma.invoice.count({
        where: { userId },
      }),
      this.prisma.invoice.aggregate({
        where: { userId, status: {in: ['PENDING_ISSUED', 'ISSUED', 'SYNC_FAILED']} },
        _sum: {
          totalPayment: true,
          taxPayable: true,
        },
      }),
    ]);

    const tong_doanh_thu = aggregateResult._sum.totalPayment
      ? Number(aggregateResult._sum.totalPayment)
      : 0;
    const tong_thue = aggregateResult._sum.taxPayable
      ? Number(aggregateResult._sum.taxPayable)
      : 0;

    return {
      tong_hoa_don,
      tong_doanh_thu,
      tong_thue,
    };
  }
}
