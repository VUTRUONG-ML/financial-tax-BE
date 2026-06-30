import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { FinancialPeriodsService } from '../financial-periods/financial-periods.service';
import { TaxEngineService } from '../tax-engine/tax-engine.service';
import { SaveStep1Dto } from './dto/save-step-1.dto';
import { StocksService } from '../stocks/stocks.service';
import { VouchersService } from '../vouchers/vouchers.service';
import { SubmitDeclarationDto } from './dto/submit-declaration.dto';
import { TaxFormsService } from '../tax-forms/tax-forms.service';
import {
  TAXPAYER_OPTIONS,
  TAX_PERIOD_OPTIONS,
  DECLARATION_TYPE_OPTIONS,
  DECLARATION_FORM_OPTIONS,
} from './constants/tax-declaration.constant';
import { mapToDto } from '../common/utils/mapper.util';
import { TaxDeclarationHistoryItemDto } from './dto/tax-declaration-history-item.dto';
import { Prisma, PeriodStatus, PitMethod, FinancialPeriod, TaxConfiguration, TaxDeclarationDraft } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/client';

type TaxConfigurationWithIndustry = TaxConfiguration & {
  industry: {
    categoryName: string;
  };
};
import { moment } from '../common/utils/time.util';
import { AppLogger } from '../common/logger/app-logger.service';
import {
  LOG_ACTIONS,
  LOG_STATUS,
} from '../common/constants/log-events.constant';
import {
  AuditLogService,
  tableWrite,
} from '../core/audit-log/audit-log.service';
import type {
  Step1Data,
  Step2Data,
  Step3Data,
  Step4Data,
  DeclarationFormType,
} from './interfaces/tax-declaration-step.interface';

export function getTaxDeclarationPeriodRange(
  periodStartDate: Date,
  periodEndDate: Date,
  taxPeriodOption?: string,
): { startDate: Date; endDate: Date; usePeriodId: boolean } {
  const startOfYear = moment(periodStartDate).startOf('year');

  if (taxPeriodOption?.startsWith('6 tháng đầu năm')) {
    return {
      startDate: startOfYear.clone().toDate(), // 01/01
      endDate: startOfYear.clone().month(5).endOf('month').toDate(), // 30/06
      usePeriodId: false,
    };
  }

  if (taxPeriodOption?.startsWith('6 tháng cuối năm')) {
    return {
      startDate: startOfYear.clone().month(6).startOf('month').toDate(), // 01/07
      endDate: startOfYear.clone().endOf('year').toDate(), // 31/12
      usePeriodId: false,
    };
  }

  if (taxPeriodOption?.startsWith('Năm')) {
    return {
      startDate: startOfYear.clone().toDate(), // 01/01
      endDate: startOfYear.clone().endOf('year').toDate(), // 31/12
      usePeriodId: false,
    };
  }

  // Mặc định (khớp kỳ Tháng/Quý gốc của người dùng)
  return {
    startDate: periodStartDate,
    endDate: periodEndDate,
    usePeriodId: true,
  };
}

@Injectable()
export class TaxDeclarationService {
  private readonly logger = new AppLogger(TaxDeclarationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly financialPeriodsService: FinancialPeriodsService,
    private readonly taxEngineService: TaxEngineService,
    private readonly auditLogService: AuditLogService,
    private readonly stocksService: StocksService,
    private readonly vouchersService: VouchersService,
    private readonly taxFormsService: TaxFormsService,
  ) {}

  private async findPeriodAndCheckOwnership(
    userId: string,
    publicId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const period = await tx.financialPeriod.findUnique({ where: { publicId } });
    if (!period) throw new NotFoundException('Financial period not found.');
    if (period.userId !== userId)
      throw new ForbiddenException(
        'You do not have permission to access this financial period.',
      );
    return period;
  }

  private async findDraftByPeriodId(
    periodId: number,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    return tx.taxDeclarationDraft.findUnique({
      where: { financialPeriodId: periodId },
    });
  }

  // kiểm tra trạng thái nút lập tờ khai
  async init(userId: string) {
    const openPeriods = await this.prisma.financialPeriod.findMany({
      where: { userId, status: PeriodStatus.OPEN },
      orderBy: { startDate: 'asc' },
    });

    const closedPeriods = await this.prisma.financialPeriod.findMany({
      where: { userId, status: PeriodStatus.CLOSED },
      orderBy: { startDate: 'asc' },
    });

    const eligibleClosedPeriods: any[] = [];
    for (const period of closedPeriods) {
      const taxConfig = await this.prisma.taxConfiguration.findFirst({
        where: {
          userId,
          applyFromDate: { lte: period.endDate },
          applyToDate: { gte: period.endDate },
        },
      });
      const taxGroupId = taxConfig?.taxGroupId ?? 1;

      if (taxGroupId !== 1) {
        // Kiểm tra xem đã nộp tờ quyết toán năm 02 cho kỳ này chưa
        const hasQtt = await this.prisma.taxFormExport.findFirst({
          where: {
            periodId: period.id,
            formType: '02_CNKD_TNCN_QTT',
            exportStatus: 'SUCCESS',
          },
        });
        if (!hasQtt) {
          eligibleClosedPeriods.push(period);
        }
      }
    }

    const availablePeriods = [...openPeriods, ...eligibleClosedPeriods].sort(
      (a, b) => a.startDate.getTime() - b.startDate.getTime(),
    );

    const declarationCount = await this.prisma.taxDeclaration.count({
      where: { period: { userId } },
    });

    return {
      message: 'Tax declaration init success.',
      data: {
        isFirstTime: declarationCount === 0,
        availablePeriods,
      },
    };
  }

  async getDeclarationOptions(userId: string, publicId: string) {
    const period = await this.findPeriodAndCheckOwnership(userId, publicId);

    const taxConfig = await this.prisma.taxConfiguration.findFirst({
      where: {
        userId,
        applyFromDate: { lte: period.endDate },
        applyToDate: { gte: period.endDate },
      },
    });
    const taxGroupId = taxConfig?.taxGroupId ?? 1;

    // Nếu kỳ đang CLOSED, chỉ được lập tờ Quyết toán 02_CNKD_TNCN_QTT
    if (period.status === PeriodStatus.CLOSED) {
      if (taxGroupId !== 1) {
        return [DECLARATION_FORM_OPTIONS.FORM_02_CNKD_TNCN_QTT];
      }
      return [];
    }

    if (taxGroupId === 1) {
      return [DECLARATION_FORM_OPTIONS.FORM_01_TKN_CNKD];
    } else {
      return [
        DECLARATION_FORM_OPTIONS.FORM_01_CNKD,
        DECLARATION_FORM_OPTIONS.FORM_02_CNKD_TNCN_QTT,
      ];
    }
  }

  getDeclarationFormType(draft: any, taxGroupId?: number): DeclarationFormType {
    const step1 = draft?.step1Data as unknown as Step1Data;
    if (step1?.declarationOptions?.declarationFormType) {
      return step1.declarationOptions.declarationFormType;
    }
    // Hỗ trợ cả trường hợp draft cũ phẳng
    if ((step1 as any)?.declarationFormType) {
      return (step1 as any).declarationFormType;
    }
    return taxGroupId === 1 ? '01_TKN_CNKD' : '01_CNKD';
  }

