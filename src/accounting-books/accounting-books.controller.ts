import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { AccountingBooksService } from './accounting-books.service';
import { CreateAccountingBookDto } from './dto/create-accounting-book.dto';
import { UpdateAccountingBookDto } from './dto/update-accounting-book.dto';

@Controller('accounting-books')
export class AccountingBooksController {
  constructor(private readonly accountingBooksService: AccountingBooksService) {}

  @Post()
  create(@Body() createAccountingBookDto: CreateAccountingBookDto) {
    return this.accountingBooksService.create(createAccountingBookDto);
  }

  @Get()
  findAll() {
    return this.accountingBooksService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.accountingBooksService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateAccountingBookDto: UpdateAccountingBookDto) {
    return this.accountingBooksService.update(+id, updateAccountingBookDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.accountingBooksService.remove(+id);
  }
}
