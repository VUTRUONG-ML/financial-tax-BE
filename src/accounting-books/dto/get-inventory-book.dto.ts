import { GetRevenueBookDto } from './get-revenue-book.dto';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class GetInventoryBookDto extends GetRevenueBookDto {
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
    }
    return value;
  })
  @IsArray()
  @IsString({ each: true })
  productPublicIds?: string[];
}
