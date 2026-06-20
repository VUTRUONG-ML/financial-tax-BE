import { Test, TestingModule } from '@nestjs/testing';
import { TaxEngineService } from './tax-engine.service';
import { Decimal } from '@prisma/client/runtime/client';
import { PitMethod } from '@prisma/client';

describe('TaxEngineService', () => {
  let service: TaxEngineService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TaxEngineService],
    }).compile();

    service = module.get<TaxEngineService>(TaxEngineService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculatePitPercentageMultipleIndustries', () => {
    it('should exempt all tax if total revenue is less than or equal to 1B threshold', () => {
      const industries = [
        { pitRate: new Decimal(0.02), ytdRevenue: new Decimal(400_000_000) },
        { pitRate: new Decimal(0.01), ytdRevenue: new Decimal(500_000_000) },
      ];

      const result = service.calculatePitPercentageMultipleIndustries(industries);
      expect(result.totalPit.toNumber()).toBe(0);
      expect(result.details).toHaveLength(2);
      expect(result.details.every((d) => d.taxableRevenue.toNumber() === 0)).toBe(true);
      expect(result.details.every((d) => d.pitAmount.toNumber() === 0)).toBe(true);
    });

    it('should apply greedy deduction starting from the highest pit rate', () => {
      // Industry A: 600M @ 2%
      // Industry B: 800M @ 1%
      // Total revenue = 1.4B
      // Exemption threshold = 1B
      // Greedy logic: 
      // 1. Sort by pitRate desc -> Industry A (2%), then Industry B (1%)
      // 2. Deduct from A first: min(600M, 1B) = 600M. Rem threshold = 400M. Taxable A = 0.
      // 3. Deduct from B next: min(800M, 400M) = 400M. Rem threshold = 0. Taxable B = 400M.
      // 4. PIT: A = 0 * 2% = 0. B = 400M * 1% = 4M. Total PIT = 4M.
      const industries = [
        { pitRate: new Decimal(0.01), ytdRevenue: new Decimal(800_000_000) }, // Industry B
        { pitRate: new Decimal(0.02), ytdRevenue: new Decimal(600_000_000) }, // Industry A
      ];

      const result = service.calculatePitPercentageMultipleIndustries(industries);

      expect(result.totalPit.toNumber()).toBe(4_000_000);
      
      const detailA = result.details.find((d) => d.pitRate.toNumber() === 0.02);
      const detailB = result.details.find((d) => d.pitRate.toNumber() === 0.01);

      expect(detailA).toBeDefined();
      expect(detailA!.taxableRevenue.toNumber()).toBe(0);
      expect(detailA!.pitAmount.toNumber()).toBe(0);

      expect(detailB).toBeDefined();
      expect(detailB!.taxableRevenue.toNumber()).toBe(400_000_000);
      expect(detailB!.pitAmount.toNumber()).toBe(4_000_000);
    });

    it('should handle threshold exactly exhausted', () => {
      const industries = [
        { pitRate: new Decimal(0.05), ytdRevenue: new Decimal(1_000_000_000) },
        { pitRate: new Decimal(0.01), ytdRevenue: new Decimal(500_000_000) },
      ];

      const result = service.calculatePitPercentageMultipleIndustries(industries);
      expect(result.totalPit.toNumber()).toBe(5_000_000); // 500M * 1%

      const detail5 = result.details.find((d) => d.pitRate.toNumber() === 0.05);
      const detail1 = result.details.find((d) => d.pitRate.toNumber() === 0.01);

      expect(detail5!.taxableRevenue.toNumber()).toBe(0);
      expect(detail1!.taxableRevenue.toNumber()).toBe(500_000_000);
    });
  });

  describe('calculateVatAmount', () => {
    it('should return 0 for taxGroupId 1 if revenue is under threshold', () => {
      const result = service.calculateVatAmount(new Decimal(500_000_000), {
        taxGroupId: 1,
        vatRateSnapShot: new Decimal(0.01),
      });
      expect(result.toNumber()).toBe(0);
    });

    it('should return calculated VAT if taxGroupId is not 1', () => {
      const result = service.calculateVatAmount(new Decimal(500_000_000), {
        taxGroupId: 2,
        vatRateSnapShot: new Decimal(0.01),
      });
      expect(result.toNumber()).toBe(5_000_000);
    });
  });

  describe('calculatePitAmount', () => {
    it('should return EXEMPT for EXEMPT method', () => {
      const result = service.calculatePitAmount(new Decimal(2000000), new Decimal(1000000), {
        taxGroupId: 1,
        pitRateSnapShot: new Decimal(0.01),
        chosenPitMethod: PitMethod.EXEMPT,
      });
      expect(result.profitMethodAmount).toBeNull();
      expect(result.percentageMethodAmount).toBeNull();
    });

    it('should calculate profit-based PIT correctly for PROFIT_17', () => {
      const result = service.calculatePitAmount(new Decimal(2_000_000_000), new Decimal(1_000_000_000), {
        taxGroupId: 3,
        pitRateSnapShot: new Decimal(0.015),
        chosenPitMethod: PitMethod.PROFIT_17,
      });
      expect(result.profitMethodAmount!.toNumber()).toBe(170_000_000); // (2B - 1B) * 17%
    });

    it('should calculate percentage-based PIT for taxGroupId 2', () => {
      const result = service.calculatePitAmount(new Decimal(1_200_000_000), new Decimal(500_000_000), {
        taxGroupId: 2,
        pitRateSnapShot: new Decimal(0.005),
        chosenPitMethod: PitMethod.PERCENTAGE,
      });
      expect(result.percentageMethodAmount!.toNumber()).toBe(1_000_000); // (1.2B - 1B) * 0.5%
    });

    it('should calculate percentage-based PIT for taxGroupId 2 using multi-industry greedy logic if industries are passed', () => {
      const industries = [
        { pitRate: new Decimal(0.01), revenue: new Decimal(800_000_000) },
        { pitRate: new Decimal(0.02), revenue: new Decimal(600_000_000) },
      ];
      const result = service.calculatePitAmount(
        new Decimal(1_400_000_000),
        new Decimal(0),
        {
          taxGroupId: 2,
          pitRateSnapShot: new Decimal(0.005),
          chosenPitMethod: PitMethod.PERCENTAGE,
        },
        industries,
      );
      expect(result.percentageMethodAmount!.toNumber()).toBe(4_000_000);
    });
  });

  describe('calculateTaxForPeriod', () => {
    it('should calculate tax correctly when revenue and expense are omitted and derived from industries', () => {
      const taxConfig = {
        taxGroupId: 2,
        chosenPitMethod: PitMethod.PERCENTAGE,
        vatRateSnapShot: new Decimal(0.01),
        pitRateSnapShot: new Decimal(0.005),
      };

      const industries = [
        { vatRate: new Decimal(0.01), pitRate: new Decimal(0.02), revenue: new Decimal(600_000_000) },
        { vatRate: new Decimal(0.05), pitRate: new Decimal(0.01), revenue: new Decimal(800_000_000) },
      ];

      const result = service.calculateTaxForPeriod(taxConfig, undefined, undefined, industries);

      // VAT: (600M * 1%) + (800M * 5%) = 6M + 40M = 46M
      expect(result.vatAmount.toNumber()).toBe(46_000_000);
      // PIT (Greedy on 1.4B with 1B exemption):
      // A (2%): 600M exempt. Rem exemption = 400M. Taxable = 0.
      // B (1%): 800M - 400M exempt = 400M taxable. PIT = 400M * 1% = 4M.
      expect(result.pitAmount.toNumber()).toBe(4_000_000);
      expect(result.totalTax.toNumber()).toBe(50_000_000);
    });

    it('should calculate tax correctly for multi-industry PERCENTAGE method', () => {
      const taxConfig = {
        taxGroupId: 2,
        chosenPitMethod: PitMethod.PERCENTAGE,
        vatRateSnapShot: new Decimal(0.01),
        pitRateSnapShot: new Decimal(0.005),
      };

      const industries = [
        { vatRate: new Decimal(0.01), pitRate: new Decimal(0.02), revenue: new Decimal(600_000_000) },
        { vatRate: new Decimal(0.05), pitRate: new Decimal(0.01), revenue: new Decimal(800_000_000) },
      ];

      const result = service.calculateTaxForPeriod(taxConfig, new Decimal(1_400_000_000), new Decimal(0), industries);

      // VAT: (600M * 1%) + (800M * 5%) = 6M + 40M = 46M
      expect(result.vatAmount.toNumber()).toBe(46_000_000);
      // PIT (Greedy on 1.4B with 1B exemption):
      // A (2%): 600M exempt. Rem exemption = 400M. Taxable = 0.
      // B (1%): 800M - 400M exempt = 400M taxable. PIT = 400M * 1% = 4M.
      expect(result.pitAmount.toNumber()).toBe(4_000_000);
      expect(result.totalTax.toNumber()).toBe(50_000_000);
    });

    it('should calculate tax correctly for profit method PROFIT_17', () => {
      const taxConfig = {
        taxGroupId: 3,
        chosenPitMethod: PitMethod.PROFIT_17,
        vatRateSnapShot: new Decimal(0.03),
        pitRateSnapShot: new Decimal(0.015),
      };

      const result = service.calculateTaxForPeriod(taxConfig, new Decimal(2_000_000_000), new Decimal(1_200_000_000));

      // VAT: 2B * 3% = 60M
      expect(result.vatAmount.toNumber()).toBe(60_000_000);
      // PIT: (2B - 1.2B) * 17% = 800M * 17% = 136M
      expect(result.pitAmount.toNumber()).toBe(136_000_000);
      expect(result.totalTax.toNumber()).toBe(196_000_000);
    });

    it('should return 0 tax for EXEMPT group 1 under 1B', () => {
      const taxConfig = {
        taxGroupId: 1,
        chosenPitMethod: PitMethod.EXEMPT,
        vatRateSnapShot: new Decimal(0.01),
        pitRateSnapShot: new Decimal(0.005),
      };

      const result = service.calculateTaxForPeriod(taxConfig, new Decimal(800_000_000), new Decimal(0));
      expect(result.vatAmount.toNumber()).toBe(0);
      expect(result.pitAmount.toNumber()).toBe(0);
      expect(result.totalTax.toNumber()).toBe(0);
    });
  });
});
