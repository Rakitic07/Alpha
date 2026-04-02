/**
 * Fill gaps in ScreenerPrice — re-fetches candle history from 2024-01-01 for every
 * instrument and inserts any dates that are missing from the DB.
 *
 * Background: the initial bulk-fetch (Jan 2026) hit Cloudflare rate limits causing
 * ~32% of trading days to be skipped per stock. This script fills those gaps so the
 * 50-day rank-history backfill has enough data to score early Feb/Mar 2026 dates.
 *
 * After this script completes, run:
 *   node_modules/.bin/tsx scripts/backfill-rank-history.ts
 *
 * Usage:
 *   node_modules/.bin/tsx scripts/fill-price-gaps.ts
 *   node_modules/.bin/tsx scripts/fill-price-gaps.ts --dry-run
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { prisma, chunkArray } from './lib/db';
function getAccessToken(): string {
  const token = process.env.UPSTOX_ANALYTICS_TOKEN;
  if (!token) throw new Error("Missing UPSTOX_ANALYTICS_TOKEN in env");
  return token;
}

const DRY_RUN = process.argv.includes('--dry-run');
const CONCURRENCY = 5;
const STAGGER_MS   = 150;
const FROM_DATE    = '2024-01-01'; // fetch back to this date for everyone

interface InstrumentRow { symbol: string; instrumentKey: string }
interface Candle { date: string; open: number; high: number; low: number; close: number; volume: number }

// ── API helpers ───────────────────────────────────────────────────────────────

async function fetchCandles(instrumentKey: string, fromDate: string, toDate: string, token: string): Promise<Candle[]> {
  const encoded = encodeURIComponent(instrumentKey);
  const url = `https://api.upstox.com/v3/historical-candle/${encoded}/days/1/${toDate}/${fromDate}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`${res.status}: ${txt.slice(0, 120)}`);
  }
  const json = await res.json();
  return (json.data?.candles ?? []).map((c: (string | number)[]) => ({
    date:   (c[0] as string).slice(0, 10),
    open:   c[1] as number,
    high:   c[2] as number,
    low:    c[3] as number,
    close:  c[4] as number,
    volume: Math.round(c[5] as number),
  }));
}

// ── Concurrency helper ────────────────────────────────────────────────────────

async function withConcurrency<T>(
  items: T[],
  concurrency: number,
  staggerMs: number,
  fn: (item: T, idx: number) => Promise<void>,
): Promise<void> {
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      await fn(items[i], i);
    }
  }
  const workers: Promise<void>[] = [];
  for (let w = 0; w < Math.min(concurrency, items.length); w++) {
    if (w > 0) await new Promise(r => setTimeout(r, staggerMs));
    workers.push(worker());
  }
  await Promise.all(workers);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const start = Date.now();

  // Load all (symbol, instrumentKey) pairs from ScreenerPrice
  const instruments: InstrumentRow[] = await prisma.$queryRaw`
    SELECT symbol, instrumentKey FROM ScreenerPrice
    GROUP BY symbol, instrumentKey
  `;
  console.log(`\n🔍 ${instruments.length} instruments to check\n`);

  const token = getAccessToken();
  const today = new Date().toISOString().slice(0, 10);

  let totalInserted = 0;
  let totalSkipped  = 0;
  let totalErrors   = 0;
  let done = 0;

  await withConcurrency(instruments, CONCURRENCY, STAGGER_MS, async (inst, i) => {
    try {
      // Fetch full candle history from FROM_DATE
      const candles = await fetchCandles(inst.instrumentKey, FROM_DATE, today, token);
      if (candles.length === 0) { done++; return; }

      // Load existing dates for this symbol
      const existing = new Set(
        (await prisma.screenerPrice.findMany({
          where: { symbol: inst.symbol, date: { gte: FROM_DATE } },
          select: { date: true },
        })).map(r => r.date)
      );

      const newRows = candles
        .filter(c => !existing.has(c.date))
        .map(c => ({
          symbol: inst.symbol,
          instrumentKey: inst.instrumentKey,
          date: c.date,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
        }));

      if (newRows.length > 0 && !DRY_RUN) {
        for (const chunk of chunkArray(newRows, 50)) {
          await prisma.screenerPrice.createMany({ data: chunk });
        }
      }

      totalInserted += newRows.length;
      totalSkipped  += candles.length - newRows.length;
      done++;

      if (newRows.length > 0 || done % 100 === 0) {
        process.stdout.write(
          `\r  [${done}/${instruments.length}] inserted=${totalInserted} skipped=${totalSkipped} errors=${totalErrors}   `
        );
      }
    } catch (err) {
      totalErrors++;
      done++;
      if (process.env.VERBOSE) {
        console.error(`\n  ✗ ${inst.symbol}: ${(err as Error).message}`);
      }
    }
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n\n✅ Done in ${elapsed}s`);
  console.log(`   Inserted: ${totalInserted} new rows`);
  console.log(`   Skipped:  ${totalSkipped} existing rows`);
  console.log(`   Errors:   ${totalErrors} instruments failed`);
  if (DRY_RUN) console.log('\n(DRY RUN — no writes made)');
  if (!DRY_RUN && totalInserted > 0) {
    console.log('\nNext: node_modules/.bin/tsx scripts/backfill-rank-history.ts');
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
