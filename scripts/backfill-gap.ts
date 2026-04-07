/**
 * Backfill missing price gaps by fetching historical candles.
 * Uses standalone DB client (no server-only import chain).
 * 3 workers × 300ms throttle (~3 req/s) to stay under Cloudflare WAF limits.
 *
 * Usage: npx tsx scripts/backfill-gap.ts [toDate]
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { prisma, chunkArray } from './lib/db';

const toDate = process.argv[2] || new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

// Direct Upstox historical candle fetch (avoids server-only import chain)
async function fetchCandles(instrumentKey: string, fromDate: string, toDate: string) {
  const token = process.env.UPSTOX_ANALYTICS_TOKEN;
  if (!token) throw new Error('Missing UPSTOX_ANALYTICS_TOKEN');

  const encoded = encodeURIComponent(instrumentKey);
  const url = `https://api.upstox.com/v3/historical-candle/${encoded}/days/1/${toDate}/${fromDate}`;

  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) throw Object.assign(new Error('Rate limited'), { rateLimited: true });
    throw new Error(`${res.status}: ${text.slice(0, 100)}`);
  }

  const json = await res.json();
  return (json.data?.candles || []).map((c: (string | number)[]) => ({
    timestamp: c[0] as string,
    open: c[1] as number,
    high: c[2] as number,
    low: c[3] as number,
    close: c[4] as number,
    volume: c[5] as number,
  }));
}

function nextDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log(`Backfilling prices up to ${toDate}`);

  // Get all instruments from price table
  const instruments = await prisma.screenerPrice.findMany({
    select: { symbol: true, instrumentKey: true },
    distinct: ['symbol'],
  });
  console.log(`${instruments.length} instruments in price table`);

  // Find last stored date per symbol
  const lastDates = new Map<string, string>();
  for (const chunk of chunkArray(instruments.map(i => i.symbol), 500)) {
    const rows = await prisma.screenerPrice.findMany({
      where: { symbol: { in: chunk } },
      select: { symbol: true, date: true },
      orderBy: { date: 'desc' },
      distinct: ['symbol'],
    });
    for (const r of rows) lastDates.set(r.symbol, r.date);
  }

  // Build fetch list
  const instMap = new Map(instruments.map(i => [i.symbol, i.instrumentKey]));
  const needsFetch: { symbol: string; instrumentKey: string; fromDate: string }[] = [];
  for (const [symbol, lastDate] of lastDates) {
    if (lastDate >= toDate) continue;
    const fromDate = nextDay(lastDate);
    if (fromDate > toDate) continue;
    const instrumentKey = instMap.get(symbol);
    if (instrumentKey) needsFetch.push({ symbol, instrumentKey, fromDate });
  }

  console.log(`${needsFetch.length} instruments need backfill`);
  if (needsFetch.length === 0) { console.log('Nothing to do'); return; }

  // Process with concurrency control
  let totalInserted = 0;
  let completed = 0;
  let errors = 0;
  let rateLimited = 0;
  const CONCURRENCY = 3;
  const THROTTLE_MS = 300;

  let idx = 0;

  async function worker() {
    while (idx < needsFetch.length) {
      const i = idx++;
      const item = needsFetch[i];
      try {
        const candles = await fetchCandles(item.instrumentKey, item.fromDate, toDate);
        if (candles.length > 0) {
          const rows = candles.map((c: { timestamp: string; open: number; high: number; low: number; close: number; volume: number }) => ({
            symbol: item.symbol,
            instrumentKey: item.instrumentKey,
            date: new Date(c.timestamp).toISOString().slice(0, 10),
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: Math.round(c.volume),
          }));

          // Check existing to avoid duplicates
          const existingDates = new Set(
            (await prisma.screenerPrice.findMany({
              where: { symbol: item.symbol, date: { in: rows.map((r: { date: string }) => r.date) } },
              select: { date: true },
            })).map((r: { date: string }) => r.date)
          );
          const newRows = rows.filter((r: { date: string }) => !existingDates.has(r.date));
          if (newRows.length > 0) {
            await prisma.screenerPrice.createMany({ data: newRows });
            totalInserted += newRows.length;
          }
        }
        completed++;
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'rateLimited' in err) {
          rateLimited++;
        } else {
          errors++;
        }
        completed++;
      }
      if (THROTTLE_MS > 0) await sleep(THROTTLE_MS);
      if (completed % 200 === 0) {
        console.log(`  ${completed}/${needsFetch.length} done, ${totalInserted} rows inserted, ${errors} errors, ${rateLimited} rate-limited`);
      }
    }
  }

  console.log(`Fetching (${CONCURRENCY} workers × ${THROTTLE_MS}ms throttle)...`);
  const start = Date.now();

  // Stagger worker starts
  const workers = [];
  for (let w = 0; w < CONCURRENCY; w++) {
    if (w > 0) await sleep(THROTTLE_MS);
    workers.push(worker());
  }
  await Promise.all(workers);

  const secs = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\nDone in ${secs}s: ${completed} stocks, ${totalInserted} rows inserted, ${errors} errors, ${rateLimited} rate-limited`);

  // Verify
  for (const d of ['2026-03-31', '2026-04-01', '2026-04-02', '2026-04-03', '2026-04-07']) {
    const count = await prisma.screenerPrice.count({ where: { date: d } });
    console.log(`  Prices for ${d}: ${count}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
