/**
 * One-time data migration: Turso (libsql/SQLite) → Neon Postgres
 *
 * Usage:
 *   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=eyJ... npx tsx scripts/migrate-turso-to-neon.ts
 *
 * Or set them in .env.local alongside the new DATABASE_URL (Neon):
 *   TURSO_DATABASE_URL=libsql://alpha-portfolio-<user>.turso.io
 *   TURSO_AUTH_TOKEN=eyJhb...
 *   DATABASE_URL=postgresql://...@....neon.tech/...?sslmode=require
 *
 * If Turso returns SELF_SIGNED_CERT_IN_CHAIN (corporate TLS inspection), the script
 * sets NODE_TLS_REJECT_UNAUTHORIZED=0 automatically — safe for this local one-time use.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { createClient } from '@libsql/client';
import { prisma, chunkArray } from './lib/db';

const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

if (!TURSO_URL) throw new Error('Missing TURSO_DATABASE_URL env var');
if (!TURSO_TOKEN) throw new Error('Missing TURSO_AUTH_TOKEN env var');

const turso = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert SQLite ISO string → JS Date (handles both "2024-01-15T..." and "2024-01-15 ...") */
function toDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  return new Date(v.replace(' ', 'T'));
}

function toDateRequired(v: string | null | undefined): Date {
  if (!v) throw new Error(`Expected date, got ${v}`);
  return new Date(v.replace(' ', 'T'));
}

