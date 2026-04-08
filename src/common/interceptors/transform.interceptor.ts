import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { map, Observable } from 'rxjs';
import { Request, Response as ExpressResponse } from 'express';
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
        return {
          success: true,
          statusCode: statusCode,
          timestamp: new Date().toISOString(),
          message: message,
          data:
            resultData === undefined || resultData === null
              ? null
              : (resultData as T),
          meta: meta,
        };
      }),
    );
  }
}
