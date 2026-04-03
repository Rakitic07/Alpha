'use server';

import { prisma } from '@/lib/db';
import { computePortfolioState } from '@/lib/finance/recalculation';
import { computeReturns, sharpeRatio, PARAMS } from '@/lib/screener/scoring';
import { runScreenerPipeline } from '@/lib/screener/pipeline';
import { detectAndFlushAnomalies } from '@/lib/screener/corporate-actions';
import { createJob, completeJob, failJob } from '@/lib/jobs';

// ── Types ──

export interface ScreenerRow {
  rank: number;
  symbol: string;
  companyName: string;
  compositeScore: number;
  avgSharpe: number;
  athProximity: number;
  currentPrice: number;
  aboveDma200Pct: number;
  dmaSwatches: { above10: boolean; above20: boolean; above50: boolean; above100: boolean; above200: boolean };
  medianTurnoverCr: number;
  marketCapCr: number;
  marketCapCategory: string | null;
  sparklineData: number[];
  prevRank: number | null;
  rankChange: number | null;
  inPortfolio: boolean;
  isPreFiltered?: boolean;  // only set for 'all' tab — stock also passes pre-filter
  isUnranked?: boolean;
  exitSignal?: {
    byRank: boolean;    // rank > 50
    byFilter: boolean;  // below 200 DMA AND athProximity < 0.75
    protected: boolean; // last BUY within 14 days (min hold rule)
  };
}

export interface ScreenerStats {
  total: number;
  allTotal: number;
  portfolioCount: number;
  rankedPortfolioCount: number;
  rankBuckets: { top25: number; top50: number; above50: number };
  mcapBreakdown: { large: number; mid: number; small: number; micro: number };
  dataDate: string | null;
}

// ── Server Actions ──

