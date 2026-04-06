/**
 * Momentum screener pipeline orchestrator.
 * Runs daily after market close to compute and store rankings.
 * Mirrors backtest/backend/engine.py scoring logic exactly.
 */

import { prisma, chunkArray, SQLITE_IN_CLAUSE_LIMIT } from '@/lib/db';
import { ensureInstrumentMaster, getAllSymbols, getAllInstrumentData } from '@/lib/instrument-service';
import { getFullQuote } from '@/lib/upstox-client';
import { getCategoriesBatch } from '@/lib/amfi/service';
import { fetchAndStoreBhavcopy, isBhavcopyStale } from './bhavcopy';
import { fetchAndStoreCandles, patchTodayPrices } from './prices';
import { detectAndFlushAnomalies } from './corporate-actions';
import { updateATHFromPrices, loadATHMap } from './ath';
import { scoreStock, PARAMS, isETFWhitelisted } from './scoring';
import { todayIST, effectiveTradingDay, resolveLastTradingDay, isMarketHours, daysAgo } from './dates';
import { logger } from '@/lib/logger';
import { updateJob } from '@/lib/jobs';

const pipelineLogger = logger.scope('ScreenerPipeline');

export interface PipelineResult {
  success: boolean;
  date: string;
  bhavcopyUpdated: number;
  candlesFetched: number;
  candlesInserted: number;
  athUpdated: number;
  universeSize: number;
  scored: number;
  ranked: number;
  corporateActionsFlushed: string[];
  errors: string[];
  durationMs: number;
}

interface InstrumentInfo {
  symbol: string;
  instrumentKey: string;
  name: string;
}

/**
 * Run the full screener pipeline.
 * Steps (maps to plan document):
 * 1. Bhavcopy → StockMarketCap
 * 2. Load instruments
 * 3. Fetch candles (incremental)
 * 4. Circuit limit check
 * 5. Update ATH
 * 6. Score each stock (filters + Sharpe + composite)
 * 7. Rank → store MomentumScore + RankingHistory
 */
