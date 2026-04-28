/**
 * Daily Report Cron
 *
 * Schedule: 0 11 * * 1-5 UTC (4:30 PM IST weekdays)
 * Gathers portfolio, market, screener data → generates AI summary → sends HTML email.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { verifyCronSecret } from '@/lib/cron-auth';
import { isTradingHoliday } from '@/lib/market-holidays-cache';
import { gatherReportData } from '@/lib/report/gather-data';
import { generateAISummary } from '@/lib/report/ai-summary';
import { buildReportEmail } from '@/lib/report/email-template';
import { logger } from '@/lib/logger';

const cronLogger = logger.scope('DailyReportCron');

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function getTodayIST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
}

export async function GET(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  const startTime = Date.now();
  const today = getTodayIST();
  const url = new URL(request.url);
  const force = url.searchParams.get('force') === 'true';

  // Skip on weekends (belt-and-suspenders — cron already filters weekdays)
  const dayOfWeek = new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: 'Asia/Kolkata' });
  if (!force && (dayOfWeek === 'Saturday' || dayOfWeek === 'Sunday')) {
    return NextResponse.json({ status: 'skipped', reason: 'Weekend', tip: 'Add ?force=true to bypass' });
  }

  // Skip on NSE trading holidays
  const isHoliday = !force && (await isTradingHoliday(today));
  if (isHoliday) {
    cronLogger.info(`Skipping daily report — ${today} is a trading holiday`);
    return NextResponse.json({ status: 'skipped', reason: 'Trading holiday', date: today, tip: 'Add ?force=true to bypass' });
  }

  cronLogger.info(`Generating daily report for ${today}...`);

  const to = process.env.REPORT_EMAIL_TO;
  const from = process.env.REPORT_EMAIL_FROM ?? 'onboarding@resend.dev';
  const resendKey = process.env.RESEND_API_KEY;

  if (!to || !resendKey) {
    return NextResponse.json(
      { status: 'error', error: 'REPORT_EMAIL_TO or RESEND_API_KEY not configured' },
      { status: 500 }
    );
  }

  // Gather all report data
  const data = await gatherReportData(today);

  // AI summary (non-blocking fallback)
  try {
    data.aiSummary = await generateAISummary(data);
  } catch (err) {
    cronLogger.error('AI summary generation failed:', err);
    data.errors.push(`AI summary: ${(err as Error).message}`);
  }

  // Build email
  const { subject, html } = buildReportEmail(data);

  // Send via Resend
  const resend = new Resend(resendKey);
  cronLogger.info(`Sending report email from=${from} to=${to}`);
  const { data: sendData, error: sendError } = await resend.emails.send({ from, to, subject, html });

  if (sendError) {
    cronLogger.error('Email send failed:', sendError);
    return NextResponse.json(
      { status: 'error', error: 'Email send failed', details: sendError, from, to, durationMs: Date.now() - startTime },
      { status: 500 }
    );
  }

  cronLogger.info(`Daily report sent to ${to} in ${Date.now() - startTime}ms`);

  return NextResponse.json({
    status: 'sent',
    date: today,
    to,
    emailId: sendData?.id,
    sections: {
      portfolio: data.portfolio !== null,
      market: data.market !== null,
      exits: data.exits.length,
      entries: data.entries.length,
      aiSummary: data.aiSummary !== null,
    },
    errors: data.errors,
    durationMs: Date.now() - startTime,
  });
}
