import { PitMethod } from '@prisma/client';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateOnboardingDto {
  @IsNotEmpty()
  @IsInt()
  industryId!: number; // Tương ứng với lựa chọn 1 ngành nghề duy nhất - ở bảng UiPopularTag

  @IsNotEmpty()
  @IsInt()
  taxGroupId!: number; // Tương ứng với 4 nhóm doanh thu

  @IsNotEmpty()
  @IsBoolean()
  pitMethod!: PitMethod;

  @IsBoolean()
  @IsOptional()
  // Flag để Service biết User chọn "Ngành nghề khác" hay "Tag gợi ý"
  isOtherIndustry?: boolean;

  @IsBoolean()
  @IsOptional()
  // Snapshot thông tin giảm thuế nếu có (theo luật 2026)
  isVatReducible?: boolean;
}
