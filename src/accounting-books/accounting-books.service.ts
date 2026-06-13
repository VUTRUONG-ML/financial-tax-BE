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
import { Invoice, TaxConfiguration, Prisma } from '@prisma/client';
import { TaxEngineService } from '../tax-engine/tax-engine.service';
import { Decimal } from '@prisma/client/runtime/client';
import { moment } from 'src/common/utils/time.util';
import { S1ARowDto, S2ARowDto, S2BRowDto } from './dto/revenue-book-row.dto';
import { ExpenseBookRowDto } from './dto/expense-book-row.dto';
import { InventoryBookRowDto } from './dto/inventory-book-row.dto';
import { plainToInstance } from 'class-transformer';
import { AppLogger } from 'src/common/logger/app-logger.service';
import { LOG_ACTIONS, LOG_STATUS } from 'src/common/constants/log-events.constant';

export interface ExpenseSummaryRow {
  chi_phi_nguyen_vat_lieu: string | number;
  chi_phi_nhan_cong: string | number;
  chi_phi_khau_hao: string | number;
  chi_phi_dich_vu_mua_ngoai: string | number;
  chi_phi_lai_vay: string | number;
  chi_phi_khac: string | number;
}

@Injectable()
export class AccountingBooksService {
  private readonly logger = new AppLogger(AccountingBooksService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly taxEngine: TaxEngineService,
  ) { }

  private async getPeriodTarget(
    publicId: string,
    userId: string,
    action: string = LOG_ACTIONS.ACC_BOOK,
  ) {
    const periodTarget = await this.prisma.financialPeriod.findUnique({
      where: { publicId },
    });
    if (!periodTarget || periodTarget.userId !== userId) {
      this.logger.warn(action, {
        status: LOG_STATUS.FAILED,
        reason: 'PERIOD_NOT_FOUND',
        periodId: publicId,
        userId,
      });
      throw new NotFoundException('Financial period not found.');
    }
    return periodTarget;
  }

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

  async getValidTaxConfig(userId: string, startDate: Date, endDate: Date) {
    const taxConfig =
      (await this.prisma.taxConfiguration.findFirst({
        where: {
          userId,
          applyFromDate: { lte: endDate },
          applyToDate: { gte: startDate },
        },
        include: { taxGroup: true, industry: true },
        orderBy: { applyFromDate: 'desc' },
      })) ||
      (await this.prisma.taxConfiguration.findFirst({
        where: { userId },
        include: { taxGroup: true, industry: true },
        orderBy: { applyFromDate: 'desc' },
      }));

    if (!taxConfig) {
      throw new NotFoundException('Tax configuration not found for this user.');
    }

    return taxConfig;
  }

  private async generateSyncCode(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<string> {
    const [invoiceAgg, voucherAgg] = await Promise.all([
      this.prisma.invoice.aggregate({
        _count: { id: true },
        _max: { updatedAt: true },
        where: {
          userId,
          issueDate: { gte: startDate, lte: endDate },
        },
      }),
      this.prisma.voucher.aggregate({
        _count: { id: true },
        _max: { updatedAt: true },
        where: {
          userId,
          transactionAt: { gte: startDate, lte: endDate },
        },
      }),
    ]);
    const invCount = invoiceAgg._count.id;
    const invMaxTime = invoiceAgg._max.updatedAt?.getTime() || 0;
    const vchCount = voucherAgg._count.id;
    const vchMaxTime = voucherAgg._max.updatedAt?.getTime() || 0;

    return `${invCount}-${invMaxTime}-${vchCount}-${vchMaxTime}`;
  }

  async getRevenueBookSummary(
    userId: string,
    timeFrame: string,
    customRange?: {
      year?: number;
      quarter?: number;
    },
  ) {
    // 1. Phân tích mốc thời gian
    const { startDate, endDate } = parseDateRange(timeFrame, customRange);

    // 2. Lấy cấu hình thuế hợp lệ của người dùng
    const taxConfig = await this.getValidTaxConfig(userId, startDate, endDate);

    const aggregateInvoices = await this.prisma.invoice.aggregate({
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
    });

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
      );
      books['S2b-HKD'] = await this.calculateS2b(
        taxConfig,
        userId,
        startDate,
        endDate,
        tong_doanh_thu,
        so_luong_don_hang,
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
      );
      activeBookKey = 'S2b-HKD';
    }

    const syncCode = await this.generateSyncCode(userId, startDate, endDate);

