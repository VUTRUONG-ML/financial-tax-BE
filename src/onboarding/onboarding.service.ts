import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { CreateOnboardingDto } from './dto/create-onboarding.dto';
import {
  AuditLogService,
  tableWrite,
} from '../core/audit-log/audit-log.service';
import { AppLogger } from '../common/logger/app-logger.service';
import {
  LOG_ACTIONS,
  LOG_STATUS,
} from '../common/constants/log-events.constant';
import { TAX_QUARTER_COOLDOWN_MS } from '../common/constants/tax-period-time.constant';
import { Decimal } from '@prisma/client/runtime/client';
import { PitMethod, Prisma } from '@prisma/client';
import { MAX_EFFECTIVE_DATE } from '../common/constants/tax-config.constant';
import { moment } from '../common/utils/time.util';
import { FinancialPeriodsService } from '../financial-periods/financial-periods.service';

@Injectable()
export class OnboardingService {
  private readonly log = new AppLogger(OnboardingService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly financialPeriodsService: FinancialPeriodsService,
  ) {}
  private async findTaxGroupValid(
    taxGroupId: number,
    tx: Prisma.TransactionClient,
  ) {
    // 1. Query lấy TaxGroup và danh sách phương pháp được phép
    const taxGroup = await tx.taxGroup.findUnique({
      where: { id: taxGroupId },
      select: { id: true, allowedMethods: true },
    });

    // 2. Kiểm tra tồn tại của nhóm thuế
    if (!taxGroup) {
      this.log.warn('Set up onboarding', {
        status: LOG_STATUS.FAILED,
        action: LOG_ACTIONS.SET_ONBOARDING,
        reason: 'TAX_GROUP_NOT_FOUND',
        taxGroupId,
      });
      throw new NotFoundException('Tax group not found.');
    }

    let defaultMethod: PitMethod | null = null;

    // Logic nghiệp vụ: Tự động chọn phương pháp mặc định phù hợp nhất
    switch (taxGroupId) {
      case 1:
        defaultMethod = 'EXEMPT'; // Nhóm 1: Mặc định miễn thuế
        break;
      case 2:
        defaultMethod = 'PERCENTAGE'; // Nhóm 2: Mặc định tính theo %, có thể đổi sau
        break;
      case 3:
        defaultMethod = 'PROFIT_17'; // Nhóm 3: Bắt buộc lợi nhuận 17%
        break;
      case 4:
        defaultMethod = 'PROFIT_20'; // Nhóm 4: Bắt buộc lợi nhuận 20%
        break;
    }
    if (defaultMethod && !taxGroup.allowedMethods.includes(defaultMethod)) {
      throw new BadRequestException(
        'The pit method is not allowed for this tax group.',
      );
    }
    return defaultMethod;
  }
  private mapPitMethodToRate(
    method: PitMethod | null,
    categoryPitRate: Decimal,
  ): Decimal {
    if (!method) return new Decimal(0);
    switch (method) {
      case 'EXEMPT':
        return new Decimal(0);
      case 'PERCENTAGE':
        return categoryPitRate;
      case 'PROFIT_15':
        return new Decimal(0.15);
      case 'PROFIT_17':
        return new Decimal(0.17);
      case 'PROFIT_20':
        return new Decimal(0.2);
      default:
        return new Decimal(0);
    }
  }
  private async findEffectiveTaxRate(
    tx: Prisma.TransactionClient,
    taxCategoryId: number,
    depth: number = 0, // Giới hạn độ sâu để bảo vệ hệ thống
  ): Promise<{ vatRate: Decimal; pitRate: Decimal }> {
    if (depth > 5) {
      throw new BadRequestException(
        'The industry has an overly complex or repetitive parent-child structure.',
      );
    }
    const currentIndustry = await tx.taxCategory.findUnique({
      where: { id: taxCategoryId },
      select: { id: true, vatRate: true, pitRate: true, parentId: true },
    });
    if (!currentIndustry) {
      throw new NotFoundException('Industry category not found');
    }
    // 2. Kiểm tra Null/Undefined thay vì Falsy (vì thuế suất 0% vẫn hợp lệ)
    const isRateMissing =
      currentIndustry.vatRate === null || currentIndustry.pitRate === null;
    if (isRateMissing) {
      const parentId = currentIndustry.parentId;
      if (!parentId)
        throw new UnprocessableEntityException(
          'This industry and its parent industries do not have a valid tax rate structure.',
        );
      return await this.findEffectiveTaxRate(tx, parentId, depth + 1);
    }
    return {
      vatRate: currentIndustry.vatRate,
      pitRate: currentIndustry.pitRate,
    };
  }
  private async resolveTaxCategory(
    tx: Prisma.TransactionClient,
    industryId: number,
    isOtherIndustry: boolean = false,
    userId: string,
    action: 'UPDATE' | 'SET',
  ) {
    // Vì Người dùng có thể có 2 trường hợp chọn trên ui hiển thị là bảng uiPopularTag -> cần map sang ngành nghề để lấy mức thuế của UI hiển thị đó
    // Nếu người dùng chọn khác thì người dùng sẽ đi tìm ngành nghề trong phần search -> lấy id đó truyền vào nên id đó không phải của uiPopularTag
    let finalCategoryId: number;
    let taxRates: { pitRate: Decimal; vatRate: Decimal };

    if (isOtherIndustry) {
      // Luồng: Người dùng chọn từ Search/Danh mục chi tiết
      finalCategoryId = industryId;
      taxRates = await this.findEffectiveTaxRate(tx, finalCategoryId);
    } else {
      // Luồng: Người dùng chọn từ Thẻ gợi ý (Popular Tags)
      const popularTag = await tx.uiPopularTag.findUnique({
        where: { id: industryId },
        select: { mappedTaxId: true },
      });

      if (!popularTag) {
        this.log.warn(
          action === 'SET'
            ? LOG_ACTIONS.SET_ONBOARDING
            : LOG_ACTIONS.UPDATE_ONBOARDING,
          {
            status: LOG_STATUS.FAILED,
            reason: 'POPULAR_TAG_NOT_FOUND',
            popularId: industryId,
            userId,
          },
        );
        throw new NotFoundException('Popular tag not found.');
      }

      finalCategoryId = popularTag.mappedTaxId;
      taxRates = await this.findEffectiveTaxRate(tx, finalCategoryId);
    }

    return { finalCategoryId, taxRates };
  }
  // onboarding lần đầu tạo tài khoản
  async setupTaxConfiguration(userId: string, dto: CreateOnboardingDto) {
    // Sử dụng Interactive Transaction của Prisma
    return this.prisma.$transaction(async (tx) => {
      // 1. KHIÊN BẢO VỆ: Kiểm tra xem user này ĐÃ TỪNG cấu hình chưa?
      const existingConfig = await tx.taxConfiguration.findFirst({
        where: { userId: userId },
        select: { id: true },
      });

      // Nếu đã có cấu hình trong DB => Đá văng ra ngay, chặn API Replay
      if (existingConfig) {
        this.log.warn(LOG_ACTIONS.SET_ONBOARDING, {
          status: LOG_STATUS.FAILED,
          reason: 'USER_COMPLETED_ONBOARDING',
          userId,
        });
        throw new ConflictException(
          'This account has completed onboarding. It cannot be done again.',
        );
      }

      // 2. Lấy thông tin ngành nghề từ bảng UiPopularTag, check tag group
      const { finalCategoryId, taxRates } = await this.resolveTaxCategory(
        tx,
        dto.industryId,
        dto.isOtherIndustry,
        userId,
        'SET',
      );

      // Check thêm taxGroup tồn tại hay không ở đây (tương tự như industry)
      const defaultPitMethod = await this.findTaxGroupValid(dto.taxGroupId, tx);

      const now = moment().startOf('day').toDate();

      // 3. Tạo cấu hình mới (Mở applyFromDate) và lưu Snapshot của Tỷ lệ thuế
      const newConfig = await tx.taxConfiguration.create({
        data: {
          userId: userId,
          industryId: finalCategoryId,
          taxGroupId: dto.taxGroupId,
          chosenPitMethod: defaultPitMethod,
          applyFromDate: now,
          applyToDate: MAX_EFFECTIVE_DATE,
          vatRateSnapShot: taxRates.vatRate,
          pitRateSnapShot: this.mapPitMethodToRate(
            defaultPitMethod,
            taxRates.pitRate,
          ),
        },
      });

      // 4. Cập nhật thời gian config trên tài khoản của người dùng
      await tx.user.update({
        where: { id: userId, setUpCompletedAt: null },
        data: { setUpCompletedAt: now },
      });

      // 5. Khởi tạo kì thuế đầu tiên
      await this.financialPeriodsService.createInitialPeriod(
        userId,
        newConfig.id,
        tx,
      );

      await this.auditLog.logChange(
        tx,
        userId,
        'CREATE',
        tableWrite.tax_configurations,
        newConfig.id,
        null,
        newConfig,
      );

      this.log.log(LOG_ACTIONS.SET_ONBOARDING, {
        status: LOG_STATUS.SUCCESS,
        userId,
        industry: dto.industryId,
        taxGroup: dto.taxGroupId,
      });
      return newConfig;
    });
  }

