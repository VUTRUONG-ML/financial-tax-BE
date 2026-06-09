import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, PitMethod, VoucherType } from '@prisma/client';
import 'dotenv/config';
import * as bcrypt from 'bcrypt';

// Chỉ cần khởi tạo Client cơ bản cho script chạy local
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  console.log('--- Đang khởi tạo Master Data (Refactored v2) ---');

  // 1. Seed cho TaxGroup (Bổ sung allowedMethods)
  const taxGroups = [
    {
      id: 1,
      groupName: 'Mức 1: Miễn thuế',
      minRevenue: 0,
      maxRevenue: 500000000,
      allowedMethods: [PitMethod.EXEMPT],
      description: 'Dưới 500 triệu/năm: Miễn thuế GTGT & TNCN',
    },
    {
      id: 2,
      groupName: 'Mức 2: Nhóm linh hoạt',
      minRevenue: 500000000, // Để 500tr để làm mốc so sánh > 500tr
      maxRevenue: 3000000000,
      allowedMethods: [PitMethod.PERCENTAGE, PitMethod.PROFIT_15],
      description: 'Trên 500tr - 3 tỷ: Được chọn % hoặc 15% Lợi nhuận',
    },
    {
      id: 3,
      groupName: 'Mức 3: Nhóm trung bình',
      minRevenue: 3000000000,
      maxRevenue: 50000000000,
      allowedMethods: [PitMethod.PROFIT_17],
      description: 'Trên 3 tỷ - 50 tỷ: Bắt buộc 17% Lợi nhuận',
    },
    {
      id: 4,
      groupName: 'Mức 4: Nhóm quy mô lớn',
      minRevenue: 50000000000,
      maxRevenue: null,
      allowedMethods: [PitMethod.PROFIT_20],
      description: 'Trên 50 tỷ: Bắt buộc 20% Lợi nhuận',
    },
  ];

  for (const group of taxGroups) {
    await prisma.taxGroup.upsert({
      where: { id: group.id },
      update: group,
      create: group,
    });
  }

  // 2. Seed cho TaxCategory (Từ điển 6 nhóm gốc - Cha)
  const mainCategories = [
    {
      id: 1,
      categoryName: 'Phân phối, cung cấp hàng hóa',
      vatRate: 0.01,
      pitRate: 0.005,
      xmlIndicator: 'ct28',
    },
    {
      id: 2,
      categoryName: 'Sản xuất, vận tải, dịch vụ gắn với hàng hóa',
      vatRate: 0.03,
      pitRate: 0.015,
      xmlIndicator: 'ct29',
    },
    {
      id: 3,
      categoryName: 'Dịch vụ, xây dựng không bao thầu NVL',
      vatRate: 0.05,
      pitRate: 0.02,
      xmlIndicator: 'ct30',
    },
    {
      id: 4,
      categoryName: 'Cho thuê tài sản, đại lý bảo hiểm, xổ số',
      vatRate: 0.05,
      pitRate: 0.05,
      xmlIndicator: 'ct31',
    },
    {
      id: 5,
      categoryName: 'Cung cấp nội dung thông tin số',
      vatRate: 0.05,
      pitRate: 0.05,
      xmlIndicator: 'ct32',
    },
    {
      id: 6,
      categoryName: 'Hoạt động kinh doanh khác',
      vatRate: 0.02,
      pitRate: 0.01,
      xmlIndicator: 'ct33',
    },
  ];

  for (const cat of mainCategories) {
    await prisma.taxCategory.upsert({
      where: { id: cat.id },
      update: cat,
      create: { ...cat, parentId: null },
    });
  }

  // 3. Seed cho UiPopularTag (Thẻ gợi ý cho User)
  await prisma.uiPopularTag.deleteMany({});
  const popularTags = [
    {
      tagName: 'Tạp hóa - Siêu thị mini',
      mappedTaxId: 1,
      iconName: 'shopping-cart',
    },
    { tagName: 'Thời trang', mappedTaxId: 1, iconName: 'shirt' },
    { tagName: 'Mỹ phẩm', mappedTaxId: 1, iconName: 'sparkles' },
    { tagName: 'Mẹ và bé', mappedTaxId: 1, iconName: 'baby' },
    { tagName: 'Gia dụng', mappedTaxId: 1, iconName: 'home' },
    { tagName: 'Dược phẩm', mappedTaxId: 1, iconName: 'pill' },
    { tagName: 'Dịch vụ ăn uống', mappedTaxId: 3, iconName: 'utensils' },
  ];

  for (const tag of popularTags) {
    const tagId = popularTags.indexOf(tag) + 1;
    await prisma.uiPopularTag.upsert({
      where: { id: tagId },
      update: tag,
      create: { ...tag, id: tagId },
    });
  }

  // Clear all transactions/documents first to avoid foreign key issues
  await prisma.productionDetail.deleteMany({});
  await prisma.internalProductionOrder.deleteMany({});
  await prisma.voucher.deleteMany({});
  await prisma.inboundInvoiceDetail.deleteMany({});
  await prisma.inboundInvoice.deleteMany({});
  await prisma.invoiceDetail.deleteMany({});
  await prisma.invoice.deleteMany({});

  // 4. Seed cho VoucherCategory (Hạng mục mặc định hệ thống - userId: null)
  await prisma.voucherCategory.deleteMany({ where: { userId: null } });
  const voucherCategories = [
    {
      type: VoucherType.PAYMENT,
      categoryName:
        'Chi phí nguyên liệu, vật liệu, nhiên liệu, năng lượng, hàng hóa sử dụng vào sản xuất, kinh doanh.',
      s2cExpenseMapping: 'ITEM_A',
    },
    {
      type: VoucherType.PAYMENT,
      categoryName:
        'Chi phí tiền lương, tiền công, các khoản phụ cấp, bảo hiểm bắt buộc và các khoản chi trả cho người lao động...',
      s2cExpenseMapping: 'ITEM_B',
    },
    {
      type: VoucherType.PAYMENT,
      categoryName:
        'Chi phí khấu hao tài sản cố định sử dụng vào sản xuất, kinh doanh.',
      s2cExpenseMapping: 'ITEM_C',
    },
    {
      type: VoucherType.PAYMENT,
      categoryName:
        'Chi phí dịch vụ mua ngoài như điện, nước, điện thoại, internet, vận chuyển, thuê tài sản...',
      s2cExpenseMapping: 'ITEM_D',
    },
    {
      type: VoucherType.PAYMENT,
      categoryName:
        'Chi phí trả lãi tiền vay phục vụ sản xuất kinh doanh.',
      s2cExpenseMapping: 'ITEM_E',
    },
    {
      type: VoucherType.PAYMENT,
      categoryName:
        'Chi phí thuê kho bãi, mặt bằng phục vụ sản xuất kinh doanh và các khoản chi khác...',
      s2cExpenseMapping: 'ITEM_F',
    },
    { type: VoucherType.RECEIPT, categoryName: 'Thu tiền bán hàng', s2cExpenseMapping: 'NONE' },
    { type: VoucherType.RECEIPT, categoryName: 'Thu tiền thu nợ', s2cExpenseMapping: 'NONE' },
    { type: VoucherType.RECEIPT, categoryName: 'Thu khác', s2cExpenseMapping: 'NONE' },
  ];

  for (const vc of voucherCategories) {
    await prisma.voucherCategory.create({
      data: {
        type: vc.type,
        categoryName: vc.categoryName,
        s2cExpenseMapping: vc.s2cExpenseMapping as any,
        userId: null,
      },
    });
  }

  // 5. Seed cho 3 tài khoản kiểm thử đại diện cho 3 nhóm thuế
  console.log('--- Đang khởi tạo 3 tài khoản kiểm thử ---');
  const saltRounds = 10;
  const commonPasswordHash = await bcrypt.hash('Password123!', saltRounds);

  const testUsers = [
    {
      phoneNumber: '0900000001',
      passwordHash: commonPasswordHash,
      taxCode: '0123456781',
      cccdNumber: '001090000001',
      businessName: 'Hộ kinh doanh Nhóm Một (Miễn thuế)',
      ownerName: 'Nguyễn Văn Miễn Thuế',
      provinceCity: 'Hà Nội',
      role: 'ADMIN' as const,
      isActive: true,
    },
    {
      phoneNumber: '0900000002',
      passwordHash: commonPasswordHash,
      taxCode: '0123456782',
      cccdNumber: '001090000002',
      businessName: 'Hộ kinh doanh Nhóm Hai (So sánh AI)',
      ownerName: 'Nguyễn Văn Linh Hoạt',
      provinceCity: 'Hồ Chí Minh',
      role: 'ADMIN' as const,
      isActive: true,
    },
    {
      phoneNumber: '0900000003',
      passwordHash: commonPasswordHash,
      taxCode: '0123456783',
      cccdNumber: '001090000003',
      businessName: 'Hộ kinh doanh Nhóm Ba (Bắt buộc theo lợi nhuận)',
      ownerName: 'Nguyễn Văn Lợi Nhuận',
      provinceCity: 'Đà Nẵng',
      role: 'ADMIN' as const,
      isActive: true,
    },
  ];

  for (const u of testUsers) {
    // Để tránh lỗi trùng lặp khi chạy đi chạy lại seed, ta sẽ dọn dẹp các bản ghi cũ trùng MST/CCCD trước nếu số điện thoại khác
    await prisma.user.deleteMany({
      where: {
        OR: [
          { taxCode: u.taxCode, NOT: { phoneNumber: u.phoneNumber } },
          { cccdNumber: u.cccdNumber, NOT: { phoneNumber: u.phoneNumber } },
        ],
      },
    });

    const existing = await prisma.user.findUnique({
      where: { phoneNumber: u.phoneNumber },
      select: { id: true },
    });

    if (existing) {
      const userId = existing.id;
      // Xóa tất cả dữ liệu liên quan để reset hoàn toàn trạng thái về chưa Onboarding
      await prisma.productionDetail.deleteMany({
        where: { order: { userId } },
      });
      await prisma.internalProductionOrder.deleteMany({ where: { userId } });
      await prisma.voucher.deleteMany({ where: { userId } });
      await prisma.inboundInvoiceDetail.deleteMany({
        where: { invoice: { userId } },
      });
      await prisma.inboundInvoice.deleteMany({ where: { userId } });
      await prisma.invoiceDetail.deleteMany({ where: { invoice: { userId } } });
      await prisma.invoice.deleteMany({ where: { userId } });
      await prisma.taxDeclarationDraft.deleteMany({ where: { userId } });
      await prisma.financialPeriod.deleteMany({ where: { userId } });
      await prisma.taxConfiguration.deleteMany({ where: { userId } });
      await prisma.revenueTracker.deleteMany({ where: { userId } });
      await prisma.auditLog.deleteMany({ where: { userId } });
      await prisma.product.deleteMany({ where: { userId } });
    }

    await prisma.user.upsert({
      where: { phoneNumber: u.phoneNumber },
      update: {
        passwordHash: u.passwordHash,
        taxCode: u.taxCode,
        cccdNumber: u.cccdNumber,
        businessName: u.businessName,
        ownerName: u.ownerName,
        provinceCity: u.provinceCity,
        role: u.role,
        isActive: u.isActive,
        setUpCompletedAt: null, // Reset trạng thái onboarding
      },
      create: u,
    });
  }

  // 6. Seed mock data for S2e-HKD cash flow testing (for the first user)
  console.log('--- Đang khởi tạo dữ liệu mẫu cho kiểm thử S2e-HKD ---');
  const testUser = await prisma.user.findUnique({
    where: { phoneNumber: '0900000001' },
  });

  if (testUser) {
    const userId = testUser.id;
    // Set up completed at to pass guards if necessary
    await prisma.user.update({
      where: { id: userId },
      data: { setUpCompletedAt: new Date() },
    });

    // Create a Tax Config
    await prisma.taxConfiguration.create({
      data: {
        userId,
        taxGroupId: 1,
        industryId: 2,
        vatRateSnapShot: 0.01,
        pitRateSnapShot: 0.005,
        applyFromDate: new Date('2023-01-01'),
        applyToDate: new Date('2026-12-31'),
        chosenPitMethod: PitMethod.EXEMPT,
      },
    });

    // Create a product
    const product = await prisma.product.create({
      data: {
        userId,
        productName: 'Sản phẩm test S2e',
        productType: 'FINISHED_GOOD',
        sellingPrice: 100000,
        currentStock: 10,
        unit: 'cái',
      },
    });

    // Create an Invoice
    const invoice = await prisma.invoice.create({
      data: {
        userId,
        invoiceSymbol: 'K1/24T',
        isB2C: true,
        issueDate: new Date(),
        totalPayment: 200000,
        taxRate: 0.01,
        taxPayable: 2000,
        status: 'ISSUED',
        paymentMethod: 'CASH',
      },
    });

    await prisma.invoiceDetail.create({
      data: {
        invoiceId: invoice.id,
        productId: product.id,
        productNameSnapshot: product.productName,
        productType: product.productType,
        quantity: 2,
        unitPrice: 100000,
        totalAmount: 200000,
        unit: 'cái',
      },
    });

    // Find voucher categories
    const catReceipt = await prisma.voucherCategory.findFirst({
      where: { type: 'RECEIPT' },
    });
    const catNhanCong = await prisma.voucherCategory.findFirst({
      where: {
        type: 'PAYMENT',
        categoryName:
          'Chi phí tiền lương, tiền công, các khoản phụ cấp, bảo hiểm bắt buộc và các khoản chi trả cho người lao động...',
      },
    });
    const catDichVuMuaNgoai = await prisma.voucherCategory.findFirst({
      where: {
        type: 'PAYMENT',
        categoryName:
          'Chi phí dịch vụ mua ngoài như điện, nước, điện thoại, internet, vận chuyển, thuê tài sản...',
      },
    });
    const catKhac = await prisma.voucherCategory.findFirst({
      where: {
        type: 'PAYMENT',
        categoryName:
          'Chi phí thuê kho bãi, mặt bằng phục vụ sản xuất kinh doanh và các khoản chi khác...',
      },
    });

    // Create Receipt Voucher (Phiếu thu)
    await prisma.voucher.create({
      data: {
        userId,
        voucherCode: 'PT001',
        voucherType: 'RECEIPT',
        categoryId: catReceipt!.id,
        amount: 200000,
        paymentMethod: 'CASH',
        transactionAt: new Date(),
        content: 'Thu tiền bán hàng hóa đơn K1/24T',
        outboundInvoiceId: invoice.id,
        status: 'ACTIVE',
      },
    });

    // Create Inbound Invoice (Hóa đơn đầu vào)
    const inboundInvoice = await prisma.inboundInvoice.create({
      data: {
        userId,
        sellerName: 'Công ty TNHH Cung cấp Thiết bị Điện',
        sellerTaxCode: '0100200300',
        invoiceNo: 'ELEC-9988',
        issueDate: new Date(),
        totalAmount: 150000,
        status: 'ACTIVE',
        isSyncedToInventory: false,
        isPaid: true,
        paidAmount: 150000,
      },
    });

    // Create Payment Voucher (Phiếu chi 1: Chi phí dịch vụ mua ngoài, deductible, linked to InboundInvoice)
    await prisma.voucher.create({
      data: {
        userId,
        voucherCode: 'PC001',
        voucherType: 'PAYMENT',
        categoryId: catDichVuMuaNgoai!.id,
        amount: 150000,
        paymentMethod: 'CASH',
        transactionAt: new Date(Date.now() + 1000), // Slightly after
        content: 'Chi trả tiền điện văn phòng',
        isDeductibleExpense: true,
        inboundInvoiceId: inboundInvoice.id,
        status: 'ACTIVE',
      },
    });

    // Create Payment Voucher (Phiếu chi 2: Chi phí lương, deductible, no invoice)
    await prisma.voucher.create({
      data: {
        userId,
        voucherCode: 'PC002',
        voucherType: 'PAYMENT',
        categoryId: catNhanCong!.id,
        amount: 2500000,
        paymentMethod: 'BANK',
        transactionAt: new Date(Date.now() + 2000),
        content: 'Chi trả lương nhân viên tháng 5',
        isDeductibleExpense: true,
        status: 'ACTIVE',
      },
    });

    // Create Payment Voucher (Phiếu chi 3: Non-deductible expense)
    await prisma.voucher.create({
      data: {
        userId,
        voucherCode: 'PC003',
        voucherType: 'PAYMENT',
        categoryId: catKhac!.id,
        amount: 100000,
        paymentMethod: 'CASH',
        transactionAt: new Date(Date.now() + 3000),
        content: 'Chi mua trà nước tiếp khách',
        isDeductibleExpense: false,
        status: 'ACTIVE',
      },
    });

    console.log('✅ Seed dữ liệu mẫu cho Cash Flow thành công!');
  }

  console.log('✅ Seed Master Data thành công!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
