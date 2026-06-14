import { Test, TestingModule } from '@nestjs/testing';
import { AccountingBooksService } from './accounting-books.service';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { parseDateRange } from 'src/common/utils/date-range-parser.util';
import { moment } from 'src/common/utils/time.util';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TaxEngineService } from '../tax-engine/tax-engine.service';
import { Decimal } from '@prisma/client/runtime/client';

describe('DateRangeParser', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    // 2026-05-22T17:30:00+07:00 is Friday
    jest.setSystemTime(new Date('2026-05-22T17:30:00+07:00').getTime());
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('should parse thang_nay correctly', () => {
    const { startDate, endDate } = parseDateRange('thang_nay');
    expect(moment(startDate).format('YYYY-MM-DD HH:mm:ss')).toBe(
      '2026-05-01 00:00:00',
    );
    expect(moment(endDate).format('YYYY-MM-DD HH:mm:ss')).toBe(
      '2026-05-22 23:59:59',
    );
  });

  it('should parse thang_truoc correctly', () => {
    const { startDate, endDate } = parseDateRange('thang_truoc');
    expect(moment(startDate).format('YYYY-MM-DD HH:mm:ss')).toBe(
      '2026-04-01 00:00:00',
    );
    expect(moment(endDate).format('YYYY-MM-DD HH:mm:ss')).toBe(
      '2026-04-30 23:59:59',
    );
  });

  it('should parse quy_nay correctly', () => {
    const { startDate, endDate } = parseDateRange('quy_nay');
    expect(moment(startDate).format('YYYY-MM-DD HH:mm:ss')).toBe(
      '2026-04-01 00:00:00',
    ); // Q2 starts in April
    expect(moment(endDate).format('YYYY-MM-DD HH:mm:ss')).toBe(
      '2026-05-22 23:59:59',
    );
  });

  it('should parse custom with year and quarter correctly', () => {
    const { startDate: s1, endDate: e1 } = parseDateRange('custom', {
      year: 2026,
      quarter: 1,
    });
    expect(moment(s1).format('YYYY-MM-DD HH:mm:ss')).toBe(
      '2026-01-01 00:00:00',
    );
    expect(moment(e1).format('YYYY-MM-DD HH:mm:ss')).toBe(
      '2026-03-31 23:59:59',
    );

    const { startDate: s2, endDate: e2 } = parseDateRange('custom', {
      year: 2026,
      quarter: 2,
    });
    expect(moment(s2).format('YYYY-MM-DD HH:mm:ss')).toBe(
      '2026-04-01 00:00:00',
    );
    expect(moment(e2).format('YYYY-MM-DD HH:mm:ss')).toBe(
      '2026-06-30 23:59:59',
    );

    const { startDate: s3, endDate: e3 } = parseDateRange('custom', {
      year: 2026,
      quarter: 3,
    });
    expect(moment(s3).format('YYYY-MM-DD HH:mm:ss')).toBe(
      '2026-07-01 00:00:00',
    );
    expect(moment(e3).format('YYYY-MM-DD HH:mm:ss')).toBe(
      '2026-09-30 23:59:59',
    );

    const { startDate: s4, endDate: e4 } = parseDateRange('custom', {
      year: 2026,
      quarter: 4,
    });
    expect(moment(s4).format('YYYY-MM-DD HH:mm:ss')).toBe(
      '2026-10-01 00:00:00',
    );
    expect(moment(e4).format('YYYY-MM-DD HH:mm:ss')).toBe(
      '2026-12-31 23:59:59',
    );
  });

  it('should throw BadRequestException for missing customRange', () => {
    expect(() => parseDateRange('custom')).toThrow(BadRequestException);
  });

  it('should throw BadRequestException for unsupported timeframe', () => {
    expect(() => parseDateRange('future')).toThrow(BadRequestException);
  });
});

