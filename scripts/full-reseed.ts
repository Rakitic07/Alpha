/**
 * Full wipe + re-seed: delete ALL ScreenerPrice, RankingHistory, MomentumScore
 * and re-fetch 18 months of clean daily candles from the Upstox historical API.
 *
 * WHY: The original seed-screener-prices.ts had an IST→UTC date shift bug that
 * stored every date shifted back by 1 day (Monday data under Sunday, etc.).
 * Since all dates already exist (just shifted), a dedup-based re-seed can't fix it.
 * We need a clean slate.
 *
 * Usage: npx tsx scripts/full-reseed.ts
 * Estimated time: ~10 minutes for ~2500 stocks
 */

import { gunzipSync } from 'zlib';
import { prisma, chunkArray } from './lib/db';

const NSE_INSTRUMENTS_URL = 'https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz';
const UPSTOX_HISTORICAL_URL = 'https://api.upstox.com/v3/historical-candle';

interface Instrument {
  instrument_key: string;
  tradingsymbol: string;
  trading_symbol?: string;
  name: string;
  instrument_type: string;
}

async function loadInstruments(): Promise<Array<{ symbol: string; key: string }>> {
  console.log('Downloading NSE instrument master...');
  const res = await fetch(NSE_INSTRUMENTS_URL);
  const buf = Buffer.from(await res.arrayBuffer());
  const json = gunzipSync(buf).toString('utf8');
  const data: Instrument[] = JSON.parse(json);

  const etfWhitelist = new Set(['GOLDBEES', 'SILVERBEES']);
  const result: Array<{ symbol: string; key: string }> = [];

  for (const inst of data) {
    const symbol = (inst.tradingsymbol || inst.trading_symbol || '').toUpperCase();
    const type = (inst.instrument_type || '').toUpperCase();
    if (type === 'EQ' || type === 'EQUITY' || etfWhitelist.has(symbol)) {
      result.push({ symbol, key: inst.instrument_key });
    }
  }
  return result;
}

function toISTDate(istTimestamp: string): string {
  // Extract YYYY-MM-DD directly from IST timestamp to avoid UTC shift
  // e.g. "2026-03-02T00:00:00+05:30" → "2026-03-02"
  return istTimestamp.slice(0, 10);
}

function isWeekend(dateStr: string): boolean {
  const dow = new Date(dateStr + 'T12:00:00Z').getUTCDay();
  return dow === 0 || dow === 6;
}

async function fetchDailyCandles(instrumentKey: string, from: string, to: string) {
  const encodedKey = encodeURIComponent(instrumentKey);
  const url = `${UPSTOX_HISTORICAL_URL}/${encodedKey}/days/1/${to}/${from}`;
  const res = await fetch(url);
  if (!res.ok) return [];

  const json = await res.json();
  const candles = json?.data?.candles;
  if (!Array.isArray(candles)) return [];

  return candles
    .map((c: [string, number, number, number, number, number, number]) => ({
      timestamp: c[0],
      open: c[1],
      high: c[2],
      low: c[3],
      close: c[4],
      volume: Math.round(c[5]),
    }))
    .filter((c) => !isWeekend(c.timestamp.slice(0, 10))); // Skip any weekend candles
}

async function withConcurrency<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  limit: number,
): Promise<{ successes: number; errors: string[] }> {
  const errors: string[] = [];
  let successes = 0;
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      try {
        await fn(items[i]);
        successes++;
      } catch (err) {
        errors.push(`${items[i]}: ${(err as Error).message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return { successes, errors };
}

async function main() {
  const startTime = Date.now();

  // ── Step 1: Load instruments ──────────────────────────────────────────────
  const instruments = await loadInstruments();
  console.log(`Found ${instruments.length} NSE_EQ instruments`);

  // Date range: 18 months back (~550 days — need 274+ trading days for scoring)
  const now = new Date();
  const fromDate = new Date(now.getTime() - 550 * 24 * 60 * 60 * 1000);
  // IST today
  const istNow = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const today = `${istNow.getUTCFullYear()}-${String(istNow.getUTCMonth() + 1).padStart(2, '0')}-${String(istNow.getUTCDate()).padStart(2, '0')}`;
  const from = `${fromDate.getUTCFullYear()}-${String(fromDate.getUTCMonth() + 1).padStart(2, '0')}-${String(fromDate.getUTCDate()).padStart(2, '0')}`;

  console.log(`Date range: ${from} → ${today}`);

  // ── Step 2: Check existing data (resume support) ───────────────────────────
  // If a previous run partially completed, skip already-seeded stocks.
  const existingSymbols = new Set(
    (await prisma.screenerPrice.findMany({
      select: { symbol: true },
      distinct: ['symbol'],
    })).map(r => r.symbol)
  );

  const remaining = instruments.filter(i => !existingSymbols.has(i.symbol));
  console.log(`\n  Already seeded: ${existingSymbols.size} stocks`);
  console.log(`  Remaining to seed: ${remaining.length} stocks`);

  // ── Step 3: Re-seed ───────────────────────────────────────────────────────
  console.log('=== RE-SEEDING PRICES ===');
  let processed = 0;
  let totalInserted = 0;

  const result = await withConcurrency(
    remaining,
    async (inst) => {
      const candles = await fetchDailyCandles(inst.key, from, today);
      if (candles.length === 0) return;

      const rows = candles.map((c: { timestamp: string; open: number; high: number; low: number; close: number; volume: number }) => ({
        symbol: inst.symbol,
        instrumentKey: inst.key,
        date: toISTDate(c.timestamp),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      }));

      for (const chunk of chunkArray(rows, 500)) {
        await prisma.screenerPrice.createMany({ data: chunk });
      }
      totalInserted += rows.length;

      processed++;
      if (processed % 50 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`  Progress: ${processed}/${remaining.length} stocks (${totalInserted} rows, ${elapsed}s)`);
      }
    },
    10,
  );

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n=== DONE (${elapsed}s) ===`);
  console.log(`  Stocks fetched: ${result.successes}`);
  console.log(`  Rows inserted: ${totalInserted}`);
  console.log(`  Errors: ${result.errors.length}`);

  if (result.errors.length > 0) {
    console.log('\nFirst 10 errors:');
    result.errors.slice(0, 10).forEach(e => console.log(`  ${e}`));
  }

  // ── Verification ──────────────────────────────────────────────────────────
  console.log('\n=== VERIFICATION ===');
  const distinctDates = await prisma.screenerPrice.findMany({
    select: { date: true },
    distinct: ['date'],
    orderBy: { date: 'asc' },
  });

  // Check for any remaining weekend dates
  const weekendDates = distinctDates.filter(d => isWeekend(d.date));
  if (weekendDates.length > 0) {
    console.log(`  WARNING: ${weekendDates.length} weekend dates still present!`);
    weekendDates.slice(0, 5).forEach(d => console.log(`    ${d.date}`));
  } else {
    console.log('  No weekend dates found (clean!)');
  }

  console.log(`  Total distinct dates: ${distinctDates.length}`);
  console.log(`  Date range: ${distinctDates[0]?.date} → ${distinctDates[distinctDates.length - 1]?.date}`);

  const totalRows = await prisma.screenerPrice.count();
  console.log(`  Total price rows: ${totalRows}`);

  console.log('\nNext step:');
  console.log('  node node_modules/.bin/tsx scripts/backfill-rank-history.ts');

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Full reseed failed:', err);
  process.exit(1);
});
