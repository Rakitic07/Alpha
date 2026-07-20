export interface BenchmarkIndex {
  name: string;
  changePercent: number;
}

export interface PortfolioSection {
  dayGainPercent: number;
  totalPnlPercent: number;
  holdingsCount: number;
  holdWarnExitCounts: { hold: number; warning: number; exit: number };
  topGainer: { symbol: string; changePercent: number } | null;
  topLoser:  { symbol: string; changePercent: number } | null;
  benchmarks: BenchmarkIndex[];
}

export interface PortfolioHolding {
  symbol:            string;
  dayChangePercent:  number;
  totalPnlPercent:   number;
  rank:              number | null;
  signal:            'hold' | 'warning' | 'exit';
  signalReason?:     string;
  drawdownSinceEntry?: number | null; // % below entry, negative = loss
  asmInfo?: { type: 'ST' | 'LT'; stage: string };
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
  topSectors:    SectorPerf[];
  bottomSectors: SectorPerf[];
  topGainers:    TopMover[];
  topLosers:     TopMover[];
  totalMarket: { advancing: number; declining: number; unchanged: number } | null;
  nifty50:     { advancing: number; declining: number; unchanged: number } | null;
}

export interface ExitCandidate {
  symbol:     string;
  rank:       number | null;
  isUnranked: boolean;
  byRank:     boolean;
  byFilter:   boolean;
  by50Dma:    boolean;
  isBE:       boolean;
  protected:  boolean;
}

export interface WarnCandidate {
  symbol:    string;
  rank:      number | null;
  by50Dma:   boolean;
  byRank:    boolean; // rank 51-60
  isBE:      boolean;
  protected: boolean;
}

export interface EntryCandidate {
  rank:             number;
  symbol:           string;
  compositeScore:   number;
  athProximityPct:  number;
  marketCapCategory: string | null;
  isNewEntrant:     boolean;
}

export interface ReportData {
  date:      string;
  portfolio: PortfolioSection | null;
  holdings:  PortfolioHolding[];   // per-stock detail for AI
  market:    MarketSection | null;
  exits:     ExitCandidate[];
  warnings:  WarnCandidate[];
  entries:   EntryCandidate[];
  aiSummary: string | null;
  errors:    string[];
}
