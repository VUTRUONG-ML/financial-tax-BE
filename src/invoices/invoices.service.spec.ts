import { BadRequestException } from '@nestjs/common';
import { CustomerType } from '@prisma/client';
import { InvoicesService } from './invoices.service';

describe('InvoicesService customer validation', () => {
  const service = new InvoicesService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  it('should reject online customers without buyer name or phone', () => {
    expect(() =>
      (service as any).validateInvoiceCustomer(CustomerType.ONLINE, '', ''),
    ).toThrow(BadRequestException);
  });

  it('should allow walk-in customers without buyer name or phone', () => {
    expect(() =>
      (service as any).validateInvoiceCustomer(CustomerType.WALK_IN, '', ''),
    ).not.toThrow();
  });
});
