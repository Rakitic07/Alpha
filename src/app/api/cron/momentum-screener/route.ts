/**
 * Momentum Screener Daily Cron
 *
 * Schedule: 0 11 * * 1-5 UTC (4:30 PM IST weekdays)
 * Runs the full screener pipeline: fetch candles → compute scores → rank → store.
 */

import { NextRequest, NextResponse } from 'next/server';
import { runScreenerPipeline } from '@/lib/screener/pipeline';
import { detectAndFlushAnomalies } from '@/lib/screener/corporate-actions';
import { verifyCronSecret } from '@/lib/cron-auth';
import { logger } from '@/lib/logger';

const cronLogger = logger.scope('ScreenerCron');

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes (Vercel Pro limit)

export async function GET(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  const startTime = Date.now();
  cronLogger.info('Starting momentum screener pipeline...');

  try {
    // Run main pipeline
    const result = await runScreenerPipeline();

    // Detect and fix corporate action anomalies
    let flushed: string[] = [];
    try {
      const caResult = await detectAndFlushAnomalies();
      flushed = caResult.flushed;
    } catch (err) {
      result.errors.push(`Corporate action detection: ${(err as Error).message}`);
    }

    return NextResponse.json({
      ...result,
      corporateActionsFlushed: flushed,
      durationMs: Date.now() - startTime,
    });
  } catch (error) {
    cronLogger.error('Screener pipeline failed:', error);
    return NextResponse.json({
      success: false,
      error: 'Screener pipeline failed',
      details: (error as Error).message,
      durationMs: Date.now() - startTime,
    }, { status: 500 });
  }
}
