import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/core/prisma/prisma.service';
import {
  ACCOUNTING_BOOKS_CONFIG,
  AccountingBookKey,
} from './constant/accounting-books.constant';
import { parseDateRange } from 'src/common/utils/date-range-parser.util';
import { Invoice, TaxConfiguration } from '@prisma/client';

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
      businessName: userProfile.businessName,
      taxCode: userProfile.taxCode,
      bookTitle: `${bookInfo.title} (Mẫu ${bookInfo.code})`,
      ownerName: userProfile.ownerName,
      templateStyle: bookInfo.template,
    };
  }

  async getRevenueBook(
    userId: string,
    timeFrame: string,
    customRange?: { startDate: Date; endDate: Date },
  ) {
    // 1. Phân tích mốc thời gian
    const { startDate, endDate } = parseDateRange(timeFrame, customRange);

    // 2. Lấy cấu hình thuế hợp lệ của người dùng
    const taxConfig =
      (await this.prisma.taxConfiguration.findFirst({
        where: {
          userId,
          applyFromDate: { lte: endDate },
          applyToDate: { gte: startDate },
        },
        include: {
          taxGroup: true,
          industry: true,
        },
        orderBy: {
          applyFromDate: 'desc',
        },
      })) ||
      (await this.prisma.taxConfiguration.findFirst({
        where: { userId },
        include: {
          taxGroup: true,
          industry: true,
        },
        orderBy: {
          applyFromDate: 'desc',
        },
      }));

    if (!taxConfig) {
      throw new NotFoundException('Tax configuration not found for this user.');
    }

    // 3. Truy vấn danh sách hóa đơn bán ra hợp lệ (ISSUED)
    const invoices = await this.prisma.invoice.findMany({
      where: {
        userId,
        status: 'ISSUED',
        issueDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: {
        issueDate: 'asc',
      },
    });

    const taxGroupId = taxConfig.taxGroupId;

    const books: Record<string, any> = {};
    let activeBookKey = '';

    // 4. Rẽ nhánh theo tax_group để tính toán các sổ được phép truy cập
    if (taxGroupId === 1) {
      books['S1a-HKD'] = await this.calculateS1a(
        invoices,
        taxConfig,
        taxConfig.industry.categoryName,
        userId,
        startDate,
        endDate,
      );
      activeBookKey = 'S1a-HKD';
    } else if (taxGroupId === 2) {
      books['S2a-HKD'] = await this.calculateS2a(
        invoices,
        taxConfig,
        taxConfig.industry.categoryName,
        userId,
        startDate,
        endDate,
      );
      books['S2b-HKD'] = await this.calculateS2b(
        invoices,
        taxConfig,
        taxConfig.industry.categoryName,
        userId,
        startDate,
        endDate,
      );
      activeBookKey = 'S2a-HKD';
    } else {
      books['S2b-HKD'] = await this.calculateS2b(
        invoices,
        taxConfig,
        taxConfig.industry.categoryName,
        userId,
        startDate,
        endDate,
      );
      activeBookKey = 'S2b-HKD';
    }

    return {
      books,
      activeBookKey,
    };
  }

  async calculateS1a(
    invoices: Invoice[],
    taxConfig: TaxConfiguration,
    dienGiai: string,
    userId: string,
    startDate: Date,
    endDate: Date,
  ) {
    const rows = invoices.map((invoice) => ({
      Ngay_Thang: invoice.issueDate,
      Dien_Giai: invoice.buyerName || dienGiai,
      So_Tien: Number(invoice.totalPayment),
    }));

    const tong_doanh_thu = rows.reduce((sum, r) => sum + r.So_Tien, 0);
    const so_luong_don_hang = invoices.length;

    const bookMetadata = await this.generateBookMetadata(
      'S1A',
      userId,
      startDate,
      endDate,
    );

    return {
      bookMetadata,
      bookKey: 'S1A',
      timeFrame: { startDate, endDate },
      rows,
      summary: {
        tong_doanh_thu,
        so_luong_don_hang,
      },
    };
  }

  async calculateS2a(
    invoices: Invoice[],
    taxConfig: TaxConfiguration,
    dienGiai: string,
    userId: string,
    startDate: Date,
    endDate: Date,
  ) {
    const vatRate = Number(taxConfig.vatRateSnapShot);
    const pitRate = Number(taxConfig.pitRateSnapShot);

    const rows = invoices.map((invoice) => {
      const amount = Number(invoice.totalPayment);
      const thueGTGT = amount * vatRate;
      return {
        So_Hieu_Chung_Tu: invoice.invoiceSymbol || invoice.id.toString(),
        Ngay_Thang: invoice.issueDate,
        Dien_Giai: invoice.buyerName || dienGiai,
        So_Tien: amount,
        Thue_GTGT: thueGTGT,
      };
    });

    const tong_doanh_thu = rows.reduce((sum, r) => sum + r.So_Tien, 0);
    const so_luong_don_hang = invoices.length;
    const tongThueGTGT = rows.reduce((sum, r) => sum + r.Thue_GTGT, 0);
    const tongThueTNCN = tong_doanh_thu * pitRate;

    const bookMetadata = await this.generateBookMetadata(
      'S2A',
      userId,
      startDate,
      endDate,
    );

    return {
      bookMetadata,
      bookKey: 'S2A',
      timeFrame: { startDate, endDate },
      rows,
      summary: {
        tong_doanh_thu,
        so_luong_don_hang,
        Tong_Thue_TNCN_Phai_Nop: tongThueTNCN,
        Tong_So_Thue_GTGT_Phai_Nop: tongThueGTGT,
      },
    };
  }

  async calculateS2b(
    invoices: Invoice[],
    taxConfig: TaxConfiguration,
    dienGiai: string,
    userId: string,
    startDate: Date,
    endDate: Date,
  ) {
    const vatRate = Number(taxConfig.vatRateSnapShot);

    const rows = invoices.map((invoice) => {
      const amount = Number(invoice.totalPayment);
      const thueGTGT = amount * vatRate;
      return {
        So_Hieu_Chung_Tu: invoice.invoiceSymbol || invoice.id.toString(),
        Ngay_Thang: invoice.issueDate,
        Dien_Giai: invoice.buyerName ?? dienGiai,
        So_Tien: amount,
        Thue_GTGT: thueGTGT,
      };
    });

    const tong_doanh_thu = rows.reduce((sum, r) => sum + r.So_Tien, 0);
    const so_luong_don_hang = invoices.length;
    const tongThueGTGT = rows.reduce((sum, r) => sum + r.Thue_GTGT, 0);

    const bookMetadata = await this.generateBookMetadata(
      'S2B',
      userId,
      startDate,
      endDate,
    );

    return {
      bookMetadata,
      bookKey: 'S2B',
      timeFrame: { startDate, endDate },
      rows,
      summary: {
        tong_doanh_thu,
        so_luong_don_hang,
        Tong_So_Thue_GTGT_Phai_Nop: tongThueGTGT,
      },
    };
  }
}
