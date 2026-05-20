/*
  Warnings:

  - You are about to drop the column `current_step` on the `tax_declaration_drafts` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "tax_declaration_drafts" DROP COLUMN "current_step";
