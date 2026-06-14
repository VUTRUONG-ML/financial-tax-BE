import { Module } from '@nestjs/common';
import { CostEngineService } from './cost-engine.service';

@Module({
  providers: [CostEngineService],
  exports: [CostEngineService],
})
export class CostEngineModule {}
