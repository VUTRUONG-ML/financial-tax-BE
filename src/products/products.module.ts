import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { FinancialPeriodsModule } from '../financial-periods/financial-periods.module';
import { StocksModule } from '../stocks/stocks.module';

@Module({
  controllers: [ProductsController],
  providers: [ProductsService],
  imports: [CloudinaryModule, FinancialPeriodsModule, StocksModule],
  exports: [ProductsService],
})
export class ProductsModule {}
