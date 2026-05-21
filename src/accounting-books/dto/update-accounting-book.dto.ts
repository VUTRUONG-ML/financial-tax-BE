import { PartialType } from '@nestjs/swagger';
import { CreateAccountingBookDto } from './create-accounting-book.dto';

export class UpdateAccountingBookDto extends PartialType(CreateAccountingBookDto) {}
