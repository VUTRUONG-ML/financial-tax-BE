import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { CreateFinancialPeriodDto } from './dto/create-financial-period.dto';
import { UpdateFinancialPeriodDto } from './dto/update-financial-period.dto';
import { FinancialPeriodResponseDto } from './dto/financial-period-response.dto';
import { RequestUser } from '../common/interface/request-user.interface';
import { AppLogger } from '../common/logger/app-logger.service';
import {
  LOG_ACTIONS,
  LOG_STATUS,
} from '../common/constants/log-events.constant';
import { Role } from '@prisma/client';
import { mapToDto } from 'src/common/utils/mapper.util';
import {
  AuditLogService,
  tableWrite,
} from '../core/audit-log/audit-log.service';

@Injectable()
export class FinancialPeriodsService {
  private readonly log = new AppLogger(FinancialPeriodsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async create(
    user: RequestUser,
    createDto: CreateFinancialPeriodDto,
  ): Promise<FinancialPeriodResponseDto> {
    return await this.prisma.$transaction(async (tx) => {
      const period = await tx.financialPeriod.create({
        data: {
          userId: user.id,
          periodName: createDto.periodName,
          startDate: new Date(createDto.startDate),
          endDate: new Date(createDto.endDate),
          deadlineDate: new Date(createDto.deadlineDate),
          taxAmount: createDto.taxAmount,
        },
      });

      await this.auditLog.logChange(
        tx,
        user.id,
        'CREATE',
        tableWrite.period,
        period.id,
        null,
        { ...createDto },
        'Initial financial period for user',
      );

      this.log.log(LOG_ACTIONS.CREATE_FINANCIAL_PERIOD, {
        status: LOG_STATUS.SUCCESS,
        userId: user.id,
        publicId: period.publicId,
      });

      return mapToDto(FinancialPeriodResponseDto, period);
    });
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
}
