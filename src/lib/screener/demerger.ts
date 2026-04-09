/**
 * Demerger detection and price adjustment for the momentum screener.
 *
 * Unlike splits/bonuses, Upstox does NOT retroactively adjust prices after demergers.
 * This module uses the NSE corporate actions API to identify demerger events,
 * computes the price adjustment ratio from the ex-date boundary, and adjusts
 * all pre-ex-date ScreenerPrice candles + StockATH to a post-demerger basis.
 *
 * Ratio = open(exDate) / close(dayBefore)
 *   - Uses open (not close) because the demerger happens overnight;
 *     the ex-date open is the first post-demerger price before any trading.
 */

import { prisma } from '@/lib/db';
import { fetchNSECorporateActions, type NSECorporateAction } from '@/lib/nse-api';
import { todayIST, toDateStr, daysAgo } from './dates';
import { logger } from '@/lib/logger';
import { parse } from 'date-fns';

const dmLogger = logger.scope('Demerger');

// ============================================================================
// Helpers
// ============================================================================

/** Parse NSE date format "24-Apr-2025" → "2025-04-24" */
function parseNSEDateToStr(dateStr: string): string | null {
  if (!dateStr || dateStr === '-') return null;
  try {
    const parsed = parse(dateStr, 'dd-MMM-yyyy', new Date());
    if (isNaN(parsed.getTime())) return null;
    return toDateStr(parsed);
  } catch {
    return null;
  }
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Fetch demerger events from NSE for a date range.
 * Returns only demerger entries (subject=DEMERGER).
 */
export async function fetchDemergers(
  fromDate: Date,
  toDate: Date,
): Promise<NSECorporateAction[]> {
  const actions = await fetchNSECorporateActions(fromDate, toDate, 'DEMERGER');
  if (!actions) return [];
  // Filter to EQ series only
  return actions.filter(a => a.series === 'EQ');
}

/**
 * Adjust ScreenerPrice candles and StockATH for a single demerger event.
 *
 * 1. Finds close on last trading day before exDate and open on exDate
 * 2. Computes ratio = open(exDate) / close(dayBefore)
 * 3. Multiplies all pre-exDate OHLC by ratio (volume untouched)
 * 4. Adjusts StockATH: ath × ratio
 * 5. Records in ScreenerDemerger for idempotency
 *
 * Returns the computed ratio, or null if adjustment could not be applied.
 */
export async function adjustDemergerPrices(
  symbol: string,
  exDate: string, // YYYY-MM-DD
): Promise<{ ratio: number } | null> {
  // Get the last close BEFORE ex-date
  const beforeRow = await prisma.screenerPrice.findFirst({
    where: { symbol, date: { lt: exDate } },
    orderBy: { date: 'desc' },
    select: { date: true, close: true },
  });

  // Get the open ON/AFTER ex-date (handles trading halts)
  const afterRow = await prisma.screenerPrice.findFirst({
    where: { symbol, date: { gte: exDate } },
    orderBy: { date: 'asc' },
    select: { date: true, open: true },
  });

  if (!beforeRow || !afterRow) {
    dmLogger.warn(`${symbol}: missing price data around ex-date ${exDate} — skipping`);
    return null;
  }

  if (beforeRow.close <= 0) {
    dmLogger.warn(`${symbol}: zero/negative close on ${beforeRow.date} — skipping`);
    return null;
  }

  const ratio = afterRow.open / beforeRow.close;

  // Sanity: demerger shouldn't remove >70% of value or increase it
  if (ratio < 0.3 || ratio > 0.95) {
    dmLogger.warn(
      `${symbol}: ratio ${ratio.toFixed(4)} out of range [0.3, 0.95] ` +
      `(${beforeRow.date} close=${beforeRow.close}, ${afterRow.date} open=${afterRow.open}) — skipping`
    );
    return null;
  }

  dmLogger.info(
    `${symbol}: adjusting for demerger on ${exDate} — ratio=${ratio.toFixed(4)} ` +
    `(${beforeRow.date} close=${beforeRow.close} → ${afterRow.date} open=${afterRow.open})`
  );

  // Adjust all pre-exDate OHLC (volume NOT adjusted — share count unchanged in demerger)
  // Use raw SQL for bulk update efficiency
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

  // Adjust StockATH
  const athRow = await prisma.stockATH.findUnique({ where: { symbol } });
  if (athRow) {
    const adjustedATH = athRow.ath * ratio;
    // Recompute athDate from adjusted ScreenerPrice highs
    const maxHighRow = await prisma.screenerPrice.findFirst({
      where: { symbol },
      orderBy: { high: 'desc' },
      select: { high: true, date: true },
    });
    const newATH = maxHighRow && maxHighRow.high > adjustedATH ? maxHighRow.high : adjustedATH;
    const newATHDate = maxHighRow && maxHighRow.high >= newATH ? maxHighRow.date : athRow.athDate;

    await prisma.stockATH.update({
      where: { symbol },
      data: { ath: newATH, athDate: newATHDate, updatedAt: new Date() },
    });
    dmLogger.info(`${symbol}: ATH ${athRow.ath.toFixed(2)} → ${newATH.toFixed(2)}`);
  }

  // Record for idempotency (raw SQL — table created outside Prisma generate)
  await prisma.$executeRawUnsafe(
    `INSERT INTO "ScreenerDemerger" ("symbol", "exDate", "ratio", "appliedAt")
     VALUES (?, ?, ?, datetime('now'))`,
    symbol, exDate, ratio,
  );

  return { ratio };
}

/**
 * Detect and adjust demergers for the stock universe.
 * Called from the daily pipeline. Fetches recent demergers from NSE,
 * filters to our universe, skips already-applied, and adjusts the rest.
 *
 * @param universeSymbols Set of symbols in the current stock universe
 * @param lookbackDays How far back to check for demergers (default: 90 days)
 */
export async function detectAndAdjustDemergers(
  universeSymbols: Set<string>,
  lookbackDays = 90,
): Promise<{ adjusted: string[]; errors: string[] }> {
  const adjusted: string[] = [];
  const errors: string[] = [];

  const today = todayIST();
  const fromDate = new Date(daysAgo(lookbackDays, today) + 'T00:00:00Z');
  const toDate = new Date(today + 'T00:00:00Z');

  let demergers: NSECorporateAction[];
  try {
    demergers = await fetchDemergers(fromDate, toDate);
  } catch (err) {
    const msg = `Failed to fetch demergers: ${(err as Error).message}`;
    dmLogger.error(msg);
    errors.push(msg);
    return { adjusted, errors };
  }

  if (demergers.length === 0) {
    dmLogger.info('No demergers found in date range');
    return { adjusted, errors };
  }

  dmLogger.info(`Found ${demergers.length} demergers from NSE, checking against universe...`);

  // Load already-applied demergers (raw SQL — table created outside Prisma generate)
  const existingAdj = await prisma.$queryRawUnsafe<Array<{ symbol: string; exDate: string }>>(
    `SELECT "symbol", "exDate" FROM "ScreenerDemerger"`,
  );
  const appliedSet = new Set(existingAdj.map(e => `${e.symbol}:${e.exDate}`));

  for (const action of demergers) {
    const { symbol } = action;

    // Must be in our stock universe
    if (!universeSymbols.has(symbol)) continue;

    // Parse ex-date
    const exDate = parseNSEDateToStr(action.exDate);
    if (!exDate) {
      dmLogger.warn(`${symbol}: could not parse ex-date "${action.exDate}"`);
      continue;
    }

    // Skip if already applied
    if (appliedSet.has(`${symbol}:${exDate}`)) {
      dmLogger.info(`${symbol}: demerger ${exDate} already adjusted — skipping`);
      continue;
    }

    try {
      const result = await adjustDemergerPrices(symbol, exDate);
      if (result) {
        adjusted.push(symbol);
        dmLogger.info(`${symbol}: demerger adjustment applied (ratio=${result.ratio.toFixed(4)})`);
      }
    } catch (err) {
      const msg = `${symbol}: adjustment failed — ${(err as Error).message}`;
      dmLogger.error(msg);
      errors.push(msg);
    }
  }

  if (adjusted.length > 0) {
    dmLogger.info(`Demerger adjustment complete: ${adjusted.join(', ')}`);
  }

  return { adjusted, errors };
}
