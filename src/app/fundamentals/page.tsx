'use client';

import StockSearch from '@/components/fundamentals/StockSearch';
import { motion } from 'framer-motion';
import Link from 'next/link';

const POPULAR_STOCKS = [
  { symbol: 'RELIANCE', name: 'Reliance Industries', sector: 'Energy & Retail', color: 'from-blue-500/20 to-indigo-500/10 hover:border-blue-500/30' },
  { symbol: 'TCS', name: 'Tata Consultancy Services', sector: 'IT Services', color: 'from-purple-500/20 to-indigo-500/10 hover:border-purple-500/30' },
  { symbol: 'INFY', name: 'Infosys', sector: 'IT Services', color: 'from-emerald-500/20 to-teal-500/10 hover:border-emerald-500/30' },
  { symbol: 'HDFCBANK', name: 'HDFC Bank', sector: 'Banking & Financials', color: 'from-sky-500/20 to-blue-500/10 hover:border-sky-500/30' },
  { symbol: 'ICICIBANK', name: 'ICICI Bank', sector: 'Banking & Financials', color: 'from-orange-500/20 to-amber-500/10 hover:border-orange-500/30' },
  { symbol: 'SBIN', name: 'State Bank of India', sector: 'Banking & Financials', color: 'from-cyan-500/20 to-blue-500/10 hover:border-cyan-500/30' },
];

export default function FundamentalsLandingPage() {
  return (
    <main className="min-h-[85vh] bg-[#090d16] text-zinc-100 flex flex-col items-center justify-center py-12 px-4 md:px-8 relative overflow-hidden">
      {/* Decorative Radial Background Gradients */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 w-[350px] h-[350px] bg-purple-500/5 rounded-full blur-[100px] pointer-events-none" />
      
      <div className="max-w-3xl w-full flex flex-col items-center text-center relative z-10">
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
          <h2 className="text-zinc-500 font-semibold text-xs uppercase tracking-wider mb-4">
            Popular Research Symbols
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {POPULAR_STOCKS.map((stock) => (
              <Link
                key={stock.symbol}
                href={`/fundamentals/${stock.symbol}`}
                className={`flex flex-col items-start p-3 bg-gradient-to-br ${stock.color} border border-white/5 rounded-xl transition-all duration-300 backdrop-blur-md shadow-md text-left hover:scale-[1.02] hover:shadow-[0_8px_20px_rgba(0,0,0,0.3)] group`}
              >
                <span className="font-bold text-white font-mono tracking-wide group-hover:text-blue-400 transition-colors">
                  {stock.symbol}
                </span>
                <span className="text-[10px] text-zinc-400 font-medium truncate w-full mt-0.5">
                  {stock.name}
                </span>
                <span className="text-[9px] text-zinc-600 font-bold uppercase tracking-wider mt-1.5">
                  {stock.sector}
                </span>
              </Link>
            ))}
          </div>
        </motion.div>
      </div>
    </main>
  );
}
