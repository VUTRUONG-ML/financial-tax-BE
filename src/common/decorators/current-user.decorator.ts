import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { RequestUser } from '../interface/request-user.interface';

export const CurrentUser = createParamDecorator(
  (key: keyof RequestUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const user = request.user as RequestUser;

    if (!user) return null;
    return key ? user?.[key] : user;
  },
);
