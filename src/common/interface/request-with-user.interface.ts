import { Request } from 'express';
import { RequestUser } from './request-user.interface';

export interface RequestWithUser extends Request {
  user: RequestUser; // Tái sử dụng ở đây
  body: {
    invoiceDate?: string;
    issueDate?: string;
    date?: string;
    [key: string]: unknown;
  };
}
