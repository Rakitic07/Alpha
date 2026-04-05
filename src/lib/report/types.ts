export interface BenchmarkIndex {
  name: string;
  changePercent: number;
}

export interface PortfolioSection {
  dayGainPercent: number;
  holdingsCount: number;
  topGainer: { symbol: string; changePercent: number } | null;
  topLoser: { symbol: string; changePercent: number } | null;
  benchmarks: BenchmarkIndex[];
}

export interface SectorPerf {
  name: string;
  shortName: string;
  changePercent: number;
}

export interface TopMover {
  symbol: string;
  changePercent: number;
  lastPrice: number;
}

export interface MarketSection {
  topSectors: SectorPerf[];
  bottomSectors: SectorPerf[];
  topGainers: TopMover[];
  topLosers: TopMover[];
  totalMarket: { advancing: number; declining: number; unchanged: number } | null;
  nifty50: { advancing: number; declining: number; unchanged: number } | null;
}

export interface ExitCandidate {
  symbol: string;
  rank: number | null;
  isUnranked: boolean;
  byRank: boolean;
  byFilter: boolean;
  protected: boolean;
}

export interface EntryCandidate {
  rank: number;
  symbol: string;
  compositeScore: number;
  athProximityPct: number;
  marketCapCategory: string | null;
  isNewEntrant: boolean;
}

export interface ReportData {
  date: string;
  portfolio: PortfolioSection | null;
  market: MarketSection | null;
  exits: ExitCandidate[];
  entries: EntryCandidate[];
  aiSummary: string | null;
  errors: string[];
}
