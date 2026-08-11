-- AlterTable: add transferredBack column to Dividend
ALTER TABLE "Dividend" ADD COLUMN "transferredBack" INTEGER NOT NULL DEFAULT 0;
