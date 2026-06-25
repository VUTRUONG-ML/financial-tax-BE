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
import { SubmitDeclarationDto } from './dto/submit-declaration.dto';
import {
  TAXPAYER_OPTIONS,
  TAX_PERIOD_OPTIONS,
  DECLARATION_TYPE_OPTIONS,
} from './constants/tax-declaration.constant';
import { Prisma, PeriodStatus, PitMethod, FinancialPeriod } from '@prisma/client';
import { AppLogger } from '../common/logger/app-logger.service';
import {
  AuditLogService,
  tableWrite,
} from '../core/audit-log/audit-log.service';
import type {
  Step1Data,
  Step2Data,
  Step3Data,
  Step4Data,
} from './interfaces/tax-declaration-step.interface';

@Injectable()
export class TaxDeclarationService {
  private readonly logger = new AppLogger(TaxDeclarationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly financialPeriodsService: FinancialPeriodsService,
    private readonly taxEngineService: TaxEngineService,
    private readonly auditLogService: AuditLogService,
    private readonly stocksService: StocksService,
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
    const availablePeriods = await this.prisma.financialPeriod.findMany({
      where: { userId, status: PeriodStatus.OPEN },
      orderBy: { startDate: 'asc' },
    });

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

  // khi nhấn vào nút bắt đầu
  async startSession(userId: string, publicId: string) {
    const period = await this.findPeriodAndCheckOwnership(userId, publicId);

    if (period.status !== PeriodStatus.OPEN) {
      throw new BadRequestException({
        message: 'Financial period is not open.',
        errorCode: 'PERIOD_NOT_OPEN',
      });
    }

    // Upsert: nếu đã có draft cũ thì giữ nguyên, chưa có thì tạo mới
    return await this.prisma.taxDeclarationDraft.upsert({
      where: { financialPeriodId: period.id },
      update: {},
      create: {
        userId,
        financialPeriodId: period.id,
      },
    });
  }

  // Step 1
  async getStep1(userId: string, publicId: string) {
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

    // Xác định formType và check lịch sử kết xuất trong TaxFormExport
    const targetFormType = currentTaxConfig?.taxGroupId === 1 ? '01_TKN_CNKD' : '01_CNKD';
    const hasExported = await this.prisma.taxFormExport.findFirst({
      where: {
        periodId: period.id,
        formType: targetFormType,
        exportStatus: 'SUCCESS',
      },
    });
    const defaultDeclType = hasExported ? DECLARATION_TYPE_OPTIONS.ADDITIONAL : DECLARATION_TYPE_OPTIONS.FIRST_TIME;

    // Xác định taxpayerOption mặc định dựa trên chosenPitMethod
    let defaultTaxpayerOpt = '';
    if (currentTaxConfig) {
      if (currentTaxConfig.chosenPitMethod === 'EXEMPT' || currentTaxConfig.taxGroupId === 1) {
        defaultTaxpayerOpt = TAXPAYER_OPTIONS.HKD_UNDER_1B;
      } else if (currentTaxConfig.chosenPitMethod === 'PERCENTAGE') {
        defaultTaxpayerOpt = TAXPAYER_OPTIONS.HKD_ON_REVENUE;
      } else if (
        currentTaxConfig.chosenPitMethod === 'PROFIT_15' ||
        currentTaxConfig.chosenPitMethod === 'PROFIT_17' ||
        currentTaxConfig.chosenPitMethod === 'PROFIT_20'
      ) {
        defaultTaxpayerOpt = TAXPAYER_OPTIONS.HKD_ON_PROFIT;
      }
    }
    if (!defaultTaxpayerOpt) {
      defaultTaxpayerOpt = currentTaxConfig?.taxGroupId === 1
        ? TAXPAYER_OPTIONS.HKD_UNDER_1B
        : TAXPAYER_OPTIONS.HKD_ON_REVENUE;
    }

    // Xác định taxPeriodOption mặc định (Nhóm 1 mặc định là 'Năm', Nhóm 2, 3, 4 ánh xạ từ vatFilingPeriod)
    let defaultTaxPeriod = TAX_PERIOD_OPTIONS.QUARTER;
    if (currentTaxConfig?.taxGroupId === 1) {
      defaultTaxPeriod = TAX_PERIOD_OPTIONS.YEAR;
    } else if (currentTaxConfig) {
      const filingPeriod = currentTaxConfig.vatFilingPeriod;
      defaultTaxPeriod = filingPeriod === 'MONTHLY'
        ? TAX_PERIOD_OPTIONS.MONTH
        : filingPeriod === 'PER_OCCURRENCE'
        ? TAX_PERIOD_OPTIONS.PER_OCCURRENCE
        : TAX_PERIOD_OPTIONS.QUARTER;
    }

    // Ưu tiên trả về dữ liệu đã lưu trong draft và merge thêm các giá trị mặc định nếu thiếu
    if (draft?.step1Data) {
      const existing = draft.step1Data as unknown as Step1Data;
      return {
        ...existing,
        taxpayerOption: existing.taxpayerOption || defaultTaxpayerOpt,
        taxPeriodOption: existing.taxPeriodOption || defaultTaxPeriod,
        declarationTypeOption: existing.declarationTypeOption || defaultDeclType,
        authorizedFilerName: existing.authorizedFilerName ?? '',
        authorizedFilerTaxCode: existing.authorizedFilerTaxCode ?? '',
        authorizedFilerDocNumber: existing.authorizedFilerDocNumber ?? '',
        authorizedFilerDocDate: existing.authorizedFilerDocDate ?? null,
        taxAgentName: existing.taxAgentName ?? '',
        taxAgentTaxCode: existing.taxAgentTaxCode ?? '',
      } as unknown as Step1Data;
    }

    // Auto-fill từ User profile
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const step1: Step1Data = {
      businessName: user?.businessName ?? '',
      taxCode: user?.taxCode ?? '',
      cccdNumber: user?.cccdNumber ?? '',
      industry: currentTaxConfig?.industry.categoryName ?? '',
      ownerName: user?.ownerName ?? '',
      phone: user?.phoneNumber ?? '',
      address:
        'Số 123, Đường Lý Thường Kiệt, Phường Trần Hưng Đạo, Quận Hoàn Kiếm, TP. Hà Nội',
      provinceCity: user?.provinceCity ?? '',
      taxpayerOption: defaultTaxpayerOpt,
      taxPeriodOption: defaultTaxPeriod,
      declarationTypeOption: defaultDeclType,
      authorizedFilerName: '',
      authorizedFilerTaxCode: '',
      authorizedFilerDocNumber: '',
      authorizedFilerDocDate: null,
      taxAgentName: '',
      taxAgentTaxCode: '',
    };
    return step1;
  }

  async saveStep1(userId: string, publicId: string, dto: SaveStep1Dto) {
    const period = await this.findPeriodAndCheckOwnership(userId, publicId);

    const step1: Step1Data = {
      taxCode: dto.taxCode ?? '',
      businessName: dto.businessName ?? '',
      ownerName: dto.ownerName ?? '',
      cccdNumber: dto.cccdNumber ?? '',
      provinceCity: dto.provinceCity ?? '',
      taxpayerOption: dto.taxpayerOption ?? '',
      taxPeriodOption: dto.taxPeriodOption ?? '',
      declarationTypeOption: dto.declarationTypeOption ?? '',
      authorizedFilerName: dto.authorizedFilerName ?? '',
      authorizedFilerTaxCode: dto.authorizedFilerTaxCode ?? '',
      authorizedFilerDocNumber: dto.authorizedFilerDocNumber ?? '',
      authorizedFilerDocDate: dto.authorizedFilerDocDate ?? null,
      taxAgentName: dto.taxAgentName ?? '',
      taxAgentTaxCode: dto.taxAgentTaxCode ?? '',
    };

    return await this.prisma.taxDeclarationDraft.update({
      where: { financialPeriodId: period.id },
      data: { step1Data: step1 as unknown as Prisma.InputJsonValue },
    });
  }

  private async checkIfExempt(userId: string, period: any): Promise<boolean> {
    const taxConfig = await this.prisma.taxConfiguration.findFirst({
      where: {
        userId,
        applyFromDate: { lte: period.endDate },
        applyToDate: { gte: period.endDate },
      },
      orderBy: { applyFromDate: 'desc' },
    });
    return taxConfig?.taxGroupId === 1;
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

    const [realtimeData, industriesData, transactionCount] = await Promise.all([
      this.financialPeriodsService.calculateRealtimeTaxData(
        userId,
        period.startDate,
        period.endDate,
        period.id,
      ),
      this.financialPeriodsService.getRevenueByIndustry(
        userId,
        period.startDate,
        period.endDate,
      ),
      this.prisma.invoice.count({
        where: {
          userId,
          status: 'ISSUED',
          periodId: period.id,
        },
      }),
    ]);

    const periodTax = await this.financialPeriodsService.calculatePeriodTax(
      userId,
      { startDate: period.startDate, endDate: period.endDate },
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

  private async calculateStep3RealtimeData(
    userId: string,
    periodId: number,
  ): Promise<Step3Data> {
    return await this.stocksService.calculatePeriodInventorySummary(
      userId,
      periodId,
    );
  }

  // step 3
  async getStep3(userId: string, publicId: string) {
    const period = await this.findPeriodAndCheckOwnership(userId, publicId);
    const isExempt = await this.checkIfExempt(userId, period);
    if (isExempt) {
      throw new BadRequestException({
        message:
          'Steps 3 and 4 are not applicable for exempt businesses (revenue <= 1 billion).',
        errorCode: 'STEP_NOT_APPLICABLE',
      });
    }

    const draft = await this.findDraftByPeriodId(period.id);

    if (draft?.step3Data) return draft.step3Data as unknown as Step3Data;

    return await this.calculateStep3RealtimeData(userId, period.id);
  }

  async saveStep3(userId: string, publicId: string) {
    const period = await this.findPeriodAndCheckOwnership(userId, publicId);
    const isExempt = await this.checkIfExempt(userId, period);
    if (isExempt) {
      throw new BadRequestException({
        message:
          'Steps 3 and 4 are not applicable for exempt businesses (revenue <= 1 billion).',
        errorCode: 'STEP_NOT_APPLICABLE',
      });
    }

    const draft = await this.findDraftByPeriodId(period.id);
    if (!draft?.step2Data)
      throw new BadRequestException({
        message: 'Please complete Step 2 first.',
        errorCode: 'STEP_2_NOT_COMPLETED',
      });

    // Đánh chặn: kiểm tra doanh thu realtime có khớp với step2 đã snapshot không
    const step2Data = draft.step2Data as unknown as Step2Data;
    const realtimeData =
      await this.financialPeriodsService.calculateRealtimeTaxData(
        userId,
        period.startDate,
        period.endDate,
      );
    if (realtimeData.revenue.toNumber() !== step2Data.confirmedRevenue) {
      throw new BadRequestException({
        message: 'Revenue has changed, please return to Step 2 to update.',
        errorCode: 'DATA_CHANGED',
      });
    }

    const step3 = await this.calculateStep3RealtimeData(userId, period.id);

    return await this.prisma.taxDeclarationDraft.update({
      where: { financialPeriodId: period.id },
      data: { step3Data: step3 as unknown as Prisma.InputJsonValue },
    });
  }

  // step 4
  async getStep4(userId: string, publicId: string) {
    const period = await this.findPeriodAndCheckOwnership(userId, publicId);
    const isExempt = await this.checkIfExempt(userId, period);
    if (isExempt) {
      throw new BadRequestException({
        message:
          'Steps 3 and 4 are not applicable for exempt businesses (revenue <= 1 billion).',
        errorCode: 'STEP_NOT_APPLICABLE',
      });
    }

    const draft = await this.findDraftByPeriodId(period.id);

    // Ưu tiên trả về dữ liệu đã lưu trong draft
    if (draft?.step4Data) return draft.step4Data as unknown as Step4Data;

    // Tính realtime
    const realtimeData =
      await this.financialPeriodsService.calculateRealtimeTaxData(
        userId,
        period.startDate,
        period.endDate,
      );
    const step4: Step4Data = { totalExpense: realtimeData.expense.toNumber() };
    return step4;
  }

  async saveStep4(userId: string, publicId: string) {
    const period = await this.findPeriodAndCheckOwnership(userId, publicId);
    const isExempt = await this.checkIfExempt(userId, period);
    if (isExempt) {
      throw new BadRequestException({
        message:
          'Steps 3 and 4 are not applicable for exempt businesses (revenue <= 1 billion).',
        errorCode: 'STEP_NOT_APPLICABLE',
      });
    }

    const draft = await this.findDraftByPeriodId(period.id);
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

    // Đánh chặn lũy tiến: doanh thu không được lệch với Step 2 đã snapshot
    const step2Data = draft.step2Data as unknown as Step2Data;
    const realtimeData =
      await this.financialPeriodsService.calculateRealtimeTaxData(
        userId,
        period.startDate,
        period.endDate,
      );
    if (realtimeData.revenue.toNumber() !== step2Data.confirmedRevenue) {
      throw new BadRequestException({
        message: 'Revenue has changed, please return to Step 2 to update.',
        errorCode: 'DATA_CHANGED',
      });
    }

    // Snapshot chi phí thực tế từ DB vào draft
    const step4: Step4Data = { totalExpense: realtimeData.expense.toNumber() };

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

    return {
      period,
      step1Data: (draft.step1Data as unknown as Step1Data) ?? null,
      step2Data: (draft.step2Data as unknown as Step2Data) ?? null,
      step3Data: (draft.step3Data as unknown as Step3Data) ?? null,
      step4Data: (draft.step4Data as unknown as Step4Data) ?? null,
    };
  }

  // nộp tờ khai
  async submit(userId: string, publicId: string, dto: SubmitDeclarationDto) {
    const period = await this.findPeriodAndCheckOwnership(userId, publicId);
    const isExempt = await this.checkIfExempt(userId, period);

    const draft = await this.findDraftByPeriodId(period.id);
    if (isExempt) {
      if (!draft?.step2Data) {
        throw new BadRequestException({
          message:
            'Incomplete draft data. Please complete Step 2 before submitting.',
          errorCode: 'DRAFT_INCOMPLETE',
        });
      }
    } else {
      if (!draft?.step2Data || !draft?.step4Data) {
        throw new BadRequestException({
          message:
            'Incomplete draft data. Please complete all steps before submitting.',
          errorCode: 'DRAFT_INCOMPLETE',
        });
      }
    }

    const step2Data = draft.step2Data as unknown as Step2Data;
    const step4Data = (draft.step4Data as unknown as Step4Data) || { totalExpense: 0 };

    // Chốt chặn: so sánh realtime với số tĩnh trong draft
    const realtimeData =
      await this.financialPeriodsService.calculateRealtimeTaxData(
        userId,
        period.startDate,
        period.endDate,
      );

    const isRevenueChanged =
      realtimeData.revenue.toNumber() !== step2Data.confirmedRevenue;
    const isExpenseChanged = isExempt
      ? false
      : realtimeData.expense.toNumber() !== step4Data.totalExpense;

    if (isRevenueChanged || isExpenseChanged) {
      throw new ConflictException({
        message: 'Data has changed since last confirmed.',
        errorCode: 'DATA_CHANGED',
        isDataChanged: true,
        draftData: {
          revenue: step2Data.confirmedRevenue,
          expense: isExempt ? 0 : step4Data.totalExpense,
        },
        realTimeData: {
          revenue: realtimeData.revenue.toNumber(),
          expense: isExempt ? 0 : realtimeData.expense.toNumber(),
        },
      });
    }

    return await this.processSubmission(
      userId,
      publicId,
      period.id,
      dto.chosenPitMethod,
      step2Data.confirmedRevenue,
      isExempt ? 0 : step4Data.totalExpense,
    );
  }

  async submitForce(
    userId: string,
    publicId: string,
    dto: SubmitDeclarationDto,
  ) {
    const period = await this.findPeriodAndCheckOwnership(userId, publicId);
    const isExempt = await this.checkIfExempt(userId, period);

    // Tự động đồng bộ với số realtime mới nhất
    const realtimeData =
      await this.financialPeriodsService.calculateRealtimeTaxData(
        userId,
        period.startDate,
        period.endDate,
      );

    return await this.processSubmission(
      userId,
      publicId,
      period.id,
      dto.chosenPitMethod,
      realtimeData.revenue.toNumber(),
      isExempt ? 0 : realtimeData.expense.toNumber(),
    );
  }

  async submitIgnoreWarning(
    userId: string,
    publicId: string,
    dto: SubmitDeclarationDto,
  ) {
    const period = await this.findPeriodAndCheckOwnership(userId, publicId);
    const isExempt = await this.checkIfExempt(userId, period);

    const draft = await this.findDraftByPeriodId(period.id);
    if (isExempt) {
      if (!draft?.step2Data) {
        throw new BadRequestException({
          message:
            'Incomplete draft data. Please complete Step 2 before submitting.',
          errorCode: 'DRAFT_INCOMPLETE',
        });
      }
    } else {
      if (!draft?.step2Data || !draft?.step4Data) {
        throw new BadRequestException({
          message:
            'Incomplete draft data. Please complete all steps before submitting.',
          errorCode: 'DRAFT_INCOMPLETE',
        });
      }
    }

    const step2Data = draft.step2Data as unknown as Step2Data;
    const step4Data = (draft.step4Data as unknown as Step4Data) || {
      totalExpense: 0,
    };

    // Bỏ qua kiểm tra realtime, dùng số cũ trong draft
    const result = await this.processSubmission(
      userId,
      publicId,
      period.id,
      dto.chosenPitMethod,
      step2Data.confirmedRevenue,
      isExempt ? 0 : step4Data.totalExpense,
    );

    // Ghi Audit Log ghi nhận việc user chủ động bỏ qua cảnh báo
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
  ) {
    return await this.prisma.$transaction(async (tx) => {
      // Chốt sổ period bên trong cùng transaction
      const {
        period: closedPeriod,
        vatAmount,
        pitAmount,
        ytdRevenue,
        ytdExpense,
      } = await this.financialPeriodsService.closeFinancialPeriod(
        userId,
        publicId,
        {
          chosenPitMethod,
          revenue,
          expense,
        },
        tx,
      );

      // Sinh tờ khai TaxDeclaration chính thức (mock XML)
      const declaration = await tx.taxDeclaration.create({
        data: {
          periodId,
          declaredRevenue: revenue,
          declaredExpense: expense,
          ytdRevenue,
          ytdExpense,
          vatTaxAmount: vatAmount,
          pitTaxAmount: pitAmount,
          totalTaxAmount: closedPeriod.taxAmount,
          chosenPitMethod,
          xmlContent: `<mock><declaredRevenue>${revenue}</declaredRevenue><declaredExpense>${expense}</declaredExpense><ytdRevenue>${ytdRevenue}</ytdRevenue><ytdExpense>${ytdExpense}</ytdExpense></mock>`,
        },
      });

      // Dọn dẹp bản nháp
      await tx.taxDeclarationDraft.deleteMany({
        where: { financialPeriodId: periodId },
      });

      return { closedPeriod, declaration };
    });
  }
}