export async function getScreenerData(
  tab: 'all' | 'prefiltered' | 'portfolio' = 'prefiltered',
): Promise<{ rows: ScreenerRow[]; stats: ScreenerStats }> {
  // Determine which rankType to query for the main scores list
  let rankTypeForScores: 'filtered' | 'all';
  if (tab === 'all') {
    rankTypeForScores = 'all';
  } else {
    // 'prefiltered', 'portfolio' all use filtered rankings
    rankTypeForScores = 'filtered';
  }

  const scores = await prisma.momentumScore.findMany({
    where: { isActive: true, rankType: rankTypeForScores },
    orderBy: { rank: 'asc' },
  });

  let portfolioSymbols: Set<string>;
  let portfolioNames: Map<string, string>;
  let holdingQty = new Map<string, number>();
  let holdingAgeDays = new Map<string, number>();
  try {
    const engine = await computePortfolioState(new Date());
    const holdings = Array.from(engine.holdings.values()).filter(h => h.qty > 0.01);
    portfolioSymbols = new Set(holdings.map(h => h.symbol));
    portfolioNames = new Map(holdings.map(h => [h.symbol, h.symbol]));
    holdingQty = new Map(holdings.map(h => [h.symbol, h.qty]));

    // Weighted-average holding age (same as portfolio page)
    const now = Date.now();
    for (const [sym, batches] of engine.inventory.entries()) {
      let totalQty = 0, weightedDays = 0;
      for (const b of batches) {
        if (b.qty <= 0) continue;
        const days = (now - b.date.getTime()) / 86_400_000;
        weightedDays += days * b.qty;
        totalQty += b.qty;
      }
      if (totalQty > 0) holdingAgeDays.set(sym, Math.round(weightedDays / totalQty));
    }
  } catch {
    portfolioSymbols = new Set();
    portfolioNames = new Map();
  }

  if (scores.length === 0 && portfolioSymbols.size === 0) {
    return {
      rows: [],
      stats: {
        total: 0, allTotal: 0, portfolioCount: 0, rankedPortfolioCount: 0,
        rankBuckets: { top25: 0, top50: 0, above50: 0 },
        mcapBreakdown: { large: 0, mid: 0, small: 0, micro: 0 },
        dataDate: null,
      },
    };
  }

  // For All tab: fetch which symbols also pass pre-filtering — used for row highlights
  let filteredSymbols = new Set<string>();
  if (tab === 'all') {
    const filteredScores = await prisma.momentumScore.findMany({
      where: { isActive: true, rankType: 'filtered' },
      select: { symbol: true },
    });
    filteredSymbols = new Set(filteredScores.map(s => s.symbol));
  }

  const rankedSymbols = new Set<string>();
  const allRows: ScreenerRow[] = scores.map(s => {
    rankedSymbols.add(s.symbol);
    const inPortfolio = portfolioSymbols.has(s.symbol);
    const rankChange = s.prevRank !== null ? s.prevRank - s.rank : null;

    return {
      rank: s.rank,
      symbol: s.symbol,
      companyName: s.companyName,
      compositeScore: s.compositeScore,
      avgSharpe: s.avgSharpe,
      athProximity: s.athProximity,
      currentPrice: s.currentPrice,
      aboveDma200Pct: s.aboveDma200Pct,
      dmaSwatches: {
        above10: s.aboveDma10,
        above20: s.aboveDma20,
        above50: s.aboveDma50,
        above100: s.aboveDma100,
        above200: s.aboveDma200Pct >= 0,
      },
      medianTurnoverCr: s.medianTurnoverCr,
      marketCapCr: s.marketCapCr,
      marketCapCategory: s.marketCapCategory,
      sparklineData: s.sparklineData ? JSON.parse(s.sparklineData) : [],
      prevRank: s.prevRank,
      rankChange,
      inPortfolio,
      isPreFiltered: filteredSymbols.size > 0 ? filteredSymbols.has(s.symbol) : undefined,
    };
  });

  // Unranked portfolio stocks — only for portfolio tab
  if (tab === 'portfolio') {
    const unrankedSyms = Array.from(portfolioSymbols).filter(s => !rankedSymbols.has(s));
    if (unrankedSyms.length > 0) {
      const [prices, athRows, mcapRows, amfiRows, lastScores] = await Promise.all([
        prisma.screenerPrice.findMany({
          where: { symbol: { in: unrankedSyms } },
          orderBy: [{ symbol: 'asc' }, { date: 'asc' }],
          select: { symbol: true, close: true, high: true, volume: true },
        }),
        prisma.stockATH.findMany({ where: { symbol: { in: unrankedSyms } }, select: { symbol: true, ath: true } }),
        prisma.stockMarketCap.findMany({ where: { symbol: { in: unrankedSyms } }, select: { symbol: true, marketCap: true } }),
        prisma.aMFIClassification.findMany({
          where: { symbol: { in: unrankedSyms } },
          orderBy: { period: 'desc' },
          select: { symbol: true, category: true, companyName: true },
        }),
        // Fallback mcap from last known scored entry (use filtered rankings for portfolio context)
        prisma.momentumScore.findMany({
          where: { symbol: { in: unrankedSyms }, rankType: 'filtered' },
          orderBy: [{ computedDate: 'desc' }],
          select: { symbol: true, marketCapCr: true, marketCapCategory: true },
        }),
      ]);

      const pricesBySymbol = new Map<string, { close: number; high: number; volume: number }[]>();
      for (const p of prices) {
        let arr = pricesBySymbol.get(p.symbol);
        if (!arr) { arr = []; pricesBySymbol.set(p.symbol, arr); }
        arr.push({ close: p.close, high: p.high, volume: p.volume });
      }
      const athMap = new Map(athRows.map(r => [r.symbol, r.ath]));
      const mcapMap = new Map(mcapRows.map(r => [r.symbol, r.marketCap]));
      const lastScoreMap = new Map<string, { marketCapCr: number; marketCapCategory: string | null }>();
      for (const r of lastScores) {
        if (!lastScoreMap.has(r.symbol)) lastScoreMap.set(r.symbol, r);
      }
      const amfiMap = new Map<string, { category: string; companyName: string }>();
      for (const r of amfiRows) {
        if (!amfiMap.has(r.symbol)) amfiMap.set(r.symbol, { category: r.category, companyName: r.companyName });
      }

      for (const sym of unrankedSyms) {
        const candles = pricesBySymbol.get(sym) || [];
        const closes = candles.map(c => c.close);
        const price = closes.length > 0 ? closes[closes.length - 1] : 0;
        const storedAth = athMap.get(sym);
        const ath = storedAth || price;
        const athProximity = ath > 0 ? price / ath : 0;
        const dma = (n: number) => closes.length >= n ? closes.slice(-n).reduce((a, b) => a + b, 0) / n : null;
        const [d10, d20, d50, d100, d200] = [dma(10), dma(20), dma(50), dma(100), dma(200)];
        const amfi = amfiMap.get(sym);
        const lastScore = lastScoreMap.get(sym);

        // Compute Sharpe-based score without hard entry filters (stock is already held)
        let compositeScore = 0, avgSharpe = 0;
        if (closes.length >= 270) {
          const dateIdx = closes.length - 1;
          const effectiveIdx = dateIdx - 21;
          const c12 = closes.slice(Math.max(0, dateIdx - 251), dateIdx + 1);
          const c6  = closes.slice(Math.max(0, dateIdx - 125), dateIdx + 1);
          const c3  = closes.slice(Math.max(0, effectiveIdx - 62), effectiveIdx + 1);
          const s12 = sharpeRatio(computeReturns(c12));
          const s6  = sharpeRatio(computeReturns(c6));
          const s3  = sharpeRatio(computeReturns(c3));
          if (Number.isFinite(s12) && Number.isFinite(s6) && Number.isFinite(s3)) {
            avgSharpe = (s12 + s6 + s3) / 3;
            compositeScore = PARAMS.sharpeWeight * avgSharpe + PARAMS.proximityWeight * athProximity;
          }
        }

        const marketCapCr = mcapMap.get(sym) ?? lastScore?.marketCapCr ?? 0;
        const marketCapCategory = amfi?.category ?? lastScore?.marketCapCategory ?? null;

        allRows.push({
          rank: 9999,
          symbol: sym,
          companyName: amfi?.companyName || portfolioNames.get(sym) || sym,
          compositeScore,
          avgSharpe,
          athProximity,
          currentPrice: price,
          aboveDma200Pct: d200 !== null ? ((price - d200) / d200) * 100 : 0,
          dmaSwatches: {
            above10:  d10  !== null && price >= d10,
            above20:  d20  !== null && price >= d20,
            above50:  d50  !== null && price >= d50,
            above100: d100 !== null && price >= d100,
            above200: d200 !== null && price >= d200,
          },
          medianTurnoverCr: 0,
          marketCapCr,
          marketCapCategory,
          sparklineData: closes.slice(-50),
          prevRank: null,
          rankChange: null,
          inPortfolio: true,
          isUnranked: true,
        });
      }
    }
  }

  const stats = await computeStats(allRows, portfolioSymbols.size, portfolioSymbols);

  // Mcap breakdown by actual portfolio position value (qty × currentPrice)
  let mcLarge = 0, mcMid = 0, mcSmall = 0, mcMicro = 0;
  for (const r of allRows) {
    if (!r.inPortfolio || r.currentPrice <= 0) continue;
    const posVal = (holdingQty.get(r.symbol) || 0) * r.currentPrice;
    const cat = r.marketCapCategory?.toLowerCase() || '';
    if (cat.includes('large')) mcLarge += posVal;
    else if (cat.includes('mid')) mcMid += posVal;
    else if (cat.includes('small')) mcSmall += posVal;
    else if (r.marketCapCategory) mcMicro += posVal;
  }
  stats.mcapBreakdown = { large: mcLarge, mid: mcMid, small: mcSmall, micro: mcMicro };

  // Exit signal detection for portfolio stocks
  const portfolioSymArr = Array.from(portfolioSymbols);
  if (portfolioSymArr.length > 0) {
    for (const row of allRows) {
      if (!row.inPortfolio) continue;
      const byRank   = row.isUnranked === true || row.rank > 50;
      const byFilter = !row.dmaSwatches.above200 && row.athProximity < 0.75;
      if (!byRank && !byFilter) continue;
      const ageDays     = holdingAgeDays.get(row.symbol) ?? 9999;
      const isProtected = ageDays < 14;
      row.exitSignal = { byRank, byFilter, protected: isProtected };
    }
  }

  let rows: ScreenerRow[];
  switch (tab) {
    case 'portfolio':
      rows = allRows.filter(r => r.inPortfolio);
      break;
    default:
      rows = allRows;
  }

  return { rows, stats };
}

