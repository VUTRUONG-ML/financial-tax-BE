import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { moment } from '../common/utils/time.util';
import { PrismaService } from '../core/prisma/prisma.service';
import { UpdateFinancialPeriodDto } from './dto/update-financial-period.dto';
import { FinancialPeriodResponseDto } from './dto/financial-period-response.dto';
import { RequestUser } from '../common/interface/request-user.interface';
import { AppLogger } from '../common/logger/app-logger.service';
import {
  LOG_ACTIONS,
  LOG_STATUS,
} from '../common/constants/log-events.constant';
import { FilingPeriod, Prisma, Role } from '@prisma/client';
import { mapToDto } from 'src/common/utils/mapper.util';
import {
  AuditLogService,
  tableWrite,
} from '../core/audit-log/audit-log.service';
import { Dayjs } from 'dayjs';

@Injectable()
export class FinancialPeriodsService {
  private readonly log = new AppLogger(FinancialPeriodsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  private calculatePeriodMetadata(
    transactionDate: Date,
    filingPeriod: FilingPeriod,
  ) {
    const now = moment(transactionDate).startOf('day');

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

    // 2. Nếu chưa có, tiến hành tạo mới (sử dụng logic tạo kỳ đã thảo luận)
    if (!period) {
      const taxConfig = await tx.taxConfiguration.findFirst({
        where: {
          userId,
          applyToDate: null,
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
}
