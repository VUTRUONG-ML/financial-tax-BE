import { Module } from '@nestjs/common';
import { AccountingBooksService } from './accounting-books.service';
import { AccountingBooksController } from './accounting-books.controller';
import { PrismaModule } from '../core/prisma/prisma.module';
import { TaxEngineModule } from '../tax-engine/tax-engine.module';
import { StocksModule } from '../stocks/stocks.module';
import { VouchersModule } from '../vouchers/vouchers.module';

@Module({
  controllers: [AccountingBooksController],
  providers: [AccountingBooksService],
  imports: [PrismaModule, TaxEngineModule, StocksModule, VouchersModule],
})
export class AccountingBooksModule {}
