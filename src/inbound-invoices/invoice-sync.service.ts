import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { AppLogger } from '../common/logger/app-logger.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class InvoiceSyncService implements OnModuleInit {
  private readonly log = new AppLogger(InvoiceSyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.log.log(
      'Starting Inbound Invoice background synchronization interval...',
    );
    setInterval(async () => {
      try {
        await this.syncAllUsers();
      } catch (err: any) {
        this.log.error('Error during scheduled invoice sync: ' + err.message);
      }
    }, 60000);
  }

  async syncAllUsers(): Promise<void> {
    const users = await this.prisma.user.findMany({
      select: { id: true, businessName: true },
    });
    this.log.debug(
      `Syncing invoices from Tax Authority for ${users.length} users...`,
    );

    for (const user of users) {
      const syncedCount = await this.syncForUser(user.id);
      if (syncedCount > 0) {
        this.log.log(
          `Successfully synced ${syncedCount} new invoices for user ${user.businessName}`,
        );
      }
    }
  }

  // Giả lập cổng thông tin hóa đơn điện tử của Cơ quan Thuế.
  private fetchInvoicesFromTaxAuthority(
    buyerTaxCode: string,
    userProducts: any[],
  ) {
    const productList = userProducts.filter((p) => p.skuCode);
    if (productList.length === 0) {
      return [];
    }

    // Hàm lấy giá nhập giả lập từ CQT để lưu vào hóa đơn đầu vào.
    // Nếu sản phẩm là "Sản phẩm test S2e" (mã SP-S2E), ta thiết lập giá nhập cố định là 55,000đ (để test logic chỉnh giá).
    // Với sản phẩm khác, ta lấy 90% giá trị openingStockUnitCost hoặc bán lẻ / 1.8.
    const getUnitCost = (product: any) => {
      if (product.skuCode === 'SP-S2E') {
        return 55000;
      }
      return Number(product.openingStockUnitCost) > 0
        ? Number(product.openingStockUnitCost)
        : Number(product.sellingPrice) / 1.8;
    };

    return [
      {
        invoiceNo: 'INV-TAX-101',
        sellerName: 'Công ty Cổ phần Bán buôn Tổng hợp',
        sellerTaxCode: '0300999888',
        buyerTaxCode,
        items: productList
          .slice(0, Math.min(2, productList.length))
          .map((p) => ({
            productName: p.productName,
            skuCode: p.skuCode,
            quantity: 10,
            unitCost: getUnitCost(p),
          })),
      },
      {
        invoiceNo: 'INV-TAX-102',
        sellerName: 'Hộ kinh doanh Vật tư Sơn Nam',
        sellerTaxCode: '0105678912',
        buyerTaxCode,
        items: productList.slice(0, Math.min(1, productList.length)).map((p) => ({
          productName: p.productName,
          skuCode: p.skuCode,
          quantity: 5,
          unitCost: getUnitCost(p) + 1000,
        })),
      },
      {
        invoiceNo: 'INV-TAX-103',
        sellerName: 'Tổng kho Phân phối Thiết bị',
        sellerTaxCode: '0200888999',
        buyerTaxCode,
        items: productList.slice(0, Math.min(2, productList.length)).map((p) => ({
          productName: p.productName,
          skuCode: p.skuCode,
          quantity: 20,
          unitCost: getUnitCost(p) - 1000,
        })),
      },
    ];
  }

  async syncForUser(userId: string): Promise<number> {
    // 1. Lấy danh sách sản phẩm thực tế của người dùng
    const userProducts = await this.prisma.product.findMany({
      where: { userId },
    });

    if (userProducts.length === 0) {
      this.log.warn(
        `User ${userId} has no products. Skipping Inbound Invoice sync.`,
      );
      return 0;
    }

    // 2. Lấy thông tin MST người mua (User)
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { taxCode: true },
    });

    if (!user) {
      this.log.warn(`User with ID ${userId} not found. Skipping sync.`);
      return 0;
    }

    // Map sản phẩm theo skuCode để đối chiếu khi lưu hóa đơn
    const productBySku = new Map<string, any>();
    for (const product of userProducts) {
      if (product.skuCode) {
        productBySku.set(product.skuCode, product);
      }
    }

    // 3. Lấy danh sách hóa đơn giả lập từ Cơ quan Thuế
    const mockInvoices = this.fetchInvoicesFromTaxAuthority(
      user.taxCode,
      userProducts,
    );

    let newInvoicesCount = 0;

    for (const mockInvoice of mockInvoices) {
      // Kiểm tra xem hóa đơn này đã được đồng bộ chưa
      const existing = await this.prisma.inboundInvoice.findFirst({
        where: {
          invoiceNo: mockInvoice.invoiceNo,
          userId,
        },
      });

      if (existing) {
        continue;
      }

      // Lập danh sách chi tiết hóa đơn dựa trên sản phẩm khớp mã SKU
      const detailsToCreate: any[] = [];
      let totalAmount = 0;

      for (const item of mockInvoice.items) {
        const product = productBySku.get(item.skuCode);
        if (product) {
          totalAmount += item.quantity * item.unitCost;
          detailsToCreate.push({
            productId: product.id,
            quantity: item.quantity,
            unitCost: new Prisma.Decimal(item.unitCost),
          });
        }
      }

      if (detailsToCreate.length === 0) {
        this.log.warn(
          `Skipping invoice ${mockInvoice.invoiceNo} because no items matched the user's products.`,
        );
        continue;
      }

      await this.prisma.$transaction(async (tx) => {
        // Lưu thông tin hóa đơn đầu vào
        await tx.inboundInvoice.create({
          data: {
            userId,
            sellerName: mockInvoice.sellerName,
            sellerTaxCode: mockInvoice.sellerTaxCode,
            invoiceNo: mockInvoice.invoiceNo,
            issueDate: new Date(),
            totalAmount: new Prisma.Decimal(totalAmount),
            status: 'ACTIVE',
            xmlFileUrl: `https://storage.tax.gov.vn/invoices/xml/${mockInvoice.invoiceNo}.xml`,
            pdfFileUrl: `https://storage.tax.gov.vn/invoices/pdf/${mockInvoice.invoiceNo}.pdf`,
            details: {
              create: detailsToCreate.map((d) => ({
                product: { connect: { id: d.productId } },
                quantity: d.quantity,
                unitCost: d.unitCost,
              })),
            },
          },
        });
      });

      newInvoicesCount++;
    }

    return newInvoicesCount;
  }
}
