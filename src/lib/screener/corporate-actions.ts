/**
 * Corporate action detection via price anomalies.
 * Scans ScreenerPrice for abnormal daily moves that indicate splits/bonus.
 * On detection: flush all candles for that stock and re-fetch from Upstox (adjusted prices).
 */

import { prisma } from '@/lib/db';
import { flushAndRefetchStock } from './prices';
import { withConcurrency } from './utils';
import { logger } from '@/lib/logger';

const caLogger = logger.scope('CorpActions');

// Thresholds matching backtest detection
const DROP_THRESHOLD = -0.20;  // >20% daily drop
const JUMP_THRESHOLD = 0.80;   // >80% daily jump

/**
 * Detect price anomalies in ScreenerPrice and flush + re-fetch affected stocks.
 * Scans the last 5 trading days for any stock showing extreme daily moves.
 */
export async function detectAndFlushAnomalies(): Promise<{ flushed: string[] }> {
  const flushed: string[] = [];

  // Get distinct symbols with recent data
  const recentDates = await prisma.screenerPrice.findMany({
    select: { date: true },
    distinct: ['date'],
    orderBy: { date: 'desc' },
    take: 6, // Need 6 dates to compute 5 days of returns
  });

  if (recentDates.length < 2) return { flushed };

  const dateCutoff = recentDates[recentDates.length - 1].date;

  // Load recent prices for all stocks
  const recentPrices = await prisma.screenerPrice.findMany({
    where: { date: { gte: dateCutoff } },
    orderBy: [{ symbol: 'asc' }, { date: 'asc' }],
    select: { symbol: true, instrumentKey: true, date: true, close: true },
  });

  // Group by symbol
  const bySymbol = new Map<string, Array<{ date: string; close: number; instrumentKey: string }>>();
  for (const p of recentPrices) {
    let arr = bySymbol.get(p.symbol);
    if (!arr) {
      arr = [];
      bySymbol.set(p.symbol, arr);
    }
    arr.push({ date: p.date, close: p.close, instrumentKey: p.instrumentKey });
  }

  // Detect anomalies first, then flush in parallel
  const anomalies: Array<{ symbol: string; instrumentKey: string; date: string; pct: string }> = [];

  for (const [symbol, prices] of bySymbol) {
    if (prices.length < 2) continue;

    for (let i = 1; i < prices.length; i++) {
      if (prices[i - 1].close === 0) continue;

      const dailyReturn = (prices[i].close - prices[i - 1].close) / prices[i - 1].close;

      if (dailyReturn <= DROP_THRESHOLD || dailyReturn >= JUMP_THRESHOLD) {
        caLogger.warn(
          `Anomaly detected: ${symbol} on ${prices[i].date}: ${(dailyReturn * 100).toFixed(1)}% ` +
          `(${prices[i - 1].close} → ${prices[i].close})`
        );
        anomalies.push({
          symbol,
          instrumentKey: prices[i].instrumentKey,
          date: prices[i].date,
          pct: (dailyReturn * 100).toFixed(1),
        });
        break; // Only one anomaly per symbol
      }
    }
  }

  // Flush detected anomalies serially with 500ms spacing.
  // Each flushAndRefetchStock calls getHistoricalCandles (1 API call per stock).
  // Serial avoids burst against the 50 req/s, 500 req/min Upstox rate limit,
  // and corp action anomalies are typically 0-5 stocks per day.
  if (anomalies.length > 0) {
    const result = await withConcurrency(anomalies, async (a) => {
      await flushAndRefetchStock(a.symbol, a.instrumentKey);
      flushed.push(a.symbol);
    }, 1, 0, 500);

    if (result.errors.length > 0) {
      caLogger.error(`${result.errors.length} flush failures:`, result.errors);
    }
    caLogger.info(`Flushed and re-fetched ${flushed.length} stocks: ${flushed.join(', ')}`);
  }

  return { flushed };
}