export async function runScreenerPipeline(jobId?: string): Promise<PipelineResult> {
  const start = Date.now();
  const TIMEOUT_MS = 270_000; // Bail at 270s — leaves 30s buffer before Vercel's 300s limit
  const duringMarket = isMarketHours();
  // Resolve the last actual trading day (skips weekends + exchange holidays).
  // Uses Upstox holiday API; falls back to weekday-only if API fails.
  const today = await resolveLastTradingDay();
  const errors: string[] = [];

  /** Returns true if we've exceeded the safety timeout. */
  const isTimedOut = () => Date.now() - start > TIMEOUT_MS;

  const progress = async (pct: number, msg: string) => {
    if (jobId) await updateJob(jobId, pct, msg).catch(() => {});
  };

  pipelineLogger.info(`Starting screener pipeline for ${today}${duringMarket ? ' (market open — using T-1 close)' : ''}`);

  // Step 1: Bhavcopy → market cap data (weekly refresh — mcap doesn't change materially daily)
  let bhavcopyUpdated = 0;
  try {
    if (await isBhavcopyStale()) {
      const bhavcopy = await fetchAndStoreBhavcopy(today); // today = T-1 if market open
      bhavcopyUpdated = bhavcopy.updated;
    } else {
      pipelineLogger.info('Skipping bhavcopy fetch — market cap data is less than 6 days old');
    }
  } catch (err) {
    errors.push(`Bhavcopy: ${(err as Error).message}`);
    pipelineLogger.error('Bhavcopy failed:', err);
  }
  await progress(10, 'Fetching bhavcopy...');

  // Step 2: Load instrument master (batch — single async call + sync lookups)
  await ensureInstrumentMaster();
  const allSymbols = await getAllSymbols();
  const instrumentMap = await getAllInstrumentData(allSymbols);
  const instruments: InstrumentInfo[] = [];
  for (const [symbol, data] of instrumentMap) {
    instruments.push({ symbol, instrumentKey: data.key, name: data.name });
  }
  // Filter out NSE_INDEX instruments (e.g. BHARATBOND-APR30/31/32/33) — they are
  // not tradeable equities and cause errors in the candle and quote APIs.
  const tradeable = instruments.filter(i => !i.instrumentKey.startsWith('NSE_INDEX|'));
  const indexCount = instruments.length - tradeable.length;
  if (indexCount > 0) {
    pipelineLogger.info(`Filtered out ${indexCount} NSE_INDEX instruments`);
  }
  pipelineLogger.info(`Loaded ${tradeable.length} tradeable instruments (${instruments.length} total)`);
  await progress(15, `Loaded ${tradeable.length} instruments`);

  // Step 3: Patch today's prices via batch OHLC endpoint (~4 API calls for 2000 stocks).
  // patchTodayPrices is used for the daily run; fetchAndStoreCandles is reserved for
  // manual gap backfill via /api/admin/backfill-prices.
  let candlesFetched = 0;
  let candlesInserted = 0;
  await progress(25, 'Patching today\'s prices...');
  try {
    const priceResult = await patchTodayPrices(tradeable, today);
    candlesFetched = priceResult.patched;
    candlesInserted = priceResult.patched;
    if (priceResult.errors.length > 0) {
      errors.push(...priceResult.errors.slice(0, 10));
    }
  } catch (err) {
    errors.push(`Prices: ${(err as Error).message}`);
    pipelineLogger.error('Price patch failed:', err);
  }
  await progress(35, 'Prices patched');

  // Step 3b: Detect corporate action anomalies (>20% drop / >80% jump) and re-fetch
  // affected stocks individually. Must run BEFORE scoring so prices are consistent
  // (Upstox adjusts all historical prices retroactively on splits/bonus).
  let corporateActionsFlushed: string[] = [];
  try {
    const caResult = await detectAndFlushAnomalies();
    corporateActionsFlushed = caResult.flushed;
    if (caResult.flushed.length > 0) {
      pipelineLogger.info(`Corporate actions flushed: ${caResult.flushed.join(', ')}`);
    }
  } catch (err) {
    errors.push(`Corporate action detection: ${(err as Error).message}`);
    pipelineLogger.error('Corporate action detection failed:', err);
  }
  await progress(40, 'Corp actions checked');

  // Step 4: Circuit limit check — batch fetch full quotes
  // Build a reverse lookup (instrumentKey → symbol) to avoid O(n) scan per quote
  const keyToSymbol = new Map<string, string>();
  for (const inst of tradeable) keyToSymbol.set(inst.instrumentKey, inst.symbol);

  const circuitMap = new Map<string, number>(); // symbol → band width %
  try {
    const allKeys = tradeable.map(i => i.instrumentKey);
    const chunks = chunkArray(allKeys, 500);
    // Upstox rate limit: 50 req/s, 500 req/min.
    // 4 chunks × 1 req each is well within limits, but add 250ms spacing for safety.
    for (let i = 0; i < chunks.length; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, 250));
      const quotes = await getFullQuote(chunks[i]);
      for (const [, quote] of quotes) {
        if (quote.lower_circuit_limit > 0) {
          const bandWidth = (quote.upper_circuit_limit - quote.lower_circuit_limit) / quote.lower_circuit_limit;
          const symbol = keyToSymbol.get(quote.instrument_token);
          if (symbol) {
            circuitMap.set(symbol, bandWidth);
          }
        }
      }
    }
  } catch (err) {
    errors.push(`Circuit check: ${(err as Error).message}`);
    pipelineLogger.warn('Circuit limit check failed, proceeding without circuit filter:', err);
  }
  await progress(50, 'Checking circuit limits...');

  // Step 5: Update ATH from today's prices
  let athUpdated = 0;
  try {
    const athResult = await updateATHFromPrices(today);
    athUpdated = athResult.updated;
  } catch (err) {
    errors.push(`ATH update: ${(err as Error).message}`);
    pipelineLogger.error('ATH update failed:', err);
  }
  await progress(60, 'Updating ATH...');

  // Timeout check: if data-fetching took too long, return partial result
  if (isTimedOut()) {
    pipelineLogger.warn('Pipeline timeout after data-fetching steps — returning partial result');
    errors.push('Pipeline timed out before scoring');
    return {
      success: false, date: today, bhavcopyUpdated, candlesFetched, candlesInserted,
      athUpdated, universeSize: tradeable.length, scored: 0, ranked: 0,
      corporateActionsFlushed, errors, durationMs: Date.now() - start,
    };
  }

  // Load market cap + AMFI classification + ATH for scoring
  const mcapMap = new Map<string, number>();
  const allMcap = await prisma.stockMarketCap.findMany({ select: { symbol: true, marketCap: true } });
  for (const row of allMcap) mcapMap.set(row.symbol, row.marketCap);

  const amfiCategories = await getCategoriesBatch(tradeable.map(i => i.symbol));
  const athMap = await loadATHMap();

  // Load previous trading day's rankings from RankingHistory for rank change calculation.
  // Using RankingHistory (not MomentumScore.isActive) makes this robust to same-day re-runs:
  // on re-run, isActive points to today's first run — but we want *yesterday's* ranks.
  const prevRanks = await loadPreviousDayRanks(today, 'filtered');
  const prevAllRanks = await loadPreviousDayRanks(today, 'all');

  // Load ranking history for denormalized stats
  const rankingHistory = await loadRankingHistoryForStats('filtered');
  const allRankingHistory = await loadRankingHistoryForStats('all');

  // Batch-load ALL prices in one query, group by symbol in memory.
  // This replaces 2000+ individual queries with a single round-trip.
  pipelineLogger.info('Batch loading all prices...');
  // Load only the last 420 calendar days (~290 trading days).
  // Scoring needs at most 252 candles (12m Sharpe) + 21-day skip buffer = 273 candles.
  // ATH is sourced from loadATHMap() (StockATH table), not from this price window.
  const priceFromDate = daysAgo(420, today);
  type Candle = { close: number; high: number; volume: number };
  const allPrices = await prisma.screenerPrice.findMany({
    where: { date: { gte: priceFromDate, lte: today } },
    orderBy: [{ symbol: 'asc' }, { date: 'asc' }],
    select: { symbol: true, close: true, high: true, volume: true },
  });
  const pricesBySymbol = new Map<string, Candle[]>();
  for (const p of allPrices) {
    let arr = pricesBySymbol.get(p.symbol);
    if (!arr) { arr = []; pricesBySymbol.set(p.symbol, arr); }
    arr.push({ close: p.close, high: p.high, volume: p.volume });
  }
  pipelineLogger.info(`Loaded ${allPrices.length} price rows for ${pricesBySymbol.size} symbols`);

  // Step 6: Score each stock
  const scored: Array<{
    symbol: string;
    instrumentKey: string;
    companyName: string;
    score: NonNullable<ReturnType<typeof scoreStock>>;
    marketCapCr: number;
    marketCapCategory: string | null;
    circuitBandPct: number | null;
    sparklineData: number[];
  }> = [];

  let scoringFailures = 0;
  for (const inst of tradeable) {
    try {
      // Filter 2: Market cap >= 1000 Cr
      const mcap = mcapMap.get(inst.symbol);
      if ((!mcap || mcap < PARAMS.mcapMinCr) && !isETFWhitelisted(inst.symbol)) continue;

      // Filter 5: Circuit band >= 15% (skip stocks with 2%/5% circuits)
      const bandWidth = circuitMap.get(inst.symbol);
      if (bandWidth !== undefined && bandWidth < 0.15) continue;

      // Get candles from in-memory map (no DB round-trip per stock)
      const candles = pricesBySymbol.get(inst.symbol);
      if (!candles || candles.length < 269) continue; // 247 effectiveIdx + 21 skip + 1 = 269

      const closes = candles.map(c => c.close);
      const highs = candles.map(c => c.high);
      const volumes = candles.map(c => c.volume);

      // Score stock (applies remaining filters: 200 DMA, ATH proximity, price, volume)
      const storedATH = athMap.get(inst.symbol);
      const result = scoreStock(closes, highs, volumes, inst.symbol, storedATH);
      if (!result) continue;

      // Price sparkline (last 50 closes, oldest-first)
      const sparkline = closes.slice(-50);

      scored.push({
        symbol: inst.symbol,
        instrumentKey: inst.instrumentKey,
        companyName: inst.name,
        score: result,
        marketCapCr: mcap ?? 0,
        marketCapCategory: amfiCategories.get(inst.symbol) || null,
        circuitBandPct: bandWidth !== undefined ? Math.round(bandWidth * 100 * 10) / 10 : null,
        sparklineData: sparkline,
      });
    } catch {
      scoringFailures++;
    }
  }

  // Step 7: Rank by composite score (descending)
  scored.sort((a, b) => b.score.compositeScore - a.score.compositeScore);

  if (scoringFailures > 0) {
    pipelineLogger.warn(`${scoringFailures} stocks failed during scoring`);
    errors.push(`${scoringFailures} stocks failed scoring`);
  }
  pipelineLogger.info(`Scored ${scored.length} stocks out of ${tradeable.length} universe`);
  await progress(70, 'Scoring pre-filtered...');

  // Step 8: Mark previous filtered scores as inactive
  await prisma.momentumScore.updateMany({
    where: { isActive: true, rankType: 'filtered' },
    data: { isActive: false },
  });

  // Delete any existing filtered records for today (handles same-day re-runs safely)
  await prisma.momentumScore.deleteMany({ where: { computedDate: today, rankType: 'filtered' } });

  // Step 9: Insert new MomentumScore records (filtered)
  const scoreRows = scored.map((s, idx) => {
    const rank = idx + 1;
    const history = rankingHistory.get(s.symbol) || [];
    const allRanksIncludingToday = [...history.map(h => h.rank), rank];

    return {
      computedDate: today,
      symbol: s.symbol,
      instrumentKey: s.instrumentKey,
      companyName: s.companyName,
      rank,
      compositeScore: s.score.compositeScore,
      avgSharpe: s.score.avgSharpe,
      sharpe12m: s.score.sharpe12m,
      sharpe6m: s.score.sharpe6m,
      sharpe3m: s.score.sharpe3m,
      athProximity: s.score.athProximity,
      ath: s.score.ath,
      currentPrice: s.score.currentPrice,
      dma200: s.score.dma200,
      aboveDma200Pct: s.score.aboveDma200Pct,
      aboveDma10: s.score.aboveDma10,
      aboveDma20: s.score.aboveDma20,
      aboveDma50: s.score.aboveDma50,
      aboveDma100: s.score.aboveDma100,
      medianTurnoverCr: s.score.medianTurnoverCr,
      marketCapCr: s.marketCapCr,
      marketCapCategory: s.marketCapCategory,
      sparklineData: JSON.stringify(s.sparklineData),
      circuitBandPct: s.circuitBandPct,
      // Denormalized rank stats
      prevRank: prevRanks.get(s.symbol) ?? null,
      avgRank50d: allRanksIncludingToday.length > 0
        ? allRanksIncludingToday.reduce((a, b) => a + b, 0) / allRanksIncludingToday.length
        : null,
      bestRank: allRanksIncludingToday.length > 0
        ? Math.min(...allRanksIncludingToday)
        : null,
      appearances: allRanksIncludingToday.length,
      t50Pct: allRanksIncludingToday.length > 0
        ? (allRanksIncludingToday.filter(r => r <= 50).length / allRanksIncludingToday.length) * 100
        : 0,
      t100Pct: allRanksIncludingToday.length > 0
        ? (allRanksIncludingToday.filter(r => r <= 100).length / allRanksIncludingToday.length) * 100
        : 0,
      isActive: true,
      rankType: 'filtered',
    };
  });

  // Batch insert in chunks (Turso-safe)
  for (const chunk of chunkArray(scoreRows, 50)) {
    await prisma.momentumScore.createMany({ data: chunk });
  }

  // Step 10: Insert RankingHistory records (delete today first for re-run safety)
  await prisma.rankingHistory.deleteMany({ where: { date: today, rankType: 'filtered' } });
  const historyRows = scored.map((s, idx) => ({
    symbol: s.symbol,
    date: today,
    rank: idx + 1,
    compositeScore: s.score.compositeScore,
    rankType: 'filtered',
  }));

  for (const chunk of chunkArray(historyRows, 50)) {
    await prisma.rankingHistory.createMany({ data: chunk });
  }

  // ── Second pass: score all-universe (mcap >= 1000 Cr + ETF whitelist, no additional filters) ──
  // Skip if we're running out of time — filtered rankings (primary) are already stored
  if (isTimedOut()) {
    pipelineLogger.warn('Pipeline timeout after filtered scoring — skipping all-universe pass');
    errors.push('Skipped all-universe scoring due to timeout');
    const duration = Date.now() - start;
    return {
      success: true, date: today, bhavcopyUpdated, candlesFetched, candlesInserted,
      athUpdated, universeSize: tradeable.length, scored: scored.length, ranked: scored.length,
      corporateActionsFlushed, errors, durationMs: duration,
    };
  }

  await progress(75, 'Scoring universe...');

  const allScored: typeof scored = [];
  let allScoringFailures = 0;
  for (const inst of tradeable) {
    try {
      const mcap = mcapMap.get(inst.symbol);
      if (!mcap || mcap < PARAMS.mcapMinCr) {
        if (!isETFWhitelisted(inst.symbol)) continue;
      }

      const bandWidth = circuitMap.get(inst.symbol);
      if (bandWidth !== undefined && bandWidth < 0.15) continue;

      const candles = pricesBySymbol.get(inst.symbol);
      if (!candles || candles.length < 269) continue;

      const closes = candles.map(c => c.close);
      const highs = candles.map(c => c.high);
      const volumes = candles.map(c => c.volume);

      const storedATH = athMap.get(inst.symbol);
      const result = scoreStock(closes, highs, volumes, inst.symbol, storedATH, { skipFilters: true });
      if (!result) continue;

      const sparkline = closes.slice(-50);

      allScored.push({
        symbol: inst.symbol,
        instrumentKey: inst.instrumentKey,
        companyName: inst.name,
        score: result,
        marketCapCr: mcap ?? 0,
        marketCapCategory: amfiCategories.get(inst.symbol) || null,
        circuitBandPct: bandWidth !== undefined ? Math.round(bandWidth * 100 * 10) / 10 : null,
        sparklineData: sparkline,
      });
    } catch {
      allScoringFailures++;
    }
  }

  allScored.sort((a, b) => b.score.compositeScore - a.score.compositeScore);

  if (allScoringFailures > 0) {
    pipelineLogger.warn(`${allScoringFailures} stocks failed during all-universe scoring`);
  }
  pipelineLogger.info(`All-universe scored: ${allScored.length} stocks`);

  await progress(85, 'Storing rankings...');

  // Mark previous "all" scores as inactive
  await prisma.momentumScore.updateMany({
    where: { isActive: true, rankType: 'all' },
    data: { isActive: false },
  });

  // Delete existing "all" records for today
  await prisma.momentumScore.deleteMany({ where: { computedDate: today, rankType: 'all' } });

  const allScoreRows = allScored.map((s, idx) => {
    const rank = idx + 1;
    const history = allRankingHistory.get(s.symbol) || [];
    const allRanksIncludingToday = [...history.map(h => h.rank), rank];

    return {
      computedDate: today,
      symbol: s.symbol,
      instrumentKey: s.instrumentKey,
      companyName: s.companyName,
      rank,
      compositeScore: s.score.compositeScore,
      avgSharpe: s.score.avgSharpe,
      sharpe12m: s.score.sharpe12m,
      sharpe6m: s.score.sharpe6m,
      sharpe3m: s.score.sharpe3m,
      athProximity: s.score.athProximity,
      ath: s.score.ath,
      currentPrice: s.score.currentPrice,
      dma200: s.score.dma200,
      aboveDma200Pct: s.score.aboveDma200Pct,
      aboveDma10: s.score.aboveDma10,
      aboveDma20: s.score.aboveDma20,
      aboveDma50: s.score.aboveDma50,
      aboveDma100: s.score.aboveDma100,
      medianTurnoverCr: s.score.medianTurnoverCr,
      marketCapCr: s.marketCapCr,
      marketCapCategory: s.marketCapCategory,
      sparklineData: JSON.stringify(s.sparklineData),
      circuitBandPct: s.circuitBandPct,
      prevRank: prevAllRanks.get(s.symbol) ?? null,
      avgRank50d: allRanksIncludingToday.length > 0
        ? allRanksIncludingToday.reduce((a, b) => a + b, 0) / allRanksIncludingToday.length
        : null,
      bestRank: allRanksIncludingToday.length > 0
        ? Math.min(...allRanksIncludingToday)
        : null,
      appearances: allRanksIncludingToday.length,
      t50Pct: allRanksIncludingToday.length > 0
        ? (allRanksIncludingToday.filter(r => r <= 50).length / allRanksIncludingToday.length) * 100
        : 0,
      t100Pct: allRanksIncludingToday.length > 0
        ? (allRanksIncludingToday.filter(r => r <= 100).length / allRanksIncludingToday.length) * 100
        : 0,
      isActive: true,
      rankType: 'all',
    };
  });

  for (const chunk of chunkArray(allScoreRows, 50)) {
    await prisma.momentumScore.createMany({ data: chunk });
  }

  // Store "all" ranking history
  await prisma.rankingHistory.deleteMany({ where: { date: today, rankType: 'all' } });
  const allHistoryRows = allScored.map((s, idx) => ({
    symbol: s.symbol,
    date: today,
    rank: idx + 1,
    compositeScore: s.score.compositeScore,
    rankType: 'all',
  }));

  for (const chunk of chunkArray(allHistoryRows, 50)) {
    await prisma.rankingHistory.createMany({ data: chunk });
  }
  await progress(90, 'Storing rankings...');

  // Step 11: Prune old RankingHistory (keep last 50 trading days, per rankType)
  try {
    for (const rt of ['filtered', 'all'] as const) {
      const distinctDates = await prisma.rankingHistory.findMany({
        where: { rankType: rt },
        select: { date: true },
        distinct: ['date'],
        orderBy: { date: 'desc' },
      });
      if (distinctDates.length > 50) {
        const cutoffDate = distinctDates[49].date;
        await prisma.rankingHistory.deleteMany({
          where: { date: { lt: cutoffDate }, rankType: rt },
        });
        pipelineLogger.info(`Pruned ${rt} ranking history before ${cutoffDate}`);
      }
    }
  } catch (err) {
    errors.push(`History pruning: ${(err as Error).message}`);
  }

  const duration = Date.now() - start;
  pipelineLogger.info(`Pipeline complete in ${duration}ms: ${scored.length} filtered, ${allScored.length} all ranked`);
  await progress(100, `Done: ${scored.length} filtered, ${allScored.length} all`);

  return {
    success: true,
    date: today,
    bhavcopyUpdated,
    candlesFetched,
    candlesInserted,
    athUpdated,
    universeSize: tradeable.length,
    scored: scored.length,
    ranked: scored.length,
    corporateActionsFlushed,
    errors,
    durationMs: duration,
  };
}

