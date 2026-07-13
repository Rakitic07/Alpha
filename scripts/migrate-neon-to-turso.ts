/**
 * One-time data migration: Neon Postgres → Turso (libsql/SQLite)
 *
 * Usage:
 *   NEON_DATABASE_URL=postgresql://... DATABASE_URL=libsql://... npx tsx scripts/migrate-neon-to-turso.ts
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Module = require('module');
const _orig = Module._load;
Module._load = function (req: string, parent: any, isMain: boolean) {
  if (req === 'server-only') return {};
  if (req === 'next/cache') return { unstable_cache: (fn: any) => fn, revalidateTag: () => {}, revalidatePath: () => {} };
  if (req === 'next/server') return {};
  return _orig(req, parent, isMain);
};

import { config } from 'dotenv';
import { join } from 'path';
import * as fs from 'fs';

// Load env
const envLocalPath = join(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  config({ path: envLocalPath });
}
config();

import { neon } from '@neondatabase/serverless';

let prisma: any;
let chunkArray: any;

const NEON_URL = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
if (!NEON_URL || !NEON_URL.startsWith('postgres')) {
  console.error('❌ Missing NEON_DATABASE_URL or DATABASE_URL env var pointing to Neon');
  process.exit(1);
}

const neonSql = neon(NEON_URL);
const sql = (queryStr: string) => neonSql.query(queryStr);

// Helpers
function fmt(n: number): string {
  return n.toLocaleString();
}

function toDate(v: any): Date | null {
  if (!v) return null;
  return new Date(v);
}

function toDateRequired(v: any): Date {
  if (!v) throw new Error(`Expected date, got ${v}`);
  return new Date(v);
}

async function withRetry<T>(fn: () => Promise<T>, retries = 5, delayMs = 5000): Promise<T | void> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      const errMsg = err.message || String(err);
      
      // If a unique constraint fails on retry, it means the previous attempt actually succeeded
      // under the hood but threw a transient network/connection error. We can safely ignore it.
      if (errMsg.includes('UNIQUE constraint failed') || err.code === 'P2002') {
        console.log('\n[Retry Info] Unique constraint failed on retry, assuming previous write succeeded.');
        return;
      }
      
      if (i === retries - 1) throw err;
      console.warn(`\n[Retry Warning] Attempt ${i + 1} failed: ${errMsg}. Retrying in ${delayMs / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw new Error('Unreachable code in withRetry');
}

// ---------------------------------------------------------------------------
// Table migrations (in dependency order)
// ---------------------------------------------------------------------------

async function migrateAppConfig() {
  process.stdout.write('AppConfig ... ');
  const rows = await sql('SELECT * FROM "AppConfig"');
  if (rows.length === 0) { console.log('0 rows (skip)'); return; }
  for (const r of rows) {
    await prisma.appConfig.upsert({
      where: { key: r.key as string },
      create: { key: r.key as string, value: r.value as string, updatedAt: toDateRequired(r.updatedAt) },
      update: { value: r.value as string, updatedAt: toDateRequired(r.updatedAt) },
    });
  }
  console.log(`${fmt(rows.length)} rows`);
}

async function migrateSymbolMapping() {
  process.stdout.write('SymbolMapping ... ');
  const rows = await sql('SELECT * FROM "SymbolMapping"');
  if (rows.length === 0) { console.log('0 rows (skip)'); return; }
  for (const chunk of chunkArray(rows, 200)) {
    await prisma.symbolMapping.createMany({
      data: chunk.map(r => ({
        id: Number(r.id),
        oldSymbol: r.oldSymbol as string,
        newSymbol: r.newSymbol as string,
        createdAt: toDateRequired(r.createdAt),
      })),
    });
  }
  console.log(`${fmt(rows.length)} rows`);
}

async function migrateSectorMapping() {
  process.stdout.write('SectorMapping ... ');
  const rows = await sql('SELECT * FROM "SectorMapping"');
  if (rows.length === 0) { console.log('0 rows (skip)'); return; }
  for (const chunk of chunkArray(rows, 200)) {
    await prisma.sectorMapping.createMany({
      data: chunk.map(r => ({
        id: Number(r.id),
        symbol: r.symbol as string,
        sector: r.sector as string,
        exchange: (r.exchange as string) ?? 'NSE',
        updatedAt: toDateRequired(r.updatedAt),
      })),
    });
  }
  console.log(`${fmt(rows.length)} rows`);
}

async function migrateAMFIClassification() {
  process.stdout.write('AMFIClassification ... ');
  const rows = await sql('SELECT * FROM "AMFIClassification"');
  if (rows.length === 0) { console.log('0 rows (skip)'); return; }
  for (const chunk of chunkArray(rows, 200)) {
    await prisma.aMFIClassification.createMany({
      data: chunk.map(r => ({
        id: Number(r.id),
        period: r.period as string,
        rank: Number(r.rank),
        companyName: r.companyName as string,
        symbol: r.symbol as string,
        isin: r.isin as string,
        category: r.category as string,
        avgMarketCap: Number(r.avgMarketCap),
        createdAt: toDateRequired(r.createdAt),
        updatedAt: toDateRequired(r.updatedAt),
      })),
    });
  }
  console.log(`${fmt(rows.length)} rows`);
}

async function migrateAMFIImportHistory() {
  process.stdout.write('AMFIImportHistory ... ');
  const rows = await sql('SELECT * FROM "AMFIImportHistory"');
  if (rows.length === 0) { console.log('0 rows (skip)'); return; }
  for (const chunk of chunkArray(rows, 200)) {
    await prisma.aMFIImportHistory.createMany({
      data: chunk.map(r => ({
        id: Number(r.id),
        period: r.period as string,
        sourceFile: r.sourceFile as string,
        stockCount: Number(r.stockCount),
        largeCapCount: Number(r.largeCapCount),
        midCapCount: Number(r.midCapCount),
        smallCapCount: Number(r.smallCapCount),
        microCapCount: Number(r.microCapCount),
        importedAt: toDateRequired(r.importedAt),
      })),
    });
  }
  console.log(`${fmt(rows.length)} rows`);
}

async function migrateUpstoxToken() {
  process.stdout.write('UpstoxToken ... ');
  const rows = await sql('SELECT * FROM "UpstoxToken"');
  if (rows.length === 0) { console.log('0 rows (skip)'); return; }
  for (const chunk of chunkArray(rows, 200)) {
    await prisma.upstoxToken.createMany({
      data: chunk.map(r => ({
        id: Number(r.id),
        accessToken: r.accessToken as string,
        expiresAt: toDateRequired(r.expiresAt),
        issuedAt: toDateRequired(r.issuedAt),
        userId: r.userId as string | null,
        createdAt: toDateRequired(r.createdAt),
      })),
    });
  }
  console.log(`${fmt(rows.length)} rows`);
}

async function migrateJob() {
  process.stdout.write('Job ... ');
  const rows = await sql('SELECT * FROM "Job"');
  if (rows.length === 0) { console.log('0 rows (skip)'); return; }
  for (const chunk of chunkArray(rows, 200)) {
    await prisma.job.createMany({
      data: chunk.map(r => ({
        id: r.id as string,
        type: r.type as string,
        status: r.status as string,
        progress: Number(r.progress ?? 0),
        message: r.message as string | null,
        result: r.result as string | null,
        error: r.error as string | null,
        createdAt: toDateRequired(r.createdAt),
        updatedAt: toDateRequired(r.updatedAt),
      })),
    });
  }
  console.log(`${fmt(rows.length)} rows`);
}

async function migrateImportBatch() {
  process.stdout.write('ImportBatch ... ');
  const rows = await sql('SELECT * FROM "ImportBatch"');
  if (rows.length === 0) { console.log('0 rows (skip)'); return; }
  for (const chunk of chunkArray(rows, 200)) {
    await prisma.importBatch.createMany({
      data: chunk.map(r => ({
        id: Number(r.id),
        filename: r.filename as string,
        timestamp: toDateRequired(r.timestamp),
        count: Number(r.count),
        startDate: toDate(r.startDate),
        endDate: toDate(r.endDate),
      })),
    });
  }
  console.log(`${fmt(rows.length)} rows`);
}

async function migrateTransaction() {
  process.stdout.write('Transaction ... ');
  const rows = await sql('SELECT * FROM "Transaction"');
  if (rows.length === 0) { console.log('0 rows (skip)'); return; }
  for (const chunk of chunkArray(rows, 200)) {
    await prisma.transaction.createMany({
      data: chunk.map(r => ({
        id: Number(r.id),
        date: toDateRequired(r.date),
        symbol: r.symbol as string,
        type: r.type as string,
        quantity: Number(r.quantity),
        price: Number(r.price),
        orderId: r.orderId as string | null,
        createdAt: toDateRequired(r.createdAt),
        splitRatio: r.splitRatio != null ? Number(r.splitRatio) : null,
        newSymbol: r.newSymbol as string | null,
        description: r.description as string | null,
        importBatchId: r.importBatchId != null ? Number(r.importBatchId) : null,
      })),
    });
  }
  console.log(`${fmt(rows.length)} rows`);
}

async function migrateStockHistory() {
  process.stdout.write('StockHistory ... ');
  const rows = await sql('SELECT * FROM "StockHistory"');
  if (rows.length === 0) { console.log('0 rows (skip)'); return; }
  let migrated = 0;
  for (const chunk of chunkArray(rows, 500)) {
    await prisma.stockHistory.createMany({
      data: chunk.map(r => ({
        id: Number(r.id),
        date: toDateRequired(r.date),
        symbol: r.symbol as string,
        close: Number(r.close),
      })),
    });
    migrated += chunk.length;
    process.stdout.write(`\rStockHistory ... ${fmt(migrated)}/${fmt(rows.length)}`);
  }
  console.log(` ✓`);
}

async function migrateIndexHistory() {
  process.stdout.write('IndexHistory ... ');
  const rows = await sql('SELECT * FROM "IndexHistory"');
  if (rows.length === 0) { console.log('0 rows (skip)'); return; }
  let migrated = 0;
  for (const chunk of chunkArray(rows, 500)) {
    await prisma.indexHistory.createMany({
      data: chunk.map(r => ({
        date: toDateRequired(r.date),
        symbol: r.symbol as string,
        close: Number(r.close),
      })),
    });
    migrated += chunk.length;
    process.stdout.write(`\rIndexHistory ... ${fmt(migrated)}/${fmt(rows.length)}`);
  }
  console.log(` ✓`);
}

async function migrateDailyPortfolioSnapshot() {
  process.stdout.write('DailyPortfolioSnapshot ... ');
  const rows = await sql('SELECT * FROM "DailyPortfolioSnapshot"');
  if (rows.length === 0) { console.log('0 rows (skip)'); return; }
  for (const chunk of chunkArray(rows, 200)) {
    await prisma.dailyPortfolioSnapshot.createMany({
      data: chunk.map(r => ({
        id: Number(r.id),
        date: toDateRequired(r.date),
        totalEquity: Number(r.totalEquity),
        investedCapital: Number(r.investedCapital),
        portfolioNAV: Number(r.portfolioNAV),
        niftyNAV: r.niftyNAV != null ? Number(r.niftyNAV) : null,
        units: Number(r.units),
        cashflow: r.cashflow != null ? Number(r.cashflow) : null,
        dailyPnL: r.dailyPnL != null ? Number(r.dailyPnL) : null,
        dailyReturn: r.dailyReturn != null ? Number(r.dailyReturn) : null,
        drawdown: r.drawdown != null ? Number(r.drawdown) : null,
        navMA200: r.navMA200 != null ? Number(r.navMA200) : null,
        nifty500Momentum50NAV: r.nifty500Momentum50NAV != null ? Number(r.nifty500Momentum50NAV) : null,
        niftyMicrocap250NAV: r.niftyMicrocap250NAV != null ? Number(r.niftyMicrocap250NAV) : null,
        niftyMidcap100NAV: r.niftyMidcap100NAV != null ? Number(r.niftyMidcap100NAV) : null,
        niftySmallcap250NAV: r.niftySmallcap250NAV != null ? Number(r.niftySmallcap250NAV) : null,
      })),
    });
  }
  console.log(`${fmt(rows.length)} rows`);
}

async function migrateWeeklyPortfolioSnapshot() {
  process.stdout.write('WeeklyPortfolioSnapshot ... ');
  const rows = await sql('SELECT * FROM "WeeklyPortfolioSnapshot"');
  if (rows.length === 0) { console.log('0 rows (skip)'); return; }
  for (const chunk of chunkArray(rows, 200)) {
    await prisma.weeklyPortfolioSnapshot.createMany({
      data: chunk.map(r => ({
        id: Number(r.id),
        date: toDateRequired(r.date),
        totalEquity: Number(r.totalEquity),
        nav: Number(r.nav),
        weeklyReturn: r.weeklyReturn != null ? Number(r.weeklyReturn) : null,
        largeCapPercent: r.largeCapPercent != null ? Number(r.largeCapPercent) : null,
        midCapPercent: r.midCapPercent != null ? Number(r.midCapPercent) : null,
        smallCapPercent: r.smallCapPercent != null ? Number(r.smallCapPercent) : null,
        microCapPercent: r.microCapPercent != null ? Number(r.microCapPercent) : null,
        marketCap: r.marketCap != null ? Number(r.marketCap) : null,
        xirr: r.xirr != null ? Number(r.xirr) : null,
        pnl: r.pnl != null ? Number(r.pnl) : null,
        winPercent: r.winPercent != null ? Number(r.winPercent) : null,
        lossPercent: r.lossPercent != null ? Number(r.lossPercent) : null,
        avgHoldingPeriod: r.avgHoldingPeriod != null ? Number(r.avgHoldingPeriod) : null,
        avgWinnerGain: r.avgWinnerGain != null ? Number(r.avgWinnerGain) : null,
        avgLoserLoss: r.avgLoserLoss != null ? Number(r.avgLoserLoss) : null,
        sectorAllocation: r.sectorAllocation as string | null,
      })),
    });
  }
  console.log(`${fmt(rows.length)} rows`);
}

async function migrateMonthlyPortfolioSnapshot() {
  process.stdout.write('MonthlyPortfolioSnapshot ... ');
  const rows = await sql('SELECT * FROM "MonthlyPortfolioSnapshot"');
  if (rows.length === 0) { console.log('0 rows (skip)'); return; }
  for (const chunk of chunkArray(rows, 200)) {
    await prisma.monthlyPortfolioSnapshot.createMany({
      data: chunk.map(r => ({
        id: Number(r.id),
        date: toDateRequired(r.date),
        totalEquity: Number(r.totalEquity),
        nav: Number(r.nav),
        monthlyReturn: r.monthlyReturn != null ? Number(r.monthlyReturn) : null,
        largeCapPercent: r.largeCapPercent != null ? Number(r.largeCapPercent) : null,
        midCapPercent: r.midCapPercent != null ? Number(r.midCapPercent) : null,
        smallCapPercent: r.smallCapPercent != null ? Number(r.smallCapPercent) : null,
        microCapPercent: r.microCapPercent != null ? Number(r.microCapPercent) : null,
        marketCap: r.marketCap != null ? Number(r.marketCap) : null,
        xirr: r.xirr != null ? Number(r.xirr) : null,
        pnl: r.pnl != null ? Number(r.pnl) : null,
        winPercent: r.winPercent != null ? Number(r.winPercent) : null,
        lossPercent: r.lossPercent != null ? Number(r.lossPercent) : null,
        avgHoldingPeriod: r.avgHoldingPeriod != null ? Number(r.avgHoldingPeriod) : null,
        avgWinnerGain: r.avgWinnerGain != null ? Number(r.avgWinnerGain) : null,
        avgLoserLoss: r.avgLoserLoss != null ? Number(r.avgLoserLoss) : null,
        exitCount: r.exitCount != null ? Number(r.exitCount) : 0,
        avgExitsPerMonth: r.avgExitsPerMonth != null ? Number(r.avgExitsPerMonth) : 0,
        sectorAllocation: r.sectorAllocation as string | null,
      })),
    });
  }
  console.log(`${fmt(rows.length)} rows`);
}

async function migrateIntradayPnL() {
  process.stdout.write('IntradayPnL ... ');
  const rows = await sql('SELECT * FROM "IntradayPnL"');
  if (rows.length === 0) { console.log('0 rows (skip)'); return; }
  for (const chunk of chunkArray(rows, 500)) {
    await prisma.intradayPnL.createMany({
      data: chunk.map(r => ({
        id: Number(r.id),
        timestamp: toDateRequired(r.timestamp),
        date: toDateRequired(r.date),
        pnl: Number(r.pnl),
        percent: Number(r.percent),
      })),
    });
  }
  console.log(`${fmt(rows.length)} rows`);
}

async function migrateScreenerPrice() {
  process.stdout.write('ScreenerPrice (large table) ...\n');
  const countResult = await sql('SELECT COUNT(*) as cnt FROM "ScreenerPrice"');
  const total = Number(countResult[0].cnt);
  console.log(`  Total rows: ${fmt(total)}`);

  const existing = await prisma.screenerPrice.count();
  let startOffset = 0;
  if (existing > 0) {
    const maxIdRow = await prisma.$queryRaw<[{ max: number }]>`SELECT MAX(id) as max FROM "ScreenerPrice"`;
    const maxId = Number(maxIdRow[0].max);
    startOffset = existing;
    console.log(`  Resuming: ${fmt(existing)} rows already in Turso (max id=${fmt(maxId)}), fetching from Neon id > ${fmt(maxId)}`);

    const pageSize = 5000;
    let lastId = maxId;
    let migrated = existing;

    while (true) {
      const rows = await sql(`SELECT * FROM "ScreenerPrice" WHERE id > ${lastId} ORDER BY id LIMIT ${pageSize}`);
      if (rows.length === 0) break;

      for (const chunk of chunkArray(rows, 500)) {
        await withRetry(() => prisma.screenerPrice.createMany({
          data: chunk.map(r => ({
            id: Number(r.id),
            symbol: r.symbol as string,
            instrumentKey: r.instrumentKey as string,
            date: r.date as string,
            open: Number(r.open),
            high: Number(r.high),
            low: Number(r.low),
            close: Number(r.close),
            volume: Number(r.volume),
          })),
        }));
      }

      lastId = Number(rows[rows.length - 1].id);
      migrated += rows.length;
      process.stdout.write(`\r  Progress: ${fmt(migrated)}/${fmt(total)} (${Math.round(migrated / total * 100)}%)`);
    }
    console.log(`\n  ScreenerPrice done ✓`);
    return;
  }

  const pageSize = 5000;
  let offset = startOffset;
  let migrated = 0;

  while (offset < total) {
    const rows = await sql(`SELECT * FROM "ScreenerPrice" ORDER BY id LIMIT ${pageSize} OFFSET ${offset}`);
    if (rows.length === 0) break;

    for (const chunk of chunkArray(rows, 500)) {
      await withRetry(() => prisma.screenerPrice.createMany({
        data: chunk.map(r => ({
          id: Number(r.id),
          symbol: r.symbol as string,
          instrumentKey: r.instrumentKey as string,
          date: r.date as string,
          open: Number(r.open),
          high: Number(r.high),
          low: Number(r.low),
          close: Number(r.close),
          volume: Number(r.volume),
        })),
      }));
    }

    migrated += rows.length;
    offset += pageSize;
    process.stdout.write(`\r  Progress: ${fmt(migrated)}/${fmt(total)} (${Math.round(migrated / total * 100)}%)`);
  }
  console.log(`\n  ScreenerPrice done ✓`);
}

async function migrateStockATH() {
  process.stdout.write('StockATH ... ');
  const rows = await sql('SELECT * FROM "StockATH"');
  if (rows.length === 0) { console.log('0 rows (skip)'); return; }
  for (const chunk of chunkArray(rows, 500)) {
    await prisma.stockATH.createMany({
      data: chunk.map(r => ({
        symbol: r.symbol as string,
        instrumentKey: r.instrumentKey as string,
        ath: Number(r.ath),
        athDate: r.athDate as string,
        updatedAt: toDateRequired(r.updatedAt),
      })),
    });
  }
  console.log(`${fmt(rows.length)} rows`);
}

async function migrateStockMarketCap() {
  process.stdout.write('StockMarketCap ... ');
  const rows = await sql('SELECT * FROM "StockMarketCap"');
  if (rows.length === 0) { console.log('0 rows (skip)'); return; }
  for (const chunk of chunkArray(rows, 500)) {
    await prisma.stockMarketCap.createMany({
      data: chunk.map(r => ({
        symbol: r.symbol as string,
        marketCap: Number(r.marketCap),
        updatedAt: toDateRequired(r.updatedAt),
      })),
    });
  }
  console.log(`${fmt(rows.length)} rows`);
}

async function migrateMomentumScore() {
  process.stdout.write('MomentumScore (paginated) ...\n');
  const countResult = await sql('SELECT COUNT(*) as cnt FROM "MomentumScore"');
  const total = Number(countResult[0].cnt || Object.values(countResult[0])[0]);
  if (total === 0) { console.log('  0 rows (skip)'); return; }
  console.log(`  Total rows: ${fmt(total)}`);

  const pageSize = 2000;
  let offset = 0;
  let migrated = 0;

  while (offset < total) {
    const rows = await sql(`SELECT * FROM "MomentumScore" ORDER BY id LIMIT ${pageSize} OFFSET ${offset}`);
    if (rows.length === 0) break;

    for (const chunk of chunkArray(rows, 200)) {
      await withRetry(() => prisma.momentumScore.createMany({
        data: chunk.map(r => ({
          id: Number(r.id),
          computedDate: r.computedDate as string,
          symbol: r.symbol as string,
          instrumentKey: r.instrumentKey as string,
          companyName: r.companyName as string,
          rank: Number(r.rank),
          compositeScore: Number(r.compositeScore),
          avgSharpe: Number(r.avgSharpe),
          sharpe12m: Number(r.sharpe12m),
          sharpe6m: Number(r.sharpe6m),
          sharpe3m: Number(r.sharpe3m),
          athProximity: Number(r.athProximity),
          ath: Number(r.ath),
          currentPrice: Number(r.currentPrice),
          dma200: Number(r.dma200),
          aboveDma200Pct: Number(r.aboveDma200Pct),
          aboveDma10: Boolean(r.aboveDma10),
          aboveDma20: Boolean(r.aboveDma20),
          aboveDma50: Boolean(r.aboveDma50),
          aboveDma100: Boolean(r.aboveDma100),
          medianTurnoverCr: Number(r.medianTurnoverCr),
          marketCapCr: Number(r.marketCapCr),
          marketCapCategory: r.marketCapCategory as string | null,
          sparklineData: r.sparklineData as string | null,
          circuitBandPct: r.circuitBandPct != null ? Number(r.circuitBandPct) : null,
          prevRank: r.prevRank != null ? Number(r.prevRank) : null,
          avgRank50d: r.avgRank50d != null ? Number(r.avgRank50d) : null,
          bestRank: r.bestRank != null ? Number(r.bestRank) : null,
          appearances: Number(r.appearances ?? 0),
          t50Pct: Number(r.t50Pct ?? 0),
          t100Pct: Number(r.t100Pct ?? 0),
          rankType: (r.rankType as string) ?? 'filtered',
          isActive: Boolean(r.isActive ?? true),
        })),
      }));
    }

    migrated += rows.length;
    offset += pageSize;
    process.stdout.write(`\r  Progress: ${fmt(migrated)}/${fmt(total)} (${Math.round(migrated / total * 100)}%)`);
  }
  console.log(`\n  MomentumScore done ✓`);
}

async function migrateRankingHistory() {
  process.stdout.write('RankingHistory (paginated) ...\n');
  const countResult = await sql('SELECT COUNT(*) as cnt FROM "RankingHistory"');
  const total = Number(countResult[0].cnt || Object.values(countResult[0])[0]);
  if (total === 0) { console.log('  0 rows (skip)'); return; }
  console.log(`  Total rows: ${fmt(total)}`);

  const pageSize = 5000;
  let offset = 0;
  let migrated = 0;

  while (offset < total) {
    const rows = await sql(`SELECT * FROM "RankingHistory" ORDER BY id LIMIT ${pageSize} OFFSET ${offset}`);
    if (rows.length === 0) break;

    for (const chunk of chunkArray(rows, 500)) {
      await withRetry(() => prisma.rankingHistory.createMany({
        data: chunk.map(r => ({
          id: Number(r.id),
          symbol: r.symbol as string,
          date: r.date as string,
          rank: Number(r.rank),
          compositeScore: Number(r.compositeScore),
          rankType: (r.rankType as string) ?? 'filtered',
        })),
      }));
    }

    migrated += rows.length;
    offset += pageSize;
    process.stdout.write(`\r  Progress: ${fmt(migrated)}/${fmt(total)} (${Math.round(migrated / total * 100)}%)`);
  }
  console.log(`\n  RankingHistory done ✓`);
}

async function migrateScreenerDemerger() {
  process.stdout.write('ScreenerDemerger ... ');
  const rows = await sql('SELECT * FROM "ScreenerDemerger"');
  if (rows.length === 0) { console.log('0 rows (skip)'); return; }
  for (const chunk of chunkArray(rows, 200)) {
    await prisma.screenerDemerger.createMany({
      data: chunk.map(r => ({
        id: Number(r.id),
        symbol: r.symbol as string,
        exDate: r.exDate as string,
        ratio: Number(r.ratio),
        appliedAt: toDateRequired(r.appliedAt),
      })),
    });
  }
  console.log(`${fmt(rows.length)} rows`);
}

async function migrateDividend() {
  process.stdout.write('Dividend ... ');
  const rows = await sql('SELECT * FROM "Dividend"');
  if (rows.length === 0) { console.log('0 rows (skip)'); return; }
  for (const chunk of chunkArray(rows, 200)) {
    await prisma.dividend.createMany({
      data: chunk.map(r => ({
        id: Number(r.id),
        isin: r.isin as string,
        symbol: r.symbol as string | null,
        exDate: toDateRequired(r.exDate),
        payDate: toDate(r.payDate),
        amount: Number(r.amount),
        dps: r.dps != null ? Number(r.dps) : null,
        quantity: r.quantity != null ? Number(r.quantity) : null,
        fiscalYear: r.fiscalYear as string,
        quarter: r.quarter as string | null,
        source: (r.source as string) ?? 'zerodha_taxpnl',
        createdAt: toDateRequired(r.createdAt),
        updatedAt: toDateRequired(r.updatedAt),
      })),
    });
  }
  console.log(`${fmt(rows.length)} rows`);
}

// ---------------------------------------------------------------------------
// Verify row counts
// ---------------------------------------------------------------------------

async function verifyRowCounts() {
  console.log('\n=== Verification: Row Counts ===');
  const tables = [
    { name: 'AppConfig', neonSql: 'SELECT COUNT(*) FROM "AppConfig"', tursoFn: () => prisma.appConfig.count() },
    { name: 'SymbolMapping', neonSql: 'SELECT COUNT(*) FROM "SymbolMapping"', tursoFn: () => prisma.symbolMapping.count() },
    { name: 'SectorMapping', neonSql: 'SELECT COUNT(*) FROM "SectorMapping"', tursoFn: () => prisma.sectorMapping.count() },
    { name: 'AMFIClassification', neonSql: 'SELECT COUNT(*) FROM "AMFIClassification"', tursoFn: () => prisma.aMFIClassification.count() },
    { name: 'AMFIImportHistory', neonSql: 'SELECT COUNT(*) FROM "AMFIImportHistory"', tursoFn: () => prisma.aMFIImportHistory.count() },
    { name: 'UpstoxToken', neonSql: 'SELECT COUNT(*) FROM "UpstoxToken"', tursoFn: () => prisma.upstoxToken.count() },
    { name: 'Job', neonSql: 'SELECT COUNT(*) FROM "Job"', tursoFn: () => prisma.job.count() },
    { name: 'ImportBatch', neonSql: 'SELECT COUNT(*) FROM "ImportBatch"', tursoFn: () => prisma.importBatch.count() },
    { name: 'Transaction', neonSql: 'SELECT COUNT(*) FROM "Transaction"', tursoFn: () => prisma.transaction.count() },
    { name: 'StockHistory', neonSql: 'SELECT COUNT(*) FROM "StockHistory"', tursoFn: () => prisma.stockHistory.count() },
    { name: 'IndexHistory', neonSql: 'SELECT COUNT(*) FROM "IndexHistory"', tursoFn: () => prisma.indexHistory.count() },
    { name: 'DailyPortfolioSnapshot', neonSql: 'SELECT COUNT(*) FROM "DailyPortfolioSnapshot"', tursoFn: () => prisma.dailyPortfolioSnapshot.count() },
    { name: 'WeeklyPortfolioSnapshot', neonSql: 'SELECT COUNT(*) FROM "WeeklyPortfolioSnapshot"', tursoFn: () => prisma.weeklyPortfolioSnapshot.count() },
    { name: 'MonthlyPortfolioSnapshot', neonSql: 'SELECT COUNT(*) FROM "MonthlyPortfolioSnapshot"', tursoFn: () => prisma.monthlyPortfolioSnapshot.count() },
    { name: 'IntradayPnL', neonSql: 'SELECT COUNT(*) FROM "IntradayPnL"', tursoFn: () => prisma.intradayPnL.count() },
    { name: 'ScreenerPrice', neonSql: 'SELECT COUNT(*) FROM "ScreenerPrice"', tursoFn: () => prisma.screenerPrice.count() },
    { name: 'StockATH', neonSql: 'SELECT COUNT(*) FROM "StockATH"', tursoFn: () => prisma.stockATH.count() },
    { name: 'StockMarketCap', neonSql: 'SELECT COUNT(*) FROM "StockMarketCap"', tursoFn: () => prisma.stockMarketCap.count() },
    { name: 'MomentumScore', neonSql: 'SELECT COUNT(*) FROM "MomentumScore"', tursoFn: () => prisma.momentumScore.count() },
    { name: 'RankingHistory', neonSql: 'SELECT COUNT(*) FROM "RankingHistory"', tursoFn: () => prisma.rankingHistory.count() },
    { name: 'ScreenerDemerger', neonSql: 'SELECT COUNT(*) FROM "ScreenerDemerger"', tursoFn: () => prisma.screenerDemerger.count() },
    { name: 'Dividend', neonSql: 'SELECT COUNT(*) FROM "Dividend"', tursoFn: () => prisma.dividend.count() },
  ];

  let allMatch = true;
  for (const t of tables) {
    try {
      const neonResult = await sql(t.neonSql);
      const neonCount = Number(neonResult[0].count || neonResult[0].cnt || Object.values(neonResult[0])[0]);
      const tursoCount = await t.tursoFn();
      const match = neonCount === tursoCount ? '✓' : '✗ MISMATCH';
      if (neonCount !== tursoCount) allMatch = false;
      console.log(`  ${t.name.padEnd(30)} Neon: ${fmt(neonCount).padStart(8)}  Turso: ${fmt(tursoCount).padStart(8)}  ${match}`);
    } catch (e) {
      console.log(`  ${t.name.padEnd(30)} ERROR: ${e}`);
    }
  }

  if (allMatch) {
    console.log('\n✅ All row counts match!');
  } else {
    console.log('\n⚠️  Some counts differ — check above for details.');
  }
}

async function cleanupTurso() {
  console.log('🧹 Cleaning up existing data in Turso (except ScreenerPrice)...');
  const tables = [
    'dividend', 'screenerDemerger', 'rankingHistory', 'momentumScore',
    'stockMarketCap', 'stockATH', 'intradayPnL', 'monthlyPortfolioSnapshot',
    'weeklyPortfolioSnapshot', 'dailyPortfolioSnapshot', 'indexHistory',
    'stockHistory', 'transaction', 'importBatch', 'job', 'upstoxToken',
    'aMFIImportHistory', 'aMFIClassification', 'sectorMapping', 'symbolMapping'
  ];
  
  for (const table of tables) {
    try {
      if ((prisma as any)[table]) {
        await (prisma as any)[table].deleteMany();
      }
    } catch (e: any) {
      console.warn(`[Cleanup Warning] Could not clear ${table}:`, e.message || e);
    }
    await new Promise(resolve => setTimeout(resolve, 100)); // sleep 100ms to avoid SQLite lock congestion
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const dbModule = await import('../src/lib/db');
  prisma = dbModule.prisma;
  chunkArray = dbModule.chunkArray;

  const verifyOnly = process.argv.includes('--verify');

  if (verifyOnly) {
    console.log('=== Verify Only Mode ===');
    await verifyRowCounts();
    await prisma.$disconnect();
    return;
  }

  console.log('=== Neon Postgres → Turso Migration ===\n');
  console.log(`Source (Neon): ${NEON_URL.substring(0, 50)}...`);
  console.log(`Target (Turso): ${process.env.DATABASE_URL?.substring(0, 50)}...\n`);
  console.log('Migrating tables (in dependency order):\n');

  await cleanupTurso();
  
  // Re-initialize a fresh Prisma Client connection to avoid transaction corruption from cleanups
  console.log('🔄 Re-initializing Prisma connection pool...');
  try {
    await prisma.$disconnect();
  } catch {}
  await new Promise(resolve => setTimeout(resolve, 500));
  
  const { PrismaClient } = await import('@prisma/client');
  const { PrismaLibSql } = await import('@prisma/adapter-libsql');
  prisma = new PrismaClient({
    adapter: new PrismaLibSql({
      url: process.env.DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN,
    })
  });

  const start = Date.now();

  // Independent lookup tables first
  await migrateAppConfig();
  await migrateSymbolMapping();
  await migrateSectorMapping();
  await migrateAMFIClassification();
  await migrateAMFIImportHistory();
  await migrateUpstoxToken();
  await migrateJob();

  // ImportBatch must come before Transaction (FK)
  await migrateImportBatch();
  await migrateTransaction();

  // Time-series data
  await migrateStockHistory();
  await migrateIndexHistory();
  await migrateDailyPortfolioSnapshot();
  await migrateWeeklyPortfolioSnapshot();
  await migrateMonthlyPortfolioSnapshot();
  await migrateIntradayPnL();

  // Screener data
  await migrateScreenerPrice();
  await migrateStockATH();
  await migrateStockMarketCap();
  await migrateMomentumScore();
  await migrateRankingHistory();
  await migrateScreenerDemerger();
  await migrateDividend();

  const elapsed = Math.round((Date.now() - start) / 1000);
  console.log(`\n✅ Migration complete in ${elapsed}s`);

  await verifyRowCounts();

  await prisma.$disconnect();
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
