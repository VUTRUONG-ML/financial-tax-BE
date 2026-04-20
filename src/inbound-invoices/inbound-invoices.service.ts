import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { AppLogger } from '../common/logger/app-logger.service';
import { CreateInboundInvoiceDto } from './dto/create-inbound-invoice.dto';

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

  async create(userId: string, dto: CreateInboundInvoiceDto) {
    // 1. Khởi tạo DB Transaction để đảm bảo tính ACID
    return await this.prisma.$transaction(async (tx) => {
      // 2. Tạo Hóa đơn đầu vào (Master)
      const inboundInvoice = await tx.inboundInvoice.create({
        data: {
          userId,
          sellerName: dto.sellerName,
          sellerTaxCode: dto.sellerTaxCode,
          invoiceNo: dto.invoiceNo, // Mã hóa đơn của nhà cung cấp
          issueDate: new Date(dto.issueDate), // Chuyển sang Date object
          totalAmount: dto.totalAmount,
          attachmentUrl: dto.attachmentUrl,
          isSyncedToInventory: dto.isSyncedToInventory, // Lưu trạng thái checkbox sync kho

          // 3. Tạo chi tiết mặt hàng (Line Items) [cite: 506]
          details: {
            create: dto.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitCost: item.unitCost,
            })),
          },
        },
        include: { details: true },
      });

      // Ghi vào phiếu chi ------------------------------

      // 4. Nếu Checkbox [x] Cập nhật tồn kho được tích
      if (dto.isSyncedToInventory) {
        for (const item of dto.items) {
          await tx.product.update({
            where: { id: item.productId, userId },
            data: {
              currentStock: {
                increment: item.quantity,
              },
            },
          });
        }
      }

      // 5. Trả về kết quả sau khi commit thành công
      return inboundInvoice;
    });
  }
}
