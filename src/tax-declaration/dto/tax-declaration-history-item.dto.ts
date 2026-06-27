import { Expose, Transform } from 'class-transformer';
import { PitMethod } from '@prisma/client';

export class TaxDeclarationHistoryItemDto {
  // Lấy publicId từ bản ghi taxFormExports đầu tiên của period
  @Expose()
  @Transform(({ obj }: { obj: any }) => {
    const latestExport = obj.period?.taxFormExports?.[0];
    return latestExport?.publicId ?? '';
  })
  publicId!: string;

  // Lấy formType từ bản ghi taxFormExports đầu tiên của period hoặc suy luận từ chosenPitMethod
  @Expose()
  @Transform(({ obj }: { obj: any }) => {
    const latestExport = obj.period?.taxFormExports?.[0];
    if (latestExport?.formType) {
      return latestExport.formType;
    }
    return obj.chosenPitMethod === PitMethod.EXEMPT ? '01_TKN_CNKD' : '01_CNKD';
  })
  formType!: string;

  // Lấy periodName trực tiếp từ quan hệ period
  @Expose()
  @Transform(({ obj }: { obj: any }) => obj.period?.periodName ?? '')
  periodName!: string;

  // Lấy taxYear từ bản ghi taxFormExports hoặc từ endDate của period
  @Expose()
  @Transform(({ obj }: { obj: any }) => {
    const latestExport = obj.period?.taxFormExports?.[0];
    if (latestExport?.taxYear) {
      return latestExport.taxYear;
    }
    return obj.period?.endDate ? new Date(obj.period.endDate).getFullYear() : new Date().getFullYear();
  })
  taxYear!: number;

  @Expose()
  @Transform(({ value }: { value: unknown }) => Number(value))
  declaredRevenue!: number;

  @Expose()
  @Transform(({ value }: { value: unknown }) => Number(value))
  totalTaxAmount!: number;

  // Lấy createdAt của chính bản ghi TaxDeclaration và convert sang định dạng ISO string
  @Expose()
  @Transform(({ value }: { value: any }) => (value instanceof Date ? value.toISOString() : value))
  createdAt!: string;

  // Lấy pdfUrl từ bản ghi taxFormExports đầu tiên của period
  @Expose()
  @Transform(({ obj }: { obj: any }) => {
    const latestExport = obj.period?.taxFormExports?.[0];
    return latestExport?.pdfUrl ?? null;
  })
  pdfUrl!: string | null;

  @Expose()
  xmlContent!: string;
}
