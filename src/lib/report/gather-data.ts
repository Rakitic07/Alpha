import { prisma } from '@/lib/db';
import { getLiveDashboardData } from '@/app/actions/live';
import { fetchMarketOverview, fetchAllIndexSummaries } from '@/app/actions/market-overview';
import { getScreenerData } from '@/app/actions/screener';
import { logger } from '@/lib/logger';
import type {
  ReportData,
  PortfolioSection,
  MarketSection,
  ExitCandidate,
  EntryCandidate,
} from './types';

const reportLogger = logger.scope('ReportData');

async function gatherPortfolioSection(): Promise<PortfolioSection> {
  const data = await getLiveDashboardData();

  const sorted = [...data.allHoldings].sort(
    (a, b) => b.dayChangePercent - a.dayChangePercent
  );

  const topGainer = sorted[0]
    ? { symbol: sorted[0].symbol, changePercent: sorted[0].dayChangePercent }
    : null;
  const topLoser = sorted[sorted.length - 1]
    ? {
        symbol: sorted[sorted.length - 1].symbol,
        changePercent: sorted[sorted.length - 1].dayChangePercent,
      }
    : null;

  const nifty50 = data.indices.find(
    (i) => i.name.toLowerCase().includes('nifty 50') && !i.name.toLowerCase().includes('500') && !i.name.toLowerCase().includes('next')
  );
  const momentum50 = data.indices.find(
    (i) => i.name.toLowerCase().includes('momentum')
  );

  return {
    dayGainPercent: data.dayGainPercent,
    totalPnlPercent: data.totalPnlPercent,
    holdingsCount: data.allHoldings.length,
    topGainer,
    topLoser,
    benchmarks: {
      nifty50ChangePercent: nifty50?.percentChange ?? null,
      momentum50ChangePercent: momentum50?.percentChange ?? null,
    },
  };
}

async function gatherMarketSection(): Promise<MarketSection> {
  const [indexSummaries, totalMarketData, nifty50Data] = await Promise.all([
    fetchAllIndexSummaries(),
    fetchMarketOverview('NIFTY Total Market'),
    fetchMarketOverview('NIFTY 50'),
  ]);

  // Top/bottom 3 sectors
  const sectorals = indexSummaries.summaries
    .filter((s) => s.category === 'sectoral')
    .sort((a, b) => b.changePercent - a.changePercent);

  const topSectors = sectorals.slice(0, 3).map((s) => ({
    name: s.name,
    shortName: s.shortName,
    changePercent: s.changePercent,
  }));
  const bottomSectors = sectorals.slice(-3).reverse().map((s) => ({
    name: s.name,
    shortName: s.shortName,
    changePercent: s.changePercent,
  }));

  const topGainers = (totalMarketData?.topGainers ?? []).slice(0, 5).map((c) => ({
    symbol: c.symbol,
    changePercent: c.changePercent,
    lastPrice: c.lastPrice,
  }));
  const topLosers = (totalMarketData?.topLosers ?? []).slice(0, 5).map((c) => ({
    symbol: c.symbol,
    changePercent: c.changePercent,
    lastPrice: c.lastPrice,
  }));

  return {
    topSectors,
    bottomSectors,
    topGainers,
    topLosers,
    totalMarket: totalMarketData
      ? {
          advancing: totalMarketData.advancing,
          declining: totalMarketData.declining,
          unchanged: totalMarketData.unchanged,
        }
      : null,
    nifty50: nifty50Data
      ? {
          advancing: nifty50Data.advancing,
          declining: nifty50Data.declining,
          unchanged: nifty50Data.unchanged,
        }
      : null,
  };
}

async function gatherExitCandidates(): Promise<ExitCandidate[]> {
  const { rows } = await getScreenerData('portfolio');
  return rows
    .filter((r) => r.exitSignal)
    .map((r) => ({
      symbol: r.symbol,
      rank: r.isUnranked ? null : r.rank,
      isUnranked: r.isUnranked === true,
      byRank: r.exitSignal!.byRank,
      byFilter: r.exitSignal!.byFilter,
      protected: r.exitSignal!.protected,
    }));
}

async function gatherEntryCandidates(
  portfolioSymbols: Set<string>
): Promise<EntryCandidate[]> {
  const top30 = await prisma.momentumScore.findMany({
    where: { isActive: true, rankType: 'filtered', rank: { lte: 30 } },
    orderBy: { rank: 'asc' },
  });

  // Get two most recent dates from RankingHistory to detect new entrants
  const recentDates = await prisma.rankingHistory.findMany({
    where: { rankType: 'filtered' },
    select: { date: true },
    distinct: ['date'],
    orderBy: { date: 'desc' },
    take: 2,
  });

  const yesterdaySet = new Set<string>();
  if (recentDates.length >= 2) {
    const yesterdayDate = recentDates[1].date;
    const yesterdayTop30 = await prisma.rankingHistory.findMany({
      where: { date: yesterdayDate, rankType: 'filtered', rank: { lte: 30 } },
      select: { symbol: true },
    });
    for (const r of yesterdayTop30) yesterdaySet.add(r.symbol);
  }

  return top30
    .filter((s) => !portfolioSymbols.has(s.symbol))
    .map((s) => ({
      rank: s.rank,
      symbol: s.symbol,
      compositeScore: s.compositeScore,
      athProximityPct: s.athProximity * 100,
      marketCapCategory: s.marketCapCategory,
      isNewEntrant: !yesterdaySet.has(s.symbol),
    }));
}

export async function gatherReportData(date: string): Promise<ReportData> {
  const errors: string[] = [];

  let portfolio: ReportData['portfolio'] = null;
  let market: ReportData['market'] = null;
  let exits: ExitCandidate[] = [];
  let entries: EntryCandidate[] = [];
  let portfolioSymbols = new Set<string>();

  await Promise.all([
    (async () => {
      try {
        portfolio = await gatherPortfolioSection();
      } catch (err) {
        reportLogger.error('Portfolio section failed:', err);
        errors.push(`Portfolio: ${(err as Error).message}`);
      }
    })(),
    (async () => {
      try {
        market = await gatherMarketSection();
      } catch (err) {
        reportLogger.error('Market section failed:', err);
        errors.push(`Market: ${(err as Error).message}`);
      }
    })(),
    (async () => {
      try {
        const { rows } = await getScreenerData('portfolio');
        portfolioSymbols = new Set(rows.filter((r) => r.inPortfolio).map((r) => r.symbol));
        exits = rows
          .filter((r) => r.exitSignal)
          .map((r) => ({
            symbol: r.symbol,
            rank: r.isUnranked ? null : r.rank,
            isUnranked: r.isUnranked === true,
            byRank: r.exitSignal!.byRank,
            byFilter: r.exitSignal!.byFilter,
            protected: r.exitSignal!.protected,
          }));
      } catch (err) {
        reportLogger.error('Screener/exits section failed:', err);
        errors.push(`Exits: ${(err as Error).message}`);
      }
    })(),
  ]);

  try {
    entries = await gatherEntryCandidates(portfolioSymbols);
  } catch (err) {
    reportLogger.error('Entry candidates section failed:', err);
    errors.push(`Entries: ${(err as Error).message}`);
  }

  return { date, portfolio, market, exits, entries, aiSummary: null, errors };
}
