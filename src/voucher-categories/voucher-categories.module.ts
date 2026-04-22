import { Module } from '@nestjs/common';
import { VoucherCategoriesService } from './voucher-categories.service';
import { VoucherCategoriesController } from './voucher-categories.controller';
import { PrismaModule } from '../core/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [VoucherCategoriesController],
  providers: [VoucherCategoriesService],
})
export class VoucherCategoriesModule {}
