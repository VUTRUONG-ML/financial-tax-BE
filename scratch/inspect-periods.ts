import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const linkUrl = process.env.DATABASE_URL;
const pool = new Pool({ connectionString: linkUrl });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('--- Inspecting FinancialPeriod dates ---');
  
  const periods = await prisma.financialPeriod.findMany({
    orderBy: { createdAt: 'asc' },
  });
  
  console.log(`Total periods found: ${periods.length}`);
  
  for (const period of periods) {
    console.log(`[Period ${period.id}] Name: ${period.periodName}`);
    console.log(`  - startDate: ${period.startDate.toISOString()}`);
    console.log(`  - endDate:   ${period.endDate.toISOString()}`);
    console.log(`  - deadline:  ${period.deadlineDate.toISOString()}`);
  }
  
  console.log('---------------------------------------');
}

main()
  .catch((e) => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
