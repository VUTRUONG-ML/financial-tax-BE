/*
  Warnings:

  - A unique constraint covering the columns `[user_id,period_name,start_date]` on the table `financial_periods` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "financial_periods_user_id_period_name_start_date_key" ON "financial_periods"("user_id", "period_name", "start_date");
