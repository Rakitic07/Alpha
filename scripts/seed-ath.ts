/**
 * One-time ATH seed script.
 * Fetches monthly candles from 2000-01-01 for all NSE_EQ stocks and populates StockATH.
 *
 * Usage: npx tsx scripts/seed-ath.ts
 * Estimated time: ~7 minutes for ~2000 stocks (5 concurrent)
 */

import { gunzipSync } from 'zlib';
import { prisma } from './lib/db';

// Inline the instrument master loading (avoids server-only chain)
const NSE_INSTRUMENTS_URL = 'https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz';
const UPSTOX_HISTORICAL_URL = 'https://api.upstox.com/v3/historical-candle';

interface Instrument {
  instrument_key: string;
  tradingsymbol: string;
  trading_symbol?: string;
  name: string;
  instrument_type: string;
}

async function loadInstruments(): Promise<Array<{ symbol: string; key: string; name: string }>> {
  console.log('Downloading NSE instrument master...');
  const res = await fetch(NSE_INSTRUMENTS_URL);
  const buf = Buffer.from(await res.arrayBuffer());
  const json = gunzipSync(buf).toString('utf8');
  const data: Instrument[] = JSON.parse(json);

  // Filter to EQ + whitelisted ETFs
  const etfWhitelist = new Set(['GOLDBEES', 'SILVERBEES']);
  const result: Array<{ symbol: string; key: string; name: string }> = [];

  for (const inst of data) {
    const symbol = (inst.tradingsymbol || inst.trading_symbol || '').toUpperCase();
    const type = (inst.instrument_type || '').toUpperCase();

    if (type === 'EQ' || type === 'EQUITY' || etfWhitelist.has(symbol)) {
      result.push({ symbol, key: inst.instrument_key, name: inst.name || symbol });
    }
  }

  return result;
}

async function fetchMonthlyCandles(instrumentKey: string): Promise<Array<{ high: number; date: string }>> {
  const encodedKey = encodeURIComponent(instrumentKey);
  const today = new Date().toISOString().split('T')[0];
  const url = `${UPSTOX_HISTORICAL_URL}/${encodedKey}/months/1/${today}/2000-01-01`;

  const res = await fetch(url);
  if (!res.ok) return [];

  const json = await res.json();
  const candles = json?.data?.candles;
  if (!Array.isArray(candles)) return [];

  return candles.map((c: [string, number, number, number, number, number, number]) => ({
    high: c[2], // [timestamp, open, high, low, close, volume, oi]
    date: new Date(c[0]).toISOString().split('T')[0],
  }));
}

async function withConcurrency<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  limit: number,
): Promise<{ successes: number; errors: string[] }> {
  const errors: string[] = [];
  let successes = 0;
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      try {
        await fn(items[i]);
        successes++;
      } catch (err) {
        errors.push(`${items[i]}: ${(err as Error).message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return { successes, errors };
}

async function main() {
  const instruments = await loadInstruments();
  console.log(`Found ${instruments.length} NSE_EQ instruments`);

  let processed = 0;

  const result = await withConcurrency(
    instruments,
    async (inst) => {
      const candles = await fetchMonthlyCandles(inst.key);
      if (candles.length === 0) return;

      let maxHigh = 0;
      let maxDate = '';
      for (const c of candles) {
        if (c.high > maxHigh) {
          maxHigh = c.high;
          maxDate = c.date;
        }
      }

      if (maxHigh > 0) {
        await prisma.stockATH.upsert({
          where: { symbol: inst.symbol },
          create: { symbol: inst.symbol, instrumentKey: inst.key, ath: maxHigh, athDate: maxDate },
          update: { ath: maxHigh, athDate: maxDate, instrumentKey: inst.key, updatedAt: new Date() },
        });
      }

      processed++;
      if (processed % 100 === 0) {
        console.log(`  Progress: ${processed}/${instruments.length}`);
      }
    },
    5,
  );

  console.log(`\nDone! Seeded: ${result.successes}, Errors: ${result.errors.length}`);
  if (result.errors.length > 0) {
    console.log('First 10 errors:');
    result.errors.slice(0, 10).forEach(e => console.log(`  ${e}`));
  }

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
