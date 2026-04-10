import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export const Cookie = createParamDecorator(
  (data: string, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request>();
    // Nếu có truyền tên cookie (data) thì lấy đích danh, không thì lấy toàn bộ
    const cookies = request?.cookies as Record<string, string> | undefined;
    return data ? cookies?.[data] : cookies;
  },
);
