import { Module } from '@nestjs/common';
import { TaxAuthorityConnectionsService } from './tax-authority-connections.service';
import { TaxAuthorityConnectionsController } from './tax-authority-connections.controller';
import { PrismaModule } from '../core/prisma/prisma.module';
import { AuditLogModule } from '../core/audit-log/audit-log.module';

@Module({
  imports: [PrismaModule, AuditLogModule],
  controllers: [TaxAuthorityConnectionsController],
  providers: [TaxAuthorityConnectionsService],
  exports: [TaxAuthorityConnectionsService],
})
export class TaxAuthorityConnectionsModule {}