  // khi nhấn vào nút bắt đầu
  async startSession(
    userId: string,
    publicId: string,
    declarationFormType: DeclarationFormType,
  ) {
    const period = await this.findPeriodAndCheckOwnership(userId, publicId);

    const taxConfig = await this.prisma.taxConfiguration.findFirst({
      where: {
        userId,
        ...(period
          ? {
              applyFromDate: { lte: period.endDate },
              applyToDate: { gte: period.endDate },
            }
          : {
              applyFromDate: { lte: moment().toDate() },
              applyToDate: { gte: moment().toDate() },
            }),
      },
    });
    const taxGroupId = taxConfig?.taxGroupId ?? 1;
    const allowedTypes: DeclarationFormType[] =
      taxGroupId === 1 ? ['01_TKN_CNKD'] : ['01_CNKD', '02_CNKD_TNCN_QTT'];
    if (!allowedTypes.includes(declarationFormType)) {
      throw new BadRequestException({
        message: `Declaration form type ${declarationFormType} is not allowed for your tax group.`,
        errorCode: 'INVALID_DECLARATION_TYPE',
      });
    }

    // Nếu kỳ đã CLOSED, chỉ cho phép bắt đầu lập tờ Quyết toán 02
    if (period.status === PeriodStatus.CLOSED && declarationFormType !== '02_CNKD_TNCN_QTT') {
      throw new BadRequestException({
        message: 'Only Quyết toán thuế (Form 02) can be filed on a closed financial period.',
        errorCode: 'INVALID_PERIOD_STATUS',
      });
    }

    const draft = await this.prisma.taxDeclarationDraft.findUnique({
      where: { financialPeriodId: period.id },
    });

    const step1 = (draft?.step1Data as any) || {};
    if (!step1.declarationOptions) {
      step1.declarationOptions = {};
    }
    step1.declarationOptions.declarationFormType = declarationFormType;

    const initialStep1Data = {
      declarationOptions: {
        declarationFormType,
      },
    };

    return await this.prisma.taxDeclarationDraft.upsert({
      where: { financialPeriodId: period.id },
      update: {
        step1Data: step1 as unknown as Prisma.InputJsonValue,
      },
      create: {
        userId,
        financialPeriodId: period.id,
        step1Data: initialStep1Data as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private getDefaultTaxpayerOption(taxConfig?: (TaxConfiguration & { industry?: { categoryName: string } }) | null): string {
    if (!taxConfig) {
      return TAXPAYER_OPTIONS.HKD_UNDER_1B;
    }
    if (taxConfig.chosenPitMethod === 'EXEMPT' || taxConfig.taxGroupId === 1) {
      return TAXPAYER_OPTIONS.HKD_UNDER_1B;
    }
    if (taxConfig.chosenPitMethod === 'PERCENTAGE') {
      return TAXPAYER_OPTIONS.HKD_ON_REVENUE;
    }
    if (
      taxConfig.chosenPitMethod &&
      ['PROFIT_15', 'PROFIT_17', 'PROFIT_20'].includes(taxConfig.chosenPitMethod)
    ) {
      return TAXPAYER_OPTIONS.HKD_ON_PROFIT;
    }
    return taxConfig.taxGroupId === 1
      ? TAXPAYER_OPTIONS.HKD_UNDER_1B
      : TAXPAYER_OPTIONS.HKD_ON_REVENUE;
  }

  private getDefaultTaxPeriod(taxConfig?: TaxConfiguration | null): string {
    if (!taxConfig || taxConfig.taxGroupId === 1) {
      return TAX_PERIOD_OPTIONS.YEAR;
    }
    const filingPeriod = taxConfig.vatFilingPeriod;
    return filingPeriod === 'MONTHLY'
      ? TAX_PERIOD_OPTIONS.MONTH
      : filingPeriod === 'PER_OCCURRENCE'
        ? TAX_PERIOD_OPTIONS.PER_OCCURRENCE
        : TAX_PERIOD_OPTIONS.QUARTER;
  }

  private async getAvailablePeriodOptions(
    taxGroupId: number,
    periodId: number,
    defaultTaxPeriod: string,
    periodStartDate: Date,
    periodName: string,
    formType: string,
  ): Promise<{ availablePeriodOptions: string[]; defaultPeriodOption: string }> {
    if (taxGroupId !== 1) {
      if (formType === DECLARATION_FORM_OPTIONS.FORM_02_CNKD_TNCN_QTT.code) {
        const currentYear = periodStartDate.getFullYear();
        const optFullYear = `Năm ${currentYear}`;
        return {
          availablePeriodOptions: [optFullYear],
          defaultPeriodOption: optFullYear,
        };
      }
      return {
        availablePeriodOptions: [periodName],
        defaultPeriodOption: periodName,
      };
    }

    const now = moment();
    const currentYear = periodStartDate.getFullYear();
    const midYearThreshold = moment(`${currentYear}-07-01`).startOf('day');

    const hasSubmittedFirstHalf =
      (await this.prisma.taxDeclaration.count({
        where: {
          periodId,
          xmlContent: { contains: '6 tháng đầu năm' },
        },
      })) > 0;

    const optFirstHalf = `6 tháng đầu năm ${currentYear}`;
    const optLastHalf = `6 tháng cuối năm ${currentYear}`;
    const optFullYear = periodName; // Ví dụ: "Năm 2026"

    if (now.isBefore(midYearThreshold)) {
      return {
        availablePeriodOptions: [optFirstHalf],
        defaultPeriodOption: optFirstHalf,
      };
    }

    if (hasSubmittedFirstHalf) {
      return {
        availablePeriodOptions: [optLastHalf, optFullYear],
        defaultPeriodOption: optLastHalf,
      };
    }

    return {
      availablePeriodOptions: [optFullYear],
      defaultPeriodOption: optFullYear,
    };
  }

  // Step 1
  async getStep1(userId: string, publicId: string): Promise<Step1Data> {
    const period = await this.findPeriodAndCheckOwnership(userId, publicId);
    const draft = await this.findDraftByPeriodId(period.id);
    const currentTaxConfig = await this.prisma.taxConfiguration.findFirst({
      where: {
        userId,
        applyFromDate: { lte: period.endDate },
        applyToDate: { gte: period.endDate },
      },
      include: {
        industry: true,
      },
    });

    const taxGroupId = currentTaxConfig?.taxGroupId ?? 1;
    if (taxGroupId === 1) {
      return this.getStep1ForGroup1(userId, period, draft, currentTaxConfig);
    } else {
      return this.getStep1ForGroupGreater1(
        userId,
        period,
        draft,
        currentTaxConfig,
      );
    }
  }

  private async getStep1ForGroup1(
    userId: string,
    period: FinancialPeriod,
    draft: TaxDeclarationDraft | null,
    currentTaxConfig: TaxConfigurationWithIndustry | null,
  ): Promise<Step1Data> {
    const formType = this.getDeclarationFormType(draft, 1);
    // Check if exported previously
    const hasExported = await this.prisma.taxFormExport.findFirst({
      where: {
        periodId: period.id,
        formType: DECLARATION_FORM_OPTIONS.FORM_01_TKN_CNKD.code,
        exportStatus: 'SUCCESS',
      },
    });
    const defaultDeclType = hasExported
      ? DECLARATION_TYPE_OPTIONS.ADDITIONAL : DECLARATION_TYPE_OPTIONS.FIRST_TIME;

    const defaultTaxpayerOpt = this.getDefaultTaxpayerOption(currentTaxConfig);
    const defaultTaxPeriod = this.getDefaultTaxPeriod(currentTaxConfig);

    const { availablePeriodOptions, defaultPeriodOption } =
      await this.getAvailablePeriodOptions(
        1,
        period.id,
        defaultTaxPeriod,
        period.startDate,
        period.periodName,
        formType,
      );

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const draftStep1 = draft?.step1Data as unknown as Partial<Step1Data> | null;

    const finalTaxPeriodOption = draftStep1?.declarationOptions?.taxPeriodOption || defaultPeriodOption;
    const calculatedRange = getTaxDeclarationPeriodRange(
      period.startDate,
      period.endDate,
      finalTaxPeriodOption,
    );

    const step1: Step1Data = {
      financialPeriodInfo: {
        periodName: period.periodName,
        vatFilingPeriod: period.vatFilingPeriod,
        startDate: period.startDate,
        endDate: period.endDate,
        calculatedRange,
      },
      taxpayerProfile: {
        taxCode: draftStep1?.taxpayerProfile?.taxCode || user?.taxCode || '',
        businessName: draftStep1?.taxpayerProfile?.businessName || user?.businessName || '',
        ownerName: draftStep1?.taxpayerProfile?.ownerName || user?.ownerName || '',
        phone: draftStep1?.taxpayerProfile?.phone || user?.phoneNumber || '',
        cccdNumber: draftStep1?.taxpayerProfile?.cccdNumber || user?.cccdNumber || '',
        address: draftStep1?.taxpayerProfile?.address || 'Số 123, Đường Lý Thường Kiệt, Phường Trần Hưng Đạo, Quận Hoàn Kiếm, TP. Hà Nội',
        provinceCity: draftStep1?.taxpayerProfile?.provinceCity || user?.provinceCity || '',
        industry: draftStep1?.taxpayerProfile?.industry || currentTaxConfig?.industry.categoryName || '',
      },
      declarationOptions: {
        declarationFormType: formType,
        taxpayerOption: draftStep1?.declarationOptions?.taxpayerOption || defaultTaxpayerOpt,
        taxPeriodOption: finalTaxPeriodOption,
        declarationTypeOption: draftStep1?.declarationOptions?.declarationTypeOption || defaultDeclType,
        availablePeriodOptions,
      },
      authorizedAgentInfo: {
        authorizedFilerName: draftStep1?.authorizedAgentInfo?.authorizedFilerName || '',
        authorizedFilerTaxCode: draftStep1?.authorizedAgentInfo?.authorizedFilerTaxCode || '',
        authorizedFilerDocNumber: draftStep1?.authorizedAgentInfo?.authorizedFilerDocNumber || '',
        authorizedFilerDocDate: draftStep1?.authorizedAgentInfo?.authorizedFilerDocDate || null,
        taxAgentName: draftStep1?.authorizedAgentInfo?.taxAgentName || '',
        taxAgentTaxCode: draftStep1?.authorizedAgentInfo?.taxAgentTaxCode || '',
      },
    };

    return step1;
  }

  private async getStep1ForGroupGreater1(
    userId: string,
    period: FinancialPeriod,
    draft: TaxDeclarationDraft | null,
    currentTaxConfig: TaxConfigurationWithIndustry | null,
  ): Promise<Step1Data> {
    const taxGroupId = currentTaxConfig?.taxGroupId ?? 2;
    const formType = this.getDeclarationFormType(draft, taxGroupId);
    
    // Check if exported previously
    const hasExported = await this.prisma.taxFormExport.findFirst({
      where: {
        periodId: period.id,
        formType: formType,
        exportStatus: 'SUCCESS',
      },
    });
    const defaultDeclType = hasExported
      ? DECLARATION_TYPE_OPTIONS.ADDITIONAL : DECLARATION_TYPE_OPTIONS.FIRST_TIME;

    const defaultTaxpayerOpt = this.getDefaultTaxpayerOption(currentTaxConfig);
    const defaultTaxPeriod = this.getDefaultTaxPeriod(currentTaxConfig);

    const { availablePeriodOptions, defaultPeriodOption } = await this.getAvailablePeriodOptions(
      taxGroupId,
      period.id,
      defaultTaxPeriod,
      period.startDate,
      period.periodName,
      formType,
    );

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const draftStep1 = draft?.step1Data as unknown as Partial<Step1Data> | null;

    const finalTaxPeriodOption = draftStep1?.declarationOptions?.taxPeriodOption || defaultPeriodOption;
    const calculatedRange = getTaxDeclarationPeriodRange(
      period.startDate,
      period.endDate,
      finalTaxPeriodOption,
    );

    const step1: Step1Data = {
      financialPeriodInfo: {
        periodName: period.periodName,
        vatFilingPeriod: period.vatFilingPeriod,
        startDate: period.startDate,
        endDate: period.endDate,
        calculatedRange,
      },
      taxpayerProfile: {
        taxCode: draftStep1?.taxpayerProfile?.taxCode || user?.taxCode || '',
        businessName: draftStep1?.taxpayerProfile?.businessName || user?.businessName || '',
        ownerName: draftStep1?.taxpayerProfile?.ownerName || user?.ownerName || '',
        phone: draftStep1?.taxpayerProfile?.phone || user?.phoneNumber || '',
        cccdNumber: draftStep1?.taxpayerProfile?.cccdNumber || user?.cccdNumber || '',
        address: draftStep1?.taxpayerProfile?.address || 'Số 123, Đường Lý Thường Kiệt, Phường Trần Hưng Đạo, Quận Hoàn Kiếm, TP. Hà Nội',
        provinceCity: draftStep1?.taxpayerProfile?.provinceCity || user?.provinceCity || '',
        industry: draftStep1?.taxpayerProfile?.industry || currentTaxConfig?.industry.categoryName || '',
      },
      declarationOptions: {
        declarationFormType: formType,
        taxpayerOption: draftStep1?.declarationOptions?.taxpayerOption || defaultTaxpayerOpt,
        taxPeriodOption: finalTaxPeriodOption,
        declarationTypeOption: draftStep1?.declarationOptions?.declarationTypeOption || defaultDeclType,
        availablePeriodOptions,
      },
      authorizedAgentInfo: {
        authorizedFilerName: draftStep1?.authorizedAgentInfo?.authorizedFilerName || '',
        authorizedFilerTaxCode: draftStep1?.authorizedAgentInfo?.authorizedFilerTaxCode || '',
        authorizedFilerDocNumber: draftStep1?.authorizedAgentInfo?.authorizedFilerDocNumber || '',
        authorizedFilerDocDate: draftStep1?.authorizedAgentInfo?.authorizedFilerDocDate || null,
        taxAgentName: draftStep1?.authorizedAgentInfo?.taxAgentName || '',
        taxAgentTaxCode: draftStep1?.authorizedAgentInfo?.taxAgentTaxCode || '',
      },
    };

    return step1;
  }

  async saveStep1(userId: string, publicId: string, dto: SaveStep1Dto) {
    const period = await this.findPeriodAndCheckOwnership(userId, publicId);
    const draft = await this.findDraftByPeriodId(period.id);
    const currentTaxConfig = await this.prisma.taxConfiguration.findFirst({
      where: {
        userId,
        applyFromDate: { lte: period.endDate },
        applyToDate: { gte: period.endDate },
      },
      include: {
        industry: true,
      },
    });

    const taxGroupId = currentTaxConfig?.taxGroupId ?? 1;
    if (taxGroupId === 1) {
      return this.saveStep1ForGroup1(userId, period, draft, currentTaxConfig, dto);
    } else {
      return this.saveStep1ForGroupGreater1(userId, period, draft, currentTaxConfig, dto);
    }
  }

  private async saveStep1ForGroup1(
    userId: string,
    period: FinancialPeriod,
    draft: TaxDeclarationDraft | null,
    currentTaxConfig: TaxConfigurationWithIndustry | null,
    dto: SaveStep1Dto,
  ) {
    const formType = this.getDeclarationFormType(draft, 1);
    const defaultTaxPeriod = this.getDefaultTaxPeriod(currentTaxConfig);

    const { availablePeriodOptions, defaultPeriodOption } = await this.getAvailablePeriodOptions(
      1,
      period.id,
      defaultTaxPeriod,
      period.startDate,
      period.periodName,
      formType,
    );

    const chosenPeriodOption = dto.taxPeriodOption || defaultPeriodOption;

    // if (!availablePeriodOptions.includes(chosenPeriodOption)) {
    //   this.logger.warn(LOG_ACTIONS.VALIDATE_FINANCIAL_PERIOD, {
    //     status: LOG_STATUS.FAILED,
    //     reason: 'TAX_PERIOD_OPTION_DISALLOWED',
    //     userId,
    //     chosenOption: chosenPeriodOption,
    //     available: availablePeriodOptions,
    //   });
    //   throw new BadRequestException(
    //     `The chosen tax period option "${chosenPeriodOption}" is disallowed. Available options: ${availablePeriodOptions.join(', ')}`,
    //   );
    // }

    const calculatedRange = getTaxDeclarationPeriodRange(
      period.startDate,
      period.endDate,
      chosenPeriodOption,
    );

    const draftStep1 = draft?.step1Data as unknown as Partial<Step1Data> | null;
    const step1: Step1Data = {
      financialPeriodInfo: {
        periodName: period.periodName,
        vatFilingPeriod: period.vatFilingPeriod,
        startDate: period.startDate,
        endDate: period.endDate,
        calculatedRange,
      },
      taxpayerProfile: {
        taxCode: dto.taxCode ?? '',
        businessName: dto.businessName ?? '',
        ownerName: dto.ownerName ?? '',
        phone: draftStep1?.taxpayerProfile?.phone || '',
        cccdNumber: dto.cccdNumber ?? '',
        address: draftStep1?.taxpayerProfile?.address || 'Số 123, Đường Lý Thường Kiệt, Phường Trần Hưng Đạo, Quận Hoàn Kiếm, TP. Hà Nội',
        provinceCity: dto.provinceCity ?? '',
        industry: currentTaxConfig?.industry.categoryName ?? '',
      },
      declarationOptions: {
        declarationFormType: formType,
        taxpayerOption: dto.taxpayerOption ?? '',
        taxPeriodOption: chosenPeriodOption,
        declarationTypeOption: dto.declarationTypeOption ?? '',
        availablePeriodOptions,
      },
      authorizedAgentInfo: {
        authorizedFilerName: dto.authorizedFilerName ?? '',
        authorizedFilerTaxCode: dto.authorizedFilerTaxCode ?? '',
        authorizedFilerDocNumber: dto.authorizedFilerDocNumber ?? '',
        authorizedFilerDocDate: dto.authorizedFilerDocDate ? new Date(dto.authorizedFilerDocDate) : null,
        taxAgentName: dto.taxAgentName ?? '',
        taxAgentTaxCode: dto.taxAgentTaxCode ?? '',
      },
    };

    return await this.prisma.taxDeclarationDraft.update({
      where: { financialPeriodId: period.id },
      data: { step1Data: step1 as unknown as Prisma.InputJsonValue },
    });
  }

  private async saveStep1ForGroupGreater1(
    userId: string,
    period: FinancialPeriod,
    draft: TaxDeclarationDraft | null,
    currentTaxConfig: TaxConfigurationWithIndustry | null,
    dto: SaveStep1Dto,
  ) {
    const taxGroupId = currentTaxConfig?.taxGroupId ?? 2;
    const formType = this.getDeclarationFormType(draft, taxGroupId);
    const defaultTaxPeriod = this.getDefaultTaxPeriod(currentTaxConfig);

    const { availablePeriodOptions, defaultPeriodOption } = await this.getAvailablePeriodOptions(
      taxGroupId,
      period.id,
      defaultTaxPeriod,
      period.startDate,
      period.periodName,
      formType,
    );

    const chosenPeriodOption = dto.taxPeriodOption || defaultPeriodOption;

    // if (!availablePeriodOptions.includes(chosenPeriodOption)) {
    //   this.logger.warn(LOG_ACTIONS.VALIDATE_FINANCIAL_PERIOD, {
    //     status: LOG_STATUS.FAILED,
    //     reason: 'TAX_PERIOD_OPTION_DISALLOWED',
    //     userId,
    //     chosenOption: chosenPeriodOption,
    //     available: availablePeriodOptions,
    //   });
    //   throw new BadRequestException(
    //     `The chosen tax period option "${chosenPeriodOption}" is disallowed. Available options: ${availablePeriodOptions.join(', ')}`,
    //   );
    // }

    const calculatedRange = getTaxDeclarationPeriodRange(
      period.startDate,
      period.endDate,
      chosenPeriodOption,
    );

    const draftStep1 = draft?.step1Data as unknown as Partial<Step1Data> | null;
    const step1: Step1Data = {
      financialPeriodInfo: {
        periodName: period.periodName,
        vatFilingPeriod: period.vatFilingPeriod,
        startDate: period.startDate,
        endDate: period.endDate,
        calculatedRange,
      },
      taxpayerProfile: {
        taxCode: dto.taxCode ?? '',
        businessName: dto.businessName ?? '',
        ownerName: dto.ownerName ?? '',
        phone: draftStep1?.taxpayerProfile?.phone || '',
        cccdNumber: dto.cccdNumber ?? '',
        address: draftStep1?.taxpayerProfile?.address || 'Số 123, Đường Lý Thường Kiệt, Phường Trần Hưng Đạo, Quận Hoàn Kiếm, TP. Hà Nội',
        provinceCity: dto.provinceCity ?? '',
        industry: currentTaxConfig?.industry.categoryName ?? '',
      },
      declarationOptions: {
        declarationFormType: formType,
        taxpayerOption: dto.taxpayerOption ?? '',
        taxPeriodOption: chosenPeriodOption,
        declarationTypeOption: dto.declarationTypeOption ?? '',
        availablePeriodOptions,
      },
      authorizedAgentInfo: {
        authorizedFilerName: dto.authorizedFilerName ?? '',
        authorizedFilerTaxCode: dto.authorizedFilerTaxCode ?? '',
        authorizedFilerDocNumber: dto.authorizedFilerDocNumber ?? '',
        authorizedFilerDocDate: dto.authorizedFilerDocDate ? new Date(dto.authorizedFilerDocDate) : null,
        taxAgentName: dto.taxAgentName ?? '',
        taxAgentTaxCode: dto.taxAgentTaxCode ?? '',
      },
    };

    return await this.prisma.taxDeclarationDraft.update({
      where: { financialPeriodId: period.id },
      data: { step1Data: step1 as unknown as Prisma.InputJsonValue },
    });
  }

  private async buildStep2Data(
    userId: string,
    period: FinancialPeriod,
  ): Promise<Step2Data> {
    const taxConfig = await this.prisma.taxConfiguration.findFirst({
      where: {
        userId,
        applyFromDate: { lte: period.endDate },
        applyToDate: { gte: period.endDate },
      },
      orderBy: { applyFromDate: 'desc' },
    });

    if (!taxConfig) {
      throw new BadRequestException(
        'You have not set up the tax configuration for this tax period.',
      );
    }

    const draft = await this.findDraftByPeriodId(period.id);
    const draftStep1 = draft?.step1Data as any;
    const chosenPeriodOption = draftStep1?.declarationOptions?.taxPeriodOption;

    const { startDate, endDate, usePeriodId } = getTaxDeclarationPeriodRange(
      period.startDate,
      period.endDate,
      chosenPeriodOption,
    );

    const [realtimeData, industriesData, transactionCount] = await Promise.all([
      this.financialPeriodsService.calculateRealtimeTaxData(
        userId,
        startDate,
        endDate,
        usePeriodId ? period.id : undefined,
      ),
      this.financialPeriodsService.getRevenueByIndustry(
        userId,
        startDate,
        endDate,
        undefined,
        usePeriodId ? period.id : undefined,
      ),
      this.prisma.invoice.count({
        where: {
          userId,
          status: 'ISSUED',
          ...(usePeriodId
            ? { periodId: period.id }
            : { issueDate: { gte: startDate, lte: endDate } }),
        },
      }),
    ]);

    const periodTax = await this.financialPeriodsService.calculatePeriodTax(
      userId,
      { startDate, endDate },
      taxConfig,
      realtimeData.revenue,
      realtimeData.expense,
    );

    const categoryIds = industriesData.map((i) => i.taxCategoryId);
    const categories = await this.prisma.taxCategory.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, categoryName: true },
    });
    const categoryMap = new Map(categories.map((c) => [c.id, c.categoryName]));

    const industriesList = industriesData.map((ind) => {
      const rev = ind.revenue.toNumber();
      const vatRateVal = ind.vatRate.toNumber();
      const pitRateVal = ind.pitRate.toNumber();

      return {
        categoryName: categoryMap.get(ind.taxCategoryId) || 'Ngành nghề khác',
        vatRate: vatRateVal,
        pitRate: pitRateVal,
        revenue: rev,
      };
    });

    return {
      periodName: period.periodName,
      industries: industriesList,
      estimatedVat: periodTax.vatAmount ? periodTax.vatAmount.toNumber() : 0,
      transactionCount,
      confirmedRevenue: realtimeData.revenue.toNumber(),
    };
  }

  // step 2
  async getStep2(userId: string, publicId: string) {
    const period = await this.findPeriodAndCheckOwnership(userId, publicId);
    const draft = await this.findDraftByPeriodId(period.id);
    // Ưu tiên trả về dữ liệu đã lưu trong draft
    if (draft?.step2Data) return draft.step2Data as unknown as Step2Data;

    // Tính realtime
    return await this.buildStep2Data(userId, period);
  }

  async saveStep2(userId: string, publicId: string) {
    const period = await this.findPeriodAndCheckOwnership(userId, publicId);

    const step2 = await this.buildStep2Data(userId, period);

    return await this.prisma.taxDeclarationDraft.update({
      where: { financialPeriodId: period.id },
      data: { step2Data: step2 as unknown as Prisma.InputJsonValue },
    });
  }

  // step 3
  async getStep3(userId: string, publicId: string) {
    const period = await this.findPeriodAndCheckOwnership(userId, publicId);
    const draft = await this.findDraftByPeriodId(period.id);

    const taxConfig = await this.prisma.taxConfiguration.findFirst({
      where: {
        userId,
        applyFromDate: { lte: period.endDate },
        applyToDate: { gte: period.endDate },
      },
    });
    const taxGroupId = taxConfig?.taxGroupId ?? 1;
    const formType = this.getDeclarationFormType(draft, taxGroupId);

    if (formType !== '02_CNKD_TNCN_QTT') {
      throw new BadRequestException({
        message: 'Steps 3 and 4 are not applicable for this declaration form type.',
        errorCode: 'STEP_NOT_APPLICABLE',
      });
    }

    if (draft?.step3Data) return draft.step3Data as unknown as Step3Data;

    const draftStep1 = draft?.step1Data as any;
    const chosenPeriodOption = draftStep1?.declarationOptions?.taxPeriodOption;
    const { startDate, endDate, usePeriodId } = getTaxDeclarationPeriodRange(
      period.startDate,
      period.endDate,
      chosenPeriodOption,
    );

    if (usePeriodId) {
      return await this.stocksService.calculatePeriodInventorySummary(
        userId,
        period.id,
      );
    } else {
      const [ytdOpeningDetails, ytdImportedDetails, ytdExportedValueDecimal] =
        await Promise.all([
          this.prisma.stockReceiptDetail.aggregate({
            where: {
              receipt: {
                userId,
                status: 'APPROVED',
                sourceType: 'OPENING',
                receiptDate: { gte: startDate, lte: endDate },
              },
              product: {
                productType: { not: 'SERVICE' },
              },
            },
            _sum: {
              totalValue: true,
            },
          }),
          this.prisma.stockReceiptDetail.aggregate({
            where: {
              receipt: {
                userId,
                status: 'APPROVED',
                sourceType: { not: 'OPENING' },
                receiptDate: { gte: startDate, lte: endDate },
              },
              product: {
                productType: { not: 'SERVICE' },
              },
            },
            _sum: {
              totalValue: true,
            },
          }),
          this.stocksService.calculateExportedCost(userId, {
            startDate,
            endDate,
          }),
        ]);

      const ytdOpeningValue = ytdOpeningDetails._sum.totalValue?.toNumber() ?? 0;
      const ytdImportedValue = ytdImportedDetails._sum.totalValue?.toNumber() ?? 0;
      const ytdExportedValue = ytdExportedValueDecimal.toNumber();
      const ytdClosingValue = ytdOpeningValue + ytdImportedValue - ytdExportedValue;

      return {
        openingValue: ytdOpeningValue,
        importedValue: ytdImportedValue,
        exportedValue: ytdExportedValue,
        closingValue: ytdClosingValue,
      };
    }
  }

  async saveStep3(userId: string, publicId: string) {
    const period = await this.findPeriodAndCheckOwnership(userId, publicId);
    const draft = await this.findDraftByPeriodId(period.id);

    const taxConfig = await this.prisma.taxConfiguration.findFirst({
      where: {
        userId,
        applyFromDate: { lte: period.endDate },
        applyToDate: { gte: period.endDate },
      },
    });
    const taxGroupId = taxConfig?.taxGroupId ?? 1;
    const formType = this.getDeclarationFormType(draft, taxGroupId);

    if (formType !== '02_CNKD_TNCN_QTT') {
      throw new BadRequestException({
        message: 'Steps 3 and 4 are not applicable for this declaration form type.',
        errorCode: 'STEP_NOT_APPLICABLE',
      });
    }

    if (!draft?.step2Data)
      throw new BadRequestException({
        message: 'Please complete Step 2 first.',
        errorCode: 'STEP_2_NOT_COMPLETED',
      });

    const draftStep1 = draft.step1Data as any;
    const chosenPeriodOption = draftStep1?.declarationOptions?.taxPeriodOption;
    const { startDate, endDate, usePeriodId } = getTaxDeclarationPeriodRange(
      period.startDate,
      period.endDate,
      chosenPeriodOption,
    );

    // Đánh chặn: kiểm tra doanh thu realtime có khớp với step2 đã snapshot không
    const step2Data = draft.step2Data as unknown as Step2Data;
    const realtimeData =
      await this.financialPeriodsService.calculateRealtimeTaxData(
        userId,
        startDate,
        endDate,
        usePeriodId ? period.id : undefined,
      );
    if (realtimeData.revenue.toNumber() !== step2Data.confirmedRevenue) {
      throw new BadRequestException({
        message: 'Revenue has changed, please return to Step 2 to update.',
        errorCode: 'DATA_CHANGED',
      });
    }

    let step3;
    if (usePeriodId) {
      step3 = await this.stocksService.calculatePeriodInventorySummary(
        userId,
        period.id,
      );
    } else {
      const [ytdOpeningDetails, ytdImportedDetails, ytdExportedValueDecimal] =
        await Promise.all([
          this.prisma.stockReceiptDetail.aggregate({
            where: {
              receipt: {
                userId,
                status: 'APPROVED',
                sourceType: 'OPENING',
                receiptDate: { gte: startDate, lte: endDate },
              },
              product: {
                productType: { not: 'SERVICE' },
              },
            },
            _sum: {
              totalValue: true,
            },
          }),
          this.prisma.stockReceiptDetail.aggregate({
            where: {
              receipt: {
                userId,
                status: 'APPROVED',
                sourceType: { not: 'OPENING' },
                receiptDate: { gte: startDate, lte: endDate },
              },
              product: {
                productType: { not: 'SERVICE' },
              },
            },
            _sum: {
              totalValue: true,
            },
          }),
          this.stocksService.calculateExportedCost(userId, {
            startDate,
            endDate,
          }),
        ]);

      const ytdOpeningValue = ytdOpeningDetails._sum.totalValue?.toNumber() ?? 0;
      const ytdImportedValue = ytdImportedDetails._sum.totalValue?.toNumber() ?? 0;
      const ytdExportedValue = ytdExportedValueDecimal.toNumber();
      const ytdClosingValue = ytdOpeningValue + ytdImportedValue - ytdExportedValue;

      step3 = {
        openingValue: ytdOpeningValue,
        importedValue: ytdImportedValue,
        exportedValue: ytdExportedValue,
        closingValue: ytdClosingValue,
      };
    }

    return await this.prisma.taxDeclarationDraft.update({
      where: { financialPeriodId: period.id },
      data: { step3Data: step3 as unknown as Prisma.InputJsonValue },
    });
  }

  // step 4
  async getStep4(userId: string, publicId: string) {
    const period = await this.findPeriodAndCheckOwnership(userId, publicId);
    const draft = await this.findDraftByPeriodId(period.id);

    const taxConfig = await this.prisma.taxConfiguration.findFirst({
      where: {
        userId,
        applyFromDate: { lte: period.endDate },
        applyToDate: { gte: period.endDate },
      },
    });
    const taxGroupId = taxConfig?.taxGroupId ?? 1;
    const formType = this.getDeclarationFormType(draft, taxGroupId);

    if (formType !== '02_CNKD_TNCN_QTT') {
      throw new BadRequestException({
        message:
          'Steps 3 and 4 are not applicable for this declaration form type.',
        errorCode: 'STEP_NOT_APPLICABLE',
      });
    }

    if (draft?.step4Data) return draft.step4Data as unknown as Step4Data;

    const draftStep1 = draft?.step1Data as any;
    const chosenPeriodOption = draftStep1?.declarationOptions?.taxPeriodOption;
    const { startDate, endDate } = getTaxDeclarationPeriodRange(
      period.startDate,
      period.endDate,
      chosenPeriodOption,
    );

    // Tính realtime
    const [materialCost, voucherExpenses] = await Promise.all([
      this.stocksService.calculateTotalMaterialCost(userId, startDate, endDate),
      this.vouchersService.calculateVoucherExpensesGrouped(userId, startDate, endDate),
    ]);

    const totalExpense = materialCost.toNumber() +
      voucherExpenses.chi_phi_nhan_cong +
      voucherExpenses.chi_phi_khau_hao +
      voucherExpenses.chi_phi_dich_vu_mua_ngoai +
      voucherExpenses.chi_phi_lai_vay +
      voucherExpenses.chi_phi_khac;

    const step4: Step4Data = {
      totalExpense,
      chiPhiNguyenVatLieu: materialCost.toNumber(),
      chiPhiNhanCong: voucherExpenses.chi_phi_nhan_cong,
      chiPhiKhauHao: voucherExpenses.chi_phi_khau_hao,
      chiPhiDichVuMuaNgoai: voucherExpenses.chi_phi_dich_vu_mua_ngoai,
      chiPhiLaiVay: voucherExpenses.chi_phi_lai_vay,
      chiPhiKhac: voucherExpenses.chi_phi_khac,
    };
    return step4;
  }

  async saveStep4(userId: string, publicId: string) {
    const period = await this.findPeriodAndCheckOwnership(userId, publicId);
    const draft = await this.findDraftByPeriodId(period.id);

    const taxConfig = await this.prisma.taxConfiguration.findFirst({
      where: {
        userId,
        applyFromDate: { lte: period.endDate },
        applyToDate: { gte: period.endDate },
      },
    });
    const taxGroupId = taxConfig?.taxGroupId ?? 1;
    const formType = this.getDeclarationFormType(draft, taxGroupId);

    if (formType !== '02_CNKD_TNCN_QTT') {
      throw new BadRequestException({
        message: 'Steps 3 and 4 are not applicable for this declaration form type.',
        errorCode: 'STEP_NOT_APPLICABLE',
      });
    }

    if (!draft?.step2Data)
      throw new BadRequestException({
        message: 'Please complete Step 2 first.',
        errorCode: 'STEP_2_NOT_COMPLETED',
      });
    if (!draft.step3Data)
      throw new BadRequestException({
        message: 'Please complete Step 3 first.',
        errorCode: 'STEP_3_NOT_COMPLETED',
      });

    const draftStep1 = draft.step1Data as any;
    const chosenPeriodOption = draftStep1?.declarationOptions?.taxPeriodOption;
    const { startDate, endDate, usePeriodId } = getTaxDeclarationPeriodRange(
      period.startDate,
      period.endDate,
      chosenPeriodOption,
    );

    // Đánh chặn lũy tiến: doanh thu không được lệch với Step 2 đã snapshot
    const step2Data = draft.step2Data as unknown as Step2Data;
    const realtimeData =
      await this.financialPeriodsService.calculateRealtimeTaxData(
        userId,
        startDate,
        endDate,
        usePeriodId ? period.id : undefined,
      );
    if (realtimeData.revenue.toNumber() !== step2Data.confirmedRevenue) {
      throw new BadRequestException({
        message: 'Revenue has changed, please return to Step 2 to update.',
        errorCode: 'DATA_CHANGED',
      });
    }

    // Snapshot chi phí thực tế từ DB vào draft
    const [materialCost, voucherExpenses] = await Promise.all([
      this.stocksService.calculateTotalMaterialCost(userId, startDate, endDate),
      this.vouchersService.calculateVoucherExpensesGrouped(userId, startDate, endDate),
    ]);

    const totalExpense = materialCost.toNumber() +
      voucherExpenses.chi_phi_nhan_cong +
      voucherExpenses.chi_phi_khau_hao +
      voucherExpenses.chi_phi_dich_vu_mua_ngoai +
      voucherExpenses.chi_phi_lai_vay +
      voucherExpenses.chi_phi_khac;

    const step4: Step4Data = {
      totalExpense,
      chiPhiNguyenVatLieu: materialCost.toNumber(),
      chiPhiNhanCong: voucherExpenses.chi_phi_nhan_cong,
      chiPhiKhauHao: voucherExpenses.chi_phi_khau_hao,
      chiPhiDichVuMuaNgoai: voucherExpenses.chi_phi_dich_vu_mua_ngoai,
      chiPhiLaiVay: voucherExpenses.chi_phi_lai_vay,
      chiPhiKhac: voucherExpenses.chi_phi_khac,
    };

    return await this.prisma.taxDeclarationDraft.update({
      where: { financialPeriodId: period.id },
      data: { step4Data: step4 as unknown as Prisma.InputJsonValue },
    });
  }

  // step 5
  async getStep5Preview(userId: string, publicId: string) {
    const period = await this.findPeriodAndCheckOwnership(userId, publicId);
    const draft = await this.findDraftByPeriodId(period.id);
    if (!draft) throw new NotFoundException('Tax declaration draft not found.');

    const taxConfig = await this.prisma.taxConfiguration.findFirst({
      where: {
        userId,
        applyFromDate: { lte: period.endDate },
        applyToDate: { gte: period.endDate },
      },
    });
    const taxGroupId = taxConfig?.taxGroupId ?? 1;
    const formType = this.getDeclarationFormType(draft, taxGroupId);

    // 1. So sánh hai mức thuế TNCN (profitMethodAmount và percentageMethodAmount)
    const pitComparison = await this.financialPeriodsService.comparePit(userId, publicId);

    // 2. Thuế giá trị gia tăng (VAT) từ snapshot của Bước 2
    const step2Data = draft.step2Data as unknown as Step2Data;
    const vatAmount = step2Data?.estimatedVat ?? 0;

    // 3. Doanh thu & Chi phí trong kỳ hiện tại
    const inPeriodRevenue = step2Data ? step2Data.confirmedRevenue : 0;
    let inPeriodExpense = 0;
    if (formType === '02_CNKD_TNCN_QTT') {
      const step4Data = draft.step4Data as unknown as Step4Data;
      inPeriodExpense = step4Data ? step4Data.totalExpense : 0;
    } else {
      const realtimeData = await this.financialPeriodsService.calculateRealtimeTaxData(
        userId,
        period.startDate,
        period.endDate,
      );
      inPeriodExpense = realtimeData.expense.toNumber();
    }

    // Doanh thu & Chi phí lũy kế YTD từ đầu năm tài chính
    const startOfYear = moment(period.startDate).startOf('year').toDate();
    const mostRecentDeclaration = await this.prisma.taxDeclaration.findFirst({
      where: {
        period: {
          userId,
          startDate: { gte: startOfYear },
          endDate: { lt: period.startDate },
          status: PeriodStatus.CLOSED,
        },
      },
      orderBy: {
        period: {
          endDate: 'desc',
        },
      },
    });

    const ytdRevenue =
      formType === '02_CNKD_TNCN_QTT'
        ? inPeriodRevenue
        : (mostRecentDeclaration?.ytdRevenue?.toNumber() ?? 0) + inPeriodRevenue;
    const ytdExpense =
      formType === '02_CNKD_TNCN_QTT'
        ? inPeriodExpense
        : (mostRecentDeclaration?.ytdExpense?.toNumber() ?? 0) + inPeriodExpense;

    // Tính ytdPitPaid: Tổng thuế TNCN đã kê khai/tạm nộp trong năm.
    // Với quyết toán năm, ta tính tổng pitAmount từ tất cả các kỳ CLOSED của năm hiện tại.
    // Với tờ khai định kỳ, ta chỉ lấy tổng pitTaxAmount từ các tờ khai trước đó.
    let ytdPitPaid = 0;
    if (formType === '02_CNKD_TNCN_QTT') {
      const closedPeriodsOfYear = await this.prisma.financialPeriod.findMany({
        where: {
          userId,
          startDate: { gte: startOfYear },
          endDate: { lte: period.endDate },
          status: PeriodStatus.CLOSED,
        },
        select: {
          pitAmount: true,
        },
      });
      ytdPitPaid = closedPeriodsOfYear.reduce(
        (sum, p) => sum + (p.pitAmount?.toNumber() ?? 0),
        0,
      );
    } else {
      const priorDeclarations = await this.prisma.taxDeclaration.findMany({
        where: {
          period: {
            userId,
            startDate: { gte: startOfYear },
            endDate: { lt: period.startDate },
          },
        },
        select: {
          pitTaxAmount: true,
        },
      });
      ytdPitPaid = priorDeclarations.reduce(
        (sum, d) => sum + (d.pitTaxAmount?.toNumber() ?? 0),
        0,
      );
    }

    // Tính chi tiết chi phí lũy kế YTD và tồn kho YTD nếu là tờ quyết toán năm 02
    let ytdExpenseBreakdown: any = null;
    let ytdInventoryBreakdown: any = null;

    if (formType === '02_CNKD_TNCN_QTT') {
      // 1. Chi phí nguyên vật liệu YTD
      const materialCostYtd = await this.stocksService.calculateTotalMaterialCost(
        userId,
        startOfYear,
        period.endDate,
      );

      // 2. Chi phí từ vouchers YTD
      const voucherExpensesYtd = await this.vouchersService.calculateVoucherExpensesGrouped(
        userId,
        startOfYear,
        period.endDate,
      );

      const totalExpenseYtd =
        materialCostYtd.toNumber() +
        voucherExpensesYtd.chi_phi_nhan_cong +
        voucherExpensesYtd.chi_phi_khau_hao +
        voucherExpensesYtd.chi_phi_dich_vu_mua_ngoai +
        voucherExpensesYtd.chi_phi_lai_vay +
        voucherExpensesYtd.chi_phi_khac;

      ytdExpenseBreakdown = {
        totalExpense: totalExpenseYtd,
        chiPhiNguyenVatLieu: materialCostYtd.toNumber(),
        chiPhiNhanCong: voucherExpensesYtd.chi_phi_nhan_cong,
        chiPhiKhauHao: voucherExpensesYtd.chi_phi_khau_hao,
        chiPhiDichVuMuaNgoai: voucherExpensesYtd.chi_phi_dich_vu_mua_ngoai,
        chiPhiLaiVay: voucherExpensesYtd.chi_phi_lai_vay,
        chiPhiKhac: voucherExpensesYtd.chi_phi_khac,
      };

      // 3. Tồn kho YTD
      const [ytdOpeningDetails, ytdImportedDetails, ytdExportedValueDecimal] =
        await Promise.all([
          this.prisma.stockReceiptDetail.aggregate({
            where: {
              receipt: {
                userId,
                status: 'APPROVED',
                sourceType: 'OPENING',
                receiptDate: { gte: startOfYear, lte: period.endDate },
              },
              product: {
                productType: { not: 'SERVICE' },
              },
            },
            _sum: {
              totalValue: true,
            },
          }),
          this.prisma.stockReceiptDetail.aggregate({
            where: {
              receipt: {
                userId,
                status: 'APPROVED',
                sourceType: { not: 'OPENING' },
                receiptDate: { gte: startOfYear, lte: period.endDate },
              },
              product: {
                productType: { not: 'SERVICE' },
              },
            },
            _sum: {
              totalValue: true,
            },
          }),
          this.stocksService.calculateExportedCost(userId, {
            startDate: startOfYear,
            endDate: period.endDate,
          }),
        ]);

      const ytdOpeningValue = ytdOpeningDetails._sum.totalValue?.toNumber() ?? 0;
      const ytdImportedValue = ytdImportedDetails._sum.totalValue?.toNumber() ?? 0;
      const ytdExportedValue = ytdExportedValueDecimal.toNumber();
      const ytdClosingValue = ytdOpeningValue + ytdImportedValue - ytdExportedValue;

      ytdInventoryBreakdown = {
        openingValue: ytdOpeningValue,
        importedValue: ytdImportedValue,
        exportedValue: ytdExportedValue,
        closingValue: ytdClosingValue,
      };
    }

    // 4. Danh sách ngành nghề đã kinh doanh
    const [periodIndustries, ytdIndustries] = await Promise.all([
      this.financialPeriodsService.getRevenueByIndustry(userId, period.startDate, period.endDate),
      this.financialPeriodsService.getRevenueByIndustry(userId, startOfYear, period.endDate),
    ]);

    const pitCalc =
      this.taxEngineService.calculatePitPercentageMultipleIndustries(
        ytdIndustries.map((ind) => ({
          taxCategoryId: ind.taxCategoryId,
          pitRate: ind.pitRate,
          ytdRevenue: ind.revenue,
        })),
      );

    const categoryIds = ytdIndustries.map((i) => i.taxCategoryId);
    const categories = await this.prisma.taxCategory.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, categoryName: true },
    });
    const categoryMap = new Map(categories.map((c) => [c.id, c.categoryName]));
    const periodRevenueMap = new Map(
      periodIndustries.map((p) => [p.taxCategoryId, p.revenue.toNumber()]),
    );

    const detailMap = new Map(pitCalc.details.map((d) => [d.taxCategoryId, d]));

    const operatedIndustries = ytdIndustries.map((ytd) => {
      const detail = detailMap.get(ytd.taxCategoryId);
      const periodRevenue = periodRevenueMap.get(ytd.taxCategoryId) || 0;
      const ytdRevenueVal = ytd.revenue.toNumber();
      const taxableRevenueVal = detail ? detail.taxableRevenue.toNumber() : 0;
      const exemptionAllocatedVal = detail
        ? ytdRevenueVal - taxableRevenueVal
        : ytdRevenueVal;

      return {
        categoryName: categoryMap.get(ytd.taxCategoryId) || 'Ngành nghề khác',
        revenue: periodRevenue,
        ytdRevenue: ytdRevenueVal,
        pitRate: ytd.pitRate.toNumber(),
        ytdExemption: exemptionAllocatedVal,
        ytdTaxableRevenue: taxableRevenueVal,
      };
    });

    return {
      period,
      step1Data: (draft.step1Data as unknown as Step1Data) ?? null,
      step2Data: (draft.step2Data as unknown as Step2Data) ?? null,
      step3Data: (draft.step3Data as unknown as Step3Data) ?? null,
      step4Data: (draft.step4Data as unknown as Step4Data) ?? null,
      pitComparison: {
        profitMethodAmount:
          pitComparison.profitMethodAmount instanceof Decimal
            ? pitComparison.profitMethodAmount.toNumber()
            : pitComparison.profitMethodAmount,
        percentageMethodAmount:
          pitComparison.percentageMethodAmount instanceof Decimal
            ? pitComparison.percentageMethodAmount.toNumber()
            : pitComparison.percentageMethodAmount,
      },
      vatAmount: vatAmount,
      ytdRevenue,
      ytdExpense,
      ytdPitPaid,
      ytdExpenseBreakdown,
      ytdInventoryBreakdown,
      operatedIndustries,
    };
  }

  // nộp tờ khai
  async submit(
    userId: string,
    publicId: string,
    dto: SubmitDeclarationDto,
    file?: Express.Multer.File,
  ) {
    const period = await this.findPeriodAndCheckOwnership(userId, publicId);
    const draft = await this.findDraftByPeriodId(period.id);

    const taxConfig = await this.prisma.taxConfiguration.findFirst({
      where: {
        userId,
        applyFromDate: { lte: period.endDate },
        applyToDate: { gte: period.endDate },
      },
    });
    const taxGroupId = taxConfig?.taxGroupId ?? 1;
    const formType = this.getDeclarationFormType(draft, taxGroupId);

    if (formType === '02_CNKD_TNCN_QTT') {
      if (!draft?.step2Data || !draft?.step4Data) {
        throw new BadRequestException({
          message:
            'Incomplete draft data. Please complete all steps before submitting.',
          errorCode: 'DRAFT_INCOMPLETE',
        });
      }
    } else {
      if (!draft?.step2Data) {
        throw new BadRequestException({
          message:
            'Incomplete draft data. Please complete Step 2 before submitting.',
          errorCode: 'DRAFT_INCOMPLETE',
        });
      }
    }

    const step2Data = draft.step2Data as unknown as Step2Data;
    const step4Data = (draft.step4Data as unknown as Step4Data) || { totalExpense: 0 };

    const draftStep1 = draft.step1Data as any;
    const chosenPeriodOption = draftStep1?.declarationOptions?.taxPeriodOption;
    const { startDate, endDate, usePeriodId } = getTaxDeclarationPeriodRange(
      period.startDate,
      period.endDate,
      chosenPeriodOption,
    );

    // Chốt chặn: so sánh realtime với số tĩnh trong draft
    const realtimeData =
      await this.financialPeriodsService.calculateRealtimeTaxData(
        userId,
        startDate,
        endDate,
        usePeriodId ? period.id : undefined,
      );

    const isRevenueChanged =
      realtimeData.revenue.toNumber() !== step2Data.confirmedRevenue;
    const isExpenseChanged =
      formType !== '02_CNKD_TNCN_QTT'
        ? false
        : realtimeData.expense.toNumber() !== step4Data.totalExpense;

    if (isRevenueChanged || isExpenseChanged) {
      throw new ConflictException({
        message: 'Data has changed since last confirmed.',
        errorCode: 'DATA_CHANGED',
        isDataChanged: true,
        draftData: {
          revenue: step2Data.confirmedRevenue,
          expense: formType === '02_CNKD_TNCN_QTT' ? step4Data.totalExpense : realtimeData.expense.toNumber(),
        },
        realTimeData: {
          revenue: realtimeData.revenue.toNumber(),
          expense: realtimeData.expense.toNumber(),
        },
      });
    }

    const expense =
      formType === '02_CNKD_TNCN_QTT'
        ? step4Data.totalExpense
        : realtimeData.expense.toNumber();

    return await this.processSubmission(
      userId,
      publicId,
      period.id,
      dto.chosenPitMethod,
      step2Data.confirmedRevenue,
      expense,
      dto.xmlContent,
      formType,
      period.endDate.getFullYear(),
      chosenPeriodOption,
      file,
    );
  }

  async submitForce(
    userId: string,
    publicId: string,
    dto: SubmitDeclarationDto,
    file?: Express.Multer.File,
  ) {
    const period = await this.findPeriodAndCheckOwnership(userId, publicId);
    const draft = await this.findDraftByPeriodId(period.id);

    const draftStep1 = draft?.step1Data as any;
    const chosenPeriodOption = draftStep1?.declarationOptions?.taxPeriodOption;
    const { startDate, endDate, usePeriodId } = getTaxDeclarationPeriodRange(
      period.startDate,
      period.endDate,
      chosenPeriodOption,
    );

    // Tự động đồng bộ với số realtime mới nhất
    const realtimeData =
      await this.financialPeriodsService.calculateRealtimeTaxData(
        userId,
        startDate,
        endDate,
        usePeriodId ? period.id : undefined,
      );

    const taxConfig = await this.prisma.taxConfiguration.findFirst({
      where: {
        userId,
        applyFromDate: { lte: period.endDate },
        applyToDate: { gte: period.endDate },
      },
    });
    const taxGroupId = taxConfig?.taxGroupId ?? 1;
    const formType = this.getDeclarationFormType(draft, taxGroupId);

    return await this.processSubmission(
      userId,
      publicId,
      period.id,
      dto.chosenPitMethod,
      realtimeData.revenue.toNumber(),
      realtimeData.expense.toNumber(),
      dto.xmlContent,
      formType,
      period.endDate.getFullYear(),
      chosenPeriodOption,
      file,
    );
  }

  async submitIgnoreWarning(
    userId: string,
    publicId: string,
    dto: SubmitDeclarationDto,
    file?: Express.Multer.File,
  ) {
    const period = await this.findPeriodAndCheckOwnership(userId, publicId);
    const draft = await this.findDraftByPeriodId(period.id);

    const taxConfig = await this.prisma.taxConfiguration.findFirst({
      where: {
        userId,
        applyFromDate: { lte: period.endDate },
        applyToDate: { gte: period.endDate },
      },
    });
    const taxGroupId = taxConfig?.taxGroupId ?? 1;
    const formType = this.getDeclarationFormType(draft, taxGroupId);

    if (formType === '02_CNKD_TNCN_QTT') {
      if (!draft?.step2Data || !draft?.step4Data) {
        throw new BadRequestException({
          message:
            'Incomplete draft data. Please complete all steps before submitting.',
          errorCode: 'DRAFT_INCOMPLETE',
        });
      }
    } else {
      if (!draft?.step2Data) {
        throw new BadRequestException({
          message:
            'Incomplete draft data. Please complete Step 2 before submitting.',
          errorCode: 'DRAFT_INCOMPLETE',
        });
      }
    }

    const step2Data = draft.step2Data as unknown as Step2Data;
    const step4Data = (draft.step4Data as unknown as Step4Data) || {
      totalExpense: 0,
    };

    const draftStep1 = draft.step1Data as any;
    const chosenPeriodOption = draftStep1?.declarationOptions?.taxPeriodOption;
    const { startDate, endDate, usePeriodId } = getTaxDeclarationPeriodRange(
      period.startDate,
      period.endDate,
      chosenPeriodOption,
    );

    let expense = 0;
    if (formType === '02_CNKD_TNCN_QTT') {
      expense = step4Data.totalExpense;
    } else {
      const realtimeData =
        await this.financialPeriodsService.calculateRealtimeTaxData(
          userId,
          startDate,
          endDate,
          usePeriodId ? period.id : undefined,
        );
      expense = realtimeData.expense.toNumber();
    }

    // Bỏ qua kiểm tra realtime, dùng số cũ trong draft
    const result = await this.processSubmission(
      userId,
      publicId,
      period.id,
      dto.chosenPitMethod,
      step2Data.confirmedRevenue,
      expense,
      dto.xmlContent,
      formType,
      period.endDate.getFullYear(),
      chosenPeriodOption,
      file,
    );

    await this.auditLogService.logChange(
      this.prisma,
      userId,
      'UPDATE',
      tableWrite.tax_declaration,
      result.declaration.id,
      null,
      null,
      `User deliberately bypassed data mismatch warning on ${new Date().toISOString()} and submitted with old draft numbers.`,
    );

    return result;
  }

  // ── Internal processSubmission ───────────────────────────────────────────────

  private async processSubmission(
    userId: string,
    publicId: string,
    periodId: number,
    chosenPitMethod: PitMethod,
    revenue: number,
    expense: number,
    xmlContent: string,
    formType: string,
    taxYear: number,
    chosenPeriodOption: string,
    file?: Express.Multer.File,
  ) {
    return await this.prisma.$transaction(async (tx) => {
      let closedPeriod: any;
      let vatAmount: Decimal;
      let pitAmount: Decimal;
      let ytdRevenue: Decimal;
      let ytdExpense: Decimal;

      if (formType === '02_CNKD_TNCN_QTT') {
        const targetPeriod = await tx.financialPeriod.findUnique({
          where: { id: periodId },
        });
        if (!targetPeriod || targetPeriod.userId !== userId) {
          throw new NotFoundException('Financial period not found.');
        }

        let currentTaxConfig = await tx.taxConfiguration.findFirst({
          where: {
            userId,
            applyFromDate: { lte: targetPeriod.endDate },
            applyToDate: { gte: targetPeriod.endDate },
          },
        });
        if (!currentTaxConfig) {
          throw new ConflictException(
            'You have not set up the tax configuration for this tax period.',
          );
        }
        currentTaxConfig = await tx.taxConfiguration.update({
          where: { id: currentTaxConfig.id },
          data: { chosenPitMethod },
        });

        const taxResult = await this.financialPeriodsService.calculatePeriodTax(
          userId,
          targetPeriod,
          currentTaxConfig,
          new Decimal(revenue),
          new Decimal(expense),
          tx,
        );

        closedPeriod = targetPeriod;
        vatAmount = taxResult.vatAmount;
        pitAmount = taxResult.pitAmount;
        ytdRevenue = new Decimal(revenue);
        ytdExpense = new Decimal(expense);
      } else {
        // Chốt sổ period bên trong cùng transaction
        const result = await this.financialPeriodsService.closeFinancialPeriod(
          userId,
          publicId,
          {
            chosenPitMethod,
            revenue,
            expense,
            // Nếu chốt 6 tháng đầu năm, chúng ta không đóng kỳ YEARLY gốc. Cờ chốt được quyết định dựa trên chosenPeriodOption.
            isHalfYearSubmission: chosenPeriodOption?.startsWith('6 tháng đầu năm'),
          },
          tx,
        );
        closedPeriod = result.period;
        vatAmount = result.vatAmount;
        pitAmount = result.pitAmount;
        ytdRevenue = result.ytdRevenue;
        ytdExpense = result.ytdExpense;
      }

      const finalTotalTax = formType === '02_CNKD_TNCN_QTT' ? vatAmount.add(pitAmount) : (closedPeriod.taxAmount ?? vatAmount.add(pitAmount));

      // Sinh tờ khai TaxDeclaration chính thức (dùng upsert để tránh lỗi unique constraint của periodId khi nộp tiếp các bán niên tiếp theo của cùng kỳ năm)
      const declaration = await tx.taxDeclaration.upsert({
        where: { periodId },
        update: {
          declaredRevenue: revenue,
          declaredExpense: expense,
          ytdRevenue,
          ytdExpense,
          vatTaxAmount: vatAmount,
          pitTaxAmount: pitAmount,
          totalTaxAmount: finalTotalTax,
          chosenPitMethod,
          xmlContent: xmlContent,
        },
        create: {
          periodId,
          declaredRevenue: revenue,
          declaredExpense: expense,
          ytdRevenue,
          ytdExpense,
          vatTaxAmount: vatAmount,
          pitTaxAmount: pitAmount,
          totalTaxAmount: finalTotalTax,
          chosenPitMethod,
          xmlContent: xmlContent,
        },
      });

      // Tạo thêm record TaxFormExport đồng bộ qua TaxFormsService để tái sử dụng logic
      await this.taxFormsService.createTaxForm(
        userId,
        {
          formType,
          periodId,
          taxYear,
          xmlContent,
        },
        file,
        tx, // Truyền transaction client để đảm bảo tính nhất quán (Atomicity)
      );

      // Dọn dẹp bản nháp
      await tx.taxDeclarationDraft.deleteMany({
        where: { financialPeriodId: periodId },
      });

      return { closedPeriod, declaration };
    });
  }

  async getDeclarationHistory(userId: string) {
    // Truy vấn duy nhất 1 lần lấy TaxDeclaration kèm theo thông tin của kỳ và danh sách file export của kỳ đó
    const declarations = await this.prisma.taxDeclaration.findMany({
      where: {
        period: {
          userId,
        },
      },
      include: {
        period: {
          include: {
            taxFormExports: {
              where: {
                createdBy: userId,
              },
              orderBy: {
                createdAt: 'desc',
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return mapToDto(TaxDeclarationHistoryItemDto, declarations);
  }
}
