import { Test, TestingModule } from '@nestjs/testing';
import { TaxDeclarationService } from './tax-declaration.service';
import { PrismaService } from '../core/prisma/prisma.service';
import { FinancialPeriodsService } from '../financial-periods/financial-periods.service';
import { TaxEngineService } from '../tax-engine/tax-engine.service';
import { AuditLogService } from '../core/audit-log/audit-log.service';
import { BadRequestException } from '@nestjs/common';
import { StocksService } from '../stocks/stocks.service';
import { VouchersService } from '../vouchers/vouchers.service';
import { TaxFormsService } from '../tax-forms/tax-forms.service';
import { Decimal } from '@prisma/client/runtime/client';

describe('TaxDeclarationService', () => {
  let service: TaxDeclarationService;
  let prisma: any;
  let financialPeriodsService: any;
  let taxEngineService: any;
  let stocksService: any;
  let vouchersService: any;

  const mockPeriod = {
    id: 1,
    publicId: 'period-01',
    userId: 'user-01',
    periodName: 'Tháng 05/2026',
    startDate: new Date('2026-05-01T00:00:00Z'),
    endDate: new Date('2026-05-31T23:59:59Z'),
    status: 'OPEN',
  };

  const mockTaxConfigExempt = {
    id: 101,
    userId: 'user-01',
    taxGroupId: 1,
    vatRateSnapShot: 0,
    pitRateSnapShot: 0,
    chosenPitMethod: 'EXEMPT',
  };

  const mockTaxConfigNonExempt = {
    id: 102,
    userId: 'user-01',
    taxGroupId: 2,
    vatRateSnapShot: 0.01,
    pitRateSnapShot: 0.005,
    chosenPitMethod: 'PERCENTAGE',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaxDeclarationService,
        {
          provide: PrismaService,
          useValue: {
            financialPeriod: {
              findUnique: jest.fn(),
            },
            taxDeclarationDraft: {
              findUnique: jest.fn(),
              upsert: jest.fn(),
              update: jest.fn(),
              deleteMany: jest.fn(),
            },
            taxConfiguration: {
              findFirst: jest.fn(),
            },
            taxCategory: {
              findMany: jest.fn(),
            },
            product: {
              findMany: jest.fn(),
            },
            invoice: {
              count: jest.fn(),
              create: jest.fn(),
            },
            taxDeclaration: {
              create: jest.fn(),
              count: jest.fn(),
              findFirst: jest.fn(),
            },
            taxFormExport: {
              create: jest.fn(),
            },
            $transaction: jest.fn((cb) => cb(prisma)),
            $queryRaw: jest.fn(),
          },
        },
        {
          provide: FinancialPeriodsService,
          useValue: {
            calculateRealtimeTaxData: jest.fn(),
            getRevenueByIndustry: jest.fn(),
            calculatePeriodTax: jest.fn(),
            closeFinancialPeriod: jest.fn(),
            comparePit: jest.fn(),
          },
        },
        {
          provide: TaxEngineService,
          useValue: {
            calculatePitProfitForPeriod: jest.fn(),
            calculatePitPercentageMultipleIndustries: jest.fn(),
          },
        },
        {
          provide: AuditLogService,
          useValue: {
            logChange: jest.fn(),
          },
        },
        {
          provide: StocksService,
          useValue: {
            calculatePeriodInventorySummary: jest.fn(),
            calculateTotalMaterialCost: jest.fn(),
          },
        },
        {
          provide: VouchersService,
          useValue: {
            calculateVoucherExpensesGrouped: jest.fn(),
          },
        },
        {
          provide: TaxFormsService,
          useValue: {
            createTaxForm: jest.fn(),
            findAllTaxForms: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TaxDeclarationService>(TaxDeclarationService);
    prisma = module.get<PrismaService>(PrismaService);
    financialPeriodsService = module.get<FinancialPeriodsService>(FinancialPeriodsService);
    taxEngineService = module.get<TaxEngineService>(TaxEngineService);
    stocksService = module.get<StocksService>(StocksService);
    vouchersService = module.get<VouchersService>(VouchersService);

    stocksService.calculateTotalMaterialCost.mockResolvedValue(new Decimal(0));
    vouchersService.calculateVoucherExpensesGrouped.mockResolvedValue({
      chi_phi_nhan_cong: 0,
      chi_phi_khau_hao: 0,
      chi_phi_dich_vu_mua_ngoai: 0,
      chi_phi_lai_vay: 0,
      chi_phi_khac: 0,
    });
  });

  describe('getStep2 and saveStep2', () => {
    it('should build and return expanded Step2Data correctly', async () => {
      prisma.financialPeriod.findUnique.mockResolvedValue(mockPeriod);
      prisma.taxConfiguration.findFirst.mockResolvedValue(mockTaxConfigNonExempt);
      prisma.taxDeclarationDraft.findUnique.mockResolvedValue(null); // No draft saved yet

      financialPeriodsService.calculateRealtimeTaxData.mockResolvedValue({
        revenue: new Decimal(250000000),
        expense: new Decimal(100000000),
      });

      financialPeriodsService.calculatePeriodTax.mockResolvedValue({
        vatAmount: new Decimal(2500000),
        pitAmount: new Decimal(1250000),
      });

      financialPeriodsService.getRevenueByIndustry.mockResolvedValue([
        {
          taxCategoryId: 10,
          vatRate: new Decimal(0.01),
          pitRate: new Decimal(0.005),
          revenue: new Decimal(250000000),
        },
      ]);

      prisma.invoice.count.mockResolvedValue(15);

      prisma.taxCategory.findMany.mockResolvedValue([
        { id: 10, categoryName: 'Buôn bán, bán lẻ' },
      ]);

      const result = await service.getStep2('user-01', 'period-01');

      expect(result.periodName).toBe('Tháng 05/2026');
      expect(result.confirmedRevenue).toBe(250000000);
      expect(result.estimatedVat).toBe(2500000);
      expect(result.transactionCount).toBe(15);
      expect(result.industries).toHaveLength(1);
      expect(result.industries[0]).toEqual({
        categoryName: 'Buôn bán, bán lẻ',
        vatRate: 0.01,
        pitRate: 0.005,
        revenue: 250000000,
      });
    });
  });

  describe('getStep5Preview', () => {
    it('should return detailed step 5 preview data including PIT comparison, VAT, YTD and operated industries', async () => {
      prisma.financialPeriod.findUnique.mockResolvedValue(mockPeriod);
      prisma.taxConfiguration.findFirst.mockResolvedValue(mockTaxConfigNonExempt);
      prisma.taxDeclarationDraft.findUnique.mockResolvedValue({
        step1Data: { declarationFormType: '02_CNKD_TNCN_QTT' },
        step2Data: { confirmedRevenue: 250000000, estimatedVat: 2500000 },
        step4Data: { totalExpense: 100000000 },
      });

      financialPeriodsService.comparePit.mockResolvedValue({
        profitMethodAmount: new Decimal(5000000),
        percentageMethodAmount: new Decimal(1250000),
      });

      prisma.taxDeclaration.findFirst.mockResolvedValue({
        ytdRevenue: new Decimal(500000000),
        ytdExpense: new Decimal(200000000),
      });

      financialPeriodsService.getRevenueByIndustry.mockResolvedValue([
        {
          taxCategoryId: 10,
          vatRate: new Decimal(0.01),
          pitRate: new Decimal(0.005),
          revenue: new Decimal(250000000),
        },
      ]);

      prisma.taxCategory.findMany.mockResolvedValue([
        { id: 10, categoryName: 'Buôn bán, bán lẻ' },
      ]);

      taxEngineService.calculatePitPercentageMultipleIndustries.mockReturnValue({
        totalPit: new Decimal(1250000),
        details: [
          {
            taxCategoryId: 10,
            pitRate: new Decimal(0.005),
            ytdRevenue: new Decimal(250000000),
            taxableRevenue: new Decimal(250000000),
            pitAmount: new Decimal(1250000),
          },
        ],
      });

      const result = await service.getStep5Preview('user-01', 'period-01');

      expect(result.vatAmount).toBe(2500000);
      expect(result.ytdRevenue).toBe(750000000); // 500M (prev) + 250M (period)
      expect(result.ytdExpense).toBe(300000000); // 200M (prev) + 100M (period)
      expect(result.pitComparison.profitMethodAmount).toBe(5000000);
      expect(result.pitComparison.percentageMethodAmount).toBe(1250000);
      expect(result.operatedIndustries).toHaveLength(1);
      expect(result.operatedIndustries[0].categoryName).toBe('Buôn bán, bán lẻ');
      expect(result.operatedIndustries[0].revenue).toBe(250000000);
    });
  });

  describe('Step 3 and Step 4 applicability', () => {
    it('should throw BadRequestException for Step 3 if formType is not 02_CNKD_TNCN_QTT', async () => {
      prisma.financialPeriod.findUnique.mockResolvedValue(mockPeriod);
      prisma.taxConfiguration.findFirst.mockResolvedValue(mockTaxConfigExempt);
      prisma.taxDeclarationDraft.findUnique.mockResolvedValue({
        step1Data: { declarationFormType: '01_TKN_CNKD' },
      });

      await expect(service.getStep3('user-01', 'period-01')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.saveStep3('user-01', 'period-01')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for Step 4 if formType is not 02_CNKD_TNCN_QTT', async () => {
      prisma.financialPeriod.findUnique.mockResolvedValue(mockPeriod);
      prisma.taxConfiguration.findFirst.mockResolvedValue(mockTaxConfigExempt);
      prisma.taxDeclarationDraft.findUnique.mockResolvedValue({
        step1Data: { declarationFormType: '01_TKN_CNKD' },
      });

      await expect(service.getStep4('user-01', 'period-01')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.saveStep4('user-01', 'period-01')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should allow Step 3 & 4 if formType is 02_CNKD_TNCN_QTT', async () => {
      prisma.financialPeriod.findUnique.mockResolvedValue(mockPeriod);
      prisma.taxConfiguration.findFirst.mockResolvedValue(mockTaxConfigNonExempt);
      prisma.taxDeclarationDraft.findUnique.mockResolvedValue({
        step1Data: { declarationFormType: '02_CNKD_TNCN_QTT' },
      });
      stocksService.calculatePeriodInventorySummary.mockResolvedValue({
        openingValue: 10000000,
        importedValue: 5000000,
        exportedValue: 3000000,
        closingValue: 12000000,
      });

      const step3 = await service.getStep3('user-01', 'period-01');
      expect(step3).toEqual({
        openingValue: 10000000,
        importedValue: 5000000,
        exportedValue: 3000000,
        closingValue: 12000000,
      });
    });
  });

  describe('Submission validation', () => {
    it('should only require Step 2 data to submit if formType is 01_TKN_CNKD', async () => {
      prisma.financialPeriod.findUnique.mockResolvedValue(mockPeriod);
      prisma.taxConfiguration.findFirst.mockResolvedValue(mockTaxConfigExempt);
      prisma.taxDeclarationDraft.findUnique.mockResolvedValue({
        step1Data: { declarationFormType: '01_TKN_CNKD' },
        step2Data: { confirmedRevenue: 250000000 },
        step4Data: null, // Step 4 is skipped
      });

      financialPeriodsService.calculateRealtimeTaxData.mockResolvedValue({
        revenue: new Decimal(250000000),
        expense: new Decimal(100000000),
      });

      financialPeriodsService.closeFinancialPeriod.mockResolvedValue({
        period: { taxAmount: new Decimal(0), endDate: new Date('2026-05-31') },
        vatAmount: new Decimal(0),
        pitAmount: new Decimal(0),
        ytdRevenue: new Decimal(250000000),
        ytdExpense: new Decimal(0),
      });

      prisma.taxDeclaration.create.mockResolvedValue({ id: 99 });

      const res = await service.submit('user-01', 'period-01', {
        chosenPitMethod: 'EXEMPT',
        xmlContent: '<mock></mock>',
      });

      expect(res.declaration).toBeDefined();
    });

    it('should only require Step 2 data to submit if formType is 01_CNKD', async () => {
      prisma.financialPeriod.findUnique.mockResolvedValue(mockPeriod);
      prisma.taxConfiguration.findFirst.mockResolvedValue(mockTaxConfigNonExempt);
      prisma.taxDeclarationDraft.findUnique.mockResolvedValue({
        step1Data: { declarationFormType: '01_CNKD' },
        step2Data: { confirmedRevenue: 250000000 },
        step4Data: null, // Step 4 is skipped
      });

      financialPeriodsService.calculateRealtimeTaxData.mockResolvedValue({
        revenue: new Decimal(250000000),
        expense: new Decimal(100000000),
      });

      financialPeriodsService.closeFinancialPeriod.mockResolvedValue({
        period: { taxAmount: new Decimal(0), endDate: new Date('2026-05-31') },
        vatAmount: new Decimal(0),
        pitAmount: new Decimal(0),
        ytdRevenue: new Decimal(250000000),
        ytdExpense: new Decimal(0),
      });

      prisma.taxDeclaration.create.mockResolvedValue({ id: 99 });

      const res = await service.submit('user-01', 'period-01', {
        chosenPitMethod: 'PERCENTAGE',
        xmlContent: '<mock></mock>',
      });

      expect(res.declaration).toBeDefined();
    });

    it('should require Step 4 data to submit if formType is 02_CNKD_TNCN_QTT', async () => {
      prisma.financialPeriod.findUnique.mockResolvedValue(mockPeriod);
      prisma.taxConfiguration.findFirst.mockResolvedValue(mockTaxConfigNonExempt);
      prisma.taxDeclarationDraft.findUnique.mockResolvedValue({
        step1Data: { declarationFormType: '02_CNKD_TNCN_QTT' },
        step2Data: { confirmedRevenue: 250000000 },
        step4Data: null, // Step 4 is missing
      });

      await expect(
        service.submit('user-01', 'period-01', {
          chosenPitMethod: 'PERCENTAGE',
          xmlContent: '<mock></mock>',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
