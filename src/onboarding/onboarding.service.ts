import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { CreateOnboardingDto } from './dto/create-onboarding.dto';
import { AuditLogService } from '../core/audit-log/audit-log.service';
import { AppLogger } from '../common/logger/app-logger.service';
import {
  LOG_ACTIONS,
  LOG_STATUS,
} from 'src/common/constants/log-events.constant';

@Injectable()
export class OnboardingService {
  private readonly log = new AppLogger(OnboardingService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  // onboarding lần đầu tạo tài khoản
  async setupTaxConfiguration(userId: string, dto: CreateOnboardingDto) {
    // Sử dụng Interactive Transaction của Prisma
    return this.prisma.$transaction(async (tx) => {
      // 1. KHIÊN BẢO VỆ: Kiểm tra xem user này ĐÃ TỪNG cấu hình chưa?
      const existingConfig = await tx.taxConfiguration.findFirst({
        where: { userId: userId },
      });

      // Nếu đã có cấu hình trong DB => Đá văng ra ngay, chặn API Replay
      if (existingConfig) {
        this.log.warn('Set up onboarding', {
          status: LOG_STATUS.FAILED,
          reason: 'USER_COMPLETED_ONBOARDING',
          action: LOG_ACTIONS.SET_ONBOARDING,
          userId,
        });
        throw new ConflictException(
          'This account has completed onboarding. It cannot be done again.',
        );
      }

      // 2. Lấy thông tin ngành nghề để snapshot Rate
      const industry = await tx.specificIndustry.findUnique({
        where: { id: dto.industryId },
      });

      if (!industry) {
        this.log.warn('Set up onboarding', {
          status: LOG_STATUS.FAILED,
          action: LOG_ACTIONS.SET_ONBOARDING,
          reason: 'INDUSTRY_NOT_FOUND',
          userId,
          industry: dto.industryId,
        });
        throw new NotFoundException('Industry not found.');
      }

      // Check thêm taxGroup tồn tại hay không ở đây (tương tự như industry)
      const taxGroup = await tx.taxGroup.findUnique({
        where: { id: dto.taxGroupId },
      });
      if (!taxGroup) {
        this.log.warn('Set up onboarding', {
          status: LOG_STATUS.FAILED,
          action: LOG_ACTIONS.SET_ONBOARDING,
          reason: 'TAX_GROUP_NOT_FOUND',
          userId,
          taxGroup: dto.taxGroupId,
        });
        throw new NotFoundException('Group tax not found.');
      }

      const now = new Date();

      // 3. Tạo cấu hình mới (Mở applyFromDate) và lưu Snapshot của Tỷ lệ thuế
      const newConfig = await tx.taxConfiguration.create({
        data: {
          userId: userId,
          industryId: dto.industryId,
          taxGroupId: dto.taxGroupId,
          applyFromDate: now,
          vatRateSnapShot: industry.vatRate,
          pitRateSnapShot: industry.pitRate,
          isVatReducible: industry.isVatReducible,
        },
      });

      await this.auditLog.logChange(
        tx,
        userId,
        'CREATE',
        'tax_configurations',
        newConfig.id,
        null,
        newConfig,
      );

      this.log.log('Set up onboarding', {
        status: LOG_STATUS.SUCCESS,
        action: LOG_ACTIONS.SET_ONBOARDING,
        userId,
        industry: dto.industryId,
        taxGroup: dto.taxGroupId,
      });
      return newConfig;
    });
  }
}
