import { Injectable } from '@nestjs/common';
import { AppLogger } from '../common/logger/app-logger.service';
import { LOG_STATUS } from '../common/constants/log-events.constant';

@Injectable()
export class TaxAuthorityService {
  private readonly logger = new AppLogger(TaxAuthorityService.name);

  /**
   * Giả lập việc xin mã CQT cho một hóa đơn.
   * Tỉ lệ thành công là 80%, thất bại 20%.
   */
  async requestTaxCode(
    invoicePublicId: string,
  ): Promise<{ success: boolean; cqtCode?: string }> {
    this.logger.log(`Calling Mock CQT API for Invoice.`, {
      status: LOG_STATUS.START,
      invoicePublicId,
    });

    // 1. Giả lập độ trễ mạng 1.5 giây theo đặc tả
    await this.sleep(1500);

    // 2. Giả lập xác suất phản hồi (Resilience Testing)
    const randomValue = Math.random();

    if (randomValue < 0.2) {
      // 20% trường hợp rơi vào lỗi hệ thống hoặc timeout
      this.logger.warn(`Mock CQT API Timeout/Failed for Invoice.`, {
        status: LOG_STATUS.FAILED,
        invoicePublicId,
      });
      return { success: false };
    }

    // 3. 80% trường hợp thành công, trả về mã hash ngẫu nhiên
    const mockCqtCode = `CQT-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
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
