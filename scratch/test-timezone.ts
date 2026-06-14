import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import dotenv from 'dotenv';

dotenv.config();

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('Asia/Ho_Chi_Minh');

const linkUrl = process.env.DATABASE_URL;
const pool = new Pool({ connectionString: linkUrl });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('--- timezone test start ---');
  
  // 1. Lấy thông tin user bất kì trong db hoặc tạo user ảo
  let user = await prisma.user.findFirst();
  if (!user) {
    console.log('No user found. Creating a temporary user...');
    user = await prisma.user.create({
      data: {
        phoneNumber: '0987654321',
        passwordHash: 'dummyhash',
        taxCode: '0987654321',
        businessName: 'Timezone Test Business',
        ownerName: 'Test Owner',
        cccdNumber: '123456789012',
        provinceCity: 'Hồ Chí Minh',
      },
    });
  }
  
  console.log(`Using user ID: ${user.id}`);

  // 2. Tìm hoặc tạo tax category & tax group hợp lệ
  let category = await prisma.taxCategory.findFirst();
  if (!category) {
    category = await prisma.taxCategory.create({
      data: {
        categoryName: 'Dịch vụ phần mềm',
        vatRate: 0.05,
        pitRate: 0.02,
      },
    });
  }

  let group = await prisma.taxGroup.findFirst();
  if (!group) {
    group = await prisma.taxGroup.create({
      data: {
        groupName: 'Nhóm 2',
        minRevenue: 100000000,
        allowedMethods: ['PERCENTAGE'],
      },
    });
  }

  // 3. Tạo applyFromDate tương đương 00:00 ngày 14/06/2026 múi giờ Việt Nam
  const testDate = dayjs.tz('2026-06-14 00:00:00').toDate();
  console.log('Date to write (in Node.js / absolute UTC):', testDate.toISOString());

  // 4. Tạo bản ghi TaxConfiguration mới
  const config = await prisma.taxConfiguration.create({
    data: {
      userId: user.id,
      industryId: category.id,
      taxGroupId: group.id,
      chosenPitMethod: 'PERCENTAGE',
      applyFromDate: testDate,
      applyToDate: new Date('9999-12-31T00:00:00Z'),
      vatRateSnapShot: 0.05,
      pitRateSnapShot: 0.02,
    },
  });

  console.log('Created record ID:', config.id);
  console.log('Prisma Client create response (applyFromDate):', config.applyFromDate.toISOString());

  // 5. Query lại bằng Prisma Client
  const queriedConfig = await prisma.taxConfiguration.findUnique({
    where: { id: config.id },
  });
  console.log('Prisma Client queried back (applyFromDate):', queriedConfig?.applyFromDate.toISOString());

  // 6. Query raw trực tiếp từ PostgreSQL để xem dữ liệu lưu trong DB thế nào
  const rawResult = await prisma.$queryRaw<{ apply_from_date: Date; datatype: string }[]>`
    SELECT 
      apply_from_date,
      pg_typeof(apply_from_date)::text as datatype
    FROM tax_configurations 
    WHERE id = ${config.id}
  `;

  if (rawResult && rawResult[0]) {
    const dbVal = rawResult[0].apply_from_date;
    console.log('Database raw value (read by $queryRaw):', dbVal instanceof Date ? dbVal.toISOString() : dbVal);
    console.log('Database raw type:', rawResult[0].datatype);
  } else {
    console.log('Could not retrieve raw DB record.');
  }

  // 7. Dọn dẹp bản ghi test
  await prisma.taxConfiguration.delete({
    where: { id: config.id },
  });
  console.log('Cleanup completed. Temporary record deleted.');
  console.log('--- timezone test end ---');
}

main()
  .catch((e) => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
