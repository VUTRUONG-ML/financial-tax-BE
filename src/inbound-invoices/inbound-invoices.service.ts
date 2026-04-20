import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { AppLogger } from '../common/logger/app-logger.service';

@Injectable()
export class InboundInvoicesService {
  private readonly log = new AppLogger(InboundInvoicesService.name);
  constructor(private readonly prisma: PrismaService) {}

  async findAllInboundInvoices(userId: string) {
    return await this.prisma.inboundInvoice.findMany({
      where: { userId },
    });
  }

  async detailInboundInvoice(publicId: string, userId: string) {
    const inInvoice = await this.prisma.inboundInvoice.findFirst({
      where: { publicId, userId },
    });
    if (!inInvoice) throw new NotFoundException('Inbound invoice not found.');
    const items = await this.prisma.inboundInvoiceDetail.findMany({
      where: { inboundInvoiceId: inInvoice?.id },
    });
    return {
      ...inInvoice,
      details: items,
    };
  }
}