describe('AccountingBooksService', () => {
  let service: AccountingBooksService;
  let prisma: jest.Mocked<PrismaService>;
  let taxEngine: jest.Mocked<TaxEngineService>;

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-22T17:30:00+07:00').getTime());
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountingBooksService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: jest.fn(),
            },
            taxConfiguration: {
              findFirst: jest.fn(),
            },
            invoice: {
              findMany: jest.fn(),
              aggregate: jest.fn(),
              count: jest.fn(),
            },
            voucher: {
              aggregate: jest.fn(),
              findMany: jest.fn(),
              count: jest.fn(),
            },
            voucherCategory: {
              findMany: jest.fn(),
            },
            product: {
              findMany: jest.fn(),
              findFirst: jest.fn(),
              findUnique: jest.fn(),
            },
            financialPeriod: {
              findUnique: jest.fn(),
            },
            inventoryMovement: {
              findFirst: jest.fn(),
            },
            inboundInvoice: {
              aggregate: jest.fn(),
            },
            internalProductionOrder: {
              aggregate: jest.fn(),
            },
            inboundInvoiceDetail: {
              count: jest.fn(),
            },
            invoiceDetail: {
              count: jest.fn(),
            },
            productionDetail: {
              count: jest.fn(),
            },
            $queryRaw: jest.fn(),
          },
        },
        {
          provide: TaxEngineService,
          useValue: {
            calculateTotalTax: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AccountingBooksService>(AccountingBooksService);
    prisma = module.get(PrismaService);
    taxEngine = module.get(TaxEngineService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getRevenueBookSummary and Records', () => {
    const mockUser = {
      id: 'user-001',
      businessName: 'Business Test',
      taxCode: '1234567890',
      ownerName: 'John Doe',
    };

    const mockInvoices = [
      {
        id: 1,
        invoiceSymbol: '2C26TAA',
        issueDate: new Date('2026-05-10T10:00:00Z'),
        buyerName: 'Công ty A',
        totalPayment: 10000000,
        taxPayable: 100000,
      },
      {
        id: 2,
        invoiceSymbol: null,
        issueDate: new Date('2026-05-12T15:00:00Z'),
        buyerName: null,
        totalPayment: 20000000,
        taxPayable: 200000,
      },
    ];

    beforeEach(() => {
      prisma.invoice.aggregate.mockResolvedValue({
        _sum: { totalPayment: new Decimal(30000000) as any },
        _count: { id: 2 },
        _max: { updatedAt: new Date() },
      } as any);

      prisma.voucher.aggregate.mockResolvedValue({
        _sum: { amount: new Decimal(0) as any },
        _count: { id: 0 },
        _max: { updatedAt: new Date() },
      } as any);

      prisma.invoice.count.mockResolvedValue(2);
      prisma.invoice.findMany.mockResolvedValue(mockInvoices as any);

      taxEngine.calculateTotalTax.mockImplementation((rev, exp) => {
        const pitRate = 0.005; // mock 0.5%
        return {
          totalTaxDue: new Decimal(Number(rev) * (0.01 + 0.005)),
          vatAmount: new Decimal(Number(rev) * 0.01),
        } as any;
      });
    });

    it('should generate summary for S1a-HKD only for taxGroupId 1', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser as any);
      prisma.taxConfiguration.findFirst.mockResolvedValue({
        taxGroupId: 1,
        vatRateSnapShot: 0,
        pitRateSnapShot: 0,
        industry: { categoryName: 'Ngành nghề kiểm thử' },
      } as any);

      const result = await service.getRevenueBookSummary(
        'user-001',
        'thang_nay',
      );

      expect(result.activeBookKey).toBe('S1a-HKD');
      expect(result.books['S1a-HKD']).toBeDefined();
      expect(result.books['S2a-HKD']).toBeUndefined();
      expect(result.books['S2b-HKD']).toBeUndefined();

      const s1a = result.books['S1a-HKD'];
      expect(s1a.bookKey).toBe('S1A');
      expect(s1a.summary.tong_doanh_thu).toBe(30000000);
      expect(s1a.summary.so_luong_don_hang).toBe(2);
    });

    it('should generate both S2a-HKD and S2b-HKD summary for taxGroupId 2', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser as any);
      prisma.taxConfiguration.findFirst.mockResolvedValue({
        taxGroupId: 2,
        vatRateSnapShot: 0.01,
        pitRateSnapShot: 0.005,
        industry: { categoryName: 'Ngành nghề kiểm thử' },
      } as any);

      const result = await service.getRevenueBookSummary(
        'user-001',
        'thang_nay',
      );

      expect(result.activeBookKey).toBe('S2a-HKD');
      expect(result.books['S2a-HKD']).toBeDefined();
      expect(result.books['S2b-HKD']).toBeDefined();

      const s2a = result.books['S2a-HKD'];
      expect(s2a.summary.tong_doanh_thu).toBe(30000000);
      expect(s2a.summary.so_luong_don_hang).toBe(2);
      expect(s2a.summary.Tong_Thue_TNCN_Phai_Nop).toBe(150000);
      expect(s2a.summary.Tong_So_Thue_GTGT_Phai_Nop).toBe(300000);
    });

    it('should retrieve records with activeBookKey S1a-HKD for taxGroupId 1', async () => {
      prisma.taxConfiguration.findFirst.mockResolvedValue({
        taxGroupId: 1,
        vatRateSnapShot: 0,
        pitRateSnapShot: 0,
        industry: { categoryName: 'Ngành nghề kiểm thử' },
      } as any);

      const result = await service.getRevenueBookRecords(
        'user-001',
        'thang_nay',
      );
      expect(result.activeBookKey).toBe('S1a-HKD');
      expect(result.rows).toHaveLength(2);
      expect(result.syncCode).toBeDefined();
    });

    it('should throw NotFoundException if tax configuration is missing', async () => {
      prisma.taxConfiguration.findFirst.mockResolvedValue(null);

      await expect(
        service.getRevenueBookSummary('user-001', 'thang_nay'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getExpenseBookSummary and Records', () => {
    const mockUser = {
      id: 'user-001',
      businessName: 'Business Test',
      taxCode: '1234567890',
      ownerName: 'John Doe',
    };

    const mockVouchers = [
      {
        id: 1,
        voucherCode: 'PC001',
        voucherType: 'PAYMENT',
        amount: new Decimal(1000000),
        transactionAt: new Date('2026-05-10T10:00:00Z'),
        content: 'Chi tiền lương nhân viên',
        isDeductibleExpense: true,
        category: {
          categoryName:
            'Chi phí tiền lương, tiền công, các khoản phụ cấp, bảo hiểm bắt buộc và các khoản chi trả cho người lao động...',
        },
        inboundInvoice: {
          invoiceNo: 'HD001',
        },
      },
      {
        id: 2,
        voucherCode: 'PC002',
        voucherType: 'PAYMENT',
        amount: new Decimal(500000),
        transactionAt: new Date('2026-05-12T15:00:00Z'),
        content: 'Chi tiền điện tháng 5',
        isDeductibleExpense: true,
        category: {
          categoryName:
            'Chi phí dịch vụ mua ngoài như điện, nước, điện thoại, internet, vận chuyển, thuê tài sản...',
        },
        inboundInvoice: null,
      },
      {
        id: 3,
        voucherCode: 'PC003',
        voucherType: 'PAYMENT',
        amount: new Decimal(200000),
        transactionAt: new Date('2026-05-15T09:00:00Z'),
        content: 'Mua văn phòng phẩm ngoài danh mục',
        isDeductibleExpense: true,
        category: {
          categoryName: 'Hạng mục tự định nghĩa',
        },
        inboundInvoice: null,
      },
    ];

    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue(mockUser as any);
      prisma.taxConfiguration.findFirst.mockResolvedValue({
        taxGroupId: 3,
        vatRateSnapShot: 0.01,
        pitRateSnapShot: 0.005,
        industry: { categoryName: 'Ngành nghề kiểm thử' },
      } as any);

      const mockCategories = [
        {
          id: 1,
          categoryName:
            'Chi phí nguyên liệu, vật liệu, nhiên liệu, năng lượng, hàng hóa sử dụng vào sản xuất, kinh doanh.',
        },
        {
          id: 2,
          categoryName:
            'Chi phí tiền lương, tiền công, các khoản phụ cấp, bảo hiểm bắt buộc và các khoản chi trả cho người lao động...',
        },
        {
          id: 3,
          categoryName:
            'Chi phí thuê kho bãi, mặt bằng phục vụ hoạt động sản xuất, kinh doanh.',
        },
        {
          id: 4,
          categoryName:
            'Chi phí dịch vụ mua ngoài như điện, nước, điện thoại, internet, vận chuyển, thuê tài sản...',
        },
        {
          id: 5,
          categoryName:
            'Các khoản chi khác phục vụ trực tiếp hoạt động sản xuất, kinh doanh...',
        },
      ];
      (prisma.voucherCategory.findMany as jest.Mock).mockResolvedValue(
        mockCategories,
      );

      prisma.voucher.findMany.mockResolvedValue(mockVouchers as any);
      prisma.voucher.count.mockResolvedValue(3);
      prisma.voucher.aggregate.mockResolvedValue({
        _count: { id: 3 },
        _max: { updatedAt: new Date() },
      } as any);
      (prisma as any).$queryRaw.mockResolvedValue([
        {
          chi_phi_nguyen_vat_lieu: 0,
          chi_phi_nhan_cong: 1000000,
          chi_phi_khau_hao: 0,
          chi_phi_dich_vu_mua_ngoai: 500000,
          chi_phi_lai_vay: 0,
          chi_phi_khac: 200000,
        },
      ]);
    });

    it('should generate summary for S2c-HKD grouped correctly', async () => {
      const result = await service.getExpenseBookSummary(
        'user-001',
        'thang_nay',
      );

      expect(result.activeBookKey).toBe('S2c-HKD');
      expect(result.books['S2c-HKD']).toBeDefined();

      const s2c = result.books['S2c-HKD'];
      expect(s2c.bookKey).toBe('S2C');
      expect(s2c.summary.chi_phi_nguyen_vat_lieu).toBe(0);
      expect(s2c.summary.chi_phi_nhan_cong).toBe(1000000);
      expect(s2c.summary.chi_phi_khau_hao).toBe(0);
      expect(s2c.summary.chi_phi_dich_vu_mua_ngoai).toBe(500000);
      expect(s2c.summary.chi_phi_lai_vay).toBe(0);
      expect(s2c.summary.chi_phi_khac).toBe(200000);
      expect(s2c.summary.tong_chi_phi_hop_le).toBe(1700000);
    });

    it('should retrieve records mapped to ExpenseBookRowDto', async () => {
      const result = await service.getExpenseBookRecords(
        'user-001',
        'thang_nay',
      );

      expect(result.activeBookKey).toBe('S2c-HKD');
      expect(result.rows).toHaveLength(3);

      const firstRow = result.rows[0];
      expect(firstRow.Ngay_Chi).toEqual(mockVouchers[0].transactionAt);
      expect(firstRow.So_Phieu_Chi).toBe('PC001');
      expect(firstRow.Hang_Muc).toBe(mockVouchers[0].category.categoryName);
      expect(firstRow.Dien_Giai).toBe('Chi tiền lương nhân viên');
      expect(firstRow.So_Tien).toBe(1000000);
      expect(firstRow.Hoa_Don_Chung_Tu_Kem_Theo).toBe('HD001');

      const secondRow = result.rows[1];
      expect(secondRow.Hoa_Don_Chung_Tu_Kem_Theo).toBe('');
    });
  });

  describe('getInventoryBookSummary and Records', () => {
    const mockUser = {
      id: 'user-001',
      businessName: 'Business Test',
      taxCode: '1234567890',
      ownerName: 'John Doe',
    };

    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue(mockUser as any);
      (prisma.product.findMany as jest.Mock).mockResolvedValue([
        { id: 101, openingStockQuantity: 10, openingStockValue: 100000 },
        { id: 102, openingStockQuantity: 5, openingStockValue: 50000 },
      ]);
      prisma.inboundInvoice.aggregate.mockResolvedValue({
        _count: { id: 1 },
        _max: { updatedAt: new Date() },
      } as any);
      prisma.invoice.aggregate.mockResolvedValue({
        _count: { id: 1 },
        _max: { updatedAt: new Date() },
      } as any);
      prisma.internalProductionOrder.aggregate.mockResolvedValue({
        _count: { id: 1 },
        _max: { updatedAt: new Date() },
      } as any);
    });

    it('should generate inventory summary correctly', async () => {
      (prisma.financialPeriod.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        publicId: 'period-123',
        userId: 'user-001',
        startDate: new Date('2026-05-01T00:00:00Z'),
        endDate: new Date('2026-05-31T23:59:59Z'),
        startYear: new Date('2026-01-01T00:00:00Z'),
        status: 'OPEN',
      });

      (prisma.product.findFirst as jest.Mock).mockResolvedValue({
        id: 101,
        publicId: 'prod-1',
        productName: 'Thịt heo',
        skuCode: 'HEO-01',
        unit: 'Kg',
      });

      (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([
        {
          stockStartPeriod: 15,
          valueStartPeriod: new Decimal(150000),
          stockToEndPeriod: 23,
          valueToEndPeriod: new Decimal(230000),
          receiptQuantity: 25,
          receiptValue: new Decimal(200000),
          issueQuantity: 17,
          issueValue: new Decimal(150000),
        },
      ]);

      const result = await service.getInventoryBookSummary(
        'user-001',
        'period-123',
        'prod-1',
      );

      expect(result.activeBookKey).toBe('S2d-HKD');
      expect(result.books['S2d-HKD']).toBeDefined();
      const s2d = result.books['S2d-HKD'];
      expect(s2d.summary.Tong_So_Luong_Ton_Dau_Ky).toBe(15);
      expect(s2d.summary.Tong_So_Luong_Nhap).toBe(25);
      expect(s2d.summary.Tong_Thanh_Tien_Nhap).toEqual(new Decimal(200000));
      expect(s2d.summary.Tong_So_Luong_Xuat).toBe(17);
      expect(s2d.summary.Tong_Thanh_Tien_Xuat).toEqual(new Decimal(150000));
      expect(s2d.summary.Tong_So_Luong_Ton_Cuoi_Ky).toBe(23);
    });

    it('should retrieve records mapped to InventoryBookRowDto', async () => {
      (prisma.financialPeriod.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        publicId: 'period-123',
        userId: 'user-001',
        startDate: new Date('2026-05-01T00:00:00Z'),
        endDate: new Date('2026-05-31T23:59:59Z'),
        startYear: new Date('2026-01-01T00:00:00Z'),
        status: 'OPEN',
      });

      (prisma.product.findFirst as jest.Mock).mockResolvedValue({
        id: 101,
        publicId: 'prod-1',
        productName: 'Thịt heo',
        skuCode: 'HEO-01',
        unit: 'Kg',
      });

      const mockRecords = [
        {
          sort_order: 0,
          id: null,
          document_no: null,
          description: 'Tồn đầu kỳ',
          movement_date: null,
          row_type: 'OPENING_BALANCE',
          movement_type: null,
          unit_cost: 20000,
          receipt_quantity: 0,
          receipt_value: 0,
          issue_quantity: 0,
          issue_value: 0,
          running_stock: 5,
          running_value: 100000,
        },
        {
          sort_order: 1,
          id: 12,
          document_no: 'HD001',
          description: 'Mua hàng',
          movement_date: new Date('2026-05-10T10:00:00.000Z'),
          row_type: 'MOVEMENT',
          movement_type: 'PURCHASE_IN',
          unit_cost: 50000,
          receipt_quantity: 10,
          receipt_value: 500000,
          issue_quantity: 0,
          issue_value: 0,
          running_stock: 15,
          running_value: 600000,
        },
      ];

      (prisma.$queryRaw as jest.Mock).mockResolvedValue(mockRecords);

      const result = await service.getInventoryBookRecords(
        'user-001',
        'prod-1',
        'period-123',
      );

      expect(result.activeBookKey).toBe('S2d-HKD');
      expect(result.rows).toHaveLength(2);

      // Virtual/Real opening balance row
      const virtualRow = result.rows[0];
      expect(virtualRow.So_Chung_Tu).toBe('');
      expect(virtualRow.Dien_Giai).toBe('Tồn đầu kỳ');
      expect(virtualRow.Product_Name).toBe('Thịt heo');
      expect(virtualRow.So_Luong_Nhap).toBe(0);
      expect(virtualRow.So_Luong_Ton).toBe(5);

      // Transaction row
      const row = result.rows[1];
      expect(row.So_Chung_Tu).toBe('HD001');
      expect(row.Dien_Giai).toBe('Mua hàng');
      expect(row.Product_Name).toBe('Thịt heo');
      expect(row.So_Luong_Nhap).toBe(10);
      expect(row.So_Luong_Ton).toBe(15);
    });
  });
});
