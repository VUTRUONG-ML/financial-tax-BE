import { IsNotEmpty, IsString } from 'class-validator';
import { GetRevenueBookDto } from './get-revenue-book.dto';
export class GetInventoryBookDto extends GetRevenueBookDto {
  @IsString()
  @IsNotEmpty()
  productPublicId!: string;

  @IsString()
  @IsNotEmpty()
  periodPublicId!: string;
}
