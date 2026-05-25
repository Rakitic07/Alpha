'use client';

import { usePortfolioHoldings } from '@/hooks/useQueries';
import StockSearch from '@/components/fundamentals/StockSearch';
import Link from 'next/link';

export default function FundamentalsLandingPage() {
  const { data: holdings = [], isLoading } = usePortfolioHoldings();

  // Filter out invalid holdings and sort alphabetically by symbol
  const activeHoldings = [...holdings]
    .filter(h => h.symbol)
    .sort((a, b) => a.symbol.localeCompare(b.symbol));

  return (
    <div className="min-h-[80vh] text-zinc-100 flex flex-col items-center justify-center py-12 px-4 md:px-8 relative overflow-hidden">
      {/* Decorative Radial Background Gradients */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] bg-blue-500/10 rounded-full blur-[130px] pointer-events-none" />
      <div className="absolute top-1/3 left-1/3 w-[300px] h-[300px] bg-purple-500/5 rounded-full blur-[100px] pointer-events-none" />
      
      <div className="max-w-2xl w-full flex flex-col items-center text-center relative z-10">
        
        {/* Small subtitle/badge */}
        <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-500 mb-6 block animate-fade-in-up stagger-1">
          Alpha Fundamentals Search
        </span>

        {/* Searchbar */}
        <div className="w-full mb-10 shadow-[0_25px_60px_rgba(0,0,0,0.5)] rounded-2xl animate-fade-in-up stagger-2">
          <StockSearch size="lg" placeholder="" />
        </div>

        {/* Quick Navigation Chips */}
        <div className="w-full flex flex-col items-center animate-fade-in-up stagger-3">
          <div className="flex flex-wrap justify-center gap-2.5 max-w-xl">
            {isLoading ? (
              // Loading skeleton chips
              Array.from({ length: 6 }).map((_, idx) => (
                <div 
                  key={idx}
                  className="px-4 py-2 rounded-xl bg-zinc-950/40 border border-white/5 w-24 h-8 animate-pulse"
                />
              ))
            ) : activeHoldings.length > 0 ? (
              activeHoldings.map((holding, idx) => {
                const isPositive = holding.pnlPercent >= 0;
                return (
                  <Link
                    key={holding.symbol}
                    href={`/fundamentals/${holding.symbol}`}
                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-zinc-950/40 border border-white/5 hover:border-blue-500/30 hover:bg-zinc-900/60 backdrop-blur-md transition-all duration-200 hover:scale-[1.05] hover:shadow-[0_0_15px_rgba(59,130,246,0.12)] group animate-fade-in-up`}
                    style={{ animationDelay: `${(idx + 4) * 80}ms` }}
                  >
                    <span className="font-mono text-xs font-bold text-zinc-200 group-hover:text-blue-400 transition-colors">
                      {holding.symbol}
                    </span>
                    <span className="w-1 h-1 rounded-full bg-zinc-700" />
                    <span className={`text-[10px] font-semibold tracking-wide ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {isPositive ? '+' : ''}{holding.pnlPercent.toFixed(1)}%
                    </span>
                  </Link>
                );
              })
            ) : (
              // Fallback to popular symbols if no active holdings
              ['HDFCBANK', 'ICICIBANK', 'INFY', 'RELIANCE', 'SBIN', 'TCS'].map((symbol, idx) => (
                <Link
                  key={symbol}
                  href={`/fundamentals/${symbol}`}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-zinc-950/40 border border-white/5 hover:border-blue-500/30 hover:bg-zinc-900/60 backdrop-blur-md transition-all duration-200 hover:scale-[1.05] hover:shadow-[0_0_15px_rgba(59,130,246,0.12)] group animate-fade-in-up`}
                  style={{ animationDelay: `${(idx + 4) * 80}ms` }}
                >
                  <span className="font-mono text-xs font-bold text-zinc-200 group-hover:text-blue-400 transition-colors">
                    {symbol}
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
