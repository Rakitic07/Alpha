/**
 * Admin endpoint to delete all screener data for a specific date.
 * Usage: GET /api/admin/delete-date?secret=<CRON_SECRET>&date=2026-04-04
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyCronSecret } from '@/lib/cron-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  const date = new URL(request.url).searchParams.get('date');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Missing or invalid ?date=YYYY-MM-DD' }, { status: 400 });
  }

  const scores = await prisma.momentumScore.deleteMany({ where: { computedDate: date } });
  const history = await prisma.rankingHistory.deleteMany({ where: { date } });
  const prices = await prisma.screenerPrice.deleteMany({ where: { date } });

  // Re-activate the most recent remaining scores (the ones before the deleted date)
  for (const rankType of ['filtered', 'all']) {
    const latestDate = await prisma.momentumScore.findFirst({
      where: { rankType },
      orderBy: { computedDate: 'desc' },
      select: { computedDate: true },
    });
    if (latestDate) {
      await prisma.momentumScore.updateMany({
        where: { computedDate: latestDate.computedDate, rankType },
        data: { isActive: true },
      });
    }
  }

  return NextResponse.json({
    deleted: { date, scores: scores.count, history: history.count, prices: prices.count },
    message: `Deleted all data for ${date} and re-activated latest remaining scores`,
  });
}
