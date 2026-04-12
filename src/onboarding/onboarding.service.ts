import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOnboardingDto } from './dto/create-onboarding.dto';

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  async setupTaxConfiguration(userId: string, dto: CreateOnboardingDto) {
    // Sử dụng Interactive Transaction của Prisma
    return this.prisma.$transaction(async (tx) => {
      // 1. Lấy thông tin ngành nghề để snapshot Rate
      const industry = await tx.specificIndustry.findUnique({
        where: { id: dto.industryId },
      });

      if (!industry) {
        throw new NotFoundException('Industry not found.');
      }

      // Check thêm taxGroup tồn tại hay không ở đây (tương tự như industry)
      const taxGroup = await tx.taxGroup.findUnique({
        where: { id: dto.taxGroupId },
      });
      if (!taxGroup) throw new NotFoundException('Group tax not found.');

      const now = new Date();

      // 2. Tìm cấu hình đang Active hiện tại của User (nếu có)
      const currentActiveConfig = await tx.taxConfiguration.findFirst({
        where: {
          userId: userId,
          applyToDate: null, // Đây là dấu hiệu nhận biết Record đang hiệu lực
        },
      });

      // 3. Nếu có cấu hình cũ => Đóng nó lại (Chốt applyToDate)
      if (currentActiveConfig) {
        await tx.taxConfiguration.update({
          where: { id: currentActiveConfig.id },
          data: { applyToDate: now },
        });
      }

      // 4. Tạo cấu hình mới (Mở applyFromDate) và lưu Snapshot của Tỷ lệ thuế
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

      return newConfig;
    });
  }
}
