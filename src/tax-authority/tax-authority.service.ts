import { Injectable } from '@nestjs/common';
import { AppLogger } from '../common/logger/app-logger.service';
import { LOG_STATUS } from '../common/constants/log-events.constant';

@Injectable()
export class TaxAuthorityService {
  private readonly logger = new AppLogger(TaxAuthorityService.name);

  async requestTaxCode(
    invoicePublicId: string,
    c5_c9: string,
  ): Promise<{ success: boolean; cqtCode?: string }> {
    this.logger.log(`Calling Mock CQT API for Invoice.`, {
      status: LOG_STATUS.START,
      invoicePublicId,
    });

    await this.sleep(1500);

    const randomValue = Math.random();

    if (randomValue < 0.2) {
      this.logger.warn(`Mock CQT API Timeout/Failed for Invoice.`, {
        status: LOG_STATUS.FAILED,
        invoicePublicId,
      });
      return { success: false };
    }

    const C1 = 'M';

    const C2 = '2';

    const C3C4 = new Date().getFullYear().toString().slice(-2);

    const C5_C9 = (c5_c9 || 'ABCDE')
      .replace(/[^A-Z0-9]/gi, '')
      .toUpperCase()
      .substring(0, 5)
      .padEnd(5, 'X');

    const C10_C20 = Date.now().toString().slice(-11).padStart(11, '0');

    const mockCqtCode = `${C1}${C2}-${C3C4}-${C5_C9}-${C10_C20}`;

    this.logger.log(`Mock CQT API Success.`, {
      status: LOG_STATUS.SUCCESS,
      invoicePublicId,
      code: mockCqtCode,
    });

    return {
      success: true,
      cqtCode: mockCqtCode,
    };
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