// ── Helpers ──

async function computeStats(
  rows: ScreenerRow[],
  portfolioCount: number = 0,
  portfolioSymbols?: Set<string>,
): Promise<ScreenerStats> {
  // Rank-bucket pills — derived from current rows (only meaningful on portfolio tab)
  let top25 = 0, top50 = 0;
  for (const r of rows) {
    if (r.inPortfolio && !r.isUnranked) {
      if (r.rank <= 25) top25++;
      else if (r.rank <= 50) top50++;
    }
  }
  const above50 = Math.max(0, portfolioCount - top25 - top50);

  // Always query canonical counts regardless of which tab's rows we received
  const symList = portfolioSymbols && portfolioSymbols.size > 0 ? [...portfolioSymbols] : [];
  const [allTotal, filteredTotal, rankedPortfolioCount] = await Promise.all([
    prisma.momentumScore.count({ where: { isActive: true, rankType: 'all' } }),
    prisma.momentumScore.count({ where: { isActive: true, rankType: 'filtered' } }),
    symList.length > 0
      ? prisma.momentumScore.count({ where: { isActive: true, rankType: 'filtered', symbol: { in: symList } } })
      : Promise.resolve(0),
  ]);

  return {
    total: filteredTotal,          // always pre-filtered count, tab-independent
    allTotal,                      // always all-universe count
    portfolioCount,                // always total portfolio size (holdings)
    rankedPortfolioCount,          // portfolio stocks in pre-filtered set
    rankBuckets: { top25, top50, above50 },
    mcapBreakdown: { large: 0, mid: 0, small: 0, micro: 0 },
    dataDate: null,
  };
}

/** Trigger the screener pipeline server-side (used by the Sync button). */
export async function syncScreener(): Promise<{ success: boolean; ranked: number; error?: string; jobId: string }> {
  const job = await createJob('screener-sync', 'Starting...');
  try {
    const result = await runScreenerPipeline(job.id);
    try { await detectAndFlushAnomalies(); } catch { /* non-fatal */ }
    await completeJob(job.id, { ranked: result.ranked });
    return { success: true, ranked: result.ranked, jobId: job.id };
  } catch (err) {
    await failJob(job.id, (err as Error).message);
    return { success: false, ranked: 0, error: (err as Error).message, jobId: job.id };
  }
}

export async function getRankHistory(
  symbol: string,
  rankType: 'filtered' | 'all' = 'all'
): Promise<{ date: string; rank: number; compositeScore: number }[]> {
  const history = await prisma.rankingHistory.findMany({
    where: { symbol, rankType },
    orderBy: { date: 'asc' },
    select: { date: true, rank: true, compositeScore: true },
  });
  return history;
}
