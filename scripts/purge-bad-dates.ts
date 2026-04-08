/**
 * One-time cleanup: delete stale/incorrect price and ranking data caused by:
 *   1. IST→UTC date-shift bug — Upstox timestamps like "2026-03-03T00:00:00+05:30"
 *      were passed through `new Date(...).toISOString().slice(0,10)`, shifting
 *      Monday data into Sunday slots across the entire 13-month history.
 *   2. Indian market holidays — cron ran on weekday holidays (e.g. Holi, Good Friday)
 *      and stored the previous day's stale OHLC under the holiday date.
 *
 * Holiday detection: fetches NSE holiday list from Upstox API per year (fast — 3 calls).
 * Falls back to NSE_HOLIDAYS hardcoded list if the API is unavailable.
 *
 * Safe to run multiple times (idempotent).
 *
 * After running this script:
 *   node node_modules/.bin/tsx scripts/seed-screener-prices.ts   # refill gaps (~8 min)
 *   node node_modules/.bin/tsx scripts/backfill-rank-history.ts  # recompute rankings
 */

import { prisma } from './lib/db';
import { NSE_HOLIDAYS } from '../src/lib/screener/dates';

// ── Helpers ─────────────────────────────────────────────────────────────────

function isWeekend(date: string): boolean {
  const dow = new Date(date + 'T12:00:00Z').getUTCDay();
  return dow === 0 || dow === 6;
}

// ── Upstox holiday detection ─────────────────────────────────────────────────

interface MarketHoliday {
  date: string;
  description?: string;
  holiday_type?: string;
  closed_exchanges?: string[];
  open_exchanges?: string[];
}

async function getAccessToken(): Promise<string> {
  const envToken = process.env.UPSTOX_ANALYTICS_TOKEN;
  if (envToken) return envToken;
  const row = await prisma.appConfig.findUnique({ where: { key: 'upstox.accessToken' } });
  if (row?.value) return row.value;
  throw new Error('No Upstox access token found');
}


async function buildHolidaySet(years: number[]): Promise<Set<string>> {
  // Start with hardcoded list for all years as baseline
  const combined = new Set<string>(NSE_HOLIDAYS);

  let token: string | null = null;
  try {
    token = await getAccessToken();
  } catch {
    console.warn('  No Upstox token — using hardcoded NSE_HOLIDAYS list only');
    return combined;
  }

  // The Upstox /market/holidays endpoint (no date param) returns current year's full list.
  // Use it to override/extend the hardcoded list for the current year.
  const currentYear = new Date().getFullYear();
  if (years.includes(currentYear)) {
    try {
      const res = await fetch(`https://api.upstox.com/v3/market/holidays`, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const json = await res.json();
        const data: MarketHoliday[] = Array.isArray(json?.data) ? json.data : [];
        let count = 0;
        for (const h of data) {
          if (!h.date) continue;
          const nseIsClosed =
            h.closed_exchanges?.includes('NSE') ||
            h.closed_exchanges?.includes('NFO') ||
            (h.holiday_type === 'TRADING_HOLIDAY' && !h.open_exchanges?.includes('NSE'));
          if (nseIsClosed) {
            const d = h.date.slice(0, 10);
            combined.add(d);
            count++;
          }
        }
        console.log(`  Upstox API (current year ${currentYear}): ${count} NSE holidays merged`);
      } else {
        console.warn(`  Upstox holiday API returned ${res.status} — using hardcoded list for ${currentYear}`);
      }
    } catch (err) {
      console.warn(`  Upstox holiday API failed (${(err as Error).message}) — using hardcoded list`);
    }
  }

  console.log(`  Total holiday set: ${combined.size} dates (years: ${years.join(', ')})`);
  return combined;
}

// ── Collect bad dates ────────────────────────────────────────────────────────

async function collectBadDates(): Promise<{ date: string; reason: string }[]> {
  const allDates = await prisma.screenerPrice.findMany({
    select: { date: true },
    distinct: ['date'],
    orderBy: { date: 'asc' },
  });

  // Determine which years we need to check
  const years = new Set<number>();
  for (const { date } of allDates) {
    years.add(parseInt(date.slice(0, 4)));
  }

  console.log(`  Building NSE holiday set for years: ${[...years].sort().join(', ')}`);
  const holidaySet = await buildHolidaySet([...years].sort());

  const bad: { date: string; reason: string }[] = [];
  for (const { date } of allDates) {
    if (isWeekend(date)) {
      bad.push({ date, reason: 'weekend' });
    } else if (holidaySet.has(date)) {
      bad.push({ date, reason: 'holiday' });
    }
  }

  return bad;
}

// ── Verify counts ────────────────────────────────────────────────────────────

async function printSummary(bad: { date: string; reason: string }[]) {
  console.log('\n=== Dates to purge ===');
  let totalPrices = 0;
  let totalRankings = 0;
  let totalScores = 0;

  for (const { date, reason } of bad) {
    const dow = new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
    const [prices, rankings, scores] = await Promise.all([
      prisma.screenerPrice.count({ where: { date } }),
      prisma.rankingHistory.count({ where: { date } }),
      prisma.momentumScore.count({ where: { computedDate: date } }),
    ]);
    totalPrices += prices;
    totalRankings += rankings;
    totalScores += scores;
    console.log(`  ${date} (${dow}) [${reason}]  prices=${prices}  rankings=${rankings}  scores=${scores}`);
  }

  console.log(`\nTotal to delete: ${totalPrices} price rows, ${totalRankings} ranking rows, ${totalScores} score rows`);
  return { totalPrices, totalRankings, totalScores };
}

// ── Delete ────────────────────────────────────────────────────────────────────

async function purge(bad: { date: string; reason: string }[]) {
  for (const { date } of bad) {
    await prisma.rankingHistory.deleteMany({ where: { date } });
    await prisma.momentumScore.deleteMany({ where: { computedDate: date } });
    await prisma.screenerPrice.deleteMany({ where: { date } });
    process.stdout.write(`  Purged ${date}\n`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (dryRun) console.log('DRY RUN — no data will be deleted\n');

  console.log('Scanning ScreenerPrice for bad dates (weekends + NSE market holidays)...');
  const badDates = await collectBadDates();

  if (badDates.length === 0) {
    console.log('\nNo bad dates found — database is clean!');
    await prisma.$disconnect();
    return;
  }

  const { totalPrices, totalRankings, totalScores } = await printSummary(badDates);

  if (dryRun) {
    console.log('\nDry run complete. Run without --dry-run to delete.');
    await prisma.$disconnect();
    return;
  }

  if (totalPrices === 0 && totalRankings === 0 && totalScores === 0) {
    console.log('\nAll bad dates already empty — nothing to delete.');
    await prisma.$disconnect();
    return;
  }

  console.log('\nDeleting...');
  await purge(badDates);

  console.log(`\nDone. Deleted data for ${badDates.length} bad dates.`);
  console.log('\nNext steps:');
  console.log('  1. node node_modules/.bin/tsx scripts/seed-screener-prices.ts   # fill price gaps (~8 min)');
  console.log('  2. node node_modules/.bin/tsx scripts/backfill-rank-history.ts  # recompute rankings');

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Purge failed:', err);
  process.exit(1);
});
