/**
 * One-shot: patch today's OHLCV for all instruments using the batch market-quote endpoint.
 * ~4 API calls for 2000 stocks. Run when the historical candle backfill is blocked.
 *
 * Usage: npx tsx scripts/patch-today-prices.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { prisma, chunkArray } from './lib/db';

const TOKEN = process.env.UPSTOX_ANALYTICS_TOKEN;
if (!TOKEN) throw new Error('Missing UPSTOX_ANALYTICS_TOKEN in .env.local');

const NSE_INSTRUMENTS_URL = 'https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz';

// Today in IST (YYYY-MM-DD)
function todayIST(): string {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function loadInstruments(): Promise<{ symbol: string; instrumentKey: string }[]> {
  const { gunzipSync } = require('zlib');
  const res = await fetch(NSE_INSTRUMENTS_URL);
  const buf = Buffer.from(await res.arrayBuffer());
  const json = JSON.parse(gunzipSync(buf).toString());
  return (json as { instrument_key: string; tradingsymbol: string; trading_symbol?: string; instrument_type: string }[])
    .filter(i => i.instrument_type === 'EQ' && i.instrument_key.startsWith('NSE_EQ|'))
    .map(i => ({ symbol: i.trading_symbol ?? i.tradingsymbol, instrumentKey: i.instrument_key }));
}

async function fetchOHLCBatch(keys: string[]): Promise<Map<string, { open: number; high: number; low: number; close: number; volume: number }>> {
  const url = `https://api.upstox.com/v3/market-quote/ohlc?instrument_key=${keys.map(k => encodeURIComponent(k)).join(',')}&interval=1d`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`OHLC fetch failed: ${res.status}`);
  const json = await res.json();
  const result = new Map<string, { open: number; high: number; low: number; close: number; volume: number }>();
  for (const [, val] of Object.entries(json.data ?? {})) {
    const v = val as { instrument_token: string; live_ohlc?: { open: number; high: number; low: number; close: number; volume: number }; prev_ohlc?: { open: number; high: number; low: number; close: number; volume: number } };
    const ohlc = v.live_ohlc ?? v.prev_ohlc;
    if (ohlc && v.instrument_token) result.set(v.instrument_token, ohlc);
  }
  return result;
}

async function main() {
  const today = todayIST();
  console.log(`Patching prices for ${today}...`);

  const instruments = await loadInstruments();
  console.log(`Loaded ${instruments.length} instruments from Upstox master`);

  // Batch OHLC in chunks of 500
  const ohlcMap = new Map<string, { open: number; high: number; low: number; close: number; volume: number }>();
  const keys = instruments.map(i => i.instrumentKey);
  for (let i = 0; i < keys.length; i += 500) {
    const batch = keys.slice(i, i + 500);
    const batchResult = await fetchOHLCBatch(batch);
    for (const [k, v] of batchResult) ohlcMap.set(k, v);
    process.stdout.write(`\rFetched OHLC: ${Math.min(i + 500, keys.length)}/${keys.length}`);
  }
  console.log(`\nGot OHLC data for ${ohlcMap.size} instruments`);

  const rows = instruments
    .filter(i => ohlcMap.has(i.instrumentKey))
    .map(i => {
      const ohlc = ohlcMap.get(i.instrumentKey)!;
      return { symbol: i.symbol, instrumentKey: i.instrumentKey, date: today, open: ohlc.open, high: ohlc.high, low: ohlc.low, close: ohlc.close, volume: Math.round(ohlc.volume) };
    });

  // Delete today's rows then batch insert
  const symbols = rows.map(r => r.symbol);
  for (const chunk of chunkArray(symbols, 500)) {
    await prisma.screenerPrice.deleteMany({ where: { symbol: { in: chunk }, date: today } });
  }
  for (const chunk of chunkArray(rows, 100)) {
    await prisma.screenerPrice.createMany({ data: chunk });
  }

  console.log(`Done — patched ${rows.length} stocks for ${today}`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
