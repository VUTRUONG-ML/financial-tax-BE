import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { moment } from '../common/utils/time.util';
import { PrismaService } from '../core/prisma/prisma.service';
import { UpdateFinancialPeriodDto } from './dto/update-financial-period.dto';
import { FinancialPeriodResponseDto } from './dto/financial-period-response.dto';
import { CloseFinancialPeriodDto } from './dto/close-financial-period.dto';
import { RequestUser } from '../common/interface/request-user.interface';
import { AppLogger } from '../common/logger/app-logger.service';
import {
  LOG_ACTIONS,
  LOG_STATUS,
} from '../common/constants/log-events.constant';
import {
  FilingPeriod,
  InvoiceStatus,
  PeriodStatus,
  Prisma,
  Role,
  VoucherStatus,
  VoucherType,
} from '@prisma/client';
import { mapToDto } from 'src/common/utils/mapper.util';
import {
  AuditLogService,
  tableWrite,
} from '../core/audit-log/audit-log.service';
import { Dayjs } from 'dayjs';
import { Decimal } from '@prisma/client/runtime/client';
import { ConfirmTaxPaymentDto } from './dto/confirm-financial-period.dto';
import { TaxEngineService } from '../tax-engine/tax-engine.service';

@Injectable()
export class FinancialPeriodsService {
  private readonly log = new AppLogger(FinancialPeriodsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly taxEngine: TaxEngineService,
  ) {}

  private calculatePeriodMetadata(issueDate: Date, filingPeriod: FilingPeriod) {
    const now = moment(issueDate).startOf('day');

    // 1. Xác định startDate/endDate trọn vẹn (Ví dụ: 01/04 - 30/06)
    const unit: 'quarter' | 'month' =
      filingPeriod === 'QUARTERLY' ? 'quarter' : 'month';
    const start = now.clone().startOf(unit);
    const end = now.clone().endOf(unit);

    // 2. Tính toán DeadlineDate chuẩn xác (Sửa lỗi tháng 30/31 ngày)
    let deadline: Dayjs;
    if (filingPeriod === 'MONTHLY') {
      // Ấn định thẳng ngày 20 của tháng sau, không dùng cộng ngày
      deadline = end.clone().add(1, 'month').date(20).startOf('day');
    } else {
      // Ngày cuối cùng của tháng đầu tiên quý sau
      deadline = end.clone().add(1, 'month').endOf('month').startOf('day');
    }

    // 3. Logic dời hạn nộp thuế nếu trùng Thứ 7, Chủ nhật
    while (deadline.day() === 6 || deadline.day() === 0) {
      deadline = deadline.add(1, 'day');
    }

    const periodName =
      filingPeriod === 'QUARTERLY'
        ? `Quý ${now.quarter()}/${now.year()}`
        : `Tháng ${now.format('MM/YYYY')}`;
    return {
      start: start.toDate(),
      end: end.toDate(),
      deadline: deadline,
      periodName,
    };
  }

  /**
   * Sử dụng trong lúc người dùng khởi tạo onboarding tax configuration
   */
  async createInitialPeriod(
    userId: string,
    taxConfigId: string,
    tx: Prisma.TransactionClient,
  ) {
    const taxConfig = await tx.taxConfiguration.findUnique({
      where: { id: taxConfigId },
    });

    if (!taxConfig) throw new NotFoundException('Tax config not found');

    const filingPeriod = taxConfig.vatFilingPeriod;
    const now = new Date();

    // 1. Tính toán các mốc thời gian và tên kì thuế phù hợp
    const { start, end, deadline, periodName } = this.calculatePeriodMetadata(
      now,
      filingPeriod,
    );
    // 2. Upsert financial period
    const period = await tx.financialPeriod.upsert({
      where: {
        userId_periodName_startDate: {
          userId,
          periodName,
          startDate: start,
        },
      },
      update: {},
      create: {
        userId,
        periodName: periodName,
        vatFilingPeriod: filingPeriod,
        startDate: start,
        endDate: end,
        deadlineDate: deadline.toDate(),
      },
    });

    // 3. Ghi Audit Log với Metadata chi tiết để BA/PM dễ dàng kiểm tra
    await this.auditLog.logChange(
      tx,
      userId,
      'CREATE',
      tableWrite.period,
      period.id,
      null,
      {
        periodName,
        startDate: start,
        endDate: end,
        deadlineDate: deadline.format('YYYY-MM-DD'),
      },
      'Initial financial period setup',
    );

    // 4. Ghi log server backend
    this.log.debug(LOG_ACTIONS.CREATE_FINANCIAL_PERIOD, {
      status: LOG_STATUS.SUCCESS,
      userId,
      periodId: period.id,
      detail: 'Initial financial period setup.',
    });
    return period;
  }

