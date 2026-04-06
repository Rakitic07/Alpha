/**
 * Admin endpoint to backfill missing historical candles for all instruments.
 * Use this to recover from gaps (e.g., missed trading days, first-run backfill).
 *
 * Usage: GET /api/admin/backfill-prices?secret=<CRON_SECRET>
 *        GET /api/admin/backfill-prices?secret=<CRON_SECRET>&toDate=2026-04-01
 *
 * WARNING: This makes ~2000 individual Upstox API calls and takes 5-10 minutes.
 * The daily cron uses patchTodayPrices (batch) instead. Only call this manually.
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchAndStoreCandles } from '@/lib/screener/prices';
import { ensureInstrumentMaster, getAllSymbols, getAllInstrumentData } from '@/lib/instrument-service';
import { verifyCronSecret } from '@/lib/cron-auth';
import { logger } from '@/lib/logger';

const backfillLogger = logger.scope('BackfillPrices');

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const toDate = searchParams.get('toDate') ?? undefined;

  const start = Date.now();
  backfillLogger.info('Starting price backfill...');

  await ensureInstrumentMaster();
  const allSymbols = await getAllSymbols();
  const instrumentMap = await getAllInstrumentData(allSymbols);
  const instruments: { symbol: string; instrumentKey: string }[] = [];
  for (const [symbol, data] of instrumentMap) {
    if (!data.key.startsWith('NSE_INDEX|')) {
      instruments.push({ symbol, instrumentKey: data.key });
    }
  }

  backfillLogger.info(`Backfilling ${instruments.length} instruments...`);

  const result = await fetchAndStoreCandles(instruments, toDate);

  backfillLogger.info(`Backfill complete: ${result.inserted} rows inserted`);

  return NextResponse.json({
    ...result,
    instruments: instruments.length,
    durationMs: Date.now() - start,
  });
}
