import { Module } from '@nestjs/common';
import { TaxEngineService } from './tax-engine.service';

@Module({
  providers: [TaxEngineService],
  exports: [TaxEngineService],
})
export class TaxEngineModule {}
