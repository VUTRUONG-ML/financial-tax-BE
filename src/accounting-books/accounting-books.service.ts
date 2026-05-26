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
import { S1ARowDto, S2ARowDto, S2BRowDto } from './dto/revenue-book-row.dto';
import { ExpenseBookRowDto } from './dto/expense-book-row.dto';
import { plainToInstance } from 'class-transformer';

const CAT_NGUYEN_VAT_LIEU =
  'Chi phí nguyên liệu, vật liệu, nhiên liệu, năng lượng, hàng hóa sử dụng vào sản xuất, kinh doanh.';
const CAT_NHAN_CONG =
  'Chi phí tiền lương, tiền công, các khoản phụ cấp, bảo hiểm bắt buộc và các khoản chi trả cho người lao động...';
const CAT_THUE_MAT_BANG =
  'Chi phí thuê kho bãi, mặt bằng phục vụ hoạt động sản xuất, kinh doanh.';
const CAT_DICH_VU_MUA_NGOAI =
  'Chi phí dịch vụ mua ngoài như điện, nước, điện thoại, internet, vận chuyển, thuê tài sản...';

export interface ExpenseSummaryRow {
  chi_phi_nguyen_vat_lieu: string | number;
  chi_phi_nhan_cong: string | number;
  chi_phi_thue_mat_bang: string | number;
  chi_phi_dich_vu_mua_ngoai: string | number;
  chi_phi_khac: string | number;
}

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
    customRange?: { startDate: Date; endDate: Date },
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
    customRange?: { startDate: Date; endDate: Date },
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
      rows = plainToInstance(S1ARowDto, mappedInvoices);
      activeBookKey = 'S1a-HKD';
    } else if (taxGroupId === 2) {
      rows = plainToInstance(S2ARowDto, mappedInvoices);
      activeBookKey = 'S2a-HKD';
    } else {
      rows = plainToInstance(S2BRowDto, mappedInvoices);
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
    startDateRaw?: Date,
    endDateRaw?: Date,
  ) {
    const customRange =
      startDateRaw && endDateRaw
        ? { startDate: startDateRaw, endDate: endDateRaw }
        : undefined;

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
    startDateRaw?: Date,
    endDateRaw?: Date,
    bookKey: string = 'S03',
    page: number = 1,
    limit: number = 20,
    clientSyncCode?: string,
  ) {
    const customRange =
      startDateRaw && endDateRaw
        ? { startDate: startDateRaw, endDate: endDateRaw }
        : undefined;

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
    customRange?: { startDate: Date; endDate: Date },
  ) {
    const { startDate, endDate } = parseDateRange(timeFrame, customRange);

    const defaultCategories = await this.prisma.voucherCategory.findMany({
      where: {
        userId: null,
        type: 'PAYMENT',
      },
    });

    const idNguyenVatLieu =
      defaultCategories.find((c) => c.categoryName === CAT_NGUYEN_VAT_LIEU)
        ?.id ?? -1;
    const idNhanCong =
      defaultCategories.find((c) => c.categoryName === CAT_NHAN_CONG)?.id ?? -1;
    const idThueMatBang =
      defaultCategories.find((c) => c.categoryName === CAT_THUE_MAT_BANG)?.id ??
      -1;
    const idDichVuMuaNgoai =
      defaultCategories.find((c) => c.categoryName === CAT_DICH_VU_MUA_NGOAI)
        ?.id ?? -1;

    const [dbResult, bookMetadata, syncCode] = await Promise.all([
      this.prisma.$queryRaw<ExpenseSummaryRow[]>`
        SELECT 
          COALESCE(SUM(CASE WHEN v.category_id = ${idNguyenVatLieu} THEN v.amount ELSE 0 END), 0) as chi_phi_nguyen_vat_lieu,
          COALESCE(SUM(CASE WHEN v.category_id = ${idNhanCong} THEN v.amount ELSE 0 END), 0) as chi_phi_nhan_cong,
          COALESCE(SUM(CASE WHEN v.category_id = ${idThueMatBang} THEN v.amount ELSE 0 END), 0) as chi_phi_thue_mat_bang,
          COALESCE(SUM(CASE WHEN v.category_id = ${idDichVuMuaNgoai} THEN v.amount ELSE 0 END), 0) as chi_phi_dich_vu_mua_ngoai,
          COALESCE(SUM(CASE WHEN v.category_id NOT IN (${idNguyenVatLieu}, ${idNhanCong}, ${idThueMatBang}, ${idDichVuMuaNgoai}) THEN v.amount ELSE 0 END), 0) as chi_phi_khac
        FROM vouchers v
        WHERE v.user_id = ${userId}
          AND v.transaction_at BETWEEN ${startDate} AND ${endDate}
          AND v.voucher_type = 'PAYMENT'
          AND v.is_deductible_expense = TRUE
          AND v.status = 'ACTIVE'
      `,
      this.generateBookMetadata('S2C', userId, startDate, endDate),
      this.generateExpenseSyncCode(userId, startDate, endDate),
    ]);

    const summaryRow: ExpenseSummaryRow = dbResult[0] || {
      chi_phi_nguyen_vat_lieu: 0,
      chi_phi_nhan_cong: 0,
      chi_phi_thue_mat_bang: 0,
      chi_phi_dich_vu_mua_ngoai: 0,
      chi_phi_khac: 0,
    };

    const chi_phi_nguyen_vat_lieu = Number(
      summaryRow.chi_phi_nguyen_vat_lieu || 0,
    );
    const chi_phi_nhan_cong = Number(summaryRow.chi_phi_nhan_cong || 0);
    const chi_phi_thue_mat_bang = Number(summaryRow.chi_phi_thue_mat_bang || 0);
    const chi_phi_dich_vu_mua_ngoai = Number(
      summaryRow.chi_phi_dich_vu_mua_ngoai || 0,
    );
    const chi_phi_khac = Number(summaryRow.chi_phi_khac || 0);

    const tong_chi_phi_hop_le =
      chi_phi_nguyen_vat_lieu +
      chi_phi_nhan_cong +
      chi_phi_thue_mat_bang +
      chi_phi_dich_vu_mua_ngoai +
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
            chi_phi_thue_mat_bang,
            chi_phi_dich_vu_mua_ngoai,
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
    customRange?: { startDate: Date; endDate: Date },
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
}