  async update(
    user: RequestUser,
    publicId: string,
    updateDto: UpdateFinancialPeriodDto,
  ): Promise<FinancialPeriodResponseDto> {
    if (user.role !== Role.ADMIN) {
      this.log.warn(LOG_ACTIONS.UPDATE_FINANCIAL_PERIOD, {
        status: LOG_STATUS.FAILED,
        userId: user.id,
        reason: 'FORBIDDEN_ROLE',
      });
      throw new ForbiddenException(
        'Only administrators have the right to update..',
      );
    }

    const period = await this.prisma.financialPeriod.findUnique({
      where: { publicId },
    });

    if (!period || period.userId !== user.id) {
      throw new NotFoundException('Financial period not found.');
    }

    const updatedPeriod = await this.prisma.financialPeriod.update({
      where: { id: period.id },
      data: {
        periodName:
          updateDto.periodName !== undefined ? updateDto.periodName : undefined,
        status: updateDto.status !== undefined ? updateDto.status : undefined,
        actualPaymentDate:
          updateDto.actualPaymentDate !== undefined
            ? updateDto.actualPaymentDate
              ? new Date(updateDto.actualPaymentDate)
              : null
            : undefined,
      },
    });

    this.log.log(LOG_ACTIONS.UPDATE_FINANCIAL_PERIOD, {
      status: LOG_STATUS.SUCCESS,
      userId: user.id,
      publicId: updatedPeriod.publicId,
      updatedFields: Object.keys(updateDto),
    });

    return mapToDto(FinancialPeriodResponseDto, updatedPeriod);
  }

  /**
   * Hệ thống tự động khởi tạo financial period khi hóa đơn hiện tại/ngày lập không thuộc một chu kỳ thuế nào
   * Service sử dụng bên trong hàm tạo invoice
   */
  async ensurePeriodExists(
    userId: string,
    tx: Prisma.TransactionClient = this.prisma,
    date: Date,
  ) {
    const targetDate = moment(date).startOf('day').toDate();

    // 1. Tìm xem đã có kỳ nào bao phủ ngày này chưa
    let period = await tx.financialPeriod.findFirst({
      where: {
        userId,
        startDate: { lte: targetDate },
        endDate: { gte: targetDate },
      },
    });

    // 2. Nếu chưa có, tiến hành tạo mới
    if (!period) {
      const taxConfig = await tx.taxConfiguration.findFirst({
        where: {
          userId,
          applyFromDate: { lte: targetDate },
          applyToDate: { gte: targetDate },
        },
      });
      if (!taxConfig) {
        this.log.warn(LOG_ACTIONS.ENSURE_FINANCIAL_PERIOD, {
          status: LOG_STATUS.FAILED,
          reason: 'TAX_CONFIG_NOT_FOUND',
          userId,
        });
        throw new ConflictException(
          'User have not been set up tax configuration yet.',
        );
      }
      const { start, end, deadline, periodName } = this.calculatePeriodMetadata(
        date,
        taxConfig.vatFilingPeriod,
      );

      period = await tx.financialPeriod.create({
        data: {
          userId,
          startDate: start,
          endDate: end,
          deadlineDate: deadline.toDate(),
          periodName,
          vatFilingPeriod: taxConfig.vatFilingPeriod,
        },
      });

      await this.auditLog.logChange(
        tx,
        userId,
        'CREATE',
        tableWrite.period,
        period.id,
        null,
        {
          periodName,
          startDate: start,
          endDate: end,
          deadlineDate: deadline.format('YYYY-MM-DD'),
        },
        'The system automatically initiates the financial period',
      );

      this.log.debug(LOG_ACTIONS.ENSURE_FINANCIAL_PERIOD, {
        status: LOG_STATUS.SUCCESS,
        userId,
        periodId: period.id,
        detail: 'The system automatically initiates the financial period.',
      });
    }
    return period;
  }

