import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

// Chỉ cần khởi tạo Client cơ bản cho script chạy local
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  console.log('--- Đang khởi tạo Master Data cho Thuế 2026 ---');

  // 1. Seed cho SpecificIndustry (Nhóm ngành nghề)
  const industries = [
    {
      id: 1,
      industryName: 'Phân phối, cung cấp hàng hóa', // Đã sửa thành camelCase
      vatRate: 0.01,
      pitRate: 0.005,
    },
    {
      id: 2,
      industryName:
        'Sản xuất, vận tải, dịch vụ gắn với hàng hóa, xây dựng có bao thầu NVL',
      vatRate: 0.03,
      pitRate: 0.015,
    },
    {
      id: 3,
      industryName: 'Dịch vụ, xây dựng không bao thầu nguyên vật liệu',
      vatRate: 0.05,
      pitRate: 0.02,
    },
    {
      id: 4,
      industryName: 'Cho thuê tài sản, đại lý bảo hiểm, xổ số, đa cấp',
      vatRate: 0.05,
      pitRate: 0.05,
    },
    {
      id: 5,
      industryName: 'Cung cấp sản phẩm/dịch vụ nội dung thông tin số',
      vatRate: 0.05,
      pitRate: 0.05,
    },
    {
      id: 6,
      industryName: 'Hoạt động kinh doanh khác',
      vatRate: 0.02,
      pitRate: 0.01,
    },
  ];

  for (const item of industries) {
    await prisma.specificIndustry.upsert({
      where: { id: item.id },
      update: {},
      create: item,
    });
  }
  console.log('✅ Khởi tạo xong SpecificIndustry');

  // 2. Seed cho TaxGroup (Mức doanh thu)
  const taxGroups = [
    {
      id: 1,
      groupName: 'Mức 1: Miễn thuế', // Đã thêm trường groupName theo đúng Schema
      minRevenue: 0, // Đã sửa thành camelCase
      maxRevenue: 500000000,
      description: 'Mức 1: Miễn thuế hoàn toàn',
    },
    {
      id: 2,
      groupName: 'Mức 2: Nhóm linh hoạt',
      minRevenue: 500000001,
      maxRevenue: 3000000000,
      description: 'Mức 2: Chọn % hoặc 15% Lợi nhuận',
    },
    {
      id: 3,
      groupName: 'Mức 3: Nhóm trung bình',
      minRevenue: 3000000001,
      maxRevenue: 50000000000,
      description: 'Mức 3: Bắt buộc 17% Lợi nhuận',
    },
    {
      id: 4,
      groupName: 'Mức 4: Nhóm quy mô lớn',
      minRevenue: 50000000001,
      maxRevenue: null, // Để null theo đúng thiết kế "không giới hạn trên"
      description: 'Mức 4: Bắt buộc 20% Lợi nhuận',
    },
  ];

  for (const group of taxGroups) {
    await prisma.taxGroup.upsert({
      where: { id: group.id },
      update: {},
      create: group,
    });
  }
  console.log('✅ Khởi tạo xong TaxGroup');

  console.log('--- Seed hoàn tất thành công! ---');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
