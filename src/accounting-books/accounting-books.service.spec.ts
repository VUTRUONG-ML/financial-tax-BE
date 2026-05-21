import { Test, TestingModule } from '@nestjs/testing';
import { AccountingBooksService } from './accounting-books.service';

describe('AccountingBooksService', () => {
  let service: AccountingBooksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AccountingBooksService],
    }).compile();

    service = module.get<AccountingBooksService>(AccountingBooksService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
