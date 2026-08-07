/**
 * Momentum Screener Daily Cron
 *
 * Schedule: 45 10 * * 1-5 UTC (4:15 PM IST weekdays — 15 min after Closing Auction Session ends)
 * Runs the full screener pipeline: fetch candles → compute scores → rank → store.
 * Persists the run result to AppConfig so the Settings page can surface failures.
 */

import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { runScreenerPipeline } from '@/lib/screener/pipeline';
import { verifyCronSecret } from '@/lib/cron-auth';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db';

const cronLogger = logger.scope('ScreenerCron');

const LAST_RUN_KEY = 'cron.screener.lastRun';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes (Vercel Pro limit)

async function persistRunResult(result: Record<string, unknown>) {
  try {
    const value = JSON.stringify(result);
    await prisma.appConfig.upsert({
      where: { key: LAST_RUN_KEY },
      update: { value },
      create: { key: LAST_RUN_KEY, value },
    });
  } catch (err) {
    // Don't let persistence failure break the response
    cronLogger.error(`Failed to persist cron run result: ${err}`);
  }
}

export async function GET(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  const startTime = Date.now();
  cronLogger.info('Starting momentum screener pipeline...');

  try {
    // Quick query for active portfolio symbols (exempt from circuit band filter)
    const txns = await prisma.transaction.findMany({ select: { symbol: true, type: true, quantity: true } });
    const qtyMap = new Map<string, number>();
    for (const t of txns) {
      const q = qtyMap.get(t.symbol) ?? 0;
      qtyMap.set(t.symbol, t.type === 'BUY' ? q + t.quantity : q - t.quantity);
    }
    const portfolioSymbols = new Set([...qtyMap.entries()].filter(([, q]) => q > 0.01).map(([s]) => s));

    const result = await runScreenerPipeline(undefined, portfolioSymbols);
    const response = {
      ...result,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startTime,
    };
    // Always log the full result so it's visible in Vercel logs
    cronLogger.info(`Pipeline result: ${JSON.stringify(response)}`);
    // Persist so Settings page can show status without digging through logs
    await persistRunResult(response);
    // Bust the screener score cache so the UI immediately reflects new rankings
    revalidateTag('screener-scores', 'max');
    return NextResponse.json(response);
  } catch (error) {
    const errResponse = {
      success: false,
      error: 'Screener pipeline failed',
      details: (error as Error).message,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startTime,
    };
    cronLogger.error(`Pipeline crashed: ${JSON.stringify(errResponse)}`);
    await persistRunResult(errResponse);
    return NextResponse.json(errResponse, { status: 500 });
  }
}
