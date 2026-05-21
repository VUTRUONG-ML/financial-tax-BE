import { Test, TestingModule } from '@nestjs/testing';
import { AccountingBooksController } from './accounting-books.controller';
import { AccountingBooksService } from './accounting-books.service';

describe('AccountingBooksController', () => {
  let controller: AccountingBooksController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AccountingBooksController],
      providers: [AccountingBooksService],
    }).compile();

    controller = module.get<AccountingBooksController>(AccountingBooksController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