async function queryAll(sql: string): Promise<Record<string, unknown>[]> {
  // Bypass TLS cert inspection proxy only for the Turso HTTP call, then restore
  const saved = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  let result: Awaited<ReturnType<typeof turso.execute>>;
  try {
    result = await turso.execute(sql);
  } finally {
    if (saved === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = saved;
  }
  return result.rows.map((row) => {
    const obj: Record<string, unknown> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result.columns.forEach((col: string, i: number) => { obj[col] = (row as any)[i]; });
    return obj;
  });
}

function fmt(n: number): string {
  return n.toLocaleString();
}

// ---------------------------------------------------------------------------
// Table migrations (in dependency order)
// ---------------------------------------------------------------------------

async function migrateAppConfig() {
  process.stdout.write('AppConfig ... ');
  const rows = await queryAll('SELECT key, value, updatedAt FROM AppConfig');
  if (rows.length === 0) { console.log('0 rows (skip)'); return; }
  for (const r of rows) {
    await prisma.appConfig.upsert({
      where: { key: r.key as string },
      create: { key: r.key as string, value: r.value as string, updatedAt: toDateRequired(r.updatedAt as string) },
      update: { value: r.value as string, updatedAt: toDateRequired(r.updatedAt as string) },
    });
  }
  console.log(`${fmt(rows.length)} rows`);
}

async function migrateSymbolMapping() {
  process.stdout.write('SymbolMapping ... ');
  const rows = await queryAll('SELECT id, oldSymbol, newSymbol, createdAt FROM SymbolMapping');
  if (rows.length === 0) { console.log('0 rows (skip)'); return; }
  for (const chunk of chunkArray(rows, 200)) {
    await prisma.symbolMapping.createMany({
      data: chunk.map(r => ({
        oldSymbol: r.oldSymbol as string,
        newSymbol: r.newSymbol as string,
        createdAt: toDateRequired(r.createdAt as string),
      })),
      skipDuplicates: true,
    });
  }
  console.log(`${fmt(rows.length)} rows`);
}

async function migrateSectorMapping() {
  process.stdout.write('SectorMapping ... ');
  const rows = await queryAll('SELECT id, symbol, sector, exchange, updatedAt FROM SectorMapping');
  if (rows.length === 0) { console.log('0 rows (skip)'); return; }
  for (const chunk of chunkArray(rows, 200)) {
    await prisma.sectorMapping.createMany({
      data: chunk.map(r => ({
        symbol: r.symbol as string,
        sector: r.sector as string,
        exchange: (r.exchange as string) ?? 'NSE',
        updatedAt: toDateRequired(r.updatedAt as string),
      })),
      skipDuplicates: true,
    });
  }
  console.log(`${fmt(rows.length)} rows`);
}

async function migrateAMFIClassification() {
  process.stdout.write('AMFIClassification ... ');
  const rows = await queryAll('SELECT * FROM AMFIClassification');
  if (rows.length === 0) { console.log('0 rows (skip)'); return; }
  for (const chunk of chunkArray(rows, 200)) {
    await prisma.aMFIClassification.createMany({
      data: chunk.map(r => ({
        period: r.period as string,
        rank: Number(r.rank),
        companyName: r.companyName as string,
        symbol: r.symbol as string,
        isin: r.isin as string,
        category: r.category as string,
        avgMarketCap: Number(r.avgMarketCap),
        createdAt: toDateRequired(r.createdAt as string),
        updatedAt: toDateRequired(r.updatedAt as string),
      })),
      skipDuplicates: true,
    });
  }
  console.log(`${fmt(rows.length)} rows`);
}

async function migrateAMFIImportHistory() {
  process.stdout.write('AMFIImportHistory ... ');
  const rows = await queryAll('SELECT * FROM AMFIImportHistory');
  if (rows.length === 0) { console.log('0 rows (skip)'); return; }
  for (const chunk of chunkArray(rows, 200)) {
    await prisma.aMFIImportHistory.createMany({
      data: chunk.map(r => ({
        period: r.period as string,
        sourceFile: r.sourceFile as string,
        stockCount: Number(r.stockCount),
        largeCapCount: Number(r.largeCapCount),
        midCapCount: Number(r.midCapCount),
        smallCapCount: Number(r.smallCapCount),
        microCapCount: Number(r.microCapCount),
        importedAt: toDateRequired(r.importedAt as string),
      })),
      skipDuplicates: true,
    });
  }
  console.log(`${fmt(rows.length)} rows`);
}

async function migrateUpstoxToken() {
  process.stdout.write('UpstoxToken ... ');
  const rows = await queryAll('SELECT * FROM UpstoxToken');
  if (rows.length === 0) { console.log('0 rows (skip)'); return; }
  for (const chunk of chunkArray(rows, 200)) {
    await prisma.upstoxToken.createMany({
      data: chunk.map(r => ({
        id: Number(r.id),
        accessToken: r.accessToken as string,
        expiresAt: toDateRequired(r.expiresAt as string),
        issuedAt: toDateRequired(r.issuedAt as string),
        userId: r.userId as string | null,
        createdAt: toDateRequired(r.createdAt as string),
      })),
      skipDuplicates: true,
    });
  }
  console.log(`${fmt(rows.length)} rows`);
}

async function migrateJob() {
  process.stdout.write('Job ... ');
  const rows = await queryAll('SELECT * FROM Job');
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
        createdAt: toDateRequired(r.createdAt as string),
        updatedAt: toDateRequired(r.updatedAt as string),
      })),
      skipDuplicates: true,
    });
  }
  console.log(`${fmt(rows.length)} rows`);
}

async function migrateImportBatch() {
  process.stdout.write('ImportBatch ... ');
  const rows = await queryAll('SELECT * FROM ImportBatch');
  if (rows.length === 0) { console.log('0 rows (skip)'); return; }
  for (const chunk of chunkArray(rows, 200)) {
    await prisma.importBatch.createMany({
      data: chunk.map(r => ({
        id: Number(r.id),
        filename: r.filename as string,
        timestamp: toDateRequired(r.timestamp as string),
        count: Number(r.count),
        startDate: toDate(r.startDate as string),
        endDate: toDate(r.endDate as string),
      })),
      skipDuplicates: true,
    });
  }
  console.log(`${fmt(rows.length)} rows`);
}

