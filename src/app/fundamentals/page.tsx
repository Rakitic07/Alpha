'use client';

import StockSearch from '@/components/fundamentals/StockSearch';
import Link from 'next/link';

const POPULAR_STOCKS = [
  { 
    symbol: 'RELIANCE', 
    name: 'Reliance Industries', 
    sector: 'Energy & Retail', 
    tagline: 'Energy & Conglomerate Leader', 
    avatar: 'R', 
    avatarBg: 'from-blue-600 to-cyan-500', 
    borderColor: 'hover:border-blue-500/30',
    glowColor: 'rgba(59, 130, 246, 0.05)',
  },
  { 
    symbol: 'TCS', 
    name: 'Tata Consultancy Services', 
    sector: 'IT Services', 
    tagline: 'Global IT Consulting Giant', 
    avatar: 'T', 
    avatarBg: 'from-purple-600 to-indigo-500', 
    borderColor: 'hover:border-purple-500/30',
    glowColor: 'rgba(139, 92, 246, 0.05)',
  },
  { 
    symbol: 'INFY', 
    name: 'Infosys', 
    sector: 'IT Services', 
    tagline: 'Digital Services & Consulting', 
    avatar: 'I', 
    avatarBg: 'from-emerald-600 to-teal-500', 
    borderColor: 'hover:border-emerald-500/30',
    glowColor: 'rgba(16, 185, 129, 0.05)',
  },
  { 
    symbol: 'HDFCBANK', 
    name: 'HDFC Bank', 
    sector: 'Banking & Financials', 
    tagline: 'Private Sector Banking Pioneer', 
    avatar: 'H', 
    avatarBg: 'from-sky-600 to-blue-500', 
    borderColor: 'hover:border-sky-500/30',
    glowColor: 'rgba(14, 165, 233, 0.05)',
  },
  { 
    symbol: 'ICICIBANK', 
    name: 'ICICI Bank', 
    sector: 'Banking & Financials', 
    tagline: 'Leading Private Sector Lender', 
    avatar: 'IC', 
    avatarBg: 'from-orange-600 to-amber-500', 
    borderColor: 'hover:border-orange-500/30',
    glowColor: 'rgba(249, 115, 22, 0.05)',
  },
  { 
    symbol: 'SBIN', 
    name: 'State Bank of India', 
    sector: 'Banking & Financials', 
    tagline: 'Public Sector Banking Giant', 
    avatar: 'S', 
    avatarBg: 'from-cyan-600 to-blue-500', 
    borderColor: 'hover:border-cyan-500/30',
    glowColor: 'rgba(6, 182, 212, 0.05)',
  },
];

export default function FundamentalsLandingPage() {
  return (
    <div className="min-h-[85vh] text-zinc-100 flex flex-col items-center justify-center py-12 px-4 md:px-8 relative overflow-hidden">
      {/* Decorative Radial Background Gradients */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 w-[350px] h-[350px] bg-purple-500/5 rounded-full blur-[100px] pointer-events-none" />
      
      <div className="max-w-4xl w-full flex flex-col items-center text-center relative z-10">
        {/* Badge */}
        <div className="mb-6 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-md animate-fade-in-up stagger-1">
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-400">Upstox Fundamentals Suite</span>
        </div>

        {/* Title */}
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-zinc-200 to-zinc-400 mb-4 leading-[1.1] animate-fade-in-up stagger-2">
          Analyze Indian Stocks
        </h1>

        {/* Subtitle */}
        <p className="text-zinc-400 text-sm sm:text-base md:text-lg max-w-xl font-medium mb-10 leading-relaxed animate-fade-in-up stagger-3">
          Evaluate financial health, ratios, shareholding patterns, and corporate actions directly from premium stock data.
        </p>

        {/* Searchbar */}
        <div className="w-full max-w-xl mb-12 shadow-[0_20px_50px_rgba(0,0,0,0.4)] rounded-2xl animate-fade-in-up stagger-4">
          <StockSearch size="lg" placeholder="Search stock symbol... (e.g. RELIANCE, TCS, INFY)" />
        </div>

        {/* Popular Stocks Grid */}
        <div className="w-full animate-fade-in-up stagger-5">
          <div className="flex items-center gap-3 mb-5 justify-center">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/20 to-violet-500/5 flex items-center justify-center">
              <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Popular Research Symbols</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
            {POPULAR_STOCKS.map((stock, idx) => (
              <Link
                key={stock.symbol}
                href={`/fundamentals/${stock.symbol}`}
                className={`flex items-start gap-4 p-4 bg-slate-900/50 rounded-2xl border border-white/5 glass-card transition-all duration-300 text-left hover:scale-[1.02] hover:shadow-[0_12px_30px_rgba(0,0,0,0.4)] hover:border-white/10 group ${stock.borderColor} animate-fade-in-up stagger-${Math.min(idx + 6, 10)}`}
                style={{ backgroundImage: `radial-gradient(circle at 100% 0%, ${stock.glowColor}, transparent)` }}
              >
                {/* Avatar */}
                <div className={`flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br ${stock.avatarBg} p-[1px] shadow-lg transition-transform duration-300 group-hover:scale-105`}>
                  <div className="w-full h-full rounded-[11px] bg-zinc-950 flex items-center justify-center font-extrabold text-white text-base">
                    {stock.avatar}
                  </div>
                </div>

                <div className="flex-grow min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-bold text-white tracking-wide group-hover:text-blue-400 transition-colors">
                      {stock.symbol}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-zinc-400 font-semibold border border-white/5">
                      {stock.sector}
                    </span>
                  </div>
                  <h3 className="text-xs font-semibold text-zinc-300 truncate mt-1">
                    {stock.name}
                  </h3>
                  <p className="text-[10px] text-zinc-500 font-medium mt-1">
                    {stock.tagline}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
