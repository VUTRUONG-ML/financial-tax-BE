import { SetMetadata } from '@nestjs/common';

export enum CheckPeriodResource {
  BODY = 'BODY',
  INVOICE = 'INVOICE',
  STOCK_RECEIPT = 'STOCK_RECEIPT',
  STOCK_ISSUE = 'STOCK_ISSUE',
  VOUCHER = 'VOUCHER',
  PRODUCTION_ORDER = 'PRODUCTION_ORDER',
}

export interface CheckPeriodOptions {
  resource?: CheckPeriodResource;
}

export const CHECK_PERIOD_KEY = 'check_period';
export const CheckPeriod = (options: CheckPeriodOptions = {}) =>
  SetMetadata(CHECK_PERIOD_KEY, {
    enabled: true,
    resource: options.resource ?? CheckPeriodResource.BODY,
  });
