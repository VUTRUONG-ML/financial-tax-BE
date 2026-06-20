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
      maxRevenue: 1000000000,
      allowedMethods: [PitMethod.EXEMPT],
      description: 'Dưới 1 tỷ/năm: Miễn thuế GTGT & TNCN',
    },
    {
      id: 2,
      groupName: 'Mức 2: Nhóm linh hoạt',
      minRevenue: 1000000000,
      maxRevenue: 3000000000,
      allowedMethods: [PitMethod.PERCENTAGE, PitMethod.PROFIT_15],
      description: 'Trên 1 tỷ - 3 tỷ: Được chọn % hoặc 15% Lợi nhuận',
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

  // 2. Seed cho TaxCategory (Từ điển 4 nhóm gốc - Cha và các Nhóm con)
  const mainCategories = [
    // --- Nhóm 1 ---
    {
      id: 1,
      categoryName: 'Phân phối, cung cấp hàng hóa',
      vatRate: 0.01,
      pitRate: 0.005,
      xmlIndicator: null,
      parentId: null,
    },
    {
      id: 11,
      categoryName: 'Bán buôn, bán lẻ hàng hóa thông thường (tạp hóa, siêu thị, linh kiện, điện máy...)',
      vatRate: 0.01,
      pitRate: 0.005,
      xmlIndicator: 'ct28',
      parentId: 1,
    },
    {
      id: 12,
      categoryName: 'Hàng hóa không chịu thuế GTGT, chịu thuế GTGT 0% hoặc không phải khai thuế GTGT',
      vatRate: 0.00,
      pitRate: 0.005,
      xmlIndicator: 'ct28',
      parentId: 1,
    },
    // --- Nhóm 2 ---
    {
      id: 2,
      categoryName: 'Dịch vụ, xây dựng (Không bao thầu nguyên vật liệu)',
      vatRate: 0.05,
      pitRate: 0.02,
      xmlIndicator: null,
      parentId: null,
    },
    {
      id: 21,
      categoryName: 'Dịch vụ thông thường: Lưu trú, bốc xếp, bưu chính, môi giới, tư vấn luật/kế toán, tắm hơi, massage, cắt tóc, giặt là, sửa chữa máy tính, thi công xây dựng (chỉ nhận tiền công)',
      vatRate: 0.05,
      pitRate: 0.02,
      xmlIndicator: 'ct30',
      parentId: 2,
    },
    {
      id: 22,
      categoryName: 'Dịch vụ không chịu thuế GTGT, thuế GTGT 0% (Ví dụ: Dịch vụ y tế, khám chữa bệnh, thú y, dịch vụ xuất khẩu...)',
      vatRate: 0.00,
      pitRate: 0.02,
      xmlIndicator: 'ct30',
      parentId: 2,
    },
    {
      id: 23,
      categoryName: 'Dịch vụ đặc thù: Cho thuê tài sản (nhà, đất, cửa hàng, nhà xưởng, kho bãi, máy móc, thiết bị, phương tiện vận tải)',
      vatRate: 0.05,
      pitRate: 0.05,
      xmlIndicator: 'ct31',
      parentId: 2,
    },
    {
      id: 24,
      categoryName: 'Dịch vụ đại lý đặc thù: Đại lý xổ số, đại lý bảo hiểm, đại lý bán hàng đa cấp; Khoản bồi thường vi phạm hợp đồng',
      vatRate: 0.00,
      pitRate: 0.05,
      xmlIndicator: 'ct31',
      parentId: 2,
    },
    // --- Nhóm 3 ---
    {
      id: 3,
      categoryName: 'Sản xuất, vận tải, dịch vụ có gắn với hàng hóa, xây dựng (Có bao thầu NVL)',
      vatRate: 0.03,
      pitRate: 0.015,
      xmlIndicator: null,
      parentId: null,
    },
    {
      id: 31,
      categoryName: 'Dịch vụ trọn gói: Sản xuất, gia công chế biến, khai thác khoáng sản; Vận tải hành khách/hàng hóa; Dịch vụ ăn uống (nhà hàng, quán cafe); Xây dựng, lắp đặt có bao thầu cả vật tư',
      vatRate: 0.03,
      pitRate: 0.015,
      xmlIndicator: 'ct29',
      parentId: 3,
    },
    {
      id: 32,
      categoryName: 'Các hoạt động thuộc Nhóm 3 nhưng là đối tượng không chịu thuế GTGT hoặc chịu thuế GTGT 0%',
      vatRate: 0.00,
      pitRate: 0.015,
      xmlIndicator: 'ct29',
      parentId: 3,
    },
    // --- Nhóm 4 ---
    {
      id: 4,
      categoryName: 'Hoạt động kinh doanh khác',
      vatRate: 0.02,
      pitRate: 0.01,
      xmlIndicator: null,
      parentId: null,
    },
    {
      id: 41,
      categoryName: 'Sản xuất, kinh doanh các sản phẩm thuộc đối tượng chịu thuế Tiêu thụ đặc biệt (như kinh doanh quán bar, bán rượu bia, xì gà...); Các hoạt động kinh doanh không được phân loại rõ ở 3 nhóm trên',
      vatRate: 0.02,
      pitRate: 0.01,
      xmlIndicator: 'ct33',
      parentId: 4,
    },
    {
      id: 42,
      categoryName: 'Các hoạt động thuộc Nhóm 4 nhưng không chịu thuế GTGT, chịu thuế GTGT 0%',
      vatRate: 0.00,
      pitRate: 0.01,
      xmlIndicator: 'ct33',
      parentId: 4,
    },
  ];

  for (const cat of mainCategories) {
    await prisma.taxCategory.upsert({
      where: { id: cat.id },
      update: {
        categoryName: cat.categoryName,
        vatRate: cat.vatRate,
        pitRate: cat.pitRate,
        xmlIndicator: cat.xmlIndicator,
        parentId: cat.parentId,
      },
      create: {
        id: cat.id,
        categoryName: cat.categoryName,
        vatRate: cat.vatRate,
        pitRate: cat.pitRate,
        xmlIndicator: cat.xmlIndicator,
        parentId: cat.parentId,
      },
    });
  }

  // 3. Seed cho UiPopularTag (Thẻ gợi ý cho User)
  await prisma.uiPopularTag.deleteMany({});
  const popularTags = [
    {
      tagName: 'Tạp hóa - Siêu thị mini',
      mappedTaxId: 11,
      iconName: 'shopping-cart',
    },
    { tagName: 'Thời trang', mappedTaxId: 11, iconName: 'shirt' },
    { tagName: 'Mỹ phẩm', mappedTaxId: 11, iconName: 'sparkles' },
    { tagName: 'Mẹ và bé', mappedTaxId: 11, iconName: 'baby' },
    { tagName: 'Gia dụng', mappedTaxId: 11, iconName: 'home' },
    { tagName: 'Dược phẩm', mappedTaxId: 11, iconName: 'pill' },
    { tagName: 'Dịch vụ ăn uống', mappedTaxId: 31, iconName: 'utensils' },
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

      // Xóa dữ liệu kho
      await prisma.inventoryMovement.deleteMany({ where: { product: { userId } } });
      await prisma.stockReceiptDetail.deleteMany({ where: { product: { userId } } });
      await prisma.stockReceipt.deleteMany({ where: { period: { userId } } });
      await prisma.stockIssueDetail.deleteMany({ where: { product: { userId } } });
      await prisma.stockIssue.deleteMany({ where: { period: { userId } } });

      await prisma.taxDeclaration.deleteMany({ where: { period: { userId } } });
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
        industryId: 11,
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
        skuCode: 'SP-S2E',
        sellingPrice: 100000,
        openingStockQuantity: 10,
        openingStockUnitCost: 60000,
        openingStockValue: 600000,
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
        isPaid: true,
        paidAmount: 150000,
        xmlFileUrl: 'https://storage.tax.gov.vn/invoices/xml/ELEC-9988.xml',
        pdfFileUrl: 'https://storage.tax.gov.vn/invoices/pdf/ELEC-9988.pdf',
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

  // Seed MockTaxAccount
  const mockAccount = {
    taxCode: '0123456789',
    username: 'demo',
    password: '123456',
    cashRegisterCode: 'ABCDE',
    businessName: 'Công ty Demo',
    isEinvoiceRegistered: true,
  };
  await prisma.mockTaxAccount.upsert({
    where: { taxCode: mockAccount.taxCode },
    update: mockAccount,
    create: mockAccount,
  });
  console.log('✅ Seed MockTaxAccount thành công!');

  console.log('✅ Seed Master Data thành công!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
