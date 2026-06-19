import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { AppLogger } from '../common/logger/app-logger.service';
import { CreateInboundInvoiceDto } from './dto/create-inbound-invoice.dto';
import {
  LOG_ACTIONS,
  LOG_STATUS,
} from '../common/constants/log-events.constant';
import {
  AuditLogService,
  tableWrite,
} from '../core/audit-log/audit-log.service';
import { VouchersService } from '../vouchers/vouchers.service';
import { mapToDto } from 'src/common/utils/mapper.util';
import { InboundResponseDto } from './dto/response-inbound-invoice.dto';
import { InboundInvoiceStatus, Prisma } from '@prisma/client';
import { UpdateInboundInvoiceDto } from './dto/update-inbound-invoice.dto';

@Injectable()
export class InboundInvoicesService {
  private readonly log = new AppLogger(InboundInvoicesService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly voucherService: VouchersService,
  ) {}

  async findAllInboundInvoices(
    userId: string,
    page: number = 1,
    limit: number = 20,
    type?: string,
  ) {
    const skip = (page - 1) * limit;

    const where: Prisma.InboundInvoiceWhereInput = { userId };

    if (type) {
      const upperType = type.toUpperCase();
      if (upperType === 'UNPAID' || upperType === 'CHUA_THANH_TOAN') {
        where.vouchers = {
          none: {
            voucherType: 'PAYMENT',
            status: 'ACTIVE',
          },
        };
      }
    }

    const [total, inboundInvoices] = await Promise.all([
      this.prisma.inboundInvoice.count({
        where,
      }),
      this.prisma.inboundInvoice.findMany({
        where,
        take: limit,
        skip,
        include: {
          details: {
            include: {
              product: {
                select: { publicId: true },
              },
            },
          },
        },
        orderBy: { issueDate: 'desc' },
      }),
    ]);
    return {
      data: mapToDto(InboundResponseDto, inboundInvoices),
      meta: { total, page, lastPage: Math.ceil(total / limit) },
    };
  }

  async detailInboundInvoice(publicId: string, userId: string) {
    const inInvoice = await this.prisma.inboundInvoice.findFirst({
      where: { publicId, userId },
    });
    if (!inInvoice) throw new NotFoundException('Inbound invoice not found.');
    const items = await this.prisma.inboundInvoiceDetail.findMany({
      where: { inboundInvoiceId: inInvoice.id },
      include: {
        product: {
          select: { publicId: true },
        },
      },
    });
    return mapToDto(InboundResponseDto, {
      ...inInvoice,
      details: items,
    });
  }

  async getSummary(userId: string) {
    const [tong_so_luong_hoa_don, aggregateActive, aggregateUnpaid] =
      await Promise.all([
        this.prisma.inboundInvoice.count({
          where: { userId },
        }),
        this.prisma.inboundInvoice.aggregate({
          where: { userId, status: 'ACTIVE' },
          _sum: {
            totalAmount: true,
          },
        }),
        this.prisma.inboundInvoice.aggregate({
          where: { userId, status: 'ACTIVE', isPaid: false },
          _sum: {
            totalAmount: true,
            paidAmount: true,
          },
        }),
      ]);

    const tong_doanh_thu = aggregateActive._sum.totalAmount
      ? Number(aggregateActive._sum.totalAmount)
      : 0;

    const unpaidTotalAmount = aggregateUnpaid._sum.totalAmount
      ? Number(aggregateUnpaid._sum.totalAmount)
      : 0;
    const unpaidPaidAmount = aggregateUnpaid._sum.paidAmount
      ? Number(aggregateUnpaid._sum.paidAmount)
      : 0;
    const tong_chua_thanh_toan = unpaidTotalAmount - unpaidPaidAmount;

    return {
      tong_so_luong_hoa_don,
      tong_doanh_thu,
      tong_chua_thanh_toan,
    };
  }
}
