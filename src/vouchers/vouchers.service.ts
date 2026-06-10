import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateVoucherDto } from './dto/create-voucher.dto';
import { UpdateVoucherDto } from './dto/update-voucher.dto';
import { PrismaService } from '../core/prisma/prisma.service';
import {
  LOG_ACTIONS,
  LOG_STATUS,
} from '../common/constants/log-events.constant';
import {
  InboundInvoiceStatus,
  InvoiceStatus,
  PaymentMethod,
  Prisma,
  Voucher,
  VoucherStatus,
  VoucherType,
} from '@prisma/client';
import { AppLogger } from '../common/logger/app-logger.service';
import {
  AuditLogService,
  tableWrite,
} from '../core/audit-log/audit-log.service';
import { Decimal } from '@prisma/client/runtime/client';
import { mapToDto } from 'src/common/utils/mapper.util';
import { VoucherResponseDto } from './dto/response-voucher-dto';
import { moment } from '../common/utils/time.util';

@Injectable()
export class VouchersService {
  private readonly log = new AppLogger(VouchersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  private calculateNewPaymentState(
    currentPaid: Decimal,
    total: Decimal,
    addAmount: Decimal,
  ) {
    const newTotalPaid = currentPaid.add(addAmount);

    if (newTotalPaid.gt(total)) {
      throw new BadRequestException(
        'The total amount collected exceeded the total amount on the invoice.',
      );
    }

    return {
      newTotalPaid,
      isPaid: newTotalPaid.eq(total),
    };
  }

  private async resolveVoucherType(
    tx: Prisma.TransactionClient,
    userId: string,
    voucherType: VoucherType,
    amount: Decimal,
    paymentMethod: PaymentMethod,
    isDeductibleExpense?: boolean,
    inInvoicePublicId?: string,
    outInvoicePublicId?: string,
  ) {
    if (inInvoicePublicId && outInvoicePublicId) {
      throw new BadRequestException(
        'A single voucher cannot be used to issue two different invoices.',
      );
    }
    if (
      (outInvoicePublicId && voucherType === VoucherType.PAYMENT) ||
      (inInvoicePublicId && voucherType === VoucherType.RECEIPT)
    )
      throw new ConflictException('Invalid voucher type.');

    // ------------Trường hợp là hóa đơn xuất kho---------------------------------------
    if (outInvoicePublicId && voucherType === VoucherType.RECEIPT) {
      const currentOutInvoice = await tx.invoice.findUnique({
        where: { publicId: outInvoicePublicId },
      });
      if (!currentOutInvoice)
        throw new NotFoundException('Outbound invoice not found.');
      if (currentOutInvoice.userId !== userId) {
        throw new ForbiddenException('You do not have access invoice.');
      }

      if (currentOutInvoice.status === InvoiceStatus.CANCELED)
        throw new BadRequestException('Invoice canceled.');

      if (currentOutInvoice.isPaid)
        throw new BadRequestException('The invoice has been paid in full.');

      const { isPaid, newTotalPaid } = this.calculateNewPaymentState(
        currentOutInvoice.paidAmount,
        currentOutInvoice.totalPayment,
        amount,
      );
      const result = await tx.invoice.updateMany({
        where: { publicId: outInvoicePublicId, userId, isPaid: false },
        data: {
          paidAmount: newTotalPaid,
          isPaid,
        },
      });
      if (result.count === 0) {
        this.log.debug('UPDATE_PAYMENT_STATUS_INVOICE', {
          status: LOG_STATUS.FAILED,
          userId,
          invoicePublicId: outInvoicePublicId,
        });
        throw new ConflictException(
          'Error updating payment status for invoice.',
        );
      }
      await this.auditLog.logChange(
        tx,
        userId,
        'UPDATE',
        tableWrite.invoices,
        currentOutInvoice.id,
        { isPaid: false, paidAmount: currentOutInvoice.paidAmount },
        {
          isPaid,
          paidAmount: newTotalPaid,
        },
      );
      this.log.debug('UPDATE_PAYMENT_STATUS_INVOICE', {
        status: LOG_STATUS.SUCCESS,
        userId,
        invoicePublicId: outInvoicePublicId,
      });
      return { id: currentOutInvoice.id, type: 'OUTBOUND' };
    }

    // Theo Luật Thuế, giao dịch từ 5 triệu VNĐ trở lên bắt buộc phải chuyển khoản (BANK) để được tính vào chi phí hợp lý.
    if (
      isDeductibleExpense &&
      paymentMethod === PaymentMethod.CASH &&
      amount.gte(5_000_000)
    ) {
      throw new BadRequestException({
        message:
          'Transactions of 5 million VND or more must be made via bank transfer.',
        errorCode: 'INVALID_TAX_DEDUCTIBLE_METHOD',
      });
    }

    // ------------Trường hợp là hóa đơn nhập kho---------------------------------------
    if (inInvoicePublicId && voucherType === VoucherType.PAYMENT) {
      const currentInboundInvoice = await tx.inboundInvoice.findUnique({
        where: { publicId: inInvoicePublicId },
      });
      if (!currentInboundInvoice)
        throw new NotFoundException('Inbound invoice not found.');
      if (currentInboundInvoice.userId !== userId)
        throw new ForbiddenException(
          'You do not have access outbound invoice.',
        );
      if (currentInboundInvoice.status === InboundInvoiceStatus.CANCELED)
        throw new BadRequestException('Inbound invoice canceled.');
      if (currentInboundInvoice.isPaid)
        throw new BadRequestException('The invoice has been paid in full.');

      const { newTotalPaid, isPaid } = this.calculateNewPaymentState(
        currentInboundInvoice.paidAmount,
        currentInboundInvoice.totalAmount,
        amount,
      );
      const result = await tx.inboundInvoice.updateMany({
        where: { publicId: inInvoicePublicId, userId, isPaid: false },
        data: {
          paidAmount: newTotalPaid,
          isPaid,
        },
      });
      if (result.count === 0) {
        this.log.debug('UPDATE_PAYMENT_STATUS_INBOUND_INVOICE', {
          status: LOG_STATUS.FAILED,
          userId,
          invoicePublicId: inInvoicePublicId,
        });
        throw new ConflictException(
          'Error updating payment status for inbound invoice.',
        );
      }
      await this.auditLog.logChange(
        tx,
        userId,
        'UPDATE',
        tableWrite.inboundInvoice,
        currentInboundInvoice.id,
        {
          isPaid: false,
          paidAmount: currentInboundInvoice.paidAmount,
        },
        {
          isPaid,
          paidAmount: newTotalPaid,
        },
      );
      this.log.debug('UPDATE_PAYMENT_STATUS_INBOUND_INVOICE', {
        status: LOG_STATUS.SUCCESS,
        userId,
        invoicePublicId: inInvoicePublicId,
      });

      return { id: currentInboundInvoice.id, type: 'INBOUND' };
    }
  }

  private async revertInvoicePayment(
    voucher: Voucher,
    tx: Prisma.TransactionClient,
  ) {
    if (
      voucher.voucherType === VoucherType.RECEIPT &&
      voucher.outboundInvoiceId &&
      voucher.amount.gt(0)
    ) {
      const { amount } = voucher;
      const invoice = await tx.invoice.findUnique({
        where: { id: voucher.outboundInvoiceId },
      });
      if (!invoice)
        throw new NotFoundException(
          'Outbound invoice not found for this voucher.',
        );

      if (invoice.paidAmount.lessThan(amount))
        throw new ConflictException('Amount of voucher invalid.');

      const updatedInvoice = await tx.invoice.update({
        where: { id: voucher.outboundInvoiceId },
        data: { paidAmount: { decrement: amount }, isPaid: false },
      });
      await this.auditLog.logChange(
        tx,
        voucher.userId,
        'UPDATE',
        tableWrite.invoices,
        updatedInvoice.id,
        { paidAmount: invoice.paidAmount, isPaid: invoice.isPaid },
        {
          paidAmount: updatedInvoice.paidAmount,
          isPaid: updatedInvoice.isPaid,
        },
      );
      this.log.debug('REFUND_AMOUNT_INVOICE', {
        status: LOG_STATUS.SUCCESS,
        invoiceId: voucher.outboundInvoiceId,
        voucherCode: voucher.voucherCode,
        userId: voucher.userId,
      });
    }
    if (
      voucher.voucherType === VoucherType.PAYMENT &&
      voucher.inboundInvoiceId &&
      voucher.amount.gt(0)
    ) {
      const { amount } = voucher;
      const invoice = await tx.inboundInvoice.findUnique({
        where: { id: voucher.inboundInvoiceId },
      });
      if (!invoice)
        throw new NotFoundException(
          'Inbound invoice not found for this voucher.',
        );

      if (invoice.paidAmount.lessThan(amount))
        throw new ConflictException('Amount of voucher invalid.');

      const updatedInvoice = await tx.inboundInvoice.update({
        where: { id: voucher.inboundInvoiceId },
        data: { paidAmount: { decrement: amount }, isPaid: false },
      });
      await this.auditLog.logChange(
        tx,
        voucher.userId,
        'UPDATE',
        tableWrite.inboundInvoice,
        updatedInvoice.id,
        { paidAmount: invoice.paidAmount, isPaid: invoice.isPaid },
        {
          paidAmount: updatedInvoice.paidAmount,
          isPaid: updatedInvoice.isPaid,
        },
      );
      this.log.debug('REFUND_AMOUNT_INBOUND_INVOICE', {
        status: LOG_STATUS.SUCCESS,
        invoiceId: voucher.inboundInvoiceId,
        voucherCode: voucher.voucherCode,
        userId: voucher.userId,
      });
    }
  }

  async create(userId: string, createVoucherDto: CreateVoucherDto) {
    const result = await this.prisma.$transaction(
      async (tx) => {
        // --- BƯỚC KHÓA CHIẾN THUẬT ---
        // Khóa dòng User này lại. Bất kỳ request nào của cùng userId
        // chạy đến đây sẽ phải xếp hàng chờ ở đây trước khi làm bất cứ việc gì.
        await tx.$executeRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
        // Validation: Check category existence and bounds
        const category = await tx.voucherCategory.findUnique({
          where: { id: createVoucherDto.categoryId },
        });

        if (!category) {
          throw new BadRequestException('Voucher category not found');
        }

        if (
          (category.userId !== null && category.userId !== userId) ||
          category.type !== createVoucherDto.voucherType
        ) {
          throw new BadRequestException('Invalid voucher category');
        }

        const invoice = await this.resolveVoucherType(
          tx,
          userId,
          createVoucherDto.voucherType,
          createVoucherDto.amount,
          createVoucherDto.paymentMethod,
          createVoucherDto.isDeductibleExpense,
          createVoucherDto.inboundInvoicePublicId,
          createVoucherDto.outboundInvoicePublicId,
        );

        // Generate Voucher Code: PT/PC-MMYY-0001
        const transactionDate = new Date(createVoucherDto.transactionAt);
        const mm = (transactionDate.getMonth() + 1).toString().padStart(2, '0');
        const yy = transactionDate.getFullYear().toString().slice(-2);
        const mmyy = `${mm}${yy}`;

        const prefix = createVoucherDto.voucherType === 'RECEIPT' ? 'PT' : 'PC';

        // Sử dụng mảng để nhận kết quả từ $queryRaw
        const vouchers: { voucher_code: string }[] = await tx.$queryRaw`
          SELECT voucher_code FROM vouchers 
          WHERE user_id = ${userId} 
            AND voucher_type = ${createVoucherDto.voucherType}
            AND voucher_code LIKE ${prefix + '-' + mmyy + '-%'}
          ORDER BY id DESC
          LIMIT 1
        `;
        let nextNumber = 1;
        // Kiểm tra xem mảng có phần tử nào không
        if (vouchers.length > 0) {
          const lastVoucher = vouchers[0]; // Lấy phần tử đầu tiên
          const parts = lastVoucher.voucher_code.split('-');
          if (parts.length === 3) {
            nextNumber = parseInt(parts[2], 10) + 1;
          }
        }

        const seq = nextNumber.toString().padStart(4, '0');
        const voucherCode = `${prefix}-${mmyy}-${seq}`;

        // Insert Voucher
        const voucher = await tx.voucher.create({
          data: {
            userId,
            voucherCode,
            voucherType: createVoucherDto.voucherType,
            transactionAt: transactionDate,
            categoryId: createVoucherDto.categoryId,
            content: createVoucherDto.content,
            amount: createVoucherDto.amount,
            paymentMethod: createVoucherDto.paymentMethod,
            contactName: createVoucherDto.contactName ?? null,
            isDeductibleExpense: createVoucherDto.isDeductibleExpense ?? false,
            inboundInvoiceId: invoice?.type === 'INBOUND' ? invoice.id : null,
            outboundInvoiceId: invoice?.type === 'OUTBOUND' ? invoice.id : null,
          },
          include: {
            category: true,
            inboundInvoice: {
              select: { publicId: true, invoiceNo: true },
            },
            outBoundInvoice: {
              select: { publicId: true, invoiceSymbol: true },
            },
          },
        });

        await this.auditLog.logChange(
          tx,
          userId,
          'CREATE',
          tableWrite.vouchers,
          voucher.id,
          null,
          voucher,
        );

        return voucher;
      },
      {
        maxWait: 5000, // Thời gian tối đa chờ để lấy được connection
        timeout: 15000, // Thời gian tối đa để thực hiện xong toàn bộ Transaction (15 giây)
      },
    );

    this.log.log(LOG_ACTIONS.CREATE_VOUCHER, {
      status: LOG_STATUS.SUCCESS,
      userId,
      voucherId: result.id,
      voucherCode: result.voucherCode,
    });

    return mapToDto(VoucherResponseDto, result);
  }

  async findAll(
    userId: string,
    page: number = 1,
    limit: number = 20,
    fromDate?: string,
  ) {
    const skip = (page - 1) * limit;
    const where: Prisma.VoucherWhereInput = { userId };

    if (fromDate) {
      const { startDate, endDate } = this.parsePeriod(fromDate);
      where.transactionAt = {
        gte: startDate,
        lte: endDate,
      };
    }

    const [total, vouchers] = await Promise.all([
      this.prisma.voucher.count({
        where,
      }),
      this.prisma.voucher.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          category: true,
        },
      }),
    ]);
    return {
      data: mapToDto(VoucherResponseDto, vouchers),
      meta: { total, page, lastPage: Math.ceil(total / limit) },
    };
  }

  async findOne(userId: string, voucherCode: string) {
    const voucher = await this.prisma.voucher.findUnique({
      where: { userId_voucherCode: { userId, voucherCode } },
      include: {
        category: true,
        inboundInvoice: {
          select: { publicId: true, invoiceNo: true },
        },
        outBoundInvoice: {
          select: { publicId: true, invoiceSymbol: true },
        },
      },
    });

    if (!voucher || voucher.userId !== userId) {
      throw new NotFoundException('Voucher not found');
    }

    return mapToDto(VoucherResponseDto, voucher);
  }

  async update(
    userId: string,
    voucherCode: string,
    updateVoucherDto: UpdateVoucherDto,
  ) {
    return await this.prisma.$transaction(async (tx) => {
      const existing = await tx.voucher.findUnique({
        where: { userId_voucherCode: { userId, voucherCode } },
        include: {
          inboundInvoice: true,
          outBoundInvoice: true,
        },
      });

      if (!existing || existing.userId !== userId) {
        throw new NotFoundException('Voucher not found');
      }

      if (existing.status === VoucherStatus.CANCELED) {
        throw new BadRequestException('Cannot update a canceled voucher');
      }

      const isLinked =
        existing.inboundInvoiceId !== null ||
        existing.outboundInvoiceId !== null;

      if (isLinked) {
        // Locked fields check: voucherType, amount, inboundInvoicePublicId, outboundInvoicePublicId, isDeductibleExpense
        const hasVoucherTypeChange =
          updateVoucherDto.voucherType !== undefined &&
          updateVoucherDto.voucherType !== existing.voucherType;

        const hasAmountChange =
          updateVoucherDto.amount !== undefined &&
          !new Decimal(updateVoucherDto.amount).eq(existing.amount);

        const hasInboundLinkChange =
          updateVoucherDto.inboundInvoicePublicId !== undefined &&
          updateVoucherDto.inboundInvoicePublicId !==
            existing.inboundInvoice?.publicId;

        const hasOutboundLinkChange =
          updateVoucherDto.outboundInvoicePublicId !== undefined &&
          updateVoucherDto.outboundInvoicePublicId !==
            existing.outBoundInvoice?.publicId;

        const hasIsDeductibleChange =
          updateVoucherDto.isDeductibleExpense !== undefined &&
          updateVoucherDto.isDeductibleExpense !== existing.isDeductibleExpense;

        if (
          hasVoucherTypeChange ||
          hasAmountChange ||
          hasInboundLinkChange ||
          hasOutboundLinkChange ||
          hasIsDeductibleChange
        ) {
          throw new BadRequestException(
            'Cannot update voucherType, amount, invoice links, or deductible status when the voucher is linked to an invoice.',
          );
        }
      }

      const newVoucherType =
        updateVoucherDto.voucherType ?? existing.voucherType;
      const newAmount =
        updateVoucherDto.amount !== undefined
          ? new Decimal(updateVoucherDto.amount)
          : existing.amount;
      const newPaymentMethod =
        updateVoucherDto.paymentMethod ?? existing.paymentMethod;
      const newIsDeductibleExpense =
        updateVoucherDto.isDeductibleExpense ?? existing.isDeductibleExpense;

      // Category Validation
      const newCategoryId = updateVoucherDto.categoryId ?? existing.categoryId;
      const category = await tx.voucherCategory.findUnique({
        where: { id: newCategoryId },
      });

      if (
        !category ||
        (category.userId !== null && category.userId !== userId) ||
        category.type !== newVoucherType
      ) {
        throw new BadRequestException('Invalid voucher category');
      }

      // Check 5 million bank transfer rule
      if (
        newIsDeductibleExpense &&
        newPaymentMethod === PaymentMethod.CASH &&
        newAmount.gte(5_000_000)
      ) {
        throw new BadRequestException({
          message:
            'Transactions of 5 million VND or more must be made via bank transfer.',
          errorCode: 'INVALID_TAX_DEDUCTIBLE_METHOD',
        });
      }

      // Handle invoice link changes for unlinked voucher
      const newInboundInvoicePublicId = updateVoucherDto.inboundInvoicePublicId;
      const newOutboundInvoicePublicId =
        updateVoucherDto.outboundInvoicePublicId;

      let invoice: { id: number; type: string } | undefined = undefined;
      if (newInboundInvoicePublicId || newOutboundInvoicePublicId) {
        invoice = await this.resolveVoucherType(
          tx,
          userId,
          newVoucherType,
          newAmount,
          newPaymentMethod,
          newIsDeductibleExpense,
          newInboundInvoicePublicId || undefined,
          newOutboundInvoicePublicId || undefined,
        );
      }

      const updateData: any = {
        ...updateVoucherDto,
      };
      if (invoice) {
        updateData.inboundInvoiceId =
          invoice.type === 'INBOUND' ? invoice.id : null;
        updateData.outboundInvoiceId =
          invoice.type === 'OUTBOUND' ? invoice.id : null;
      }
      delete updateData.inboundInvoicePublicId;
      delete updateData.outboundInvoicePublicId;

      const updated = await tx.voucher.update({
        where: { userId_voucherCode: { userId, voucherCode } },
        data: updateData,
        include: {
          inboundInvoice: {
            select: { publicId: true, invoiceNo: true },
          },
          outBoundInvoice: {
            select: { publicId: true, invoiceSymbol: true },
          },
          category: true,
        },
      });

      await this.auditLog.logChange(
        tx,
        userId,
        'UPDATE',
        tableWrite.vouchers,
        updated.id,
        {
          ...(updateVoucherDto.categoryId && {
            categoryId: existing.categoryId,
          }),
          ...(updateVoucherDto.content && { content: existing.content }),
          ...(updateVoucherDto.isDeductibleExpense !== undefined && {
            isDeductibleExpense: existing.isDeductibleExpense,
          }),
          ...(updateVoucherDto.paymentMethod && {
            paymentMethod: existing.paymentMethod,
          }),
          ...(updateVoucherDto.voucherType && {
            voucherType: existing.voucherType,
          }),
          ...(updateVoucherDto.amount && {
            amount: existing.amount,
          }),
        },
        {
          ...updateVoucherDto,
        },
      );

      this.log.log(LOG_ACTIONS.UPDATE_VOUCHER, {
        status: LOG_STATUS.SUCCESS,
        userId,
        voucherCode,
      });
      return mapToDto(VoucherResponseDto, updated);
    });
  }

  async cancel(userId: string, voucherCode: string) {
    return await this.prisma.$transaction(async (tx) => {
      const existing = await tx.voucher.findUnique({
        where: { userId_voucherCode: { userId, voucherCode } },
      });

      if (!existing) {
        throw new NotFoundException('Voucher not found');
      }

      if (existing.status === VoucherStatus.CANCELED) {
        throw new BadRequestException('Voucher is already canceled');
      }

      const result = await tx.voucher.updateMany({
        where: {
          id: existing.id,
          status: VoucherStatus.ACTIVE,
        },
        data: {
          status: VoucherStatus.CANCELED,
        },
      });

      if (result.count === 0) {
        this.log.warn(LOG_ACTIONS.CANCEL_VOUCHER, {
          status: LOG_STATUS.FAILED,
          reason: 'RACE_CONDITION',
          userId,
          voucherCode,
        });
        throw new BadRequestException(
          'The voucher does not exist or has already been processed.',
        );
      }

      await this.revertInvoicePayment(existing, tx);

      await this.auditLog.logChange(
        tx,
        userId,
        'UPDATE',
        tableWrite.vouchers,
        existing.id,
        { status: VoucherStatus.ACTIVE },
        { status: VoucherStatus.CANCELED },
      );

      this.log.log(LOG_ACTIONS.CANCEL_VOUCHER, {
        status: LOG_STATUS.SUCCESS,
        voucherCode,
        userId,
      });
      return mapToDto(VoucherResponseDto, {
        ...existing,
        status: VoucherStatus.CANCELED,
      });
    });
  }

  async remove(userId: string, voucherCode: string) {
    return await this.prisma.$transaction(async (tx) => {
      const existing = await tx.voucher.findUnique({
        where: { userId_voucherCode: { userId, voucherCode } },
      });

      if (!existing) {
        throw new NotFoundException('Voucher not found');
      }

      if (
        existing.inboundInvoiceId !== null ||
        existing.outboundInvoiceId !== null
      ) {
        throw new BadRequestException(
          'Voucher is linked to an invoice and cannot be deleted.',
        );
      }

      await tx.voucher.delete({
        where: { id: existing.id },
      });

      await this.auditLog.logChange(
        tx,
        userId,
        'DELETE',
        tableWrite.vouchers,
        existing.id,
        existing,
        null,
      );

      this.log.log(LOG_ACTIONS.DELETE_VOUCHER, {
        status: LOG_STATUS.SUCCESS,
        voucherCode,
        userId,
      });

      return { message: 'Voucher deleted successfully.' };
    });
  }

  async bulkCancelByInvoice(
    tx: Prisma.TransactionClient,
    userId: string,
    invoiceId: number,
    type: 'INBOUND' | 'OUTBOUND',
  ) {
    // Xác định cột cần filter dựa trên loại hóa đơn
    const whereField =
      type === 'OUTBOUND' ? 'outboundInvoiceId' : 'inboundInvoiceId';

    const result = await tx.voucher.updateMany({
      where: {
        [whereField]: invoiceId,
        userId,
        status: VoucherStatus.ACTIVE,
      },
      data: {
        status: VoucherStatus.CANCELED,
      },
    });

    await this.auditLog.logChange(
      tx,
      userId,
      'UPDATE',
      tableWrite.vouchers,
      `VOUCHERS_RELATED_${whereField}_${invoiceId}`,
      { status: 'ACTIVE' },
      { status: 'CANCELED' },
    );
    // Ghi log chung cho hành động này (hoặc em có thể query ra list IDs để log chi tiết)
    this.log.debug(
      `Bulk canceled ${result.count} vouchers for ${type} invoice: ${invoiceId}`,
    );

    return result.count;
  }

  private parsePeriod(fromDate: string): { startDate: Date; endDate: Date } {
    const normalized = fromDate.trim().toUpperCase();

    // 1. Check if it's a quarter (e.g. "2026-Q2", "Q2-2026", "Q2/2026")
    const quarterMatch = normalized.match(/(Q[1-4])/i);
    if (quarterMatch) {
      const quarterStr = quarterMatch[1];
      const quarter = parseInt(quarterStr.charAt(1), 10);
      const yearMatch = normalized.match(/\b(\d{4})\b/);
      const year = yearMatch ? parseInt(yearMatch[1], 10) : moment().year();

      const startMonth = (quarter - 1) * 3;
      const startDate = moment()
        .year(year)
        .month(startMonth)
        .date(1)
        .startOf('day')
        .toDate();
      const endDate = moment(startDate).endOf('quarter').toDate();
      return { startDate, endDate };
    }

    // 2. Check if it's a month (e.g. "2026-05", "05/2026", "05-2026")
    const mmyyyyMatch = normalized.match(/^(\d{1,2})[-/](\d{4})$/);
    if (mmyyyyMatch) {
      const month = parseInt(mmyyyyMatch[1], 10) - 1;
      const year = parseInt(mmyyyyMatch[2], 10);
      const startDate = moment()
        .year(year)
        .month(month)
        .date(1)
        .startOf('day')
        .toDate();
      const endDate = moment(startDate).endOf('month').toDate();
      return { startDate, endDate };
    }

    const yyyymmMatch = normalized.match(/^(\d{4})[-/](\d{1,2})$/);
    if (yyyymmMatch) {
      const year = parseInt(yyyymmMatch[1], 10);
      const month = parseInt(yyyymmMatch[2], 10) - 1;
      const startDate = moment()
        .year(year)
        .month(month)
        .date(1)
        .startOf('day')
        .toDate();
      const endDate = moment(startDate).endOf('month').toDate();
      return { startDate, endDate };
    }

    // 3. Try parsed date fallback
    const parsed = moment(normalized);
    if (parsed.isValid()) {
      const startDate = parsed.startOf('month').toDate();
      const endDate = parsed.endOf('month').toDate();
      return { startDate, endDate };
    }

    throw new BadRequestException(
      'Invalid fromDate format. Expected month (YYYY-MM, MM/YYYY) or quarter (YYYY-Q#).',
    );
  }

  async getSummary(userId: string, fromDate: string) {
    const { startDate, endDate } = this.parsePeriod(fromDate);

    const [periodReceipts, periodPayments, cashGroup, bankGroup] =
      await Promise.all([
        // 1. Tổng tiền thu trong kỳ (tháng/quý)
        this.prisma.voucher.aggregate({
          where: {
            userId,
            voucherType: 'RECEIPT',
            status: 'ACTIVE',
            transactionAt: {
              gte: startDate,
              lte: endDate,
            },
          },
          _sum: {
            amount: true,
          },
        }),
        // 2. Tổng tiền chi trong kỳ (tháng/quý)
        this.prisma.voucher.aggregate({
          where: {
            userId,
            voucherType: 'PAYMENT',
            status: 'ACTIVE',
            transactionAt: {
              gte: startDate,
              lte: endDate,
            },
          },
          _sum: {
            amount: true,
          },
        }),
        // 3. Phân nhóm Thu/Chi tiền mặt từ fromDate đến hiện tại
        this.prisma.voucher.groupBy({
          by: ['voucherType'],
          where: {
            userId,
            status: 'ACTIVE',
            paymentMethod: 'CASH',
            transactionAt: {
              gte: startDate,
            },
          },
          _sum: {
            amount: true,
          },
        }),
        // 4. Phân nhóm Thu/Chi chuyển khoản từ fromDate đến hiện tại
        this.prisma.voucher.groupBy({
          by: ['voucherType'],
          where: {
            userId,
            status: 'ACTIVE',
            paymentMethod: 'BANK',
            transactionAt: {
              gte: startDate,
            },
          },
          _sum: {
            amount: true,
          },
        }),
      ]);

    const tong_tien_thu = Number(periodReceipts._sum.amount || 0);
    const tong_tien_chi = Number(periodPayments._sum.amount || 0);

    // Tính tiền mặt: Thu - Chi
    let cashReceipt = 0;
    let cashPayment = 0;
    for (const group of cashGroup) {
      if (group.voucherType === 'RECEIPT') {
        cashReceipt = Number(group._sum.amount || 0);
      } else if (group.voucherType === 'PAYMENT') {
        cashPayment = Number(group._sum.amount || 0);
      }
    }
    const tien_mat = cashReceipt - cashPayment;

    // Tính tiền chuyển khoản: Thu - Chi
    let bankReceipt = 0;
    let bankPayment = 0;
    for (const group of bankGroup) {
      if (group.voucherType === 'RECEIPT') {
        bankReceipt = Number(group._sum.amount || 0);
      } else if (group.voucherType === 'PAYMENT') {
        bankPayment = Number(group._sum.amount || 0);
      }
    }
    const tien_chuyen_khoan = bankReceipt - bankPayment;

    return {
      tong_tien_thu,
      tong_tien_chi,
      tien_mat,
      tien_chuyen_khoan,
    };
  }
}
