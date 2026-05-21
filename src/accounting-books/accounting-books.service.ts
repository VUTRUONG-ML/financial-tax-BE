import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from 'src/core/prisma/prisma.service';
import {
  ACCOUNTING_BOOKS_CONFIG,
  AccountingBookKey,
} from './constant/accounting-books.constant';

@Injectable()
export class AccountingBooksService {
  constructor(private readonly prisma: PrismaService) {}
  async generateBookMetadata(
    bookKey: AccountingBookKey,
    userId: string,
    startDate: Date,
    endDate: Date,
  ) {
    const bookInfo = ACCOUNTING_BOOKS_CONFIG[bookKey];

    if (!bookInfo) {
      throw new BadRequestException('Book code invalid.');
    }
    // Lấy thông tin người dùng để điền vào metadata
    const userProfile = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!userProfile) throw new ForbiddenException('You do not have access.');

    return {
      // business_name: userProfile.business_name,
      // tax_code: userProfile.tax_code,
      // book_title: `${bookInfo.title} (Mẫu ${bookInfo.code})`, // Chuẩn hóa chuỗi in ấn
      // period_name: periodName,
      // representative_name: userProfile.owner_name,
      // template_type: bookInfo.template,
      businessName: userProfile.businessName,
      taxCode: userProfile.taxCode,
      bookTitle: `${bookInfo.title} (Mẫu ${bookInfo.code})`,
      ownerName: userProfile.ownerName,
      templateStyle: bookInfo.template,
    };
  }
  async revenue(startDate: Date, endDate: Date, userId: string) {}
}
