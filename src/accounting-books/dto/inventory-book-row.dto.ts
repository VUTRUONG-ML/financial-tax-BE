import { Expose, Transform } from 'class-transformer';

export class InventoryBookRowDto {
  @Expose()
  @Transform(({ obj }) => {
    return obj.Ngay_Chung_Tu instanceof Date
      ? obj.Ngay_Chung_Tu.toISOString()
      : new Date(obj.Ngay_Chung_Tu).toISOString();
  })
  Ngay_Chung_Tu!: string;

  @Expose()
  So_Chung_Tu!: string;

  @Expose()
  Dien_Giai!: string;

  @Expose()
  Product_Id!: number;

  @Expose()
  Product_Name!: string;

  @Expose()
  Sku_Code!: string;

  @Expose()
  Unit!: string;

  @Expose()
  @Transform(({ value }) => Number(value || 0))
  So_Luong_Nhap!: number;

  @Expose()
  @Transform(({ value }) => Number(value || 0))
  Don_Gia_Nhap!: number;

  @Expose()
  @Transform(({ value }) => Number(value || 0))
  Thanh_Tien_Nhap!: number;

  @Expose()
  @Transform(({ value }) => Number(value || 0))
  So_Luong_Xuat!: number;

  @Expose()
  @Transform(({ value }) => Number(value || 0))
  Don_Gia_Xuat!: number;

  @Expose()
  @Transform(({ value }) => Number(value || 0))
  Thanh_Tien_Xuat!: number;

  @Expose()
  @Transform(({ value }) => Number(value || 0))
  So_Luong_Ton!: number;
}