  // update khi doanh thu vượt mức hoặc người dùng muốn update đầu kì thuế
  async updateTaxConfiguration(
    userId: string,
    dto: CreateOnboardingDto,
    options?: { isSystemAutoUpgrade?: boolean },
  ) {
    const { industryId, taxGroupId } = dto;
    return this.prisma.$transaction(async (tx) => {
      const now = moment().startOf('day').toDate();
      // 1. Tìm cấu hình đang Active
      const currentActiveConfig = await tx.taxConfiguration.findFirst({
        where: {
          userId: userId,
          applyFromDate: { lte: now },
          applyToDate: MAX_EFFECTIVE_DATE,
        },
      });

      if (!currentActiveConfig) {
        this.log.warn(LOG_ACTIONS.UPDATE_ONBOARDING, {
          status: LOG_STATUS.FAILED,
          reason: 'NOT_CONFIG_TAX_ACTIVE',
          userId,
        });
        throw new BadRequestException(
          'No active tax configurations were found.',
        );
      }

      // 2. Kiểm tra xem có phải hệ thống không để kiểm tra xem qua mốc thời gian được update tax config chưa (khoảng thời gian TAX_QUARTER_COOLDOWN_MS)
      if (!options?.isSystemAutoUpgrade) {
        const timeSinceLastChange =
          now.getTime() - currentActiveConfig.applyFromDate.getTime();

        if (timeSinceLastChange < TAX_QUARTER_COOLDOWN_MS) {
          this.log.warn(LOG_ACTIONS.UPDATE_ONBOARDING, {
            status: LOG_STATUS.FAILED,
            reason: 'USER_UPDATE_BEFORE_PERIOD',
            userId,
          });
          throw new BadRequestException(
            'You are only allowed to change your tax configuration at the beginning of the period..',
          );
        }
      }
      // 3. Kiểm tra taxCategory và taxGroup
      const { finalCategoryId, taxRates } = await this.resolveTaxCategory(
        tx,
        dto.industryId,
        dto.isOtherIndustry,
        userId,
        'UPDATE',
      );

      const defaultPitMethod = await this.findTaxGroupValid(dto.taxGroupId, tx);

      // 4. KHIÊN BẢO VỆ CHỐNG DOUBLE CLICK (Optimistic Locking) - đóng cấu hình cũ
      const closeResult = await tx.taxConfiguration.updateMany({
        where: {
          id: currentActiveConfig.id,
          applyToDate: MAX_EFFECTIVE_DATE, // Điều kiện sống còn: Chỉ đóng nếu nó CHƯA BỊ ĐÓNG
        },
        data: { applyToDate: now },
      });

      if (closeResult.count === 0) {
        this.log.warn(LOG_ACTIONS.UPDATE_ONBOARDING, {
          status: LOG_STATUS.FAILED,
          reason: 'CLICK_MULTIPLE_TIMES',
          userId,
        });
        throw new ConflictException('Please do not click multiple times.');
      }

      const actionBy: string = options?.isSystemAutoUpgrade
        ? 'SYSTEM_AUTO'
        : userId;

      await this.auditLog.logChange(
        tx,
        actionBy,
        'UPDATE',
        tableWrite.tax_configurations,
        currentActiveConfig.id,
        { applyToDate: currentActiveConfig.applyToDate },
        { applyToDate: now },
      );

      // 5. Tạo cấu hình mới
      const newConfig = await tx.taxConfiguration.create({
        data: {
          userId: userId,
          industryId: finalCategoryId,
          taxGroupId: dto.taxGroupId,
          chosenPitMethod: defaultPitMethod,
          applyFromDate: now,
          applyToDate: MAX_EFFECTIVE_DATE,
          vatRateSnapShot: taxRates.vatRate,
          pitRateSnapShot: this.mapPitMethodToRate(
            defaultPitMethod,
            taxRates.pitRate,
          ),
        },
      });
      await this.auditLog.logChange(
        tx,
        actionBy,
        'CREATE',
        tableWrite.tax_configurations,
        newConfig.id,
        null,
        newConfig,
      );

      this.log.log(LOG_ACTIONS.UPDATE_ONBOARDING, {
        status: LOG_STATUS.SUCCESS,
        userId,
        industry: industryId,
        taxGroup: taxGroupId,
      });

      return newConfig;
    });
  }
}
