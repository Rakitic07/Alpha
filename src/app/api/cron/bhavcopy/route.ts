/**
 * Bhavcopy Weekly Cron
 *
 * Schedule: 0 6 * * 6 UTC (Saturday 11:30 AM IST)
 * Fetches NSE bhavcopy to refresh market cap data weekly.
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchAndStoreBhavcopy } from '@/lib/screener/bhavcopy';
import { effectiveTradingDay } from '@/lib/screener/dates';
import { verifyCronSecret } from '@/lib/cron-auth';
import { logger } from '@/lib/logger';

const cronLogger = logger.scope('BhavcopyCron');

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  cronLogger.info('Starting bhavcopy refresh...');

  try {
    const today = effectiveTradingDay();
    const result = await fetchAndStoreBhavcopy(today);

    cronLogger.info(`Bhavcopy updated ${result.updated} entries for ${result.date}`);
    return NextResponse.json({ ok: true, updated: result.updated, date: result.date });
  } catch (err) {
    cronLogger.error('Bhavcopy cron failed:', err);
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
