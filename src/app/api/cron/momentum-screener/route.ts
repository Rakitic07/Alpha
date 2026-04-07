/**
 * Momentum Screener Daily Cron
 *
 * Schedule: 0 11 * * 1-5 UTC (4:30 PM IST weekdays)
 * Runs the full screener pipeline: fetch candles → compute scores → rank → store.
 */

import { NextRequest, NextResponse } from 'next/server';
import { runScreenerPipeline } from '@/lib/screener/pipeline';
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
    const result = await runScreenerPipeline();
    const response = { ...result, durationMs: Date.now() - startTime };
    // Always log the full result so it's visible in Vercel logs
    cronLogger.info(`Pipeline result: ${JSON.stringify(response)}`);
    return NextResponse.json(response);
  } catch (error) {
    const errResponse = {
      success: false,
      error: 'Screener pipeline failed',
      details: (error as Error).message,
      durationMs: Date.now() - startTime,
    };
    cronLogger.error(`Pipeline crashed: ${JSON.stringify(errResponse)}`);
    return NextResponse.json(errResponse, { status: 500 });
  }
}