async function migrateTransaction() {
  process.stdout.write('Transaction ... ');
  const rows = await queryAll('SELECT * FROM "Transaction"');
  if (rows.length === 0) { console.log('0 rows (skip)'); return; }
  for (const chunk of chunkArray(rows, 200)) {
    await prisma.transaction.createMany({
      data: chunk.map(r => ({
        id: Number(r.id),
        date: toDateRequired(r.date as string),
        symbol: r.symbol as string,
        type: r.type as string,
        quantity: Number(r.quantity),
        price: Number(r.price),
        orderId: r.orderId as string | null,
        createdAt: toDateRequired(r.createdAt as string),
        splitRatio: r.splitRatio != null ? Number(r.splitRatio) : null,
        newSymbol: r.newSymbol as string | null,
        description: r.description as string | null,
        importBatchId: r.importBatchId != null ? Number(r.importBatchId) : null,
      })),
      skipDuplicates: true,
    });
  }
  console.log(`${fmt(rows.length)} rows`);
}

async function migrateStockHistory() {
  process.stdout.write('StockHistory ... ');
  const rows = await queryAll('SELECT id, date, symbol, close FROM StockHistory');
  let migrated = 0;
  for (const chunk of chunkArray(rows, 500)) {
    await prisma.stockHistory.createMany({
      data: chunk.map(r => ({
        id: Number(r.id),
        date: toDateRequired(r.date as string),
        symbol: r.symbol as string,
        close: Number(r.close),
      })),
      skipDuplicates: true,
    });
    migrated += chunk.length;
    process.stdout.write(`\rStockHistory ... ${fmt(migrated)}/${fmt(rows.length)}`);
  }
  console.log(` ✓`);
}

async function migrateIndexHistory() {
  process.stdout.write('IndexHistory ... ');
  const rows = await queryAll('SELECT date, symbol, close FROM IndexHistory');
  let migrated = 0;
  for (const chunk of chunkArray(rows, 500)) {
    await prisma.indexHistory.createMany({
      data: chunk.map(r => ({
        date: toDateRequired(r.date as string),
        symbol: r.symbol as string,
        close: Number(r.close),
      })),
      skipDuplicates: true,
    });
    migrated += chunk.length;
    process.stdout.write(`\rIndexHistory ... ${fmt(migrated)}/${fmt(rows.length)}`);
  }
  console.log(` ✓`);
}

