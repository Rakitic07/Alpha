/**
 * ATH (All-Time High) management for the momentum screener.
 * - seedATH(): One-time backfill from monthly candles since 2000
 * - updateATHFromPrices(): Daily update from ScreenerPrice data
 */

import { prisma, chunkArray } from '@/lib/db';
import { getHistoricalCandles } from '@/lib/upstox-client';
import { todayIST, toDateStr } from './dates';
import { withConcurrency } from './utils';
import { logger } from '@/lib/logger';

const athLogger = logger.scope('ATH');

interface InstrumentInfo {
  symbol: string;
  instrumentKey: string;
}

/**
 * One-time ATH seed: fetch monthly candles from 2000-01-01 to today for each stock.
 * Computes max(high) across all months to get the all-time high.
 * ~2000 stocks at 5 concurrent = ~7 minutes.
 */
export async function seedATH(instruments: InstrumentInfo[]): Promise<{ seeded: number; errors: string[] }> {
  const today = todayIST();
  athLogger.info(`Seeding ATH for ${instruments.length} instruments from 2000-01-01 to ${today}`);

  const result = await withConcurrency(
    instruments,
    async (inst) => {
      try {
        const data = await getHistoricalCandles(inst.instrumentKey, 'month', '2000-01-01', today);
        if (!data?.candles || data.candles.length === 0) return;

        let maxHigh = 0;
        let maxHighDate = '';

        for (const c of data.candles) {
          if (c.high > maxHigh) {
            maxHigh = c.high;
            maxHighDate = toDateStr(new Date(c.timestamp));
          }
        }

        if (maxHigh > 0) {
          await prisma.stockATH.upsert({
            where: { symbol: inst.symbol },
            create: {
              symbol: inst.symbol,
              instrumentKey: inst.instrumentKey,
              ath: maxHigh,
              athDate: maxHighDate,
            },
            update: {
              ath: maxHigh,
              athDate: maxHighDate,
              instrumentKey: inst.instrumentKey,
              updatedAt: new Date(),
            },
          });
        }
      } catch (err) {
        // Rethrow to be caught by withConcurrency
        throw new Error(`${inst.symbol}: ${(err as Error).message}`);
      }
    },
    5,
  );

  athLogger.info(`ATH seed complete: ${result.successes} stocks, ${result.errors.length} errors`);
  return { seeded: result.successes, errors: result.errors };
}

/**
 * Daily ATH update: load all stored ATH into memory, compare with today's highs
 * from ScreenerPrice, batch upsert only changed records.
 */
export async function updateATHFromPrices(date: string): Promise<{ updated: number }> {
  // Load all existing ATH records into a Map
  const existingATH = new Map<string, { ath: number; athDate: string }>();
  const allATH = await prisma.stockATH.findMany({
    select: { symbol: true, ath: true, athDate: true },
  });
  for (const row of allATH) {
    existingATH.set(row.symbol, { ath: row.ath, athDate: row.athDate });
  }

  // Get today's highs from ScreenerPrice
  const todayPrices = await prisma.screenerPrice.findMany({
    where: { date },
    select: { symbol: true, instrumentKey: true, high: true },
  });

  // Separate new stocks (create) from ATH updates
  const toCreate: Array<{ symbol: string; instrumentKey: string; ath: number; athDate: string }> = [];
  const toUpdate: Array<{ symbol: string; ath: number; athDate: string }> = [];

  for (const price of todayPrices) {
    const existing = existingATH.get(price.symbol);
    if (!existing) {
      toCreate.push({ symbol: price.symbol, instrumentKey: price.instrumentKey, ath: price.high, athDate: date });
    } else if (price.high > existing.ath) {
      toUpdate.push({ symbol: price.symbol, ath: price.high, athDate: date });
    }
  }

  // Batch create new ATH records
  for (const chunk of chunkArray(toCreate)) {
    await prisma.stockATH.createMany({ data: chunk });
  }

  // Update existing records with new ATH (typically 10-50 stocks per day)
  for (const row of toUpdate) {
    await prisma.stockATH.update({
      where: { symbol: row.symbol },
      data: { ath: row.ath, athDate: row.athDate, updatedAt: new Date() },
    });
  }

  const updated = toCreate.length + toUpdate.length;
  athLogger.info(`ATH update for ${date}: ${toCreate.length} new, ${toUpdate.length} updated out of ${todayPrices.length} stocks`);
  return { updated };
}

/**
 * Load all ATH records as a Map for fast in-memory lookups during scoring.
 */
export async function loadATHMap(): Promise<Map<string, number>> {
  const records = await prisma.stockATH.findMany({
    select: { symbol: true, ath: true },
  });
  const map = new Map<string, number>();
  for (const r of records) {
    map.set(r.symbol, r.ath);
  }
  return map;
}
