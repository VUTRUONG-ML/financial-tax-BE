import { ConsoleLogger, Injectable } from '@nestjs/common';
import { requestContext } from './logger.context';

@Injectable()
export class AppLogger extends ConsoleLogger {
  constructor(context?: string) {
    // Gọi super() để khởi tạo class cha
    super(context || '');

    // TỰ ĐỘNG CẤU HÌNH LOG LEVEL NGAY LÚC KHỞI TẠO
    const isProduction = process.env.NODE_ENV === 'production';
    this.setLogLevels(
      isProduction
        ? ['log', 'warn', 'error']
        : ['log', 'warn', 'error', 'debug', 'verbose'],
    );
  }

  // Ghi đè hàm log cơ bản
  log(message: any, context?: any) {
    const store = requestContext.getStore();
    const requestId = store ? store.get('requestId') : 'SYSTEM';
    // Lấy context từ tham số truyền vào, nếu không có thì lấy context mặc định của class
    super.log(`[${requestId}] ${message}`, context || this.context);
  }

  error(message: any, trace?: string, context?: any) {
    const store = requestContext.getStore();
    const requestId = store ? store.get('requestId') : 'SYSTEM';
    super.error(`[${requestId}] ${message}`, trace, context || this.context);
  }

  warn(message: any, context?: unknown, ...rest: unknown[]): void {
    const store = requestContext.getStore();
    const requestId = store ? store.get('requestId') : 'SYSTEM';
    super.error(`[${requestId}] ${message}`, context || this.context);
  }
}
