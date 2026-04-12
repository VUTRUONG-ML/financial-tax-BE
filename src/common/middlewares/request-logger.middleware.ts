import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { requestContext } from '../logger/logger.context';
import { v4 as uuidv4 } from 'uuid';
@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const requestId = uuidv4();
    const store = new Map<string, string>();
    store.set('requestId', requestId);

    // Bọc toàn bộ luồng request trong ngữ cảnh của AsyncLocalStorage
    requestContext.run(store, () => {
      const { method, originalUrl, ip } = req;
      const userAgent = req.get('user-agent') || '';
      const startTime = Date.now();

      // Log lúc bắt đầu
      this.logger.log(`[${requestId}] SYSTEM_REQUEST_START`, {
        method,
        originalUrl,
        ip,
        userAgent,
      });

      // Lắng nghe sự kiện khi response trả về xong
      res.on('finish', () => {
        const { statusCode } = res;
        const duration = Date.now() - startTime;

        // Log lúc kết thúc
        this.logger.log(`[${requestId}] SYSTEM_REQUEST_END`, {
          statusCode,
          method,
          originalUrl,
          duration: `${duration}ms`,
        });
      });

      next();
    });
  }
}
