/**
 * Pure, client-safe screener filter-query logic.
 *
 * A "saved query" is a set of filter + sort presets applied over the
 * already-computed momentum universe (no pipeline re-run). Most classic
 * strategy parameters (200-DMA, ATH %, mcap, price, turnover, score, rank)
 * map directly onto columns the pipeline already stores, so we can honour
 * them as filters here without re-scoring.
 */

import type { ScreenerRow } from '@/app/actions/screener';

export type PortfolioMode = 'any' | 'only' | 'exclude';

export interface ScreenerQueryFilters {
  /** Free-text match on symbol or company name. */
  search?: string;
  // Score / rank
  minScore?: number | null;
  maxScore?: number | null;
  minRank?: number | null;
  maxRank?: number | null;
  // ATH proximity — keep rows within X% of ATH
  athWithinPct?: number | null;
  // Trend requirements (must be above the given DMA)
  require200Dma?: boolean;
  require50Dma?: boolean;
  requireAllDma?: boolean; // above 10/20/50/100/200
  // Market cap
  minMcapCr?: number | null;
  maxMcapCr?: number | null;
  mcapCategories?: string[]; // subset of ['Large','Mid','Small','Micro']
  // Liquidity
  minTurnoverCr?: number | null;
  // Price (CMP)
  minPrice?: number | null;
  maxPrice?: number | null;
  // Day change %
  minDayChange?: number | null;
  maxDayChange?: number | null;
  // Drawdown — keep rows whose drawdown is >= this value (e.g. -20 keeps
  // everything that has fallen less than 20%). Uses entry DD on the portfolio
  // tab when available, else ATH drawdown.
  minDrawdownPct?: number | null;
  // Portfolio membership
  portfolio?: PortfolioMode;
}

export const EMPTY_FILTERS: ScreenerQueryFilters = {};

/** True when the filter object has at least one active constraint. */
export function hasActiveFilters(f: ScreenerQueryFilters): boolean {
  return countActiveFilters(f) > 0;
}

/** Number of active (non-empty) constraints — used for the UI badge. */
export function countActiveFilters(f: ScreenerQueryFilters): number {
  let n = 0;
  if (f.search && f.search.trim()) n++;
  if (f.minScore != null) n++;
  if (f.maxScore != null) n++;
  if (f.minRank != null) n++;
  if (f.maxRank != null) n++;
  if (f.athWithinPct != null) n++;
  if (f.require200Dma) n++;
  if (f.require50Dma) n++;
  if (f.requireAllDma) n++;
  if (f.minMcapCr != null) n++;
  if (f.maxMcapCr != null) n++;
  if (f.mcapCategories && f.mcapCategories.length > 0) n++;
  if (f.minTurnoverCr != null) n++;
  if (f.minPrice != null) n++;
  if (f.maxPrice != null) n++;
  if (f.minDayChange != null) n++;
  if (f.maxDayChange != null) n++;
  if (f.minDrawdownPct != null) n++;
  if (f.portfolio && f.portfolio !== 'any') n++;
  return n;
}

function matchesCategory(row: ScreenerRow, cats: string[]): boolean {
  const c = (row.marketCapCategory || '').toLowerCase();
  return cats.some((want) => c.includes(want.toLowerCase()));
}

/**
 * Apply a saved query's filters to a set of rows. Pure — does not sort.
 * `tab` lets drawdown pick the right basis (entry DD on portfolio tab).
 */
export function applyScreenerFilters(
  rows: ScreenerRow[],
  f: ScreenerQueryFilters,
  tab: 'all' | 'prefiltered' | 'portfolio',
): ScreenerRow[] {
  const q = f.search?.trim().toLowerCase();

  return rows.filter((r) => {
    if (q) {
      const hay = `${r.symbol} ${r.companyName}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }

    if (f.portfolio === 'only' && !r.inPortfolio) return false;
    if (f.portfolio === 'exclude' && r.inPortfolio) return false;

    // Score
    if (f.minScore != null && r.compositeScore < f.minScore) return false;
    if (f.maxScore != null && r.compositeScore > f.maxScore) return false;

    // Rank — unranked rows (9999) only pass when no rank constraint is set
    if (f.minRank != null || f.maxRank != null) {
      if (r.rank === 9999) return false;
      if (f.minRank != null && r.rank < f.minRank) return false;
      if (f.maxRank != null && r.rank > f.maxRank) return false;
    }

    // ATH proximity — within X% means (1 - proximity)*100 <= X
    if (f.athWithinPct != null) {
      const awayPct = (1 - r.athProximity) * 100;
      if (awayPct > f.athWithinPct) return false;
    }

    // Trend / DMA requirements
    if (f.require200Dma && !r.dmaSwatches.above200) return false;
    if (f.require50Dma && !r.dmaSwatches.above50) return false;
    if (f.requireAllDma) {
      const s = r.dmaSwatches;
      if (!(s.above10 && s.above20 && s.above50 && s.above100 && s.above200)) return false;
    }

    // Market cap
    if (f.minMcapCr != null && r.marketCapCr < f.minMcapCr) return false;
    if (f.maxMcapCr != null && r.marketCapCr > f.maxMcapCr) return false;
    if (f.mcapCategories && f.mcapCategories.length > 0 && !matchesCategory(r, f.mcapCategories)) return false;

    // Liquidity
    if (f.minTurnoverCr != null && r.medianTurnoverCr < f.minTurnoverCr) return false;

    // Price (CMP)
    if (f.minPrice != null && r.currentPrice < f.minPrice) return false;
    if (f.maxPrice != null && r.currentPrice > f.maxPrice) return false;

    // Day change
    if (f.minDayChange != null || f.maxDayChange != null) {
      const dc = r.dayChangePct;
      if (dc == null) return false;
      if (f.minDayChange != null && dc < f.minDayChange) return false;
      if (f.maxDayChange != null && dc > f.maxDayChange) return false;
    }

    // Drawdown — pick entry DD on portfolio tab if present, else ATH DD
    if (f.minDrawdownPct != null) {
      const athDd = -((1 - r.athProximity) * 100);
      const dd = tab === 'portfolio' && r.drawdownSinceEntry != null ? r.drawdownSinceEntry : athDd;
      if (dd < f.minDrawdownPct) return false;
    }

    return true;
  });
}
