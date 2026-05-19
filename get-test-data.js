const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const user = await p.user.findFirst({
    select: { phoneNumber: true, id: true, businessName: true }
  });
  console.log('USER:', JSON.stringify(user));

  if (user) {
    const period = await p.financialPeriod.findFirst({
      where: { userId: user.id, status: 'OPEN' },
      select: { publicId: true, periodName: true, startDate: true, endDate: true }
    });
    console.log('OPEN PERIOD:', JSON.stringify(period));
  }
}

main().catch(console.error).finally(() => p.$disconnect());
