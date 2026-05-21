'use client';

import StockSearch from '@/components/fundamentals/StockSearch';
import { motion } from 'framer-motion';
import Link from 'next/link';

const POPULAR_STOCKS = [
  { 
    symbol: 'RELIANCE', 
    name: 'Reliance Industries', 
    sector: 'Energy & Retail', 
    tagline: 'Energy & Conglomerate Leader', 
    avatar: 'R', 
    avatarBg: 'from-blue-600 to-cyan-500', 
    borderColor: 'hover:border-blue-500/30'
  },
  { 
    symbol: 'TCS', 
    name: 'Tata Consultancy Services', 
    sector: 'IT Services', 
    tagline: 'Global IT Consulting Giant', 
    avatar: 'T', 
    avatarBg: 'from-purple-600 to-indigo-500', 
    borderColor: 'hover:border-purple-500/30'
  },
  { 
    symbol: 'INFY', 
    name: 'Infosys', 
    sector: 'IT Services', 
    tagline: 'Digital Services & Consulting', 
    avatar: 'I', 
    avatarBg: 'from-emerald-600 to-teal-500', 
    borderColor: 'hover:border-emerald-500/30'
  },
  { 
    symbol: 'HDFCBANK', 
    name: 'HDFC Bank', 
    sector: 'Banking & Financials', 
    tagline: 'Private Sector Banking Pioneer', 
    avatar: 'H', 
    avatarBg: 'from-sky-600 to-blue-500', 
    borderColor: 'hover:border-sky-500/30'
  },
  { 
    symbol: 'ICICIBANK', 
    name: 'ICICI Bank', 
    sector: 'Banking & Financials', 
    tagline: 'Leading Private Sector Lender', 
    avatar: 'IC', 
    avatarBg: 'from-orange-600 to-amber-500', 
    borderColor: 'hover:border-orange-500/30'
  },
  { 
    symbol: 'SBIN', 
    name: 'State Bank of India', 
    sector: 'Banking & Financials', 
    tagline: 'Public Sector Banking Giant', 
    avatar: 'S', 
    avatarBg: 'from-cyan-600 to-blue-500', 
    borderColor: 'hover:border-cyan-500/30'
  },
];

export default function FundamentalsLandingPage() {
  return (
    <div className="min-h-[85vh] text-zinc-100 flex flex-col items-center justify-center py-12 px-4 md:px-8 relative overflow-hidden">
      {/* Decorative Radial Background Gradients */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 w-[350px] h-[350px] bg-purple-500/5 rounded-full blur-[100px] pointer-events-none" />
      
      <div className="max-w-4xl w-full flex flex-col items-center text-center relative z-10">
        {/* Animated Icon Badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="mb-6 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-md"
        >
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-400">Upstox Fundamentals Suite</span>
        </motion.div>

        {/* Dynamic Title */}
        <motion.h1
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-zinc-200 to-zinc-400 mb-4 leading-[1.1]"
        >
          Analyze Indian Stocks
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-zinc-400 text-sm sm:text-base md:text-lg max-w-xl font-medium mb-10 leading-relaxed"
        >
          Evaluate financial health, ratios, shareholding patterns, and corporate actions directly from premium stock data.
        </motion.p>

        {/* Big Searchbar Container */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="w-full max-w-xl mb-12 shadow-[0_20px_50px_rgba(0,0,0,0.4)] rounded-2xl"
        >
          <StockSearch size="lg" placeholder="Search stock symbol... (e.g. RELIANCE, TCS, INFY)" />
        </motion.div>

        {/* Popular Stocks Grid */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="w-full"
        >
          <h2 className="text-zinc-500 font-semibold text-xs uppercase tracking-wider mb-5">
            Popular Research Symbols
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
            {POPULAR_STOCKS.map((stock) => (
              <Link
                key={stock.symbol}
                href={`/fundamentals/${stock.symbol}`}
                className={`flex items-start gap-4 p-4 rounded-2xl bg-zinc-900/30 border border-white/5 backdrop-blur-xl transition-all duration-300 text-left hover:scale-[1.02] hover:bg-zinc-900/50 hover:shadow-[0_12px_30px_rgba(0,0,0,0.4)] hover:shadow-cyan-500/5 hover:border-white/10 group ${stock.borderColor}`}
              >
                {/* Visual Avatar with Gradient */}
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
        </motion.div>
      </div>
    </div>
  );
}
