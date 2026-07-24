
import { NextResponse } from 'next/server';
import { after } from 'next/server';
import { recalculatePortfolioHistory, captureWeeklySnapshot, captureMonthlySnapshot, captureHolidaySnapshot } from '@/lib/finance';
import { getMarketStatus } from '@/lib/market-holidays-cache';
import { addMinutes, isAfter, startOfDay } from 'date-fns';
import { prisma } from '@/lib/db';
import { verifyCronSecret } from '@/lib/cron-auth';
import { apiLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Allow up to 5 min — recalculation can be slow on large histories

/**
 * Respond immediately so cron-job.org (30s max) gets its 200.
 * The actual heavy work runs in after() — Vercel keeps the function alive.
 */
export async function GET(request: Request) {
    const authError = verifyCronSecret(request);
    if (authError) return authError;

    try {
        const { searchParams } = new URL(request.url);
        const rawType = searchParams.get('type');
        const type = rawType === 'month' ? 'monthly' : rawType;
        const force = searchParams.get('force') === 'true';

        if (type === 'weekly') {
            after(async () => {
                try { await captureWeeklySnapshot(); }
                catch (e) { apiLogger.error('after(): weekly snapshot failed', e); }
            });
            return NextResponse.json({ message: 'Weekly snapshot accepted — processing in background' });
        }

        if (type === 'monthly') {
            after(async () => {
                try { await captureMonthlySnapshot(); }
                catch (e) { apiLogger.error('after(): monthly snapshot failed', e); }
            });
            return NextResponse.json({ message: 'Monthly snapshot accepted — processing in background' });
        }

        // --- Daily logic ---

        if (force) {
            after(async () => {
                try { await recalculatePortfolioHistory(); }
                catch (e) { apiLogger.error('after(): forced recalculation failed', e); }
            });
            return NextResponse.json({ message: 'Daily recalculation accepted (forced) — processing in background' });
        }

        // SMART TRIGGER LOGIC — do the cheap checks synchronously before responding
        const status = await getMarketStatus();

        if (status.closeTime) {
            const triggerTime = addMinutes(status.closeTime, 15);

            if (!isAfter(new Date(), triggerTime)) {
                return NextResponse.json({
                    message: 'Skipped: Market is still open or within 15m buffer',
                    marketStatus: status.isOpen ? 'Open' : 'Buffer',
                    triggerTime: triggerTime.toISOString()
                });
            }

            // IDEMPOTENCY CHECK
            const todayStart = startOfDay(new Date());
            const existingSnapshot = await prisma.dailyPortfolioSnapshot.findFirst({
                where: { date: { gte: todayStart } },
                select: { date: true }
            });
            if (existingSnapshot) {
                return NextResponse.json({
                    message: 'Skipped: Snapshot already exists for today',
                    date: existingSnapshot.date.toISOString()
                });
            }

            // Respond immediately — heavy work runs after
            after(async () => {
                try {
                    await recalculatePortfolioHistory();
                    apiLogger.info('after(): daily recalculation complete');
                } catch (e) { apiLogger.error('after(): daily recalculation failed', e); }
            });
            return NextResponse.json({
                message: 'Daily recalculation accepted — processing in background',
                marketStatus: 'Closed',
                closeTime: status.closeTime.toISOString()
            });
        }

        // FALLBACK: no closeTime from market status API
        const todayStart = startOfDay(new Date());
        const todayPriceExists = await prisma.stockHistory.findFirst({
            where: { date: { gte: todayStart } },
            select: { id: true }
        });

        if (todayPriceExists) {
            apiLogger.info('DB fallback: Found stock prices for today, treating as trading day');
            const defaultCloseTime = new Date();
            defaultCloseTime.setHours(10, 0, 0, 0); // 3:30 PM IST = 10:00 UTC
            const triggerTime = addMinutes(defaultCloseTime, 15);

            if (!isAfter(new Date(), triggerTime)) {
                return NextResponse.json({
                    message: 'Skipped: Within 15m buffer (DB fallback)',
                    marketStatus: 'Buffer',
                    triggerTime: triggerTime.toISOString()
                });
            }

            // Idempotency check
            const existingSnapshot = await prisma.dailyPortfolioSnapshot.findFirst({
                where: { date: { gte: todayStart } },
                select: { date: true }
            });
            if (existingSnapshot) {
                return NextResponse.json({
                    message: 'Skipped: Snapshot already exists for today (DB fallback)',
                    date: existingSnapshot.date.toISOString()
                });
            }

            after(async () => {
                try {
                    await recalculatePortfolioHistory();
                    apiLogger.info('after(): DB fallback daily recalculation complete');
                } catch (e) { apiLogger.error('after(): DB fallback recalculation failed', e); }
            });
            return NextResponse.json({
                message: 'Daily recalculation accepted (DB fallback) — processing in background',
                marketStatus: 'Closed',
                note: 'API returned no timings but stock prices exist'
            });
        }

        // Truly a holiday/weekend — holiday snapshot is fast, no need for after()
        const reason = status.reason || 'Market Holiday/Weekend';
        after(async () => {
            try { await captureHolidaySnapshot(); }
            catch (e) { apiLogger.error('after(): holiday snapshot failed', e); }
        });
        return NextResponse.json({
            message: 'Holiday snapshot accepted — processing in background',
            reason
        });

    } catch (error: unknown) {
        apiLogger.error('Snapshot error:', error);
        const details = error instanceof Error ? error.message : String(error);
        return NextResponse.json({ error: 'Failed to capture snapshot', details }, { status: 500 });
    }
}

// POST: manual trigger — no 30s constraint, await directly
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { type } = body;

        if (type === 'weekly') {
            await captureWeeklySnapshot();
            return NextResponse.json({ message: 'Weekly snapshot captured' });
        } else if (type === 'monthly') {
            await captureMonthlySnapshot();
            return NextResponse.json({ message: 'Monthly snapshot captured' });
        } else {
            await recalculatePortfolioHistory();
            return NextResponse.json({ message: 'Daily history recalculated' });
        }
    } catch (error: unknown) {
        apiLogger.error('Snapshot error:', error);
        const details = error instanceof Error ? error.message : String(error);
        return NextResponse.json({ error: 'Failed to capture snapshot', details }, { status: 500 });
    }
}
