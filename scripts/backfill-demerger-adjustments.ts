/**
 * One-time backfill: adjust ScreenerPrice + StockATH for all demergers in the last 24 months.
 *
 * Steps:
 *   1. Ensure ScreenerDemerger table exists
 *   2. Fetch demerger events from NSE (24 months)
 *   3. For each demerger with matching ScreenerPrice data:
 *      - Compute ratio = open(exDate) / close(dayBefore)
 *      - Multiply all pre-exDate OHLC by ratio
 *      - Adjust StockATH
 *      - Record in ScreenerDemerger
 *   4. Print summary
 *
 * After this script, run:
 *   - run-pipeline.ts        → recompute MomentumScore with adjusted prices
 *   - backfill-rank-history.ts → rebuild 50-day rank history
 *
 * Usage:
 *   npx tsx scripts/backfill-demerger-adjustments.ts
 *   npx tsx scripts/backfill-demerger-adjustments.ts --dry-run
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { prisma } from './lib/db';
import { fetchNSECorporateActions, type NSECorporateAction } from '../src/lib/nse-api';
import { parse, format } from 'date-fns';

const DRY_RUN = process.argv.includes('--dry-run');
if (DRY_RUN) console.log('🔍 DRY RUN — no writes will be made\n');

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseNSEDateToISO(dateStr: string): string | null {
  if (!dateStr || dateStr === '-') return null;
  try {
    const parsed = parse(dateStr, 'dd-MMM-yyyy', new Date());
    if (isNaN(parsed.getTime())) return null;
    return format(parsed, 'yyyy-MM-dd');
  } catch {
    return null;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Demerger Price Adjustment Backfill ===\n');

  // Step 1: Ensure table exists + load already-applied
  let appliedSet = new Set<string>();
  if (!DRY_RUN) {
    console.log('Step 1: Ensuring ScreenerDemerger table exists...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ScreenerDemerger" (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT,
        "symbol" TEXT NOT NULL,
        "exDate" TEXT NOT NULL,
        "ratio" REAL NOT NULL,
        "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "ScreenerDemerger_symbol_exDate_key"
      ON "ScreenerDemerger" ("symbol", "exDate")
    `);
    console.log('  ✅ Table ready\n');

    const existing = await prisma.$queryRawUnsafe<Array<{ symbol: string; exDate: string }>>(
      `SELECT "symbol", "exDate" FROM "ScreenerDemerger"`,
    );
    appliedSet = new Set(existing.map(e => `${e.symbol}:${e.exDate}`));
    console.log(`  Already applied: ${existing.length} demerger adjustments\n`);
  } else {
    console.log('Step 1: Skipped table creation (dry run)\n');
  }

  // Step 3: Fetch demergers from NSE (24 months)
  console.log('Step 2: Fetching demergers from NSE (24 months)...');
  const now = new Date();
  const fromDate = new Date(now);
  fromDate.setMonth(fromDate.getMonth() - 24);

  const demergers = await fetchNSECorporateActions(fromDate, now, 'DEMERGER');
  if (!demergers || demergers.length === 0) {
    console.log('  No demergers found. Done.');
    await prisma.$disconnect();
    return;
  }

  // Filter to EQ series
  const eqDemergers = demergers.filter(a => a.series === 'EQ');
  console.log(`  Found ${demergers.length} demergers (${eqDemergers.length} EQ series)\n`);

  // Step 4: Get all symbols in ScreenerPrice
  const allSymbols = await prisma.$queryRawUnsafe<Array<{ symbol: string }>>(
    `SELECT DISTINCT "symbol" FROM "ScreenerPrice"`,
  );
  const universeSymbols = new Set(allSymbols.map(s => s.symbol));
  console.log(`  ScreenerPrice universe: ${universeSymbols.size} symbols\n`);

  // Step 5: Process each demerger
  console.log('Step 3: Adjusting prices...\n');
  const adjusted: Array<{ symbol: string; exDate: string; ratio: number }> = [];
  const skipped: Array<{ symbol: string; reason: string }> = [];

  for (const action of eqDemergers) {
    const { symbol } = action;

    // Must have ScreenerPrice data
    if (!universeSymbols.has(symbol)) {
      skipped.push({ symbol, reason: 'not in ScreenerPrice' });
      continue;
    }

    // Parse ex-date
    const exDate = parseNSEDateToISO(action.exDate);
    if (!exDate) {
      skipped.push({ symbol, reason: `invalid exDate "${action.exDate}"` });
      continue;
    }

    // Skip if already applied
    if (appliedSet.has(`${symbol}:${exDate}`)) {
      skipped.push({ symbol, reason: `already adjusted (${exDate})` });
      continue;
    }

    // Get close before ex-date
    const beforeRows = await prisma.$queryRawUnsafe<Array<{ date: string; close: number }>>(
      `SELECT "date", "close" FROM "ScreenerPrice"
       WHERE "symbol" = ? AND "date" < ?
       ORDER BY "date" DESC LIMIT 1`,
      symbol, exDate,
    );

    // Get open on/after ex-date
    const afterRows = await prisma.$queryRawUnsafe<Array<{ date: string; open: number }>>(
      `SELECT "date", "open" FROM "ScreenerPrice"
       WHERE "symbol" = ? AND "date" >= ?
       ORDER BY "date" ASC LIMIT 1`,
      symbol, exDate,
    );

    if (beforeRows.length === 0 || afterRows.length === 0) {
      skipped.push({ symbol, reason: `missing price data around ${exDate}` });
      continue;
    }

    const closeBefore = beforeRows[0].close;
    const openAfter = afterRows[0].open;

    if (closeBefore <= 0) {
      skipped.push({ symbol, reason: `zero close on ${beforeRows[0].date}` });
      continue;
    }

    const ratio = openAfter / closeBefore;

    // Sanity check
    if (ratio < 0.3 || ratio > 0.95) {
      skipped.push({ symbol, reason: `ratio ${ratio.toFixed(4)} out of [0.3, 0.95] range` });
      continue;
    }

    console.log(
      `  ${symbol}: ${beforeRows[0].date} close=₹${closeBefore.toFixed(2)} → ` +
      `${afterRows[0].date} open=₹${openAfter.toFixed(2)} → ratio=${ratio.toFixed(4)}`
    );

    if (!DRY_RUN) {
      // Count affected rows
      const countResult = await prisma.$queryRawUnsafe<Array<{ cnt: number }>>(
        `SELECT COUNT(*) as cnt FROM "ScreenerPrice" WHERE "symbol" = ? AND "date" < ?`,
        symbol, exDate,
      );
      const rowCount = countResult[0]?.cnt ?? 0;

      // Adjust OHLC for all pre-exDate rows
      await prisma.$executeRawUnsafe(
        `UPDATE "ScreenerPrice"
         SET "open" = "open" * ?,
             "high" = "high" * ?,
             "low"  = "low"  * ?,
             "close"= "close"* ?
         WHERE "symbol" = ? AND "date" < ?`,
        ratio, ratio, ratio, ratio,
        symbol, exDate,
      );
      console.log(`    → Adjusted ${rowCount} ScreenerPrice rows`);

      // Adjust StockATH
      const athRows = await prisma.$queryRawUnsafe<Array<{ ath: number; athDate: string }>>(
        `SELECT "ath", "athDate" FROM "StockATH" WHERE "symbol" = ?`,
        symbol,
      );
      if (athRows.length > 0) {
        const oldATH = athRows[0].ath;
        const adjustedATH = oldATH * ratio;

        // Find max high in adjusted ScreenerPrice
        const maxHighRows = await prisma.$queryRawUnsafe<Array<{ high: number; date: string }>>(
          `SELECT "high", "date" FROM "ScreenerPrice"
           WHERE "symbol" = ? ORDER BY "high" DESC LIMIT 1`,
          symbol,
        );

        const newATH = maxHighRows.length > 0 && maxHighRows[0].high > adjustedATH
          ? maxHighRows[0].high : adjustedATH;
        const newATHDate = maxHighRows.length > 0 && maxHighRows[0].high >= newATH
          ? maxHighRows[0].date : athRows[0].athDate;

        await prisma.$executeRawUnsafe(
          `UPDATE "StockATH" SET "ath" = ?, "athDate" = ?, "updatedAt" = datetime('now')
           WHERE "symbol" = ?`,
          newATH, newATHDate, symbol,
        );
        console.log(`    → ATH: ₹${oldATH.toFixed(2)} → ₹${newATH.toFixed(2)}`);
      }

      // Record for idempotency
      await prisma.$executeRawUnsafe(
        `INSERT INTO "ScreenerDemerger" ("symbol", "exDate", "ratio", "appliedAt")
         VALUES (?, ?, ?, datetime('now'))`,
        symbol, exDate, ratio,
      );
    }

    adjusted.push({ symbol, exDate, ratio });
  }

  // Summary
  console.log('\n=== Summary ===');
  console.log(`Adjusted: ${adjusted.length}`);
  for (const a of adjusted) {
    console.log(`  ${a.symbol} (${a.exDate}): ratio=${a.ratio.toFixed(4)}`);
  }

  if (skipped.length > 0) {
    console.log(`\nSkipped: ${skipped.length}`);
    for (const s of skipped) {
      console.log(`  ${s.symbol}: ${s.reason}`);
    }
  }

  if (adjusted.length > 0 && !DRY_RUN) {
    console.log('\n✅ Adjustments applied. Next steps:');
    console.log('  1. Run pipeline:  node --env-file=.env --env-file=.env.local node_modules/.bin/tsx scripts/run-pipeline.ts');
    console.log('  2. Backfill ranks: node --env-file=.env --env-file=.env.local node_modules/.bin/tsx scripts/backfill-rank-history.ts');
  }

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
