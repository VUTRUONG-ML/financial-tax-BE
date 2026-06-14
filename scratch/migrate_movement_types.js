require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  console.log('--- Checking inventory movements with old types ---');
  const checkRes = await pool.query(`
    SELECT movement_type, COUNT(*) 
    FROM inventory_movements 
    GROUP BY movement_type
  `);
  console.log('Current movement types in DB:', checkRes.rows);

  console.log('--- Updating old movement types ---');
  // First, check if ADJUST_IN and ADJUST_OUT already exist in enum
  // Wait! PostgreSQL enums are strict. If the database schema has not been updated yet,
  // we cannot UPDATE the records to 'ADJUST_IN' or 'ADJUST_OUT' because those values are not in the enum type yet!
  // Ah! That is a very important database behavior.
  // In PostgreSQL, to alter an enum type, we do:
  // ALTER TYPE "InventoryMovementType" ADD VALUE 'CARRY_FORWARD';
  // ALTER TYPE "InventoryMovementType" ADD VALUE 'ADJUST_IN';
  // ALTER TYPE "InventoryMovementType" ADD VALUE 'ADJUST_OUT';
  // Let's run these ALTER TYPE commands first! Then we can update the values, and then delete the old values if needed.
  // Wait, let's run ALTER TYPE raw SQL queries!
  
  try {
    await pool.query(`ALTER TYPE "InventoryMovementType" ADD VALUE 'CARRY_FORWARD'`);
    console.log('Added CARRY_FORWARD to enum');
  } catch (e) {
    console.log('CARRY_FORWARD might already exist or failed:', e.message);
  }

  try {
    await pool.query(`ALTER TYPE "InventoryMovementType" ADD VALUE 'ADJUST_IN'`);
    console.log('Added ADJUST_IN to enum');
  } catch (e) {
    console.log('ADJUST_IN might already exist or failed:', e.message);
  }

  try {
    await pool.query(`ALTER TYPE "InventoryMovementType" ADD VALUE 'ADJUST_OUT'`);
    console.log('Added ADJUST_OUT to enum');
  } catch (e) {
    console.log('ADJUST_OUT might already exist or failed:', e.message);
  }

  const updateInc = await pool.query(`
    UPDATE inventory_movements 
    SET movement_type = 'ADJUST_IN' 
    WHERE movement_type = 'ADJUSTMENT_INCREASE'
  `);
  console.log('Updated ADJUSTMENT_INCREASE -> ADJUST_IN count:', updateInc.rowCount);

  const updateDec = await pool.query(`
    UPDATE inventory_movements 
    SET movement_type = 'ADJUST_OUT' 
    WHERE movement_type = 'ADJUSTMENT_DECREASE'
  `);
  console.log('Updated ADJUSTMENT_DECREASE -> ADJUST_OUT count:', updateDec.rowCount);
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await pool.end();
  });
