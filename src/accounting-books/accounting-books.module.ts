import { Module } from '@nestjs/common';
import { AccountingBooksService } from './accounting-books.service';
import { AccountingBooksController } from './accounting-books.controller';
import { PrismaModule } from '../core/prisma/prisma.module';

@Module({
  controllers: [AccountingBooksController],
  providers: [AccountingBooksService],
  imports: [PrismaModule],
})
export class AccountingBooksModule {}