/**
 * Load the most recent RankingHistory date BEFORE `today` and return its ranks.
 * Robust to same-day re-runs: always returns the previous trading session's ranks.
 */
async function loadPreviousDayRanks(today: string, rankType: string): Promise<Map<string, number>> {
  // Find the most recent date strictly before today
  const prevDate = await prisma.rankingHistory.findFirst({
    where: { rankType, date: { lt: today } },
    select: { date: true },
    orderBy: { date: 'desc' },
  });

  if (!prevDate) return new Map();

  const rows = await prisma.rankingHistory.findMany({
    where: { rankType, date: prevDate.date },
    select: { symbol: true, rank: true },
  });

  const map = new Map<string, number>();
  for (const r of rows) map.set(r.symbol, r.rank);
  return map;
}

/**
 * Load ranking history for all symbols (last 50 trading days) for denormalized stat computation.
 * Pass a rankType to filter to a specific universe ('filtered' or 'all').
 */
async function loadRankingHistoryForStats(rankType?: string): Promise<Map<string, Array<{ date: string; rank: number }>>> {
  const where = rankType ? { rankType } : {};
  const allHistory = await prisma.rankingHistory.findMany({
    where,
    orderBy: { date: 'asc' },
    select: { symbol: true, date: true, rank: true },
  });

  const map = new Map<string, Array<{ date: string; rank: number }>>();
  for (const row of allHistory) {
    let arr = map.get(row.symbol);
    if (!arr) {
      arr = [];
      map.set(row.symbol, arr);
    }
    arr.push({ date: row.date, rank: row.rank });
  }
  return map;
}
