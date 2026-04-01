/**
 * One-shot: patch today's OHLCV for all instruments using the batch market-quote endpoint.
 * ~4 API calls for 2000 stocks. Run this when the historical candle backfill is blocked.
 *
 * Usage: npx tsx scripts/patch-today-prices.ts
 */

import { ensureInstrumentMaster, getAllSymbols, getAllInstrumentData } from '../src/lib/instrument-service';
import { patchTodayPrices } from '../src/lib/screener/prices';
import { effectiveTradingDay } from '../src/lib/screener/dates';

async function main() {
  const today = effectiveTradingDay();
  console.log(`Patching prices for ${today}...`);

  await ensureInstrumentMaster();
  const allSymbols = await getAllSymbols();
  const instrumentMap = await getAllInstrumentData(allSymbols);
  const instruments = Array.from(instrumentMap, ([symbol, data]) => ({
    symbol,
    instrumentKey: data.key,
  }));

  console.log(`Loaded ${instruments.length} instruments`);

  const result = await patchTodayPrices(instruments, today);
  console.log(`Patched ${result.patched} stocks`);
  if (result.errors.length > 0) console.warn('Errors:', result.errors);

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