  /**
   * Tính toán doanh thu và chi phí thực tế trong kỳ
   */
  async calculateRealtimeTaxData(
    userId: string,
    startDate: Date,
    endDate: Date,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<{ revenue: Decimal; expense: Decimal }> {
    const aggregateInvoice = await tx.invoice.aggregate({
      _sum: { totalPayment: true },
      where: {
        userId,
        issueDate: { gte: startDate, lte: endDate },
        status: InvoiceStatus.ISSUED, // Chỉ tính các hóa đơn đã phát hành
      },
    });
    const revenue = aggregateInvoice._sum.totalPayment || new Decimal(0);

    const aggregateVoucher = await tx.voucher.aggregate({
      _sum: { amount: true },
      where: {
        userId,
        transactionAt: { gte: startDate, lte: endDate },
        voucherType: VoucherType.PAYMENT,
        isDeductibleExpense: true,
        status: VoucherStatus.ACTIVE,
      },
    });
    const expense = aggregateVoucher._sum.amount || new Decimal(0);

    return { revenue, expense };
  }

  /**
   * Service dùng để chốt sổ cho người dùng.
   * Nếu truyền vào tx thì chạy chung transaction với caller.
   * Trả về thêm vatAmount và pitAmount để caller dùng tạo TaxDeclaration.
   */
  async closeFinancialPeriod(
    userId: string,
    publicId: string,
    dto?: CloseFinancialPeriodDto,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<{
    period: FinancialPeriodResponseDto;
    vatAmount: Decimal;
    pitAmount: Decimal;
  }> {
    const run = async (client: Prisma.TransactionClient) => {
      await client.$executeRaw`SELECT id FROM financial_periods WHERE public_id = ${publicId} FOR UPDATE`;

      // 1. Kiểm tra kì thuế
      const targetFp = await client.financialPeriod.findUnique({
        where: { publicId },
      });

      if (!targetFp || targetFp.userId !== userId) {
        this.log.warn(LOG_ACTIONS.CLOSE_FINANCIAL_PERIOD, {
          status: LOG_STATUS.FAILED,
          reason: 'FINANCIAL_PERIOD_NOT_FOUND',
          userId,
        });
        throw new NotFoundException('Financial period not found.');
      }

      // 2. Lấy tax config
      let currentTaxConfig = await client.taxConfiguration.findFirst({
        where: {
          userId,
          applyFromDate: { lte: targetFp.endDate },
          applyToDate: { gte: targetFp.endDate },
        },
      });
      if (!currentTaxConfig) {
        this.log.warn(LOG_ACTIONS.CLOSE_FINANCIAL_PERIOD, {
          status: LOG_STATUS.FAILED,
          reason: 'TAX_CONFIG_NOT_FOUND',
          userId,
        });
        throw new ConflictException(
          'You have not set up the tax configuration for this tax period.',
        );
      }
      if (targetFp.status === PeriodStatus.CLOSED) {
        this.log.warn(LOG_ACTIONS.CLOSE_FINANCIAL_PERIOD, {
          status: LOG_STATUS.FAILED,
          reason: 'FINANCIAL_PERIOD_IS_CLOSED',
          financialPeriodId: targetFp.id,
          userId,
        });
        throw new BadRequestException('The financial period is closed.');
      }

      // Nếu người dùng chọn một phương thức tính thuế cụ thể, cập nhật nó vào cấu hình
      if (dto?.chosenPitMethod) {
        currentTaxConfig = await client.taxConfiguration.update({
          where: { id: currentTaxConfig.id },
          data: { chosenPitMethod: dto.chosenPitMethod },
        });
      }

      // Kiểm tra xem còn kì thuế nào chưa được đóng trước đây ko
      const openPeriodCount = await client.financialPeriod.count({
        where: {
          userId,
          status: PeriodStatus.OPEN,
          endDate: { lt: targetFp.startDate },
        },
      });
      if (openPeriodCount > 0) {
        this.log.warn(LOG_ACTIONS.CLOSE_FINANCIAL_PERIOD, {
          status: LOG_STATUS.FAILED,
          reason: 'PRE_PERIOD_NOT_YET_CLOSE',
          userId,
        });
        throw new BadRequestException(
          'There are previous tax periods that have not been closed.',
        );
      }
      // 3. Kiểm tra danh sách invoice và tính tổng doanh thu issued
      const invalidInvoiceCount = await client.invoice.count({
        where: {
          userId,
          issueDate: { gte: targetFp.startDate, lte: targetFp.endDate },
          NOT: [
            { status: InvoiceStatus.ISSUED },
            { status: InvoiceStatus.CANCELED },
          ],
        },
      });
      if (invalidInvoiceCount > 0) {
        this.log.warn(LOG_ACTIONS.CLOSE_FINANCIAL_PERIOD, {
          status: LOG_STATUS.FAILED,
          reason: 'SOME_INVOICE_NOT_FINALIZED',
          userId,
        });
        throw new BadRequestException(
          'Some invoices are still in draft or sync failed status, please check again.',
        );
      }

      // Hàm này giờ sẽ cho tính revenue với expense từ tham số đầu vào nếu người dùng muốn chốt sổ với một doanh thu khác với doanh thu thực tế.
      let taxableRevenue = new Decimal(0);
      let expense = new Decimal(0);

      if (dto?.revenue !== undefined && dto?.expense !== undefined) {
        taxableRevenue = new Decimal(dto.revenue);
        expense = new Decimal(dto.expense);
      } else {
        const realtimeData = await this.calculateRealtimeTaxData(
          userId,
          targetFp.startDate,
          targetFp.endDate,
          client,
        );
        taxableRevenue = realtimeData.revenue;
        expense = realtimeData.expense;
      }

      // Dùng service tính thuế với pitRate và vatRate trong taxConfiguration
      const taxResult = this.taxEngine.calculateTotalTax(
        taxableRevenue,
        expense,
        currentTaxConfig,
      );
      const vatAmount = taxResult.vatAmount;
      // Lấy pit amount đã được dùng để tính tổng thuế dựa theo phương thức đã chọn
      const pitAmount =
        currentTaxConfig.chosenPitMethod === 'PERCENTAGE' &&
        currentTaxConfig.taxGroupId === 2
          ? (taxResult.pitAmountDetails.percentageMethodAmount ??
            new Decimal(0))
          : (taxResult.pitAmountDetails.profitMethodAmount ?? new Decimal(0));
      const totalTax = taxResult.totalTaxDue;

      const updatedFp = await client.financialPeriod.update({
        where: { id: targetFp.id },
        data: {
          taxAmount: totalTax,
          vatRateSnapShot: currentTaxConfig.vatRateSnapShot,
          pitRateSnapShot: currentTaxConfig.pitRateSnapShot,
          status: PeriodStatus.CLOSED,
        },
      });
      await this.auditLog.logChange(
        client,
        userId,
        'UPDATE',
        tableWrite.period,
        updatedFp.id,
        {
          taxAmount: targetFp.taxAmount,
          vatRateSnapShot: targetFp.vatRateSnapShot,
          pitRateSnapShot: targetFp.pitRateSnapShot,
          status: targetFp.status,
        },
        {
          taxAmount: updatedFp.taxAmount,
          vatRateSnapShot: updatedFp.vatRateSnapShot,
          pitRateSnapShot: updatedFp.pitRateSnapShot,
          status: updatedFp.status,
        },
        'User close financial period.',
      );
      this.log.log(LOG_ACTIONS.CLOSE_FINANCIAL_PERIOD, {
        status: LOG_STATUS.SUCCESS,
        userId,
        financialPeriodId: targetFp.id,
      });
      return {
        period: mapToDto(FinancialPeriodResponseDto, updatedFp),
        vatAmount,
        pitAmount,
      };
    };

    // Nếu caller đã truyền tx thực sự (không phải prisma), chạy trực tiếp không tạo transaction mới
    if (tx !== (this.prisma as unknown as Prisma.TransactionClient)) {
      return run(tx);
    }
    return this.prisma.$transaction(run);
  }

  /**
   * Mở lại kì chưa lập tờ kê khai
   */
  async openFinancialPeriod(userId: string, publicId: string) {
    return await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT id FROM "financial_periods" 
        WHERE "public_id" = ${publicId} 
        FOR UPDATE
      `;

      const period = await tx.financialPeriod.findUnique({
        where: { publicId: publicId },
        include: {
          taxDeclaration: true,
        },
      });

      if (!period) {
        this.log.warn(LOG_ACTIONS.REOPEN_PERIOD, {
          status: LOG_STATUS.FAILED,
          reason: 'PERIOD_NOT_FOUND',
          userId,
          publicId,
        });
        throw new NotFoundException('Financial period not found.');
      }

      if (period.userId !== userId) {
        this.log.warn(LOG_ACTIONS.REOPEN_PERIOD, {
          status: LOG_STATUS.FAILED,
          reason: 'ACCESS_DENIED',
          userId,
          publicId,
        });
        throw new ForbiddenException(
          'You do not have permission to access this financial period.',
        );
      }

      if (period.status === PeriodStatus.OPEN) {
        this.log.warn(LOG_ACTIONS.REOPEN_PERIOD, {
          status: LOG_STATUS.FAILED,
          reason: 'ALREADY_OPEN',
          userId,
          financialPeriodId: period.id,
        });
        throw new BadRequestException('The financial period is already open.');
      }

      if (period.taxDeclaration) {
        this.log.warn(LOG_ACTIONS.REOPEN_PERIOD, {
          status: LOG_STATUS.FAILED,
          reason: 'TAX_DECLARED_LOCK',
          userId,
          financialPeriodId: period.id,
        });
        throw new ConflictException(
          "This period has an associated tax declaration. Reopening the accounting book is blocked to preserve the reported data's legal integrity.",
        );
      }

      // không thể mở kì khi kì tiếp theo của kì này đã đóng
      const hasNextClosePeriod: boolean =
        (await tx.financialPeriod.count({
          where: {
            userId,
            startDate: { gte: period.endDate },
            status: PeriodStatus.CLOSED,
          },
        })) > 0;

      if (hasNextClosePeriod) {
        this.log.warn(LOG_ACTIONS.REOPEN_PERIOD, {
          status: LOG_STATUS.FAILED,
          reason: 'EXIST_NEXT_CLOSE_PERIOD',
          publicId,
        });
        throw new NotFoundException(
          'The next period of this period has closed.',
        );
      }

      const updatedFp = await tx.financialPeriod.update({
        where: { id: period.id },
        data: { status: PeriodStatus.OPEN },
      });

      await this.auditLog.logChange(
        tx,
        userId,
        'UPDATE',
        tableWrite.period,
        updatedFp.id,
        { status: period.status },
        { status: updatedFp.status },
        'User reopened the financial period.',
      );

      this.log.log(LOG_ACTIONS.REOPEN_PERIOD, {
        status: LOG_STATUS.SUCCESS,
        userId,
        financialPeriodId: updatedFp.id,
        detail: 'OPEN_FINANCIAL_PERIOD',
      });

      return mapToDto(FinancialPeriodResponseDto, updatedFp);
    });
  }

  /**
   * Xác nhận nộp tiền thuế khi đã lập tờ khai
   */
  async finishedTaxPayment(
    userId: string,
    publicId: string,
    dto: ConfirmTaxPaymentDto,
  ) {
    const paymentDate = dto.paymentDate;
    return await this.prisma.$transaction(async (tx) => {
      // 1. Kiểm tra điều kiện status và tờ khai
      const period = await tx.financialPeriod.findUnique({
        where: { publicId },
        include: { taxDeclaration: true },
      });

      if (!period) {
        this.log.log(LOG_ACTIONS.FINISHED_TAX_PAYMENT, {
          status: LOG_STATUS.FAILED,
          reason: 'PERIOD_NOT_FOUND',
          userId,
          publicId,
        });
        throw new NotFoundException('Financial period not found.');
      }

      if (period.userId !== userId) {
        this.log.log(LOG_ACTIONS.FINISHED_TAX_PAYMENT, {
          status: LOG_STATUS.FAILED,
          reason: 'PERIOD_NOT_OWN',
          userId,
          publicId,
        });
        throw new ForbiddenException('You do not have access period.');
      }

      if (period.status !== PeriodStatus.CLOSED || !period.taxDeclaration) {
        throw new BadRequestException(
          'The tax period has not been close or no tax return has been filed.',
        );
      }

      if (period.startDate > paymentDate) {
        this.log.log(LOG_ACTIONS.FINISHED_TAX_PAYMENT, {
          status: LOG_STATUS.FAILED,
          reason: 'INVALID_PAYMENT_DATE',
          userId,
          publicId,
        });
        throw new BadRequestException(
          'You cannot pay your taxes before the start of the period.',
        );
      }

      // 2. Cập nhật ngày nộp thực tế
      const updatedPeriod = await tx.financialPeriod.updateMany({
        where: { publicId, actualPaymentDate: null },
        data: { actualPaymentDate: paymentDate },
      });

      if (updatedPeriod.count === 0) {
        throw new BadRequestException(
          'Period not found or repeat the update action.',
        );
      }

      await this.auditLog.logChange(
        tx,
        userId,
        'UPDATE',
        tableWrite.period,
        period.id,
        { actualPayment: null },
        { actualPayment: paymentDate },
      );
      return mapToDto(FinancialPeriodResponseDto, {
        ...period,
        actualPaymentDate: paymentDate,
      });
    });
  }

  /**
   * So sánh hai phương pháp tính thuế PIT cho mức doanh thu thứ 2
   */
  async comparePit(userId: string, publicId: string) {
    // 1. Kiểm tra kì thuế
    const targetFp = await this.prisma.financialPeriod.findUnique({
      where: {
        publicId,
      },
    });

    if (!targetFp || targetFp.userId !== userId) {
      this.log.warn(LOG_ACTIONS.CALCULATE_TAX, {
        status: LOG_STATUS.FAILED,
        reason: 'FINANCIAL_PERIOD_NOT_FOUND',
        userId,
      });
      throw new NotFoundException('Financial period not found.');
    }

    // 2. Lấy tax config
    const currentTaxConfig = await this.prisma.taxConfiguration.findFirst({
      where: {
        userId,
        applyFromDate: { lte: targetFp.endDate },
        applyToDate: { gte: targetFp.endDate },
      },
    });

    if (!currentTaxConfig) {
      this.log.warn(LOG_ACTIONS.CALCULATE_TAX, {
        status: LOG_STATUS.FAILED,
        reason: 'TAX_CONFIG_NOT_FOUND',
        userId,
      });
      throw new ConflictException(
        'You have not set up the tax configuration for this tax period.',
      );
    }

    // 3. Tính tổng doanh thu và chi phí bằng hàm dùng chung
    const realtimeData = await this.calculateRealtimeTaxData(
      userId,
      targetFp.startDate,
      targetFp.endDate,
    );
    const taxableRevenue = realtimeData.revenue;
    const expense = realtimeData.expense;

    // 4. Gọi tax-engine với mức doanh thu thứ 2 (taxGroupId = 2) để mô phỏng
    const pitAmountDetails = this.taxEngine.calculatePitAmount(
      taxableRevenue,
      expense,
      currentTaxConfig,
    );

    this.log.log(LOG_ACTIONS.CALCULATE_TAX, {
      status: LOG_STATUS.SUCCESS,
      userId,
      financialPeriodId: targetFp.id,
      detail: 'Compare PIT methods for tax group 2',
    });

    return pitAmountDetails;
  }
}