async function migrateDailyPortfolioSnapshot() {
  process.stdout.write('DailyPortfolioSnapshot ... ');
  const rows = await queryAll('SELECT * FROM DailyPortfolioSnapshot');
  if (rows.length === 0) { console.log('0 rows (skip)'); return; }
  for (const chunk of chunkArray(rows, 200)) {
    await prisma.dailyPortfolioSnapshot.createMany({
      data: chunk.map(r => ({
        id: Number(r.id),
        date: toDateRequired(r.date as string),
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
      skipDuplicates: true,
    });
  }
  console.log(`${fmt(rows.length)} rows`);
}

async function migrateWeeklyPortfolioSnapshot() {
  process.stdout.write('WeeklyPortfolioSnapshot ... ');
  const rows = await queryAll('SELECT * FROM WeeklyPortfolioSnapshot');
  if (rows.length === 0) { console.log('0 rows (skip)'); return; }
  for (const chunk of chunkArray(rows, 200)) {
    await prisma.weeklyPortfolioSnapshot.createMany({
      data: chunk.map(r => ({
        id: Number(r.id),
        date: toDateRequired(r.date as string),
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
      skipDuplicates: true,
    });
  }
  console.log(`${fmt(rows.length)} rows`);
}

async function migrateMonthlyPortfolioSnapshot() {
  process.stdout.write('MonthlyPortfolioSnapshot ... ');
  const rows = await queryAll('SELECT * FROM MonthlyPortfolioSnapshot');
  if (rows.length === 0) { console.log('0 rows (skip)'); return; }
  for (const chunk of chunkArray(rows, 200)) {
    await prisma.monthlyPortfolioSnapshot.createMany({
      data: chunk.map(r => ({
        id: Number(r.id),
        date: toDateRequired(r.date as string),
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
      skipDuplicates: true,
    });
  }
  console.log(`${fmt(rows.length)} rows`);
}

async function migrateIntradayPnL() {
  process.stdout.write('IntradayPnL ... ');
  const rows = await queryAll('SELECT * FROM IntradayPnL');
  if (rows.length === 0) { console.log('0 rows (skip)'); return; }
  for (const chunk of chunkArray(rows, 500)) {
    await prisma.intradayPnL.createMany({
      data: chunk.map(r => ({
        id: Number(r.id),
        timestamp: toDateRequired(r.timestamp as string),
        date: toDateRequired(r.date as string),
        pnl: Number(r.pnl),
        percent: Number(r.percent),
      })),
      skipDuplicates: true,
    });
  }
  console.log(`${fmt(rows.length)} rows`);
}

async function migrateScreenerPrice() {
  process.stdout.write('ScreenerPrice (large table, resumable) ...\n');
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  const countResult = await turso.execute('SELECT COUNT(*) as cnt FROM ScreenerPrice');
  delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  const total = Number(countResult.rows[0][0]);
  console.log(`  Total rows: ${fmt(total)}`);

  // Resume from where we left off — find the highest id already in Neon
  const existing = await prisma.screenerPrice.count();
  let startOffset = 0;
  if (existing > 0) {
    // Find the max id migrated so far so we can resume by id
    const maxIdRow = await prisma.$queryRaw<[{ max: number }]>`SELECT MAX(id) as max FROM "ScreenerPrice"`;
    const maxId = Number(maxIdRow[0].max);
    startOffset = existing;
    console.log(`  Resuming: ${fmt(existing)} rows already in Neon (max id=${fmt(maxId)}), fetching from Turso id > ${fmt(maxId)}`);

    // Use id-based pagination to resume correctly
    const pageSize = 5000;
    let lastId = maxId;
    let migrated = existing;

    while (true) {
      const rows = await queryAll(`SELECT * FROM ScreenerPrice WHERE id > ${lastId} ORDER BY id LIMIT ${pageSize}`);
      if (rows.length === 0) break;

      for (const chunk of chunkArray(rows, 500)) {
        await prisma.screenerPrice.createMany({
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
          skipDuplicates: true,
        });
      }

      lastId = Number(rows[rows.length - 1].id);
      migrated += rows.length;
      process.stdout.write(`\r  Progress: ${fmt(migrated)}/${fmt(total)} (${Math.round(migrated / total * 100)}%)`);
    }
    console.log(`\n  ScreenerPrice done ✓`);
    return;
  }

  // Fresh start — offset-based pagination
  const pageSize = 5000;
  let offset = startOffset;
  let migrated = 0;

  while (offset < total) {
    const rows = await queryAll(`SELECT * FROM ScreenerPrice ORDER BY id LIMIT ${pageSize} OFFSET ${offset}`);
    if (rows.length === 0) break;

    for (const chunk of chunkArray(rows, 500)) {
      await prisma.screenerPrice.createMany({
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
        skipDuplicates: true,
      });
    }

    migrated += rows.length;
    offset += pageSize;
    process.stdout.write(`\r  Progress: ${fmt(migrated)}/${fmt(total)} (${Math.round(migrated / total * 100)}%)`);
  }
  console.log(`\n  ScreenerPrice done ✓`);
}

async function migrateStockATH() {
  process.stdout.write('StockATH ... ');
  const rows = await queryAll('SELECT * FROM StockATH');
  if (rows.length === 0) { console.log('0 rows (skip)'); return; }
  for (const chunk of chunkArray(rows, 500)) {
    await prisma.stockATH.createMany({
      data: chunk.map(r => ({
        symbol: r.symbol as string,
        instrumentKey: r.instrumentKey as string,
        ath: Number(r.ath),
        athDate: r.athDate as string,
        updatedAt: toDateRequired(r.updatedAt as string),
      })),
      skipDuplicates: true,
    });
  }
  console.log(`${fmt(rows.length)} rows`);
}

async function migrateStockMarketCap() {
  process.stdout.write('StockMarketCap ... ');
  const rows = await queryAll('SELECT * FROM StockMarketCap');
  if (rows.length === 0) { console.log('0 rows (skip)'); return; }
  for (const chunk of chunkArray(rows, 500)) {
    await prisma.stockMarketCap.createMany({
      data: chunk.map(r => ({
        symbol: r.symbol as string,
        marketCap: Number(r.marketCap),
        updatedAt: toDateRequired(r.updatedAt as string),
      })),
      skipDuplicates: true,
    });
  }
  console.log(`${fmt(rows.length)} rows`);
}

async function migrateMomentumScore() {
  process.stdout.write('MomentumScore ... ');
  const rows = await queryAll('SELECT * FROM MomentumScore');
  if (rows.length === 0) { console.log('0 rows (skip)'); return; }
  let migrated = 0;
  for (const chunk of chunkArray(rows, 200)) {
    await prisma.momentumScore.createMany({
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
      skipDuplicates: true,
    });
    migrated += chunk.length;
    process.stdout.write(`\rMomentumScore ... ${fmt(migrated)}/${fmt(rows.length)}`);
  }
  console.log(` ✓`);
}

async function migrateRankingHistory() {
  process.stdout.write('RankingHistory ... ');
  const rows = await queryAll('SELECT * FROM RankingHistory');
  if (rows.length === 0) { console.log('0 rows (skip)'); return; }
  let migrated = 0;
  for (const chunk of chunkArray(rows, 500)) {
    await prisma.rankingHistory.createMany({
      data: chunk.map(r => ({
        id: Number(r.id),
        symbol: r.symbol as string,
        date: r.date as string,
        rank: Number(r.rank),
        compositeScore: Number(r.compositeScore),
        rankType: (r.rankType as string) ?? 'filtered',
      })),
      skipDuplicates: true,
    });
    migrated += chunk.length;
    process.stdout.write(`\rRankingHistory ... ${fmt(migrated)}/${fmt(rows.length)}`);
  }
  console.log(` ✓`);
}

async function migrateScreenerDemerger() {
  // This table is new in Postgres — won't exist in Turso, skip gracefully
  try {
    process.stdout.write('ScreenerDemerger ... ');
    const rows = await queryAll('SELECT * FROM ScreenerDemerger');
    if (rows.length === 0) { console.log('0 rows (skip)'); return; }
    for (const chunk of chunkArray(rows, 200)) {
      await prisma.screenerDemerger.createMany({
        data: chunk.map(r => ({
          id: Number(r.id),
          symbol: r.symbol as string,
          exDate: r.exDate as string,
          ratio: Number(r.ratio),
          appliedAt: toDateRequired(r.appliedAt as string),
        })),
        skipDuplicates: true,
      });
    }
    console.log(`${fmt(rows.length)} rows`);
  } catch {
    console.log('table not in Turso (skip)');
  }
}

// ---------------------------------------------------------------------------
// Verify row counts
// ---------------------------------------------------------------------------

async function verifyRowCounts() {
  console.log('\n=== Verification: Row Counts ===');
  const tables = [
    { name: 'AppConfig', tursoSql: 'SELECT COUNT(*) FROM AppConfig', neonFn: () => prisma.appConfig.count() },
    { name: 'SymbolMapping', tursoSql: 'SELECT COUNT(*) FROM SymbolMapping', neonFn: () => prisma.symbolMapping.count() },
    { name: 'SectorMapping', tursoSql: 'SELECT COUNT(*) FROM SectorMapping', neonFn: () => prisma.sectorMapping.count() },
    { name: 'AMFIClassification', tursoSql: 'SELECT COUNT(*) FROM AMFIClassification', neonFn: () => prisma.aMFIClassification.count() },
    { name: 'AMFIImportHistory', tursoSql: 'SELECT COUNT(*) FROM AMFIImportHistory', neonFn: () => prisma.aMFIImportHistory.count() },
    { name: 'Transaction', tursoSql: 'SELECT COUNT(*) FROM "Transaction"', neonFn: () => prisma.transaction.count() },
    { name: 'ImportBatch', tursoSql: 'SELECT COUNT(*) FROM ImportBatch', neonFn: () => prisma.importBatch.count() },
    { name: 'DailyPortfolioSnapshot', tursoSql: 'SELECT COUNT(*) FROM DailyPortfolioSnapshot', neonFn: () => prisma.dailyPortfolioSnapshot.count() },
    { name: 'WeeklyPortfolioSnapshot', tursoSql: 'SELECT COUNT(*) FROM WeeklyPortfolioSnapshot', neonFn: () => prisma.weeklyPortfolioSnapshot.count() },
    { name: 'MonthlyPortfolioSnapshot', tursoSql: 'SELECT COUNT(*) FROM MonthlyPortfolioSnapshot', neonFn: () => prisma.monthlyPortfolioSnapshot.count() },
    { name: 'StockHistory', tursoSql: 'SELECT COUNT(*) FROM StockHistory', neonFn: () => prisma.stockHistory.count() },
    { name: 'IndexHistory', tursoSql: 'SELECT COUNT(*) FROM IndexHistory', neonFn: () => prisma.indexHistory.count() },
    { name: 'ScreenerPrice', tursoSql: 'SELECT COUNT(*) FROM ScreenerPrice', neonFn: () => prisma.screenerPrice.count() },
    { name: 'StockATH', tursoSql: 'SELECT COUNT(*) FROM StockATH', neonFn: () => prisma.stockATH.count() },
    { name: 'StockMarketCap', tursoSql: 'SELECT COUNT(*) FROM StockMarketCap', neonFn: () => prisma.stockMarketCap.count() },
    { name: 'MomentumScore', tursoSql: 'SELECT COUNT(*) FROM MomentumScore', neonFn: () => prisma.momentumScore.count() },
    { name: 'RankingHistory', tursoSql: 'SELECT COUNT(*) FROM RankingHistory', neonFn: () => prisma.rankingHistory.count() },
  ];

  let allMatch = true;
  for (const t of tables) {
    try {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
      const tursoResult = await turso.execute(t.tursoSql);
      delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      const tursoCount = Number(tursoResult.rows[0][0]);
      const neonCount = await t.neonFn();
      const match = tursoCount === neonCount ? '✓' : '✗ MISMATCH';
      if (tursoCount !== neonCount) allMatch = false;
      console.log(`  ${t.name.padEnd(30)} Turso: ${fmt(tursoCount).padStart(8)}  Neon: ${fmt(neonCount).padStart(8)}  ${match}`);
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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const verifyOnly = process.argv.includes('--verify');

  if (verifyOnly) {
    console.log('=== Verify Only Mode ===');
    await verifyRowCounts();
    await prisma.$disconnect();
    turso.close();
    return;
  }

  console.log('=== Turso → Neon Postgres Migration ===\n');
  console.log(`Source: ${TURSO_URL}`);
  console.log(`Target: Neon (${process.env.DATABASE_URL?.substring(0, 50)}...)\n`);
  console.log('Migrating tables (in dependency order):\n');

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

  // Screener data (largest tables)
  await migrateScreenerPrice();
  await migrateStockATH();
  await migrateStockMarketCap();
  await migrateMomentumScore();
  await migrateRankingHistory();
  await migrateScreenerDemerger();

  const elapsed = Math.round((Date.now() - start) / 1000);
  console.log(`\n✅ Migration complete in ${elapsed}s`);

  await verifyRowCounts();

  await prisma.$disconnect();
  turso.close();
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
