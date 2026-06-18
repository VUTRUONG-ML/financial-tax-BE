import { Module } from '@nestjs/common';
import { CostEngineService } from './cost-engine.service';
import { StocksModule } from '../stocks/stocks.module';

@Module({
  imports: [StocksModule],
  providers: [CostEngineService],
  exports: [CostEngineService],
})
export class CostEngineModule {}
