/**
 * Screener price ingestion — fetch daily OHLCV candles from Upstox and store in ScreenerPrice.
 * Incremental: only fetches candles from last stored date to today.
 */

import { prisma, chunkArray, SQLITE_IN_CLAUSE_LIMIT } from '@/lib/db';
import { getHistoricalCandles } from '@/lib/upstox-client';
import { toDateStr, daysAgo, todayIST } from './dates';
import { withConcurrency, withRetry } from './utils';
import { logger } from '@/lib/logger';

const priceLogger = logger.scope('ScreenerPrices');

interface InstrumentInfo {
  symbol: string;
  instrumentKey: string;
}

/**
 * Fetch and store daily candles for all instruments.
 * Incremental: finds last stored date per stock, only fetches missing days.
 * First run: backfills 400 calendar days (~13 months of trading days).
 */
export async function fetchAndStoreCandles(
  instruments: InstrumentInfo[],
  toDate?: string, // defaults to todayIST(); pass T-1 during market hours
): Promise<{ fetched: number; inserted: number; errors: string[] }> {
  const today = toDate ?? todayIST();
  const defaultFromDate = daysAgo(400, today); // ~13 months for first run

  // Get last stored date per symbol in batch
  const lastDates = await getLastStoredDates(instruments.map(i => i.symbol));

  let totalInserted = 0;
  const instrumentsToFetch: { inst: InstrumentInfo; fromDate: string }[] = [];

  for (const inst of instruments) {
    const lastDate = lastDates.get(inst.symbol);
    if (lastDate === today) continue; // Already up to date

    const fromDate = lastDate
      ? nextDay(lastDate) // Day after last stored
      : defaultFromDate;

    if (fromDate > today) continue; // Already up to date
    instrumentsToFetch.push({ inst, fromDate });
  }

  priceLogger.info(`Fetching candles for ${instrumentsToFetch.length} stocks (${instruments.length - instrumentsToFetch.length} already up to date)`);

  const result = await withConcurrency(
    instrumentsToFetch,
    async ({ inst, fromDate }) => {
      const candles = await withRetry(() =>
        getHistoricalCandles(inst.instrumentKey, 'day', fromDate, today)
      );

      if (!candles?.candles || candles.candles.length === 0) return;

      // Transform Upstox candles to ScreenerPrice rows
      const rows = candles.candles.map(c => ({
        symbol: inst.symbol,
        instrumentKey: inst.instrumentKey,
        date: toDateStr(new Date(c.timestamp)),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: Math.round(c.volume),
      }));

      // Get existing dates to avoid unique constraint violations
      const existingDates = new Set(
        (await prisma.screenerPrice.findMany({
          where: { symbol: inst.symbol, date: { in: rows.map(r => r.date) } },
          select: { date: true },
        })).map(r => r.date)
      );

      const newRows = rows.filter(r => !existingDates.has(r.date));
      if (newRows.length === 0) return;

      // Batch insert in chunks of 100
      for (const chunk of chunkArray(newRows, 100)) {
        await prisma.screenerPrice.createMany({ data: chunk });
      }
      totalInserted += newRows.length;
    },
    5,   // 5 concurrent; staggered 200ms apart to avoid simultaneous burst hitting Cloudflare WAF
    200, // staggerMs — workers start at t=0,200,400,600,800ms instead of all at once
  );

  priceLogger.info(`Candle ingestion complete: ${result.successes} stocks, ${totalInserted} rows inserted, ${result.errors.length} errors`);
  return { fetched: result.successes, inserted: totalInserted, errors: result.errors };
}

/**
 * Flush all candles for a stock and re-fetch (for corporate action adjustments).
 */
export async function flushAndRefetchStock(symbol: string, instrumentKey: string): Promise<number> {
  await prisma.screenerPrice.deleteMany({ where: { symbol } });

  const today = todayIST();
  const fromDate = daysAgo(400, today);

  const candles = await withRetry(() =>
    getHistoricalCandles(instrumentKey, 'day', fromDate, today)
  );

  if (!candles?.candles || candles.candles.length === 0) return 0;

  const rows = candles.candles.map(c => ({
    symbol,
    instrumentKey,
    date: toDateStr(new Date(c.timestamp)),
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: Math.round(c.volume),
  }));

  for (const chunk of chunkArray(rows, 100)) {
    await prisma.screenerPrice.createMany({ data: chunk });
  }

  priceLogger.info(`Flushed and re-fetched ${rows.length} candles for ${symbol}`);
  return rows.length;
}

/** Get last stored date per symbol from ScreenerPrice */
async function getLastStoredDates(symbols: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const chunks = chunkArray(symbols, SQLITE_IN_CLAUSE_LIMIT);

  for (const chunk of chunks) {
    // Prisma doesn't support GROUP BY natively — use raw query or per-symbol query
    // For efficiency, fetch the max date per symbol using findMany with orderBy
    const rows = await prisma.screenerPrice.findMany({
      where: { symbol: { in: chunk } },
      select: { symbol: true, date: true },
      orderBy: { date: 'desc' },
      distinct: ['symbol'],
    });
    for (const row of rows) {
      result.set(row.symbol, row.date);
    }
  }

  return result;
}

/** Get the next day as YYYY-MM-DD */
function nextDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return toDateStr(d);
}