    return {
      books,
      activeBookKey,
      syncCode,
    };
  }

  async getRevenueBookRecords(
    userId: string,
    timeFrame: string,
    customRange?: {
      year?: number;
      quarter?: number;
    },
    page: number = 1,
    limit: number = 20,
    currentSyncCode?: string,
  ) {
    const { startDate, endDate } = parseDateRange(timeFrame, customRange);

    const taxConfig = await this.getValidTaxConfig(userId, startDate, endDate);

    const skip = (page - 1) * limit;

    const [invoices, totalInvoices, syncCode] = await Promise.all([
      this.prisma.invoice.findMany({
        where: {
          userId,
          status: 'ISSUED',
          issueDate: { gte: startDate, lte: endDate },
        },
        orderBy: { issueDate: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.invoice.count({
        where: {
          userId,
          status: 'ISSUED',
          issueDate: { gte: startDate, lte: endDate },
        },
      }),
      this.generateSyncCode(userId, startDate, endDate),
    ]);

    const mappedInvoices = invoices.map((inv) => ({
      ...inv,
      Dien_Giai: inv.buyerName || taxConfig.industry.categoryName,
      Thue_GTGT: Number(inv.taxPayable),
    }));

    let rows: S1ARowDto[] | S2ARowDto[] | S2BRowDto[] = [];
    let activeBookKey = '';
    const taxGroupId = taxConfig.taxGroupId;

    if (taxGroupId === 1) {
      rows = plainToInstance(S1ARowDto, mappedInvoices, {
        excludeExtraneousValues: true,
      });
      activeBookKey = 'S1a-HKD';
    } else if (taxGroupId === 2) {
      rows = plainToInstance(S2ARowDto, mappedInvoices, {
        excludeExtraneousValues: true,
      });
      activeBookKey = 'S2a-HKD';
    } else {
      rows = plainToInstance(S2BRowDto, mappedInvoices, {
        excludeExtraneousValues: true,
      });
      activeBookKey = 'S2b-HKD';
    }

    return {
      rows,
      meta: {
        total: totalInvoices,
        page,
        lastPage: Math.ceil(totalInvoices / limit) || 1,
      },
      activeBookKey,
      syncCode,
      isSummaryOutdated: currentSyncCode ? currentSyncCode !== syncCode : true,
    };
  }

  async calculateS1a(
    userId: string,
    startDate: Date,
    endDate: Date,
    tong_doanh_thu: number,
    so_luong_don_hang: number,
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
      summary: {
        tong_doanh_thu,
        so_luong_don_hang,
        Tong_So_Thue_GTGT_Phai_Nop: tongThueGTGT,
      },
    };
  }

  // --------------------------------------------------------------------------
  // SỔ CHI TIẾT TIỀN (S2e-HKD: S03 Tiền Mặt & S04 Tiền Gửi)
  // --------------------------------------------------------------------------

  async generateCashFlowSyncCode(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<string> {
    const voucherStats = await this.prisma.voucher.aggregate({
      where: {
        userId,
        transactionAt: { gte: startDate, lte: endDate },
      },
      _count: { id: true },
      _max: { updatedAt: true },
    });
    const vCount = voucherStats._count.id || 0;
    const vMaxTime = voucherStats._max.updatedAt?.getTime() || 0;

    return `${vCount}-${vMaxTime}`;
  }

  async getCashFlowBookSummary(
    userId: string,
    timeFrame: string,
    customRange?: {
      year?: number;
      quarter?: number;
    },
  ) {
    const { startDate, endDate } = parseDateRange(timeFrame, customRange);

    const syncCode = await this.generateCashFlowSyncCode(
      userId,
      startDate,
      endDate,
    );

    // Lấy thông tin thống kê Thu Chi (Voucher) cho S03 (CASH) và S04 (BANK)
    // 1. Tổng thu/chi trong kỳ
    const periodStats = await this.prisma.voucher.groupBy({
      by: ['paymentMethod', 'voucherType'],
      where: {
        userId,
        transactionAt: { gte: startDate, lte: endDate },
        status: 'ACTIVE',
      },
      _sum: { amount: true },
    });

    // 2. Lấy số dư đầu kỳ (Trước startDate)
    const openingStats = await this.prisma.voucher.groupBy({
      by: ['paymentMethod', 'voucherType'],
      where: {
        userId,
        transactionAt: { lt: startDate },
        status: 'ACTIVE',
      },
      _sum: { amount: true },
    });

    // Helper tính toán cho một phương thức thanh toán
    const calculateBookStats = async (
      bookKey: AccountingBookKey,
      paymentMethod: 'CASH' | 'BANK',
    ) => {
      // Số dư đầu kỳ = Tổng thu - Tổng chi (trước startDate)
      let openingBalance = 0;
      openingStats.forEach((stat) => {
        if (stat.paymentMethod === paymentMethod) {
          const amt = Number(stat._sum.amount || 0);
          if (stat.voucherType === 'RECEIPT') openingBalance += amt;
          if (stat.voucherType === 'PAYMENT') openingBalance -= amt;
        }
      });

      // Số liệu trong kỳ
      let periodReceipt = 0;
      let periodPayment = 0;
      periodStats.forEach((stat) => {
        if (stat.paymentMethod === paymentMethod) {
          const amt = Number(stat._sum.amount || 0);
          if (stat.voucherType === 'RECEIPT') periodReceipt += amt;
          if (stat.voucherType === 'PAYMENT') periodPayment += amt;
        }
      });

      const closingBalance = openingBalance + periodReceipt - periodPayment;

      const bookMetadata = await this.generateBookMetadata(
        bookKey,
        userId,
        startDate,
        endDate,
      );

      return {
        bookMetadata,
        bookKey,
        timeFrame: { startDate, endDate },
        summary: {
          So_Du_Dau_Ky: openingBalance,
          Tong_Thu_Trong_Ky: periodReceipt,
          Tong_Chi_Trong_Ky: periodPayment,
          So_Du_Cuoi_Ky: closingBalance,
        },
      };
    };

    const s03 = await calculateBookStats('S2E', 'CASH');
    const s04 = await calculateBookStats('S2E', 'BANK');

    return {
      activeBookKey: 'S2e-HKD', // Main tab UI
      books: {
        'S03-HKD': s03,
        'S04-HKD': s04,
      },
      syncCode,
    };
  }

  async getCashFlowBookRecords(
    userId: string,
    timeFrame: string,
    customRange?: {
      year?: number;
      quarter?: number;
    },
    bookKey: string = 'S03',
    page: number = 1,
    limit: number = 20,
    clientSyncCode?: string,
  ) {
    const { startDate, endDate } = parseDateRange(timeFrame, customRange);

    const currentSyncCode = await this.generateCashFlowSyncCode(
      userId,
      startDate,
      endDate,
    );
    const isSummaryOutdated =
      !!clientSyncCode && currentSyncCode !== clientSyncCode;

    const paymentMethod = bookKey === 'S03' ? 'CASH' : 'BANK';

    // 1. Tính toán số dư đầu kỳ (Opening Balance) bằng Prisma native
    const openingStats = await this.prisma.voucher.groupBy({
      by: ['voucherType'],
      where: {
        userId,
        paymentMethod: paymentMethod,
        transactionAt: { lt: startDate },
        status: 'ACTIVE',
      },
      _sum: { amount: true },
    });

    let openingBalance = 0;
    openingStats.forEach((stat) => {
      const amt = Number(stat._sum.amount || 0);
      if (stat.voucherType === 'RECEIPT') openingBalance += amt;
      if (stat.voucherType === 'PAYMENT') openingBalance -= amt;
    });

    // 2. Đếm tổng số bản ghi trong kỳ để phân trang bằng Prisma native
    const total = await this.prisma.voucher.count({
      where: {
        userId,
        paymentMethod: paymentMethod,
        transactionAt: { gte: startDate, lte: endDate },
        status: 'ACTIVE',
      },
    });

    // 3. Truy vấn chi tiết với Window Function để tính running balance
    const limitVal = BigInt(limit);
    const offsetVal = BigInt((page - 1) * limit);

    const records = await this.prisma.$queryRaw<any[]>`
      WITH CTE AS (
        SELECT 
          id,
          transaction_at as "Ngay_Giao_Dich",
          CASE WHEN voucher_type = 'RECEIPT' THEN voucher_code ELSE NULL END as "So_Phieu_Thu",
          CASE WHEN voucher_type = 'PAYMENT' THEN voucher_code ELSE NULL END as "So_Phieu_Chi",
          content as "Dien_Giai",
          CASE WHEN voucher_type = 'RECEIPT' THEN amount ELSE 0 END as "Tien_Thu",
          CASE WHEN voucher_type = 'PAYMENT' THEN amount ELSE 0 END as "Tien_Chi",
          SUM(CASE WHEN voucher_type = 'RECEIPT' THEN amount ELSE -amount END) 
            OVER (ORDER BY transaction_at ASC, id ASC) as running_balance_in_period
        FROM vouchers
        WHERE user_id = ${userId} 
          AND payment_method = ${paymentMethod}::"PaymentMethod" 
          AND transaction_at BETWEEN ${startDate} AND ${endDate}
          AND status = 'ACTIVE'
      )
      SELECT 
        "Ngay_Giao_Dich",
        "So_Phieu_Thu",
        "So_Phieu_Chi",
        "Dien_Giai",
        "Tien_Thu",
        "Tien_Chi",
        (${openingBalance}::numeric + running_balance_in_period) as "So_Du_Ton"
      FROM CTE
      ORDER BY "Ngay_Giao_Dich" ASC, id ASC
      LIMIT ${limitVal} OFFSET ${offsetVal}
    `;

    return {
      rows: records.map((r) => ({
        ...r,
        Tien_Thu: Number(r.Tien_Thu),
        Tien_Chi: Number(r.Tien_Chi),
        So_Du_Ton: Number(r.So_Du_Ton),
      })),
      meta: {
        total,
        page,
        lastPage: Math.ceil(total / limit) || 1,
      },
      activeBookKey: `${bookKey}-HKD`,
      syncCode: currentSyncCode,
      isSummaryOutdated,
    };
  }

  async generateExpenseSyncCode(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<string> {
    const voucherAgg = await this.prisma.voucher.aggregate({
      _count: { id: true },
      _max: { updatedAt: true },
      where: {
        userId,
        transactionAt: { gte: startDate, lte: endDate },
        voucherType: 'PAYMENT',
        isDeductibleExpense: true,
        status: 'ACTIVE',
      },
    });
    const vchCount = voucherAgg._count.id;
    const vchMaxTime = voucherAgg._max.updatedAt?.getTime() || 0;

    return `${vchCount}-${vchMaxTime}`;
  }

  async getExpenseBookSummary(
    userId: string,
    timeFrame: string,
    customRange?: {
      year?: number;
      quarter?: number;
    },
  ) {
    const { startDate, endDate } = parseDateRange(timeFrame, customRange);

    const [dbResult, bookMetadata, syncCode] = await Promise.all([
      this.prisma.$queryRaw<ExpenseSummaryRow[]>`
        SELECT 
          COALESCE(SUM(CASE WHEN vc.s2c_expense_mapping = 'ITEM_A' THEN v.amount ELSE 0 END), 0) as chi_phi_nguyen_vat_lieu,
          COALESCE(SUM(CASE WHEN vc.s2c_expense_mapping = 'ITEM_B' THEN v.amount ELSE 0 END), 0) as chi_phi_nhan_cong,
          COALESCE(SUM(CASE WHEN vc.s2c_expense_mapping = 'ITEM_C' THEN v.amount ELSE 0 END), 0) as chi_phi_khau_hao,
          COALESCE(SUM(CASE WHEN vc.s2c_expense_mapping = 'ITEM_D' THEN v.amount ELSE 0 END), 0) as chi_phi_dich_vu_mua_ngoai,
          COALESCE(SUM(CASE WHEN vc.s2c_expense_mapping = 'ITEM_E' THEN v.amount ELSE 0 END), 0) as chi_phi_lai_vay,
          COALESCE(SUM(CASE WHEN vc.s2c_expense_mapping = 'ITEM_F' THEN v.amount ELSE 0 END), 0) as chi_phi_khac
        FROM vouchers v
        JOIN voucher_categories vc ON v.category_id = vc.id
        WHERE v.user_id = ${userId}
          AND v.transaction_at BETWEEN ${startDate} AND ${endDate}
          AND v.voucher_type = 'PAYMENT'
          AND v.is_deductible_expense = TRUE
          AND v.status = 'ACTIVE';
      `,
      this.generateBookMetadata('S2C', userId, startDate, endDate),
      this.generateExpenseSyncCode(userId, startDate, endDate),
    ]);

    const summaryRow: ExpenseSummaryRow = dbResult[0] || {
      chi_phi_nguyen_vat_lieu: 0,
      chi_phi_nhan_cong: 0,
      chi_phi_khau_hao: 0,
      chi_phi_dich_vu_mua_ngoai: 0,
      chi_phi_lai_vay: 0,
      chi_phi_khac: 0,
    };

    const chi_phi_nguyen_vat_lieu = Number(
      summaryRow.chi_phi_nguyen_vat_lieu || 0,
    );
    const chi_phi_nhan_cong = Number(summaryRow.chi_phi_nhan_cong || 0);
    const chi_phi_khau_hao = Number(summaryRow.chi_phi_khau_hao || 0);
    const chi_phi_dich_vu_mua_ngoai = Number(
      summaryRow.chi_phi_dich_vu_mua_ngoai || 0,
    );
    const chi_phi_lai_vay = Number(summaryRow.chi_phi_lai_vay || 0);
    const chi_phi_khac = Number(summaryRow.chi_phi_khac || 0);

    const tong_chi_phi_hop_le =
      chi_phi_nguyen_vat_lieu +
      chi_phi_nhan_cong +
      chi_phi_khau_hao +
      chi_phi_dich_vu_mua_ngoai +
      chi_phi_lai_vay +
      chi_phi_khac;

    return {
      activeBookKey: 'S2c-HKD',
      books: {
        'S2c-HKD': {
          bookMetadata,
          bookKey: 'S2C',
          timeFrame: { startDate, endDate },
          summary: {
            chi_phi_nguyen_vat_lieu,
            chi_phi_nhan_cong,
            chi_phi_khau_hao,
            chi_phi_dich_vu_mua_ngoai,
            chi_phi_lai_vay,
            chi_phi_khac,
            tong_chi_phi_hop_le,
          },
        },
      },
      syncCode,
    };
  }

  async getExpenseBookRecords(
    userId: string,
    timeFrame: string,
    customRange?: {
      year?: number;
      quarter?: number;
    },
    page: number = 1,
    limit: number = 20,
    currentSyncCode?: string,
  ) {
    const { startDate, endDate } = parseDateRange(timeFrame, customRange);

    const skip = (page - 1) * limit;

    const [vouchers, totalVouchers, syncCode] = await Promise.all([
      this.prisma.voucher.findMany({
        where: {
          userId,
          transactionAt: { gte: startDate, lte: endDate },
          voucherType: 'PAYMENT',
          isDeductibleExpense: true,
          status: 'ACTIVE',
        },
        include: {
          category: true,
          inboundInvoice: true,
        },
        orderBy: { transactionAt: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.voucher.count({
        where: {
          userId,
          transactionAt: { gte: startDate, lte: endDate },
          voucherType: 'PAYMENT',
          isDeductibleExpense: true,
          status: 'ACTIVE',
        },
      }),
      this.generateExpenseSyncCode(userId, startDate, endDate),
    ]);

    const rows = plainToInstance(ExpenseBookRowDto, vouchers, {
      excludeExtraneousValues: true,
    });

    return {
      rows,
      meta: {
        total: totalVouchers,
        page,
        lastPage: Math.ceil(totalVouchers / limit) || 1,
      },
      activeBookKey: 'S2c-HKD',
      syncCode,
      isSummaryOutdated: currentSyncCode ? currentSyncCode !== syncCode : true,
    };
  }

  // s2d
  private async getInventorySummary(
    productId: number,
    dateStartYear: Date,
    startPeriod: Date,
    endPeriod: Date,
  ) {
    const res = await this.prisma.$queryRaw<
      {
        stockStartPeriod: number;
        valueStartPeriod: Decimal;
        stockToEndPeriod: number;
        valueToEndPeriod: Decimal;
        receiptQuantity: number;
        receiptValue: Decimal;
        issueQuantity: number;
        issueValue: Decimal;
      }[]
    >`
          SELECT
            COALESCE(
              SUM(
                CASE
                  WHEN movement_date >= ${dateStartYear}
                    AND movement_date < ${startPeriod}
                  THEN
                    CASE
                      WHEN  movement_type IN (
                        'OPENING',
                        'PURCHASE_IN',
                        'PRODUCTION_IN',
                        'ADJUSTMENT_INCREASE'
                        )
                      THEN quantity
                      ELSE -quantity
                    END
                  ELSE 0
                END
              ),
              0
            ) as stockStartPeriod,
            COALESCE(
              SUM(
                CASE
                  WHEN movement_date >= ${dateStartYear}
                    AND movement_date < ${startPeriod}
                  THEN
                    CASE
                      WHEN  movement_type IN (
                        'OPENING',
                        'PURCHASE_IN',
                        'PRODUCTION_IN',
                        'ADJUSTMENT_INCREASE'
                        )
                      THEN total_value
                      ELSE -total_value
                    END
                  ELSE 0
                END
              ),
              0
            ) as valueStartPeriod,
            COALESCE(
              SUM(
                CASE
                  WHEN movement_date >= ${dateStartYear}
                    AND movement_date <= ${endPeriod}
                  THEN
                    CASE
                      WHEN  movement_type IN (
                        'OPENING',
                        'PURCHASE_IN',
                        'PRODUCTION_IN',
                        'ADJUSTMENT_INCREASE'
                        )
                      THEN quantity
                      ELSE -quantity
                    END
                  ELSE 0
                END
              ),
              0
            ) as stockToEndPeriod,
            COALESCE(
              SUM(
                CASE
                  WHEN movement_date >= ${dateStartYear}
                    AND movement_date <= ${endPeriod}
                  THEN
                    CASE
                      WHEN  movement_type IN (
                        'OPENING',
                        'PURCHASE_IN',
                        'PRODUCTION_IN',
                        'ADJUSTMENT_INCREASE'
                        )
                      THEN total_value
                      ELSE -total_value
                    END
                  ELSE 0
                END
              ),
              0
            ) as valueToEndPeriod,
            COALESCE(
              SUM(
                CASE
                  WHEN movement_type IN (
                      'PURCHASE_IN',
                      'PRODUCTION_IN',
                      'ADJUSTMENT_INCREASE'
                    )
                    AND movement_date >= ${startPeriod}
                    AND movement_date <= ${endPeriod}
                  THEN quantity
                  ELSE 0
                END
              ),
              0
            ) as receiptQuantity,
            COALESCE(
              SUM(
                CASE
                  WHEN movement_type IN (
                      'PURCHASE_IN',
                      'PRODUCTION_IN',
                      'ADJUSTMENT_INCREASE'
                    )
                    AND movement_date >= ${startPeriod}
                    AND movement_date <= ${endPeriod}
                  THEN total_value
                  ELSE 0
                END
              ),
              0
            ) as receiptValue,
            COALESCE(
              SUM(
                CASE
                  WHEN movement_type IN (
                      'SALE_OUT',
                      'PRODUCTION_OUT',
                      'ADJUSTMENT_DECREASE'
                    )
                    AND movement_date >= ${startPeriod}
                    AND movement_date <= ${endPeriod}
                  THEN quantity
                  ELSE 0
                END
              ),
              0 
            ) as issueQuantity,
             COALESCE(
              SUM(
                CASE
                  WHEN movement_type IN (
                      'SALE_OUT',
                      'PRODUCTION_OUT',
                      'ADJUSTMENT_DECREASE'
                    )
                    AND movement_date >= ${startPeriod}
                    AND movement_date <= ${endPeriod}
                  THEN total_value
                  ELSE 0
                END
              ),
              0 
            ) as issueValue
          FROM inventory_movements
          WHERE product_id = ${productId}
            AND movement_date >= ${dateStartYear}
        `;
    const row = res[0];

    return {
      stockStartPeriod: row?.stockStartPeriod ?? 0,
      valueStartPeriod: row?.valueStartPeriod ?? new Decimal(0),
      stockToEndPeriod: row?.stockToEndPeriod ?? 0,
      valueToEndPeriod: row?.valueToEndPeriod ?? new Decimal(0),
      receiptQuantity: row?.receiptQuantity ?? 0,
      receiptValue: row?.receiptValue ?? new Decimal(0),
      issueQuantity: row?.issueQuantity ?? 0,
      issueValue: row?.issueValue ?? new Decimal(0),
    };
  }
  async generateInventorySyncCode(
    userId: string,
    startDate: Date,
    endDate: Date,
    publicIdPeriod: string = 'template',
  ): Promise<string> {
    const periodTarget = await this.getPeriodTarget(
      publicIdPeriod,
      userId,
      LOG_ACTIONS.ACC_BOOK_S2d_VERSION,
    );
    const latestMovement = await this.prisma.inventoryMovement.findFirst({
      where: { periodId: periodTarget.id },
      orderBy: { createdAt: 'desc' },
      select: { publicId: true },
    });

    const version = latestMovement ? latestMovement.publicId : 0;
    return `${version}`;
  }

  async getInventoryBookSummary(
    userId: string,
    periodPublicId: string,
    productPublicId: string,
  ) {
    const periodTarget = await this.getPeriodTarget(
      periodPublicId,
      userId,
      LOG_ACTIONS.ACC_BOOK_S2d_SUMMARY,
    );
    const startDatePeriod = periodTarget.startDate;
    const endDatePeriod = periodTarget.endDate;
    const startYear = moment(periodTarget.startDate).startOf('year').toDate();

    const [bookMetadata, syncCode] = await Promise.all([
      this.generateBookMetadata('S2D', userId, startDatePeriod, endDatePeriod),
      this.generateInventorySyncCode(userId, startDatePeriod, endDatePeriod),
    ]);

    const product = await this.prisma.product.findFirst({
      where: {
        userId,
        publicId: productPublicId,
        productType: {
          not: 'SERVICE',
        },
      },
      select: {
        id: true,
        publicId: true,
        productName: true,
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found.');
    }

    const {
      stockStartPeriod,
      valueStartPeriod,
      stockToEndPeriod,
      valueToEndPeriod,
      receiptQuantity,
      receiptValue,
      issueQuantity,
      issueValue,
    } = await this.getInventorySummary(
      product.id,
      startYear,
      startDatePeriod,
      endDatePeriod,
    );
    return {
      activeBookKey: 'S2d-HKD',
      books: {
        'S2d-HKD': {
          bookMetadata,
          bookKey: 'S2D',
          timeFrame: { startDatePeriod, endDatePeriod },
          summary: {
            Tong_So_Luong_Ton_Dau_Ky: stockStartPeriod,
            Tong_Thanh_tien_Dau_Ky: valueStartPeriod,
            Tong_So_Luong_Nhap: receiptQuantity,
            Tong_Thanh_Tien_Nhap: receiptValue,
            Tong_So_Luong_Xuat: issueQuantity,
            Tong_Thanh_Tien_Xuat: issueValue,
            Tong_So_Luong_Ton_Cuoi_Ky: stockToEndPeriod,
            Tong_Thanh_tien_Cuoi_Ky: valueToEndPeriod,
          },
          isFinalized: periodTarget.status === 'CLOSED',
        },
      },
      syncCode,
    };
  }

  async getInventoryBookRecords(
    userId: string,
    timeFrame: string,
    productPublicIds: string,
    customRange?: {
      year?: number;
      quarter?: number;
    },
    page: number = 1,
    limit: number = 20,
    currentSyncCode?: string,
  ) {
    const { startDate, endDate } = parseDateRange(timeFrame, customRange);

    const products = await this.prisma.product.findMany({
      where: {
        userId,
        productType: { not: 'SERVICE' },
        ...(productPublicIds && productPublicIds.length > 0
          ? { publicId: productPublicIds }
          : {}),
      },
      select: { id: true },
    });

    const productIds = products.map((p) => p.id);

    const syncCode = await this.generateInventorySyncCode(
      userId,
      startDate,
      endDate,
    );

    if (productIds.length === 0) {
      return {
        rows: [],
        meta: {
          total: 0,
          page,
          lastPage: 1,
        },
        activeBookKey: 'S2d-HKD',
        syncCode,
        isSummaryOutdated: currentSyncCode
          ? currentSyncCode !== syncCode
          : true,
      };
    }

    const limitVal = BigInt(limit);
    const offsetVal = BigInt((page - 1) * limit);

    const records = await this.prisma.$queryRaw<any[]>`
      WITH historical_inbound AS (
        SELECT item.product_id, SUM(item.quantity) AS total_qty
        FROM inbound_invoice_details item
        JOIN inbound_invoices inv ON item.inbound_invoice_id = inv.id
        WHERE inv.user_id = ${userId}
          AND inv.issue_date < ${startDate}
          AND inv.status = 'ACTIVE'
          AND inv.is_synced_to_inventory = true
          AND item.product_id IN (${Prisma.join(productIds)})
        GROUP BY item.product_id
      ),
      historical_outbound AS (
        SELECT item.product_id, SUM(item.quantity) AS total_qty
        FROM invoice_details item
        JOIN invoices inv ON item.invoice_id = inv.id
        WHERE inv.user_id = ${userId}
          AND inv.issue_date < ${startDate}
          AND inv.status = 'ISSUED'
          AND item.product_id IN (${Prisma.join(productIds)})
        GROUP BY item.product_id
      ),
      historical_issue_material AS (
        SELECT pd.product_id, SUM(pd.quantity) AS total_qty
        FROM production_details pd
        JOIN internal_production_orders po ON pd.order_id = po.id
        WHERE po.user_id = ${userId}
          AND po.transaction_at < ${startDate}
          AND po.status = 'ACTIVE'
          AND pd.transaction_type = 'ISSUE_MATERIAL'
          AND pd.product_id IN (${Prisma.join(productIds)})
        GROUP BY pd.product_id
      ),
      historical_receive_product AS (
        SELECT pd.product_id, SUM(pd.quantity) AS total_qty
        FROM production_details pd
        JOIN internal_production_orders po ON pd.order_id = po.id
        WHERE po.user_id = ${userId}
          AND po.transaction_at < ${startDate}
          AND po.status = 'ACTIVE'
          AND pd.transaction_type = 'RECEIVE_PRODUCT'
          AND pd.product_id IN (${Prisma.join(productIds)})
        GROUP BY pd.product_id
      ),
      opening_balances AS (
        SELECT 
          p.id AS product_id,
          (
            p.opening_stock_quantity 
            + COALESCE(hi.total_qty, 0)
            - COALESCE(ho.total_qty, 0)
            - COALESCE(hm.total_qty, 0)
            + COALESCE(hr.total_qty, 0)
          ) AS opening_balance
        FROM products p
        LEFT JOIN historical_inbound hi ON p.id = hi.product_id
        LEFT JOIN historical_outbound ho ON p.id = ho.product_id
        LEFT JOIN historical_issue_material hm ON p.id = hm.product_id
        LEFT JOIN historical_receive_product hr ON p.id = hr.product_id
        WHERE p.id IN (${Prisma.join(productIds)})
      ),
      transactions AS (
        -- Inbound Invoices
        SELECT
          item.id AS detail_id,
          'TX_INBOUND' AS flow_type,
          inv.issue_date AS "Ngay_Chung_Tu",
          inv.invoice_no AS "So_Chung_Tu",
          item.product_id AS "Product_Id",
          item.quantity AS "So_Luong_Nhap",
          item.unit_cost AS "Don_Gia_Nhap",
          (item.quantity * item.unit_cost) AS "Thanh_Tien_Nhap",
          0 AS "So_Luong_Xuat",
          0 AS "Don_Gia_Xuat",
          0 AS "Thanh_Tien_Xuat"
        FROM inbound_invoice_details item
        JOIN inbound_invoices inv ON item.inbound_invoice_id = inv.id
        WHERE inv.user_id = ${userId}
          AND inv.issue_date BETWEEN ${startDate} AND ${endDate}
          AND inv.status = 'ACTIVE'
          AND inv.is_synced_to_inventory = true
          AND item.product_id IN (${Prisma.join(productIds)})

        UNION ALL

        -- Outbound Invoices
        SELECT
          item.id AS detail_id,
          'TX_OUTBOUND' AS flow_type,
          inv.issue_date AS "Ngay_Chung_Tu",
          inv.invoice_symbol AS "So_Chung_Tu",
          item.product_id AS "Product_Id",
          0 AS "So_Luong_Nhap",
          0 AS "Don_Gia_Nhap",
          0 AS "Thanh_Tien_Nhap",
          item.quantity AS "So_Luong_Xuat",
          item.unit_price AS "Don_Gia_Xuat",
          item.total_amount AS "Thanh_Tien_Xuat"
        FROM invoice_details item
        JOIN invoices inv ON item.invoice_id = inv.id
        WHERE inv.user_id = ${userId}
          AND inv.issue_date BETWEEN ${startDate} AND ${endDate}
          AND inv.status = 'ISSUED'
          AND item.product_id IN (${Prisma.join(productIds)})

        UNION ALL

        -- Production Orders
        SELECT
          pd.id AS detail_id,
          CASE WHEN pd.transaction_type = 'ISSUE_MATERIAL' THEN 'TX_PROD_ISSUE' ELSE 'TX_PROD_RECEIVE' END AS flow_type,
          po.transaction_at AS "Ngay_Chung_Tu",
          po.order_code AS "So_Chung_Tu",
          pd.product_id AS "Product_Id",
          CASE WHEN pd.transaction_type = 'RECEIVE_PRODUCT' THEN pd.quantity ELSE 0 END AS "So_Luong_Nhap",
          0 AS "Don_Gia_Nhap",
          0 AS "Thanh_Tien_Nhap",
          CASE WHEN pd.transaction_type = 'ISSUE_MATERIAL' THEN pd.quantity ELSE 0 END AS "So_Luong_Xuat",
          0 AS "Don_Gia_Xuat",
          0 AS "Thanh_Tien_Xuat"
        FROM production_details pd
        JOIN internal_production_orders po ON pd.order_id = po.id
        WHERE po.user_id = ${userId}
          AND po.transaction_at BETWEEN ${startDate} AND ${endDate}
          AND po.status = 'ACTIVE'
          AND pd.product_id IN (${Prisma.join(productIds)})
      ),
      running_balances AS (
        SELECT
          t.*,
          p.product_name AS "Product_Name",
          p.sku_code AS "Sku_Code",
          p.unit AS "Unit",
          SUM(t."So_Luong_Nhap" - t."So_Luong_Xuat") OVER (
            PARTITION BY t."Product_Id" 
            ORDER BY 
              t."Ngay_Chung_Tu" ASC, 
              CASE t.flow_type 
                WHEN 'TX_INBOUND' THEN 1 
                WHEN 'TX_PROD_RECEIVE' THEN 2 
                WHEN 'TX_PROD_ISSUE' THEN 3 
                WHEN 'TX_OUTBOUND' THEN 4 
                ELSE 5 
              END ASC,
              t.detail_id ASC
          ) AS running_balance_in_period,
          COUNT(*) OVER () AS total_count
        FROM transactions t
        JOIN products p ON t."Product_Id" = p.id
      )
      SELECT 
        rb."Ngay_Chung_Tu",
        rb."So_Chung_Tu",
        rb.flow_type,
        rb."Product_Id",
        rb."Product_Name",
        rb."Sku_Code",
        rb."Unit",
        rb."So_Luong_Nhap",
        rb."Don_Gia_Nhap",
        rb."Thanh_Tien_Nhap",
        rb."So_Luong_Xuat",
        rb."Don_Gia_Xuat",
        rb."Thanh_Tien_Xuat",
        (COALESCE(ob.opening_balance, 0) + rb.running_balance_in_period) AS "So_Luong_Ton",
        rb.total_count
      FROM running_balances rb
      LEFT JOIN opening_balances ob ON rb."Product_Id" = ob.product_id
      ORDER BY 
        rb."Product_Id" ASC, 
        rb."Ngay_Chung_Tu" ASC, 
        CASE rb.flow_type 
          WHEN 'TX_INBOUND' THEN 1 
          WHEN 'TX_PROD_RECEIVE' THEN 2 
          WHEN 'TX_PROD_ISSUE' THEN 3 
          WHEN 'TX_OUTBOUND' THEN 4 
          ELSE 5 
        END ASC,
        rb.detail_id ASC
      LIMIT ${limitVal} OFFSET ${offsetVal}
    `;

    const TRANSLATION_MAP = {
      TX_INBOUND: 'Mua hàng',
      TX_OUTBOUND: 'Bán hàng',
      TX_PROD_ISSUE: 'Xuất nguyên liệu',
      TX_PROD_RECEIVE: 'Nhập thành phẩm',
    };

    const totalTransactions =
      records.length > 0 ? Number(records[0].total_count) : 0;

    let rawRows = records.map((r) => ({
      ...r,
      Dien_Giai: TRANSLATION_MAP[r.flow_type] || r.flow_type,
      So_Luong_Nhap: Number(r.So_Luong_Nhap || 0),
      Don_Gia_Nhap: Number(r.Don_Gia_Nhap || 0),
      Thanh_Tien_Nhap: Number(r.Thanh_Tien_Nhap || 0),
      So_Luong_Xuat: Number(r.So_Luong_Xuat || 0),
      Don_Gia_Xuat: Number(r.Don_Gia_Xuat || 0),
      Thanh_Tien_Xuat: Number(r.Thanh_Tien_Xuat || 0),
      So_Luong_Ton: Number(r.So_Luong_Ton || 0),
    }));

    // TỐI ƯU CƠ CHẾ INJECT VIRTUAL ROW
    if (productIds.length === 1) {
      const previousBalance = await this.getVirtualRowBalance(
        userId,
        productIds[0],
        startDate,
        endDate,
        page,
        rawRows[0],
      );

      let productName = '';
      let skuCode = '';
      let unit = '';

      if (rawRows.length > 0) {
        productName = rawRows[0].Product_Name;
        skuCode = rawRows[0].Sku_Code;
        unit = rawRows[0].Unit;
      } else {
        const prod = await this.prisma.product.findUnique({
          where: { id: productIds[0] },
          select: { productName: true, skuCode: true, unit: true },
        });
        if (prod) {
          productName = prod.productName;
          skuCode = prod.skuCode || '';
          unit = prod.unit;
        }
      }

      if (page === 1 || rawRows.length > 0 || totalTransactions > 0) {
        const virtualRow = {
          Ngay_Chung_Tu:
            page === 1
              ? startDate.toISOString()
              : rawRows.length > 0 && rawRows[0].Ngay_Chung_Tu instanceof Date
                ? rawRows[0].Ngay_Chung_Tu.toISOString()
                : rawRows.length > 0
                  ? new Date(rawRows[0].Ngay_Chung_Tu).toISOString()
                  : startDate.toISOString(),
          So_Chung_Tu: '',
          Dien_Giai:
            page === 1 ? 'Số dư đầu kỳ' : 'Số dư mang sang từ trang trước',
          flow_type: 'VIRTUAL',
          Product_Id: Number(productIds[0]),
          Product_Name: productName,
          Sku_Code: skuCode,
          Unit: unit,
          So_Luong_Nhap: 0,
          Don_Gia_Nhap: 0,
          Thanh_Tien_Nhap: 0,
          So_Luong_Xuat: 0,
          Don_Gia_Xuat: 0,
          Thanh_Tien_Xuat: 0,
          So_Luong_Ton: previousBalance,
        };

        rawRows = [virtualRow, ...rawRows];
      }
    }

    const rows = plainToInstance(InventoryBookRowDto, rawRows, {
      excludeExtraneousValues: true,
    });

    return {
      rows,
      meta: {
        total: totalTransactions,
        page,
        lastPage: Math.ceil(totalTransactions / limit) || 1,
      },
      activeBookKey: 'S2d-HKD',
      syncCode,
      isSummaryOutdated: currentSyncCode ? currentSyncCode !== syncCode : true,
    };
  }

  private async getVirtualRowBalance(
    userId: string,
    productId: number,
    startDate: Date,
    endDate: Date,
    page: number,
    firstRecordOnPage?: any,
  ): Promise<number> {
    if (firstRecordOnPage) {
      return (
        Number(firstRecordOnPage.So_Luong_Ton || 0) -
        Number(firstRecordOnPage.So_Luong_Nhap || 0) +
        Number(firstRecordOnPage.So_Luong_Xuat || 0)
      );
    }

    // Only execute DB queries when page is empty (firstRecordOnPage is undefined)
    const openingBalResult = await this.prisma.$queryRaw<any[]>`
      WITH historical_inbound AS (
        SELECT SUM(item.quantity) AS total_qty
        FROM inbound_invoice_details item
        JOIN inbound_invoices inv ON item.inbound_invoice_id = inv.id
        WHERE inv.user_id = ${userId}
          AND inv.issue_date < ${startDate}
          AND inv.status = 'ACTIVE'
          AND inv.is_synced_to_inventory = true
          AND item.product_id = ${productId}
      ),
      historical_outbound AS (
        SELECT SUM(item.quantity) AS total_qty
        FROM invoice_details item
        JOIN invoices inv ON item.invoice_id = inv.id
        WHERE inv.user_id = ${userId}
          AND inv.issue_date < ${startDate}
          AND inv.status = 'ISSUED'
          AND item.product_id = ${productId}
      ),
      historical_issue_material AS (
        SELECT SUM(pd.quantity) AS total_qty
        FROM production_details pd
        JOIN internal_production_orders po ON pd.order_id = po.id
        WHERE po.user_id = ${userId}
          AND po.transaction_at < ${startDate}
          AND po.status = 'ACTIVE'
          AND pd.transaction_type = 'ISSUE_MATERIAL'
          AND pd.product_id = ${productId}
      ),
      historical_receive_product AS (
        SELECT SUM(pd.quantity) AS total_qty
        FROM production_details pd
        JOIN internal_production_orders po ON pd.order_id = po.id
        WHERE po.user_id = ${userId}
          AND po.transaction_at < ${startDate}
          AND po.status = 'ACTIVE'
          AND pd.transaction_type = 'RECEIVE_PRODUCT'
          AND pd.product_id = ${productId}
      )
      SELECT 
        (
          p.opening_stock_quantity 
          + COALESCE((SELECT total_qty FROM historical_inbound), 0)
          - COALESCE((SELECT total_qty FROM historical_outbound), 0)
          - COALESCE((SELECT total_qty FROM historical_issue_material), 0)
          + COALESCE((SELECT total_qty FROM historical_receive_product), 0)
        ) AS opening_balance
      FROM products p
      WHERE p.id = ${productId};
    `;
    const openingBalance = Number(openingBalResult[0]?.opening_balance || 0);

    if (page === 1) {
      return openingBalance;
    }

    const periodChangeResult = await this.prisma.$queryRaw<any[]>`
      WITH period_inbound AS (
        SELECT SUM(item.quantity) AS total_qty
        FROM inbound_invoice_details item
        JOIN inbound_invoices inv ON item.inbound_invoice_id = inv.id
        WHERE inv.user_id = ${userId}
          AND inv.issue_date BETWEEN ${startDate} AND ${endDate}
          AND inv.status = 'ACTIVE'
          AND inv.is_synced_to_inventory = true
          AND item.product_id = ${productId}
      ),
      period_outbound AS (
        SELECT SUM(item.quantity) AS total_qty
        FROM invoice_details item
        JOIN invoices inv ON item.invoice_id = inv.id
        WHERE inv.user_id = ${userId}
          AND inv.issue_date BETWEEN ${startDate} AND ${endDate}
          AND inv.status = 'ISSUED'
          AND item.product_id = ${productId}
      ),
      period_issue AS (
        SELECT SUM(pd.quantity) AS total_qty
        FROM production_details pd
        JOIN internal_production_orders po ON pd.order_id = po.id
        WHERE po.user_id = ${userId}
          AND po.transaction_at BETWEEN ${startDate} AND ${endDate}
          AND po.status = 'ACTIVE'
          AND pd.transaction_type = 'ISSUE_MATERIAL'
          AND pd.product_id = ${productId}
      ),
      period_receive AS (
        SELECT SUM(pd.quantity) AS total_qty
        FROM production_details pd
        JOIN internal_production_orders po ON pd.order_id = po.id
        WHERE po.user_id = ${userId}
          AND po.transaction_at BETWEEN ${startDate} AND ${endDate}
          AND po.status = 'ACTIVE'
          AND pd.transaction_type = 'RECEIVE_PRODUCT'
          AND pd.product_id = ${productId}
      )
      SELECT 
        (
          COALESCE((SELECT total_qty FROM period_inbound), 0)
          - COALESCE((SELECT total_qty FROM period_outbound), 0)
          - COALESCE((SELECT total_qty FROM period_issue), 0)
          + COALESCE((SELECT total_qty FROM period_receive), 0)
        ) AS net_change;
    `;
    const netChange = Number(periodChangeResult[0]?.net_change || 0);
    return openingBalance + netChange;
  }
}
