import { Expose, Transform } from 'class-transformer';

export class BaseRevenueRowDto {
  @Expose({ name: 'Ngay_Thang' })
  @Transform(({ obj }) => obj.issueDate)
  Ngay_Thang: Date;

  // Xóa bỏ options?.context?.dienGiai. frontend/service sẽ map trực tiếp vào trường này
  @Expose({ name: 'Dien_Giai' })
  Dien_Giai: string;

  @Expose({ name: 'So_Tien' })
  @Transform(({ obj }) => Number(obj.totalPayment))
  So_Tien: number;
}

export class S1ARowDto extends BaseRevenueRowDto {}

export class S2ARowDto extends BaseRevenueRowDto {
  @Expose({ name: 'So_Hieu_Chung_Tu' })
  @Transform(({ obj }) => obj.invoiceSymbol || obj.publicId.toString())
  So_Hieu_Chung_Tu: string;
}

export class S2BRowDto extends S2ARowDto {
  @Expose({ name: 'Thue_GTGT' })
  Thue_GTGT: number;
}
