import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, PitMethod } from '@prisma/client';
import 'dotenv/config';

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

  console.log('✅ Seed Master Data thành công!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
