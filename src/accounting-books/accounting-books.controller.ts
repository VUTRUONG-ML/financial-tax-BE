import { Controller } from '@nestjs/common';
import { AccountingBooksService } from './accounting-books.service';

@Controller('accounting-books')
export class AccountingBooksController {
  constructor(
    private readonly accountingBooksService: AccountingBooksService,
  ) {}
}
