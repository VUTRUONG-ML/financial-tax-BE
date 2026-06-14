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
  console.log('--- Checking for incorrect timezone records ---');
  
  const configs = await prisma.taxConfiguration.findMany({
    orderBy: { createdAt: 'asc' },
  });
  
  console.log(`Total records found: ${configs.length}`);
  
  let fixCount = 0;
  
  for (const config of configs) {
    const fromDate = config.applyFromDate;
    const toDate = config.applyToDate;
    
    console.log(`[Config ${config.id}] User: ${config.userId}`);
    console.log(`  - Original applyFromDate: ${fromDate.toISOString()}`);
    if (toDate) {
      console.log(`  - Original applyToDate:   ${toDate.toISOString()}`);
    }
    
    // Check if applyFromDate has the incorrect UTC time 10:00:00 (which corresponds to 17:00 in GMT+7)
    // instead of 17:00:00 (which corresponds to 00:00 in GMT+7)
    const fromHourUTC = fromDate.getUTCHours();
    const fromMinUTC = fromDate.getUTCMinutes();
    
    let needsFix = false;
    let newFromDate = new Date(fromDate);
    
    if (fromHourUTC === 10 && fromMinUTC === 0) {
      needsFix = true;
      // Change to 17:00:00 UTC
      newFromDate.setUTCHours(17, 0, 0, 0);
    }
    
    let newToDate: Date | null = null;
    if (toDate) {
      const toHourUTC = toDate.getUTCHours();
      const toMinUTC = toDate.getUTCMinutes();
      
      // Also check if applyToDate needs fixing (e.g. ended at 10:00:00 UTC instead of 17:00:00 UTC)
      if (toHourUTC === 10 && toMinUTC === 0) {
        needsFix = true;
        newToDate = new Date(toDate);
        newToDate.setUTCHours(17, 0, 0, 0);
      }
    }
    
    if (needsFix) {
      console.log(`  => Needs correction!`);
      console.log(`     New applyFromDate: ${newFromDate.toISOString()}`);
      if (newToDate) {
        console.log(`     New applyToDate:   ${newToDate.toISOString()}`);
      }
      
      // Update in DB
      await prisma.taxConfiguration.update({
        where: { id: config.id },
        data: {
          applyFromDate: newFromDate,
          ...(newToDate ? { applyToDate: newToDate } : {}),
        },
      });
      
      fixCount++;
      console.log(`  [Config ${config.id}] Corrected successfully.`);
    } else {
      console.log(`  => Status: Correct.`);
    }
  }
  
  console.log(`--- Timezone correction summary ---`);
  console.log(`Total records checked:    ${configs.length}`);
  console.log(`Total records corrected:  ${fixCount}`);
  console.log(`-----------------------------------`);
}

main()
  .catch((e) => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
