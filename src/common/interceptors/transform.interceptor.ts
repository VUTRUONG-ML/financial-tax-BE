import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { map, Observable } from 'rxjs';
import { Request, Response as ExpressResponse } from 'express';
import { moment } from '../utils/time.util';
export interface Response<T> {
  success: boolean;
  statusCode: number;
  timestamp: string;
  message: string;
  data: T | null;
  meta?: Record<string, unknown>;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  Response<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<Response<T>> {
    // Lấy context của HTTP request/response
    const ctx = context.switchToHttp();
    const response = ctx.getResponse<ExpressResponse>();
    const statusCode = response.statusCode;
    return next.handle().pipe(
      map((rawData: unknown): Response<T> => {
        let message = 'Operation successful';
        let resultData = rawData;
        let meta: Record<string, unknown> | undefined = undefined;

        // Nếu không có, tự động dùng giá trị mặc định
        if (rawData && typeof rawData === 'object' && !Array.isArray(rawData)) {
          // Ép kiểu an toàn về Record
          const obj = rawData as Record<string, unknown>;

          // Bóc tách message an toàn
          if (typeof obj.message === 'string') {
            message = obj.message;
          }

          // Bóc tách meta an toàn
          if (obj.meta !== undefined && typeof obj.meta === 'object') {
            meta = obj.meta as Record<string, unknown>;
          }

          // Bóc tách data an toàn (Nếu controller bọc sẵn data)
          if (obj.data !== undefined) {
            resultData = obj.data;
          }
        }
        const processedData = this.transformDates(resultData);
        return {
          success: true,
          statusCode: statusCode,
          timestamp: new Date().toISOString(),
          message: message,
          data:
            processedData === undefined || processedData === null
              ? null
              : (processedData as T),
          meta: meta,
        };
      }),
    );
  }
  private transformDates(data: any): any {
    if (data === null || data === undefined) return data;

    // Nếu là đối tượng Date (từ Prisma/DB trả về)
    if (data instanceof Date) {
      // Sử dụng dayjs để ép về múi giờ VN (UTC+7)
      return moment(data).tz().format('YYYY-MM-DD HH:mm:ss');
    }

    // Nếu là mảng (ví dụ danh sách hóa đơn)
    if (Array.isArray(data)) {
      return data.map((item) => this.transformDates(item));
    }

    // Nếu là Object lồng nhau
    if (typeof data === 'object') {
      for (const key in data) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
          data[key] = this.transformDates(data[key]);
        }
      }
    }
    return data;
  }
}
