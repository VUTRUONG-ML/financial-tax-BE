import { GetRevenueBookDto } from './get-revenue-book.dto';
import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class GetInventoryBookDto extends GetRevenueBookDto {
  @IsString()
  @IsNotEmpty()
  productPublicId!: string;

  @IsString()
  @IsNotEmpty()
  periodPublicId!: string;
}
