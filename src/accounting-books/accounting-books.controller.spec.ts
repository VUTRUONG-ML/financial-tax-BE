import { Test, TestingModule } from '@nestjs/testing';
import { AccountingBooksController } from './accounting-books.controller';
import { AccountingBooksService } from './accounting-books.service';
import { PrismaService } from 'src/core/prisma/prisma.service';

describe('AccountingBooksController', () => {
  let controller: AccountingBooksController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AccountingBooksController],
      providers: [
        AccountingBooksService,
        {
          provide: PrismaService,
          useValue: {
            user: { findUnique: jest.fn() },
            taxConfiguration: { findFirst: jest.fn() },
            invoice: { findMany: jest.fn() },
          },
        },
      ],
    }).compile();

    controller = module.get<AccountingBooksController>(AccountingBooksController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

