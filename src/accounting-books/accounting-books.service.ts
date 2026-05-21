import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateAccountingBookDto } from './dto/create-accounting-book.dto';
import { UpdateAccountingBookDto } from './dto/update-accounting-book.dto';

import { ACCOUNTING_BOOKS_CONFIG, AccountingBookKey } from './constant/accounting-books.constant';
import { PrismaService } from 'src/core/prisma/prisma.service';

@Injectable()
export class AccountingBooksService {
  constructor(private readonly prisma: PrismaService) {}
  generateBookMetadata(bookKey: AccountingBookKey, userId: string, startDate: Date, endDate: Date) {
    const bookInfo = ACCOUNTING_BOOKS_CONFIG[bookKey];
    
    if (!bookInfo) {
      throw new BadRequestException('Book code invalid.');
    }
    // Lấy thông tin người dùng để điền vào metadata
    const userProfile = this.prisma.userProfile.findUnique({
      where: { userId },
      select: { business_name: true, tax_code: true, owner_name: true },
    });

    // Tạo tên kỳ kế toán từ startDate và endDate
    const periodName = `${startDate.getDate()}/${startDate.getMonth() + 1}/${startDate.getFullYear()} - ${endDate.getDate()}/${endDate.getMonth() + 1}/${endDate.getFullYear()}`;   

    return {
      business_name: userProfile.business_name,
      tax_code: userProfile.tax_code,
      book_title: `${bookInfo.title} (Mẫu ${bookInfo.code})`, // Chuẩn hóa chuỗi in ấn
      period_name: periodName,
      representative_name: userProfile.owner_name,
      template_type: bookInfo.template
    };
  }
  async revenue(startDate: Date, endDate: Date, userId: string) { }
}
