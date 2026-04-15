import { IsInt, IsNotEmpty } from 'class-validator';

export class CreateOnboardingDto {
  @IsNotEmpty()
  @IsInt()
  industryId!: number; // Tương ứng với lựa chọn 1 ngành nghề duy nhất

  @IsNotEmpty()
  @IsInt()
  taxGroupId!: number; // Tương ứng với 4 nhóm doanh thu
}
