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
import { SaveStep3Dto } from './dto/save-step-3.dto';
import { SubmitDeclarationDto } from './dto/submit-declaration.dto';
import { Prisma, PeriodStatus, PitMethod } from '@prisma/client';
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
  ) {}

  // ─── Helper ──────────────────────────────────────────────────────────────────

  /**
   * Tìm period theo publicId và kiểm tra ownership userId.
   * Ném lỗi nếu không tìm thấy hoặc không phải của userId.
   */
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

  /**
   * Tìm draft theo periodId.
   */
  private async findDraftByPeriodId(
    periodId: number,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    return tx.taxDeclarationDraft.findUnique({
      where: { financialPeriodId: periodId },
    });
  }

  // ─── APIs ─────────────────────────────────────────────────────────────────────

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

  // ── Step 1 ──────────────────────────────────────────────────────────────────

  async getStep1(userId: string, publicId: string) {
    const period = await this.findPeriodAndCheckOwnership(userId, publicId);
    const draft = await this.findDraftByPeriodId(period.id);

    // Ưu tiên trả về dữ liệu đã lưu trong draft
    if (draft?.step1Data) return draft.step1Data as unknown as Step1Data;

    // Auto-fill từ User profile
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const step1: Step1Data = {
      taxCode: user?.taxCode ?? '',
      businessName: user?.businessName ?? '',
      ownerName: user?.ownerName ?? '',
      cccdNumber: user?.cccdNumber ?? '',
      provinceCity: user?.provinceCity ?? '',
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
    };

    return await this.prisma.taxDeclarationDraft.update({
      where: { financialPeriodId: period.id },
      data: { step1Data: step1 as unknown as Prisma.InputJsonValue },
    });
  }

  // ── Step 2 ──────────────────────────────────────────────────────────────────

  async getStep2(userId: string, publicId: string) {
    const period = await this.findPeriodAndCheckOwnership(userId, publicId);
    const draft = await this.findDraftByPeriodId(period.id);
    // Ưu tiên trả về dữ liệu đã lưu trong draft
    if (draft?.step2Data) return draft.step2Data as unknown as Step2Data;

    // Tính realtime
    const realtimeData =
      await this.financialPeriodsService.calculateRealtimeTaxData(
        userId,
        period.startDate,
        period.endDate,
      );
    const step2: Step2Data = {
      confirmedRevenue: realtimeData.revenue.toNumber(),
    };
    return step2;
  }

  /**
   * Step 2 POST: Không nhận body từ client.
   * Backend tự query realtime và snapshot vào draft để tránh client giả mạo số liệu.
   */
  async saveStep2(userId: string, publicId: string) {
    const period = await this.findPeriodAndCheckOwnership(userId, publicId);

    const realtimeData =
      await this.financialPeriodsService.calculateRealtimeTaxData(
        userId,
        period.startDate,
        period.endDate,
      );
    const step2: Step2Data = {
      confirmedRevenue: realtimeData.revenue.toNumber(),
    };

    return await this.prisma.taxDeclarationDraft.update({
      where: { financialPeriodId: period.id },
      data: { step2Data: step2 as unknown as Prisma.InputJsonValue },
    });
  }

  // ── Step 3 ──────────────────────────────────────────────────────────────────

  async getStep3(userId: string, publicId: string) {
    const period = await this.findPeriodAndCheckOwnership(userId, publicId);
    const draft = await this.findDraftByPeriodId(period.id);

    // Ưu tiên trả về dữ liệu đã lưu trong draft
    if (draft?.step3Data) return draft.step3Data as unknown as Step3Data;

    // Auto-fill từ product hiện tại
    const products = await this.prisma.product.findMany({
      where: { userId, productType: { not: 'SERVICE' } },
      select: {
        publicId: true,
        productName: true,
        currentStock: true,
        unit: true,
      },
    });

    const step3: Step3Data = products.map((p) => ({
      productPublicId: p.publicId,
      productName: p.productName,
      unit: p.unit,
      actualClosingQuantity: p.currentStock,
    }));
    return step3;
  }

  async saveStep3(userId: string, publicId: string, dto: SaveStep3Dto) {
    const period = await this.findPeriodAndCheckOwnership(userId, publicId);

    const draft = await this.findDraftByPeriodId(period.id);
    if (!draft?.step2Data)
      throw new BadRequestException({
        message: 'Please complete Step 2 first.',
        errorCode: 'STEP_2_NOT_COMPLETED',
      });

    // Validate: tất cả productPublicId phải thuộc về userId này
    const incomingPublicIds = dto.inventoryItems.map((i) => i.productPublicId);
    const ownedProducts = await this.prisma.product.findMany({
      where: {
        publicId: { in: incomingPublicIds },
        userId,
        productType: { not: 'SERVICE' },
      },
      select: { publicId: true },
    });
    const ownedPublicIds = new Set(ownedProducts.map((p) => p.publicId));
    const invalidIds = incomingPublicIds.filter(
      (id) => !ownedPublicIds.has(id),
    );
    if (invalidIds.length > 0) {
      throw new BadRequestException({
        message: `Invalid product IDs: ${invalidIds.join(', ')}. Products do not belong to this user or are SERVICE type.`,
        errorCode: 'INVALID_PRODUCT_IDS',
      });
    }

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

    const step3: Step3Data = dto.inventoryItems.map((item) => ({
      productPublicId: item.productPublicId,
      actualClosingQuantity: item.actualClosingQuantity,
    }));

    return await this.prisma.taxDeclarationDraft.update({
      where: { financialPeriodId: period.id },
      data: { step3Data: step3 as unknown as Prisma.InputJsonValue },
    });
  }

  // ── Step 4 ──────────────────────────────────────────────────────────────────

  async getStep4(userId: string, publicId: string) {
    const period = await this.findPeriodAndCheckOwnership(userId, publicId);
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

  /**
   * Step 4 POST: Không nhận body từ client.
   * Backend tự query realtime và snapshot vào draft để tránh client giả mạo số liệu.
   */
  async saveStep4(userId: string, publicId: string) {
    const period = await this.findPeriodAndCheckOwnership(userId, publicId);

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

  // ── Step 5 Preview ──────────────────────────────────────────────────────────

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

  // ── Submission ──────────────────────────────────────────────────────────────

  async submit(userId: string, publicId: string, dto: SubmitDeclarationDto) {
    const period = await this.findPeriodAndCheckOwnership(userId, publicId);

    const draft = await this.findDraftByPeriodId(period.id);
    if (!draft?.step2Data || !draft?.step4Data) {
      throw new BadRequestException({
        message:
          'Incomplete draft data. Please complete all steps before submitting.',
        errorCode: 'DRAFT_INCOMPLETE',
      });
    }

    const step2Data = draft.step2Data as unknown as Step2Data;
    const step4Data = draft.step4Data as unknown as Step4Data;

    // Chốt chặn: so sánh realtime với số tĩnh trong draft
    const realtimeData =
      await this.financialPeriodsService.calculateRealtimeTaxData(
        userId,
        period.startDate,
        period.endDate,
      );

    const isRevenueChanged =
      realtimeData.revenue.toNumber() !== step2Data.confirmedRevenue;
    const isExpenseChanged =
      realtimeData.expense.toNumber() !== step4Data.totalExpense;

    if (isRevenueChanged || isExpenseChanged) {
      throw new ConflictException({
        message: 'Data has changed since last confirmed.',
        errorCode: 'DATA_CHANGED',
        isDataChanged: true,
        draftData: {
          revenue: step2Data.confirmedRevenue,
          expense: step4Data.totalExpense,
        },
        realTimeData: {
          revenue: realtimeData.revenue.toNumber(),
          expense: realtimeData.expense.toNumber(),
        },
      });
    }

    return await this.processSubmission(
      userId,
      publicId,
      period.id,
      dto.chosenPitMethod,
      step2Data.confirmedRevenue,
      step4Data.totalExpense,
    );
  }

  async submitForce(
    userId: string,
    publicId: string,
    dto: SubmitDeclarationDto,
  ) {
    const period = await this.findPeriodAndCheckOwnership(userId, publicId);

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
      realtimeData.expense.toNumber(),
    );
  }

  async submitIgnoreWarning(
    userId: string,
    publicId: string,
    dto: SubmitDeclarationDto,
  ) {
    const period = await this.findPeriodAndCheckOwnership(userId, publicId);

    const draft = await this.findDraftByPeriodId(period.id);
    if (!draft?.step2Data || !draft?.step4Data) {
      throw new BadRequestException({
        message:
          'Incomplete draft data. Please complete all steps before submitting.',
        errorCode: 'DRAFT_INCOMPLETE',
      });
    }

    const step2Data = draft.step2Data as unknown as Step2Data;
    const step4Data = draft.step4Data as unknown as Step4Data;

    // Bỏ qua kiểm tra realtime, dùng số cũ trong draft
    const result = await this.processSubmission(
      userId,
      publicId,
      period.id,
      dto.chosenPitMethod,
      step2Data.confirmedRevenue,
      step4Data.totalExpense,
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
