import { Module } from '@nestjs/common';
import { TaxAuthorityService } from './tax-authority.service';
import { TaxAuthorityController } from './tax-authority.controller';

@Module({
  controllers: [TaxAuthorityController],
  providers: [TaxAuthorityService],
  exports: [TaxAuthorityService],
})
export class TaxAuthorityModule {}
