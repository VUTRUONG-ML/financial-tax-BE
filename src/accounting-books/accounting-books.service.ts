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
import { TaxEngineService } from '../tax-engine/tax-engine.service';
import { Decimal } from '@prisma/client/runtime/client';
import { moment } from 'src/common/utils/time.util';
import { plainToInstance } from 'class-transformer';
import { S1ARowDto, S2ARowDto, S2BRowDto } from './dto/revenue-book-row.dto';

@Injectable()
export class AccountingBooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly taxEngine: TaxEngineService,
  ) {}

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
    page: number = 1,
    limit: number = 20,
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

    // 3. Truy vấn danh sách hóa đơn phân trang
    const skip = (page - 1) * limit;
    const [invoices, aggregateInvoices] = await Promise.all([
      this.prisma.invoice.findMany({
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
        skip,
        take: limit,
      }),
      this.prisma.invoice.aggregate({
        _sum: { totalPayment: true },
        _count: { id: true },
        where: {
          userId,
          status: 'ISSUED',
          issueDate: {
            gte: startDate,
            lte: endDate,
          },
        },
      }),
    ]);

    const tong_doanh_thu = Number(aggregateInvoices._sum.totalPayment || 0);
    const so_luong_don_hang = aggregateInvoices._count.id;

    const taxGroupId = taxConfig.taxGroupId;

    const books: Record<string, any> = {};
    let activeBookKey = '';

    // 4. Rẽ nhánh theo tax_group để tính toán các sổ được phép truy cập
    if (taxGroupId === 1) {
      books['S1a-HKD'] = await this.calculateS1a(
        userId,
        startDate,
        endDate,
        tong_doanh_thu,
        so_luong_don_hang,
        page,
        limit,
      );
      activeBookKey = 'S1a-HKD';
    } else if (taxGroupId === 2) {
      books['S2a-HKD'] = await this.calculateS2a(
        taxConfig,
        userId,
        startDate,
        endDate,
        tong_doanh_thu,
        so_luong_don_hang,
        page,
        limit,
      );
      books['S2b-HKD'] = await this.calculateS2b(
        taxConfig,
        userId,
        startDate,
        endDate,
        tong_doanh_thu,
        so_luong_don_hang,
        page,
        limit,
      );
      activeBookKey = 'S2a-HKD';
    } else {
      books['S2b-HKD'] = await this.calculateS2b(
        taxConfig,
        userId,
        startDate,
        endDate,
        tong_doanh_thu,
        so_luong_don_hang,
        page,
        limit,
      );
      activeBookKey = 'S2b-HKD';
    }

    const mappedInvoices = invoices.map((inv) => ({
      ...inv,
      Dien_Giai: inv.buyerName || taxConfig.industry.categoryName,
      Thue_GTGT: Number(inv.taxPayable),
    }));

    if (books['S1a-HKD']) {
      books['S1a-HKD'].rows = plainToInstance(S1ARowDto, mappedInvoices);
    }
    if (books['S2a-HKD']) {
      books['S2a-HKD'].rows = plainToInstance(S2ARowDto, mappedInvoices);
    }
    if (books['S2b-HKD']) {
      books['S2b-HKD'].rows = plainToInstance(S2BRowDto, mappedInvoices);
    }

    return {
      books,
      activeBookKey,
    };
  }

  async calculateS1a(
    userId: string,
    startDate: Date,
    endDate: Date,
    tong_doanh_thu: number,
    so_luong_don_hang: number,
    page: number,
    limit: number,
  ) {
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
      meta: {
        total: so_luong_don_hang,
        page,
        lastPage: Math.ceil(so_luong_don_hang / limit) || 1,
      },
      rows: [],
      summary: {
        tong_doanh_thu,
        so_luong_don_hang,
      },
    };
  }

  async calculateS2a(
    taxConfig: TaxConfiguration,
    userId: string,
    startDate: Date,
    endDate: Date,
    tong_doanh_thu: number,
    so_luong_don_hang: number,
    page: number,
    limit: number,
  ) {
    // Thuế GTGT được tính từ tổng doanh thu nhân với tỷ lệ thuế
    const vatRate = Number(taxConfig.vatRateSnapShot);
    const tongThueGTGT = tong_doanh_thu * vatRate;

    // Tính Thuế TNCN (PIT) lũy kế YTD --------------------------------------------------------
    const startOfYear = moment(startDate).startOf('year').toDate();

    // 1. Tính tổng doanh thu và chi phí từ đầu năm đến trước startDate
    const [revBefore, expBefore] = await Promise.all([
      this.prisma.invoice.aggregate({
        _sum: { totalPayment: true },
        where: {
          userId,
          status: 'ISSUED',
          issueDate: { gte: startOfYear, lt: startDate },
        },
      }),
      this.prisma.voucher.aggregate({
        _sum: { amount: true },
        where: {
          userId,
          transactionAt: { gte: startOfYear, lt: startDate },
          voucherType: 'PAYMENT',
          isDeductibleExpense: true,
          status: 'ACTIVE',
        },
      }),
    ]);
    const ytdRevenueBefore = revBefore._sum.totalPayment || new Decimal(0);
    const ytdExpenseBefore = expBefore._sum.amount || new Decimal(0);

    // 2. Tính chi phí trong kỳ (doanh thu trong kỳ chính là tong_doanh_thu)
    const expInPeriod = await this.prisma.voucher.aggregate({
      _sum: { amount: true },
      where: {
        userId,
        transactionAt: { gte: startDate, lte: endDate },
        voucherType: 'PAYMENT',
        isDeductibleExpense: true,
        status: 'ACTIVE',
      },
    });
    const expenseInPeriod = expInPeriod._sum.amount || new Decimal(0);

    // 3. Tính YTD đến cuối kỳ
    const ytdRevenueEnd = ytdRevenueBefore.add(tong_doanh_thu);
    const ytdExpenseEnd = ytdExpenseBefore.add(expenseInPeriod);

    // 4. Tính thuế lũy kế 2 mốc
    const taxBefore = this.taxEngine.calculateTotalTax(
      ytdRevenueBefore,
      ytdExpenseBefore,
      taxConfig,
    );
    const taxEnd = this.taxEngine.calculateTotalTax(
      ytdRevenueEnd,
      ytdExpenseEnd,
      taxConfig,
    );

    // 5. Lấy phần PIT phát sinh trong kỳ (TaxEnd - TaxBefore) bằng cách lấy tổng thuế trừ đi VAT
    const pitBefore = taxBefore.totalTaxDue.sub(taxBefore.vatAmount);
    const pitEnd = taxEnd.totalTaxDue.sub(taxEnd.vatAmount);
    const tongThueTNCN = Number(Decimal.max(0, pitEnd.sub(pitBefore)));

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
      meta: {
        total: so_luong_don_hang,
        page,
        lastPage: Math.ceil(so_luong_don_hang / limit) || 1,
      },
      rows: [],
      summary: {
        tong_doanh_thu,
        so_luong_don_hang,
        Tong_Thue_TNCN_Phai_Nop: tongThueTNCN,
        Tong_So_Thue_GTGT_Phai_Nop: Number(tongThueGTGT),
      },
    };
  }

  async calculateS2b(
    taxConfig: TaxConfiguration,
    userId: string,
    startDate: Date,
    endDate: Date,
    tong_doanh_thu: number,
    so_luong_don_hang: number,
    page: number,
    limit: number,
  ) {
    const vatRate = Number(taxConfig.vatRateSnapShot);

    // Thuế GTGT được tính từ tổng doanh thu nhân với tỷ lệ thuế
    const tongThueGTGT = tong_doanh_thu * vatRate;

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
      meta: {
        total: so_luong_don_hang,
        page,
        lastPage: Math.ceil(so_luong_don_hang / limit) || 1,
      },
      rows: [],
      summary: {
        tong_doanh_thu,
        so_luong_don_hang,
        Tong_So_Thue_GTGT_Phai_Nop: tongThueGTGT,
      },
    };
  }
}
