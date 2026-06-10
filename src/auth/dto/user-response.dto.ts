import { Expose, Transform } from 'class-transformer';

export class UserResponseDto {
  @Expose()
  id!: string;

  @Expose()
  @Transform(({ obj }) => obj.phoneNumber)
  phone!: string;

  @Expose()
  role!: string;

  @Expose()
  @Transform(({ obj }) => obj.taxCode)
  tax_code!: string;

  @Expose()
  @Transform(({ obj }) => obj.cccdNumber)
  cccd_number!: string;

  @Expose()
  @Transform(({ obj }) => obj.businessName)
  business_name!: string;

  @Expose()
  @Transform(({ obj }) => obj.ownerName)
  representative!: string;

  @Expose()
  @Transform(({ obj }) => {
    const taxConfig = obj.taxConfig;
    if (!taxConfig || !taxConfig.industry) return 'TRADE';
    const categoryId = taxConfig.industry.id;
    if (categoryId === 1) return 'TRADE';
    if (categoryId === 2) return 'SERVICE';
    if (categoryId === 3) return 'PRODUCTION';
    if (categoryId === 4) return 'RENT';
    if (categoryId === 5) return 'DIGITAL';
    if (categoryId === 6) return 'OTHER';
    return 'TRADE';
  })
  industry!: string;

  @Expose()
  @Transform(({ obj }) => {
    const taxConfig = obj.taxConfig;
    if (!taxConfig || !taxConfig.industry)
      return 'Phân phối, cung cấp hàng hóa';
    return taxConfig.industry.categoryName;
  })
  industry_label!: string;

  @Expose()
  @Transform(({ obj }) => {
    const taxConfig = obj.taxConfig;
    if (!taxConfig) return 2;
    return taxConfig.taxGroupId;
  })
  tax_group!: number;

  @Expose()
  @Transform(({ obj }) => {
    try {
      const dateVal = obj.createdAt;
      if (!dateVal) return new Date().toISOString();
      const d = new Date(dateVal);
      return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
    } catch {
      return new Date().toISOString();
    }
  })
  created_at!: string;

  @Expose()
  @Transform(({ obj }) => {
    try {
      const dateVal = obj.setUpCompletedAt;
      if (!dateVal) return null;
      const d = new Date(dateVal);
      return isNaN(d.getTime()) ? null : d.toISOString();
    } catch {
      return null;
    }
  })
  setUpCompletedAt!: string | null;
}
