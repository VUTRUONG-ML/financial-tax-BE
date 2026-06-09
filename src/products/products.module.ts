import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { FinancialPeriodsModule } from '../financial-periods/financial-periods.module';

@Module({
  controllers: [ProductsController],
  providers: [ProductsService],
  imports: [CloudinaryModule, FinancialPeriodsModule],
  exports: [ProductsService],
})
export class ProductsModule {}
