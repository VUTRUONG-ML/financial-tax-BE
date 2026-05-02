-- CreateEnum
CREATE TYPE "ProductionStatus" AS ENUM ('ACTIVE', 'CANCELED');

-- AlterTable
ALTER TABLE "internal_production_orders" ADD COLUMN     "status" "ProductionStatus" NOT NULL DEFAULT 'ACTIVE';
