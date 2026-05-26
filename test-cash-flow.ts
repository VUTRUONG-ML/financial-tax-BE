import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { AccountingBooksService } from './src/accounting-books/accounting-books.service';
import { PrismaService } from './src/core/prisma/prisma.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);
  const service = app.get(AccountingBooksService);

  const testUser = await prisma.user.findUnique({
    where: { phoneNumber: '0900000001' },
  });
  if (!testUser) {
    console.log('No test user found!');
    return;
  }

  console.log('--- TEST CASH FLOW SUMMARY ---');
  const summary = await service.getCashFlowBookSummary(testUser.id, 'nam_nay');
  console.dir(summary, { depth: null });

  console.log('\n--- TEST CASH FLOW RECORDS (S03-CASH) ---');
  const records = await service.getCashFlowBookRecords(
    testUser.id,
    'nam_nay',
    undefined,
    undefined,
    'S03',
  );
  console.dir(records, { depth: null });

  await app.close();
}

bootstrap();
