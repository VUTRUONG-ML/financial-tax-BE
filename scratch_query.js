require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('--- RECENT INVOICES ---');
  const invoices = await prisma.invoice.findMany({
    take: 5,
    orderBy: { id: 'desc' },
    select: { id: true, invoiceSymbol: true, issueDate: true, createdAt: true }
  });
  console.log(JSON.stringify(invoices, null, 2));

  console.log('--- RECENT PRODUCTION ORDERS ---');
  const prodOrders = await prisma.internalProductionOrder.findMany({
    take: 5,
    orderBy: { id: 'desc' },
    select: { id: true, orderCode: true, transactionAt: true, createdAt: true }
  });
  console.log(JSON.stringify(prodOrders, null, 2));

  console.log('--- RECENT VOUCHERS ---');
  const vouchers = await prisma.voucher.findMany({
    take: 5,
    orderBy: { id: 'desc' },
    select: { id: true, voucherCode: true, transactionAt: true, createdAt: true }
  });
  console.log(JSON.stringify(vouchers, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
