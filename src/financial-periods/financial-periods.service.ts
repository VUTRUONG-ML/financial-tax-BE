import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Inject,
  forwardRef,
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
  TaxConfiguration,
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
import { CostEngineService } from '../cost-engine/cost-engine.service';

@Injectable()
export class FinancialPeriodsService {
  private readonly log = new AppLogger(FinancialPeriodsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly taxEngine: TaxEngineService,
    @Inject(forwardRef(() => CostEngineService))
    private readonly costEngine: CostEngineService,
  ) { }

  private calculatePeriodMetadata(issueDate: Date, filingPeriod: FilingPeriod) {
    const now = moment(issueDate);

    // xác định startDate/endDate
    const unit: 'quarter' | 'month' =
      filingPeriod === 'QUARTERLY' ? 'quarter' : 'month';
    const start = now.clone().startOf(unit);
    const end = now.clone().endOf(unit);

    // tính toán DeadlineDate
    let deadline: Dayjs;
    if (filingPeriod === 'MONTHLY') {
      deadline = end.clone().add(1, 'month').date(20).endOf('day');
    } else {
      // Ngày cuối cùng của tháng đầu tiên quý sau
      deadline = end.clone().add(1, 'month').endOf('month').endOf('day');
    }

    // dời hạn nộp thuế nếu trùng Thứ 7, Chủ nhật
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

    const { start, end, deadline, periodName } = this.calculatePeriodMetadata(
      now,
      filingPeriod,
    );
    console.log('period: ', start, end);
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

    const p = await tx.financialPeriod.findUnique({
      where: {id: period.id},
    });
    this.log.debug(LOG_ACTIONS.CREATE_FINANCIAL_PERIOD, {
      status: LOG_STATUS.SUCCESS,
      userId,
      periodId: period.id,
      detail: 'Initial financial period setup.',
      startDate: p?.startDate,
      endDate: p?.endDate,
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

    return mapToDto(
      FinancialPeriodResponseDto,
      this.enrichPeriodWithPenalty(updatedPeriod),
    );
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
    const targetDate = moment(date).toDate();
    let period = await tx.financialPeriod.findFirst({
      where: {
        userId,
        startDate: { lte: targetDate },
        endDate: { gte: targetDate },
      },
    });

    if (!period) {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { createdAt: true },
      });

      if (user && user.createdAt > targetDate) {
        this.log.warn(LOG_ACTIONS.ENSURE_FINANCIAL_PERIOD, {
          reason: 'TARGET_DATE_INVALID',
          userId,
          targetDate,
          userCreated: user.createdAt,
        });
        throw new BadRequestException(
          'Target date less than user created time.',
        );
      }

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
        targetDate,
        taxConfig.vatFilingPeriod,
      );
      console.log('period: ', start, end);
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
    periodId?: number,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<{ revenue: Decimal; expense: Decimal }> {
    const aggregateInvoice = await tx.invoice.aggregate({
      _sum: { totalPayment: true },
      where: {
        userId,
        status: InvoiceStatus.ISSUED, // Chỉ tính các hóa đơn đã phát hành
        ...(periodId !== undefined
          ? { periodId }
          : { issueDate: { gte: startDate, lte: endDate } }),
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

  async getRevenueByIndustry(
    userId: string,
    startDate: Date,
    endDate: Date,
    tx: Prisma.TransactionClient = this.prisma,
    periodId?: number,
  ): Promise<
    {
      taxCategoryId: number;
      pitRate: Decimal;
      vatRate: Decimal;
      revenue: Decimal;
    }[]
  > {
    const rawResult =
      periodId !== undefined
        ? await tx.$queryRaw<any[]>`
      SELECT 
        COALESCE(p.tax_category_id, 0) as "taxCategoryId",
        COALESCE(tc.pit_rate, 0) as "pitRate",
        COALESCE(tc.vat_rate, 0) as "vatRate",
        COALESCE(SUM(id.total_amount), 0) as "revenue"
      FROM invoice_details id
      JOIN invoices i ON id.invoice_id = i.id
      LEFT JOIN products p ON id.product_id = p.id
      LEFT JOIN tax_categories_dictionary tc ON p.tax_category_id = tc.id
      WHERE i.user_id = ${userId}
        AND i.period_id = ${periodId}
        AND i.status = 'ISSUED'
      GROUP BY p.tax_category_id, tc.pit_rate, tc.vat_rate
    `
        : await tx.$queryRaw<any[]>`
      SELECT 
        COALESCE(p.tax_category_id, 0) as "taxCategoryId",
        COALESCE(tc.pit_rate, 0) as "pitRate",
        COALESCE(tc.vat_rate, 0) as "vatRate",
        COALESCE(SUM(id.total_amount), 0) as "revenue"
      FROM invoice_details id
      JOIN invoices i ON id.invoice_id = i.id
      LEFT JOIN products p ON id.product_id = p.id
      LEFT JOIN tax_categories_dictionary tc ON p.tax_category_id = tc.id
      WHERE i.user_id = ${userId}
        AND i.issue_date >= ${startDate}
        AND i.issue_date <= ${endDate}
        AND i.status = 'ISSUED'
      GROUP BY p.tax_category_id, tc.pit_rate, tc.vat_rate
    `;

    return rawResult.map((r) => ({
      taxCategoryId: Number(r.taxCategoryId),
      pitRate: new Decimal(r.pitRate || 0),
      vatRate: new Decimal(r.vatRate || 0),
      revenue: new Decimal(r.revenue || 0),
    }));
  }

  private async calculatePeriodTaxDeltaForPercentageMethod(
    userId: string,
    targetFp: { id?: number; startDate: Date; endDate: Date },
    currentTaxConfig: TaxConfiguration,
    client: Prisma.TransactionClient,
  ): Promise<{ vatAmount: Decimal; pitAmount: Decimal }> {
    const startOfYear = moment(targetFp.startDate).startOf('year').toDate();

    const ytdBeforeIndustries = await this.getRevenueByIndustry(
      userId,
      startOfYear,
      moment(targetFp.startDate).subtract(1, 'ms').toDate(),
      client,
    );

    const ytdBeforeRevenue = ytdBeforeIndustries.reduce(
      (sum, ind) => sum.add(ind.revenue),
      new Decimal(0),
    );

    const inputBefore =
      ytdBeforeIndustries.length > 0 ? ytdBeforeIndustries : ytdBeforeRevenue;

    const prevVatAmount = this.taxEngine.calculateVatAmount(
      currentTaxConfig,
      inputBefore,
    );
    const prevPitAmount = this.taxEngine.calculatePitPercentage(
      currentTaxConfig,
      inputBefore,
    );

    // Tính toán số thuế YTD lũy kế đến hết kỳ này
    const ytdEndIndustries = await this.getRevenueByIndustry(
      userId,
      startOfYear,
      targetFp.endDate,
      client,
    );

    const ytdRevenue = ytdEndIndustries.reduce(
      (sum, ind) => sum.add(ind.revenue),
      new Decimal(0),
    );

    const input = ytdEndIndustries.length > 0 ? ytdEndIndustries : ytdRevenue;
    const ytdVatAmount = this.taxEngine.calculateVatAmount(
      currentTaxConfig,
      input,
    );
    const ytdPitAmount = this.taxEngine.calculatePitPercentage(
      currentTaxConfig,
      input,
    );

    const vatAmount = Decimal.max(0, ytdVatAmount.sub(prevVatAmount));
    const pitAmount = Decimal.max(0, ytdPitAmount.sub(prevPitAmount));

    return { vatAmount, pitAmount };
  }

  async calculatePeriodTax(
    userId: string,
    targetFp: { id?: number; startDate: Date; endDate: Date },
    currentTaxConfig: TaxConfiguration,
    inPeriodRevenue: Decimal,
    inPeriodExpense: Decimal,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<{ vatAmount: Decimal; pitAmount: Decimal; totalTax: Decimal }> {
    if (currentTaxConfig.chosenPitMethod === 'PERCENTAGE') {
      const periodTaxDelta =
        await this.calculatePeriodTaxDeltaForPercentageMethod(
          userId,
          targetFp,
          currentTaxConfig,
          client,
        );
      return {
        vatAmount: periodTaxDelta.vatAmount,
        pitAmount: periodTaxDelta.pitAmount,
        totalTax: periodTaxDelta.vatAmount.add(periodTaxDelta.pitAmount),
      };
    }

    const periodTaxDeltaForVat =
      await this.calculatePeriodTaxDeltaForPercentageMethod(
        userId,
        targetFp,
        currentTaxConfig,
        client,
      );
    const vatAmount = periodTaxDeltaForVat.vatAmount;

    const pitAmount = this.taxEngine.calculatePitProfitForPeriod(
      currentTaxConfig,
      inPeriodRevenue,
      inPeriodExpense,
    );
    return {
      vatAmount,
      pitAmount,
      totalTax: vatAmount.add(pitAmount),
    };
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
    ytdRevenue: Decimal;
    ytdExpense: Decimal;
  }> {
    const run = async (client: Prisma.TransactionClient) => {
      await client.financialPeriod.update({
        where: { publicId },
        data: {},
      });
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
          periodId: targetFp.id,
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

      await this.costEngine.calculateAndApplyWeightedAverageCosts(
        userId,
        targetFp.id,
        client,
      );

      let inPeriodRevenue = new Decimal(0);
      let inPeriodExpense = new Decimal(0);

      if (dto?.revenue !== undefined && dto?.expense !== undefined) {
        inPeriodRevenue = new Decimal(dto.revenue);
        inPeriodExpense = new Decimal(dto.expense);
      } else {
        const realtimeData = await this.calculateRealtimeTaxData(
          userId,
          targetFp.startDate,
          targetFp.endDate,
          targetFp.id,
          client,
        );
        inPeriodRevenue = realtimeData.revenue;
        inPeriodExpense = realtimeData.expense;
      }

      const startOfYear = moment(targetFp.startDate).startOf('year').toDate();
      const mostRecentDeclaration = await client.taxDeclaration.findFirst({
        where: {
          period: {
            userId,
            startDate: { gte: startOfYear },
            endDate: { lt: targetFp.startDate },
            status: PeriodStatus.CLOSED,
          },
        },
        orderBy: {
          period: {
            endDate: 'desc',
          },
        },
      });

      const ytdRevenue = (
        mostRecentDeclaration?.ytdRevenue ?? new Decimal(0)
      ).add(inPeriodRevenue);
      const ytdExpense = (
        mostRecentDeclaration?.ytdExpense ?? new Decimal(0)
      ).add(inPeriodExpense);

      this.log.debug('CALCULATE_YTD_REVENUE', {
        ytdRevenue,
        ytdExpense,
        period: publicId,
        userId,
      });

      const taxResult = await this.calculatePeriodTax(
        userId,
        targetFp,
        currentTaxConfig,
        inPeriodRevenue,
        inPeriodExpense,
        client,
      );
      const vatAmount = taxResult.vatAmount;
      const pitAmount = taxResult.pitAmount;
      const totalTax = taxResult.totalTax;

      const updatedFp = await client.financialPeriod.update({
        where: { id: targetFp.id },
        data: {
          taxAmount: totalTax,
          vatAmount: vatAmount,
          pitAmount: pitAmount,
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
          vatAmount: targetFp.vatAmount,
          pitAmount: targetFp.pitAmount,
          vatRateSnapShot: targetFp.vatRateSnapShot,
          pitRateSnapShot: targetFp.pitRateSnapShot,
          status: targetFp.status,
        },
        {
          taxAmount: updatedFp.taxAmount,
          vatAmount: updatedFp.vatAmount,
          pitAmount: updatedFp.pitAmount,
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
        period: mapToDto(
          FinancialPeriodResponseDto,
          this.enrichPeriodWithPenalty(updatedFp),
        ),
        vatAmount,
        pitAmount,
        ytdRevenue,
        ytdExpense,
      };
    };

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

      return mapToDto(
        FinancialPeriodResponseDto,
        this.enrichPeriodWithPenalty(updatedFp),
      );
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
      return mapToDto(
        FinancialPeriodResponseDto,
        this.enrichPeriodWithPenalty({
          ...period,
          actualPaymentDate: paymentDate,
        }),
      );
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

    const realtimeData = await this.calculateRealtimeTaxData(
      userId,
      targetFp.startDate,
      targetFp.endDate,
      targetFp.id,
    );
    const inPeriodRevenue = realtimeData.revenue;
    const inPeriodExpense = realtimeData.expense;

    const startOfYear = moment(targetFp.startDate).startOf('year').toDate();
    const ytdEndIndustries = await this.getRevenueByIndustry(
      userId,
      startOfYear,
      targetFp.endDate,
      this.prisma,
    );
    const ytdRevenue = ytdEndIndustries.reduce(
      (sum, ind) => sum.add(ind.revenue),
      new Decimal(0),
    );
    const ytdInput =
      ytdEndIndustries.length > 0 ? ytdEndIndustries : ytdRevenue;

    const compareResult = this.taxEngine.calculatePitAmount(
      currentTaxConfig,
      inPeriodRevenue,
      inPeriodExpense,
      ytdInput,
    );

    const aggregateResult = await this.prisma.financialPeriod.aggregate({
      _sum: {
        pitAmount: true,
      },
      where: {
        userId,
        startDate: { gte: startOfYear },
        endDate: { lt: targetFp.startDate },
        status: PeriodStatus.CLOSED,
      },
    });
    const prevPitAmount = aggregateResult._sum.pitAmount ?? new Decimal(0);
    const percentageMethodPeriodAmount = Decimal.max(
      0,
      (compareResult.percentageMethodAmount ?? new Decimal(0)).sub(prevPitAmount),
    );

    const pitAmountDetails = {
      profitMethodAmount: compareResult.profitMethodAmount,
      percentageMethodAmount: percentageMethodPeriodAmount,
    };

    this.log.log(LOG_ACTIONS.CALCULATE_TAX, {
      status: LOG_STATUS.SUCCESS,
      userId,
      financialPeriodId: targetFp.id,
      detail: 'Compare PIT methods for tax group 2',
    });

    return pitAmountDetails;
  }

  async summary(userId: string) {
    const [countOpen, countExpire, resTotalTax] = await Promise.all([
      this.prisma.financialPeriod.count({
        where: {
          userId,
          status: PeriodStatus.OPEN,
        },
      }),
      this.prisma.$queryRaw<{ count: number | null }[]>`
        SELECT COUNT(*)::bigint AS count
        FROM financial_periods 
        WHERE user_id = ${userId}
          AND (actual_payment_date IS NULL AND NOW() > deadline_date)
      `,
      this.prisma.financialPeriod.aggregate({
        _sum: {
          taxAmount: true,
        },
        where: {
          status: PeriodStatus.CLOSED,
          userId,
        },
      }),
    ]);
    return {
      countOpen,
      countExpire: countExpire[0] ? Number(countExpire[0].count) : 0,
      totalTaxPayment: resTotalTax._sum.taxAmount
        ? Number(resTotalTax._sum.taxAmount)
        : 0,
    };
  }

  async findAll(
    userId: string,
    page: number = 1,
    limit: number = 20,
    status?: string,
  ) {
    const skip = limit * (page - 1);
    const where: Prisma.FinancialPeriodWhereInput = { userId };
    if (status) {
      const upperStatus = status.trim().toUpperCase();
      if (upperStatus === 'OPENING' || upperStatus === 'DANG_MO'){
        where.status = PeriodStatus.OPEN;
      }
      if (upperStatus === 'CLOSED' || upperStatus === 'DA_KHOA'){
        where.status = PeriodStatus.CLOSED;
      }
      if (upperStatus === 'EXPIRE' || upperStatus === 'QUA_HAN'){
        where.status = PeriodStatus.OPEN;
        const now = moment().toDate();
        where.endDate = {
          lt: now,
        };
      }
      if (upperStatus === 'FINISHED' || upperStatus === 'HOAN_THANH') {
        where.status = PeriodStatus.CLOSED;
        where.actualPaymentDate = {
          not: null,
        };
      }
    }
    const [total, periods] = await Promise.all([
      this.prisma.financialPeriod.count({
        where: {
          userId,
        },
      }),
      this.prisma.financialPeriod.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const enriched = periods.map((p) => this.enrichPeriodWithPenalty(p));
    return {
      data: mapToDto(FinancialPeriodResponseDto, enriched),
      meta: {
        total,
        page,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  async findOne(
    userId: string,
    publicId: string,
  ): Promise<FinancialPeriodResponseDto> {
    const period = await this.prisma.financialPeriod.findUnique({
      where: { publicId },
    });

    if (!period || period.userId !== userId) {
      throw new NotFoundException('Financial period not found.');
    }

    const enriched = this.enrichPeriodWithPenalty(period);
    return mapToDto(FinancialPeriodResponseDto, enriched);
  }

  enrichPeriodWithPenalty(period: any) {
    const countExpireDate = period.actualPaymentDate
      ? moment(period.actualPaymentDate).diff(period.deadlineDate, 'day')
      : moment().diff(period.deadlineDate, 'day') > 0
        ? moment().diff(period.deadlineDate, 'day')
        : 0;

    const lateDays = Math.max(0, countExpireDate);
    const penaltyResult = this.taxEngine.calculatePenaltyAmount(
      new Decimal(period.taxAmount || 0),
      lateDays,
    );

    return {
      ...period,
      penaltyAmount: penaltyResult.penaltyAmount.toNumber(),
    };
  }
}
