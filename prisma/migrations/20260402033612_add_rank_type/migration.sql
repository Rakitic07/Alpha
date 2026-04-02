/*
  Warnings:

  - You are about to drop the `Cashflow` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MarketCapDefinition` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `discrepancyData` on the `DailyPortfolioSnapshot` table. All the data in the column will be lost.
  - You are about to drop the column `hasDiscrepancy` on the `DailyPortfolioSnapshot` table. All the data in the column will be lost.
  - You are about to drop the column `isResolved` on the `DailyPortfolioSnapshot` table. All the data in the column will be lost.
  - You are about to drop the column `nanoCapPercent` on the `WeeklyPortfolioSnapshot` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "MarketCapDefinition_year_period_key";

-- AlterTable
ALTER TABLE "MonthlyPortfolioSnapshot" ADD COLUMN "sectorAllocation" TEXT;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Cashflow";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "MarketCapDefinition";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "SectorMapping" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "symbol" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "exchange" TEXT NOT NULL DEFAULT 'NSE',
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UpstoxToken" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "accessToken" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "issuedAt" DATETIME NOT NULL,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AMFIImportHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "period" TEXT NOT NULL,
    "sourceFile" TEXT NOT NULL,
    "stockCount" INTEGER NOT NULL,
    "largeCapCount" INTEGER NOT NULL,
    "midCapCount" INTEGER NOT NULL,
    "smallCapCount" INTEGER NOT NULL,
    "microCapCount" INTEGER NOT NULL,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "IntradayPnL" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date" DATETIME NOT NULL,
    "pnl" REAL NOT NULL,
    "percent" REAL NOT NULL
);

-- CreateTable
CREATE TABLE "ScreenerPrice" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "symbol" TEXT NOT NULL,
    "instrumentKey" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "open" REAL NOT NULL,
    "high" REAL NOT NULL,
    "low" REAL NOT NULL,
    "close" REAL NOT NULL,
    "volume" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "StockATH" (
    "symbol" TEXT NOT NULL PRIMARY KEY,
    "instrumentKey" TEXT NOT NULL,
    "ath" REAL NOT NULL,
    "athDate" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "MomentumScore" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "computedDate" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "instrumentKey" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "compositeScore" REAL NOT NULL,
    "avgSharpe" REAL NOT NULL,
    "sharpe12m" REAL NOT NULL,
    "sharpe6m" REAL NOT NULL,
    "sharpe3m" REAL NOT NULL,
    "athProximity" REAL NOT NULL,
    "ath" REAL NOT NULL,
    "currentPrice" REAL NOT NULL,
    "dma200" REAL NOT NULL,
    "aboveDma200Pct" REAL NOT NULL,
    "aboveDma10" BOOLEAN NOT NULL DEFAULT false,
    "aboveDma20" BOOLEAN NOT NULL DEFAULT false,
    "aboveDma50" BOOLEAN NOT NULL DEFAULT false,
    "aboveDma100" BOOLEAN NOT NULL DEFAULT false,
    "medianTurnoverCr" REAL NOT NULL,
    "marketCapCr" REAL NOT NULL,
    "marketCapCategory" TEXT,
    "sparklineData" TEXT,
    "circuitBandPct" REAL,
    "prevRank" INTEGER,
    "avgRank50d" REAL,
    "bestRank" INTEGER,
    "appearances" INTEGER NOT NULL DEFAULT 0,
    "t50Pct" REAL NOT NULL DEFAULT 0,
    "t100Pct" REAL NOT NULL DEFAULT 0,
    "rankType" TEXT NOT NULL DEFAULT 'filtered',
    "isActive" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "RankingHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "symbol" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "compositeScore" REAL NOT NULL,
    "rankType" TEXT NOT NULL DEFAULT 'filtered'
);

-- CreateTable
CREATE TABLE "StockMarketCap" (
    "symbol" TEXT NOT NULL PRIMARY KEY,
    "marketCap" REAL NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DailyPortfolioSnapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" DATETIME NOT NULL,
    "totalEquity" REAL NOT NULL,
    "investedCapital" REAL NOT NULL,
    "portfolioNAV" REAL NOT NULL,
    "niftyNAV" REAL,
    "units" REAL NOT NULL,
    "cashflow" REAL,
    "dailyPnL" REAL,
    "dailyReturn" REAL,
    "drawdown" REAL,
    "navMA200" REAL,
    "nifty500Momentum50NAV" REAL,
    "niftyMicrocap250NAV" REAL,
    "niftyMidcap100NAV" REAL,
    "niftySmallcap250NAV" REAL
);
INSERT INTO "new_DailyPortfolioSnapshot" ("cashflow", "dailyPnL", "dailyReturn", "date", "drawdown", "id", "investedCapital", "navMA200", "nifty500Momentum50NAV", "niftyMicrocap250NAV", "niftyMidcap100NAV", "niftyNAV", "niftySmallcap250NAV", "portfolioNAV", "totalEquity", "units") SELECT "cashflow", "dailyPnL", "dailyReturn", "date", "drawdown", "id", "investedCapital", "navMA200", "nifty500Momentum50NAV", "niftyMicrocap250NAV", "niftyMidcap100NAV", "niftyNAV", "niftySmallcap250NAV", "portfolioNAV", "totalEquity", "units" FROM "DailyPortfolioSnapshot";
DROP TABLE "DailyPortfolioSnapshot";
ALTER TABLE "new_DailyPortfolioSnapshot" RENAME TO "DailyPortfolioSnapshot";
CREATE UNIQUE INDEX "DailyPortfolioSnapshot_date_key" ON "DailyPortfolioSnapshot"("date");
CREATE TABLE "new_WeeklyPortfolioSnapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" DATETIME NOT NULL,
    "totalEquity" REAL NOT NULL,
    "nav" REAL NOT NULL,
    "weeklyReturn" REAL,
    "largeCapPercent" REAL,
    "midCapPercent" REAL,
    "smallCapPercent" REAL,
    "microCapPercent" REAL,
    "marketCap" REAL,
    "xirr" REAL,
    "pnl" REAL,
    "winPercent" REAL,
    "lossPercent" REAL,
    "avgHoldingPeriod" REAL,
    "avgWinnerGain" REAL,
    "avgLoserLoss" REAL,
    "sectorAllocation" TEXT
);
INSERT INTO "new_WeeklyPortfolioSnapshot" ("avgHoldingPeriod", "avgLoserLoss", "avgWinnerGain", "date", "id", "largeCapPercent", "lossPercent", "marketCap", "microCapPercent", "midCapPercent", "nav", "pnl", "smallCapPercent", "totalEquity", "weeklyReturn", "winPercent", "xirr") SELECT "avgHoldingPeriod", "avgLoserLoss", "avgWinnerGain", "date", "id", "largeCapPercent", "lossPercent", "marketCap", "microCapPercent", "midCapPercent", "nav", "pnl", "smallCapPercent", "totalEquity", "weeklyReturn", "winPercent", "xirr" FROM "WeeklyPortfolioSnapshot";
DROP TABLE "WeeklyPortfolioSnapshot";
ALTER TABLE "new_WeeklyPortfolioSnapshot" RENAME TO "WeeklyPortfolioSnapshot";
CREATE UNIQUE INDEX "WeeklyPortfolioSnapshot_date_key" ON "WeeklyPortfolioSnapshot"("date");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "SectorMapping_symbol_key" ON "SectorMapping"("symbol");

-- CreateIndex
CREATE INDEX "SectorMapping_sector_idx" ON "SectorMapping"("sector");

-- CreateIndex
CREATE INDEX "UpstoxToken_expiresAt_idx" ON "UpstoxToken"("expiresAt");

-- CreateIndex
CREATE INDEX "AMFIImportHistory_period_idx" ON "AMFIImportHistory"("period");

-- CreateIndex
CREATE INDEX "IntradayPnL_date_idx" ON "IntradayPnL"("date");

-- CreateIndex
CREATE INDEX "ScreenerPrice_symbol_idx" ON "ScreenerPrice"("symbol");

-- CreateIndex
CREATE INDEX "ScreenerPrice_date_idx" ON "ScreenerPrice"("date");

-- CreateIndex
CREATE UNIQUE INDEX "ScreenerPrice_symbol_date_key" ON "ScreenerPrice"("symbol", "date");

-- CreateIndex
CREATE INDEX "MomentumScore_computedDate_isActive_rankType_idx" ON "MomentumScore"("computedDate", "isActive", "rankType");

-- CreateIndex
CREATE INDEX "MomentumScore_isActive_rank_rankType_idx" ON "MomentumScore"("isActive", "rank", "rankType");

-- CreateIndex
CREATE INDEX "MomentumScore_symbol_idx" ON "MomentumScore"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "MomentumScore_computedDate_symbol_rankType_key" ON "MomentumScore"("computedDate", "symbol", "rankType");

-- CreateIndex
CREATE INDEX "RankingHistory_symbol_idx" ON "RankingHistory"("symbol");

-- CreateIndex
CREATE INDEX "RankingHistory_date_idx" ON "RankingHistory"("date");

-- CreateIndex
CREATE UNIQUE INDEX "RankingHistory_symbol_date_rankType_key" ON "RankingHistory"("symbol", "date", "rankType");

-- CreateIndex
CREATE INDEX "ImportBatch_timestamp_idx" ON "ImportBatch"("timestamp");

-- CreateIndex
CREATE INDEX "IndexHistory_date_idx" ON "IndexHistory"("date");

-- CreateIndex
CREATE INDEX "IndexHistory_symbol_idx" ON "IndexHistory"("symbol");

-- CreateIndex
CREATE INDEX "StockHistory_symbol_idx" ON "StockHistory"("symbol");

-- CreateIndex
CREATE INDEX "StockHistory_date_idx" ON "StockHistory"("date");

-- CreateIndex
CREATE INDEX "Transaction_date_idx" ON "Transaction"("date");

-- CreateIndex
CREATE INDEX "Transaction_date_symbol_idx" ON "Transaction"("date", "symbol");

-- CreateIndex
CREATE INDEX "Transaction_type_idx" ON "Transaction"("type");
