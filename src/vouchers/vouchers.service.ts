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
import { Prisma, Voucher, VoucherStatus, VoucherType } from '@prisma/client';
import { AppLogger } from '../common/logger/app-logger.service';
import {
  AuditLogService,
  tableWrite,
} from '../core/audit-log/audit-log.service';
import { Decimal } from '@prisma/client/runtime/client';

@Injectable()
export class VouchersService {
  private readonly log = new AppLogger(VouchersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  private async resolveVoucherType(
    tx: Prisma.TransactionClient,
    userId: string,
    voucherType: VoucherType,
    amount: Decimal,
    isDeductibleExpense = false,
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
      if (currentOutInvoice.isPaid)
        throw new BadRequestException('The invoice has been paid in full.');

      const currentPaid = currentOutInvoice.paidAmount as unknown as Decimal;
      const amountToAdd = amount as unknown as Decimal;

      const totalPaidSoFar: Decimal = currentPaid.add(amountToAdd);

      if (totalPaidSoFar.gt(currentOutInvoice.totalPayment))
        throw new BadRequestException(
          'The total amount collected exceeded the total amount on the invoice.',
        );
      const isPaid = totalPaidSoFar.eq(currentOutInvoice.totalPayment);
      const result = await tx.invoice.updateMany({
        where: { publicId: outInvoicePublicId, userId, isPaid: false },
        data: {
          paidAmount: { increment: amount },
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
          paidAmount: totalPaidSoFar,
        },
      );
      this.log.debug('UPDATE_PAYMENT_STATUS_INVOICE', {
        status: LOG_STATUS.SUCCESS,
        userId,
        invoicePublicId: outInvoicePublicId,
      });
      return { id: currentOutInvoice.id, type: 'OUTBOUND' };
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
      if (currentInboundInvoice.isPaid)
        throw new BadRequestException('The invoice has been paid in full.');

      const currentPaid =
        currentInboundInvoice.paidAmount as unknown as Decimal;
      const amountToAdd = amount as unknown as Decimal;

      const totalPaidSoFar: Decimal = currentPaid.add(amountToAdd);

      if (totalPaidSoFar.gt(currentInboundInvoice.totalAmount))
        throw new BadRequestException(
          'The total amount payment exceeded the total amount on the inbound invoice.',
        );
      const isPaid = totalPaidSoFar.eq(currentInboundInvoice.totalAmount);
      const result = await tx.inboundInvoice.updateMany({
        where: { publicId: inInvoicePublicId, userId, isPaid: false },
        data: {
          paidAmount: { increment: amount },
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
          paidAmount: currentInboundInvoice.paidAmount as Decimal,
        },
        {
          isPaid,
          paidAmount: totalPaidSoFar,
        },
      );
      this.log.debug('UPDATE_PAYMENT_STATUS_INBOUND_INVOICE', {
        status: LOG_STATUS.SUCCESS,
        userId,
        invoicePublicId: inInvoicePublicId,
      });

      return { id: currentInboundInvoice.id, type: 'INBOUND' };
    }
    if (isDeductibleExpense && !inInvoicePublicId)
      throw new BadRequestException(
        'Missing inbound invoice when calculating deductible expenses for personal income tax purposes.',
      );
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

        if (category.userId !== null && category.userId !== userId) {
          throw new BadRequestException('Invalid voucher category');
        }

        const invoice = await this.resolveVoucherType(
          tx,
          userId,
          createVoucherDto.voucherType,
          createVoucherDto.amount,
          createVoucherDto.isDeductibleExpense,
          createVoucherDto.inboundInvoicePublicId,
          createVoucherDto.outboundInvoicePublicId,
        );

        // Generate Voucher Code: PT/PC-MMYY-0001
        const transactionDate = new Date();
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
            isDeductibleExpense: createVoucherDto.isDeductibleExpense ?? false,
            inboundInvoiceId: invoice?.type === 'INBOUND' ? invoice.id : null,
            outboundInvoiceId: invoice?.type === 'OUTBOUND' ? invoice.id : null,
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

    const { id, ...rest } = result;
    return rest;
  }

  async findAll(userId: string) {
    return this.prisma.voucher.findMany({
      where: { userId },
      orderBy: [{ transactionAt: 'desc' }, { id: 'desc' }],
      include: {
        category: {
          select: { categoryName: true, type: true },
        },
      },
    });
  }

  async findOne(userId: string, id: number) {
    const voucher = await this.prisma.voucher.findUnique({
      where: { id },
      include: {
        category: true,
        inboundInvoice: true,
      },
    });

    if (!voucher || voucher.userId !== userId) {
      throw new NotFoundException('Voucher not found');
    }

    return voucher;
  }

  async update(userId: string, id: number, updateVoucherDto: UpdateVoucherDto) {
    const existing = await this.prisma.voucher.findUnique({
      where: { id },
    });

    if (!existing || existing.userId !== userId) {
      throw new NotFoundException('Voucher not found');
    }

    if (existing.status === VoucherStatus.CANCELED) {
      throw new BadRequestException('Cannot update a canceled voucher');
    }

    // Category Validation if modifying category
    if (
      updateVoucherDto.categoryId &&
      updateVoucherDto.categoryId !== existing.categoryId
    ) {
      const category = await this.prisma.voucherCategory.findUnique({
        where: { id: updateVoucherDto.categoryId },
      });

      if (
        !category ||
        (category.userId !== null && category.userId !== userId) ||
        category.type !== existing.voucherType
      ) {
        throw new BadRequestException('Invalid voucher category');
      }
    }

    const updated = await this.prisma.voucher.update({
      where: { id },
      data: {
        ...updateVoucherDto,
        amount: updateVoucherDto.amount ? updateVoucherDto.amount : undefined,
      },
    });

    this.log.log(LOG_ACTIONS.UPDATE_VOUCHER, {
      status: LOG_STATUS.SUCCESS,
      userId,
      voucherId: id,
    });

    return updated;
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

      return { ...existing, status: VoucherStatus.CANCELED };
    });
  }
}
