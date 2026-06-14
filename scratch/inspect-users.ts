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
  console.log('--- Inspecting User setUpCompletedAt dates ---');
  
  const users = await prisma.user.findMany({
    where: { setUpCompletedAt: { not: null } },
  });
  
  console.log(`Users with onboarding completed: ${users.length}`);
  
  for (const user of users) {
    console.log(`[User ${user.id}] Name: ${user.ownerName}`);
    console.log(`  - setUpCompletedAt (Prisma): ${user.setUpCompletedAt?.toISOString()}`);
    
    // Check raw PG value
    const rawResult = await prisma.$queryRaw<{ setup_completed_at: Date; datatype: string }[]>`
      SELECT 
        setup_completed_at,
        pg_typeof(setup_completed_at)::text as datatype
      FROM users 
      WHERE id = ${user.id}
    `;
    
    if (rawResult && rawResult[0]) {
      const dbVal = rawResult[0].setup_completed_at;
      console.log(`  - Database raw value:        ${dbVal instanceof Date ? dbVal.toISOString() : dbVal}`);
      console.log(`  - Database raw type:         ${rawResult[0].datatype}`);
    }
  }
  
  console.log('----------------------------------------------');
}

main()
  .catch((e) => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
