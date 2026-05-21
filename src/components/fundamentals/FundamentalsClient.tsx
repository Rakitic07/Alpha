'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import StockSearch from '@/components/fundamentals/StockSearch';

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { CompanyFundamentals, FinancialStatement, ShareholdingPattern, KeyRatio, CorporateAction, CompetitorProfile } from '@/lib/upstox/fundamentals';

interface FundamentalsClientProps {
  symbol: string;
  resolvedName: string;
  resolvedIsin: string;
  initialData: CompanyFundamentals;
}

// Color constants for shareholding pie slices
const PIE_COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#f59e0b', '#ec4899'];

export default function FundamentalsClient({
  symbol,
  resolvedName,
  resolvedIsin,
  initialData,
}: FundamentalsClientProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'financials' | 'shareholding' | 'actions'>('overview');
  const [financialSubTab, setFinancialSubTab] = useState<'income' | 'balance' | 'cash'>('income');
  const [expandedStatement, setExpandedStatement] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Scroll spy to highlight active anchor link in sticky sub-navigation
  useEffect(() => {
    const sections = ['overview', 'financials', 'shareholding', 'actions'];
    const observers = sections.map(id => {
      const el = document.getElementById(id);
      if (!el) return null;
      
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setActiveTab(id as any);
          }
        },
        {
          rootMargin: '-10% 0px -50% 0px' // Trigger when section occupies the top-middle of the screen
        }
      );
      observer.observe(el);
      return { observer, el };
    });
    
    return () => {
      observers.forEach(obs => {
        if (obs) obs.observer.unobserve(obs.el);
      });
    };
  }, []);

  // ────────────────────────────────────────────────────────────────────────────
  // Parse Data for Recharts
  // ────────────────────────────────────────────────────────────────────────────

  // Helper to search row by partial matching name (case-insensitive)
  const getStatementRow = (statement: FinancialStatement, keywords: string[]) => {
    return statement?.full_statement?.find(row =>
      keywords.some(kw => row.particular.toLowerCase().includes(kw.toLowerCase()))
    );
  };

  // 1. Income Statement Chart Data (Revenue vs Net Profit)
  const incomeChartData = useMemo(() => {
    if (!initialData.incomeStatement?.full_statement) return [];
    
    // Find revenue and profit rows
    const revRow = getStatementRow(initialData.incomeStatement, ['sales', 'revenue', 'earned', 'turnover']);
    const profRow = getStatementRow(initialData.incomeStatement, ['net profit', 'profit after tax', 'pat', 'income']);
    
    if (!revRow && !profRow) return [];

    // Collect all periods
    const periods = new Set<string>();
    revRow?.history.forEach(h => periods.add(h.period));
    profRow?.history.forEach(h => periods.add(h.period));
    
    return Array.from(periods)
      .sort((a, b) => {
        const yrA = parseInt(a.replace(/\D/g, '')) || 0;
        const yrB = parseInt(b.replace(/\D/g, '')) || 0;
        return yrA - yrB;
      })
      .map(period => {
        const revVal = revRow?.history.find(h => h.period === period)?.value || 0;
        const profVal = profRow?.history.find(h => h.period === period)?.value || 0;
        return {
          period,
          Revenue: revVal,
          'Net Profit': profVal,
        };
      });
  }, [initialData.incomeStatement]);

  // 2. Balance Sheet Chart Data (Assets vs Liabilities)
  const balanceChartData = useMemo(() => {
    // If standard history is provided directly, use it
    if (initialData.balanceSheet?.history && initialData.balanceSheet.history.length > 0) {
      return [...initialData.balanceSheet.history].sort((a, b) => {
        const yrA = parseInt(a.period.replace(/\D/g, '')) || 0;
        const yrB = parseInt(b.period.replace(/\D/g, '')) || 0;
        return yrA - yrB;
      });
    }

    if (!initialData.balanceSheet?.full_statement) return [];

    // Otherwise, try to extract total assets and total liabilities (or borrowings/reserves)
    const assetKeywords = ['total asset', 'assets', 'net block', 'capital'];
    const liabKeywords = ['total liability', 'liabilities', 'borrowings', 'reserves'];
    
    const assetRow = getStatementRow(initialData.balanceSheet, assetKeywords);
    const liabRow = getStatementRow(initialData.balanceSheet, liabKeywords);

    const periods = new Set<string>();
    assetRow?.history.forEach(h => periods.add(h.period));
    liabRow?.history.forEach(h => periods.add(h.period));

    return Array.from(periods)
      .sort((a, b) => {
        const yrA = parseInt(a.replace(/\D/g, '')) || 0;
        const yrB = parseInt(b.replace(/\D/g, '')) || 0;
        return yrA - yrB;
      })
      .map(period => {
        const assetVal = assetRow?.history.find(h => h.period === period)?.value || 0;
        const liabVal = liabRow?.history.find(h => h.period === period)?.value || 0;
        return {
          period,
          total_asset: assetVal,
          total_liability: liabVal || assetVal, // in accounting, assets = liabilities + equity
        };
      });
  }, [initialData.balanceSheet]);

  // 3. Cash Flow Chart Data (Operating, Investing, Financing)
  const cashFlowChartData = useMemo(() => {
    if (!initialData.cashFlow?.full_statement) return [];

    const opRow = getStatementRow(initialData.cashFlow, ['operating']);
    const invRow = getStatementRow(initialData.cashFlow, ['investing']);
    const finRow = getStatementRow(initialData.cashFlow, ['financing']);
    const netRow = getStatementRow(initialData.cashFlow, ['net cash']);

    const periods = new Set<string>();
    opRow?.history.forEach(h => periods.add(h.period));
    invRow?.history.forEach(h => periods.add(h.period));
    finRow?.history.forEach(h => periods.add(h.period));
    netRow?.history.forEach(h => periods.add(h.period));

    return Array.from(periods)
      .sort((a, b) => {
        const yrA = parseInt(a.replace(/\D/g, '')) || 0;
        const yrB = parseInt(b.replace(/\D/g, '')) || 0;
        return yrA - yrB;
      })
      .map(period => {
        return {
          period,
          Operating: opRow?.history.find(h => h.period === period)?.value || 0,
          Investing: invRow?.history.find(h => h.period === period)?.value || 0,
          Financing: finRow?.history.find(h => h.period === period)?.value || 0,
          'Net Flow': netRow?.history.find(h => h.period === period)?.value || 0,
        };
      });
  }, [initialData.cashFlow]);

  // 4. Shareholding Data (Latest Donut & Historical Stacked Bars)
  const shareholdingPeriods = useMemo(() => {
    if (!initialData.shareHoldings || initialData.shareHoldings.length === 0) return [];
    const periods = new Set<string>();
    initialData.shareHoldings.forEach(sh => {
      sh.history.forEach(h => periods.add(h.period));
    });
    
    return Array.from(periods).sort((a, b) => {
      const parsePeriod = (p: string) => {
        const parts = p.split(' ');
        const year = parseInt(parts[1]) || 0;
        const months = { 'Jan': 1, 'Feb': 2, 'Mar': 3, 'Apr': 4, 'May': 5, 'Jun': 6, 'Jul': 7, 'Aug': 8, 'Sep': 9, 'Oct': 10, 'Nov': 11, 'Dec': 12 };
        const month = months[parts[0] as keyof typeof months] || 0;
        return year * 100 + month;
      };
      return parsePeriod(a) - parsePeriod(b);
    });
  }, [initialData.shareHoldings]);

  const latestShareholdingPeriod = shareholdingPeriods[shareholdingPeriods.length - 1];

  const latestShareholdingPieData = useMemo(() => {
    if (!initialData.shareHoldings || !latestShareholdingPeriod) return [];
    return initialData.shareHoldings
      .map(cat => {
        const percentage = cat.history.find(h => h.period === latestShareholdingPeriod)?.percentage || 0;
        return {
          name: cat.category,
          value: percentage,
        };
      })
      .filter(item => item.value > 0);
  }, [initialData.shareHoldings, latestShareholdingPeriod]);

  const shareholdingHistoricalData = useMemo(() => {
    if (!initialData.shareHoldings) return [];
    return shareholdingPeriods.map(period => {
      const row: Record<string, any> = { period };
      initialData.shareHoldings.forEach(cat => {
        row[cat.category] = cat.history.find(h => h.period === period)?.percentage || 0;
      });
      return row;
    });
  }, [initialData.shareHoldings, shareholdingPeriods]);

  // Ratios extraction
  // Ratios extraction
  const getRatioValue = (name: string) => {
    return initialData.keyRatios?.find(r => {
      const lowerName = r.name.toLowerCase().trim();
      const lowerQuery = name.toLowerCase().trim();
      if (lowerQuery === 'p/e ratio' || lowerQuery === 'p/e') {
        return lowerName === 'p/e' || lowerName === 'p/e ratio';
      }
      if (lowerQuery === 'p/b ratio' || lowerQuery === 'p/b') {
        return lowerName === 'p/b' || lowerName === 'p/b ratio';
      }
      return lowerName.includes(lowerQuery);
    })?.company_value || '—';
  };

  // Header quick statistics
  const headPE = getRatioValue('p/e ratio');
  const headPB = getRatioValue('p/b ratio');
  const headROE = getRatioValue('roe');
  const headDivYield = getRatioValue('dividend yield');

  // Ratios values parsed
  const parsePercent = (valStr: string) => parseFloat(valStr.replace('%', '')) || 0;

  return (
    <div className="flex flex-col gap-6 w-full animate-fade-in-up">
      {/* ────────────────────────────────────────────────────────────────────────
          Header Actions
          ──────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-white/5 pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/fundamentals"
            title="Back to Fundamentals Search"
            className="flex items-center justify-center w-9 h-9 rounded-xl bg-zinc-900/60 border border-white/5 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-all shadow-md group"
          >
            <svg className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white leading-none">
                {resolvedName}
              </h1>
              <span className="font-mono text-sm px-2 py-0.5 rounded-md bg-white/5 text-zinc-400 border border-white/5">
                {symbol}
              </span>
              {initialData.isMock && (
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.1)] cursor-help" title="Using offline database representation as Upstox credentials are not fully integrated.">
                  DEMO DATA
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              Sector: <span className="text-zinc-300 font-semibold">{initialData.profile?.sector}</span> | ISIN: <span className="font-mono text-zinc-400">{resolvedIsin}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
          {/* Search bar inside details page header */}
          <div className="w-full sm:w-60">
            <StockSearch size="sm" placeholder="Search other stock..." />
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────
          Top Quick Cards Grid
          ──────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            title: 'Market Capitalization',
            value: initialData.profile?.sector_market_cap_inr?.formatted || '—',
            subtitle: initialData.profile?.sector_market_cap_usd?.formatted || '',
            iconColor: 'text-blue-400',
            bgGlow: 'rgba(59, 130, 246, 0.05)',
            icon: (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            )
          },
          {
            title: 'P/E Ratio',
            value: headPE,
            subtitle: `Sector Avg: ${initialData.keyRatios?.find(r => {
              const nameLower = r.name.toLowerCase();
              return nameLower === 'p/e' || nameLower === 'p/e ratio' || nameLower.includes('p/e');
            })?.sector_value || '—'}`,
            iconColor: 'text-violet-400',
            bgGlow: 'rgba(139, 92, 246, 0.05)',
            icon: (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z" />
              </svg>
            )
          },
          {
            title: 'Return on Equity (ROE)',
            value: headROE,
            subtitle: `P/B Ratio: ${headPB}`,
            iconColor: 'text-emerald-400',
            bgGlow: 'rgba(16, 185, 129, 0.05)',
            icon: (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            )
          },
          {
            title: 'Dividend Yield',
            value: headDivYield,
            subtitle: `Sector Avg: ${initialData.keyRatios?.find(r => r.name.toLowerCase().includes('dividend yield'))?.sector_value || '—'}`,
            iconColor: 'text-amber-400',
            bgGlow: 'rgba(245, 158, 11, 0.05)',
            icon: (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M12 16v0" />
              </svg>
            )
          }
        ].map((card, i) => (
          <motion.div
            key={i}
            className="glass-card p-4 relative group hover:scale-[1.01] transition-transform duration-200"
            style={{
              backgroundImage: `radial-gradient(circle at 10% 10%, ${card.bgGlow}, transparent)`
            }}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{card.title}</p>
                <h3 className="text-xl font-bold text-white mt-1.5 tracking-tight">{card.value}</h3>
                <p className="text-xs text-zinc-400 mt-1">{card.subtitle}</p>
              </div>
              <div className={`p-2.5 rounded-xl bg-white/5 border border-white/5 ${card.iconColor}`}>
                {card.icon}
              </div>
            </div>
            <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-transparent via-blue-500/20 to-transparent scale-x-0 group-hover:scale-x-100 transition-transform duration-300" />
          </motion.div>
        ))}
      </div>

      {/* Sticky Anchor Navigation Bar */}
      <div className="sticky top-0 z-40 bg-[#090d16]/90 backdrop-blur-md py-3.5 border-b border-white/5 -mx-4 px-4 md:-mx-8 md:px-8 flex items-center justify-between gap-4">
        <span className="hidden md:inline font-bold text-sm text-zinc-300">
          {resolvedName} <span className="font-mono text-zinc-500">({symbol})</span>
        </span>
        <div className="flex p-1 rounded-xl bg-zinc-900/60 border border-white/5 backdrop-blur-md relative overflow-hidden justify-between sm:justify-start w-full md:w-auto">
          {([
            { id: 'overview', label: 'Overview' },
            { id: 'financials', label: 'Financials' },
            { id: 'shareholding', label: 'Shareholding' },
            { id: 'actions', label: 'Actions' },
          ] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                const element = document.getElementById(tab.id);
                if (element) {
                  const offset = 80;
                  const bodyRect = document.body.getBoundingClientRect().top;
                  const elementRect = element.getBoundingClientRect().top;
                  const elementPosition = elementRect - bodyRect;
                  const offsetPosition = elementPosition - offset;
                  
                  window.scrollTo({
                    top: offsetPosition,
                    behavior: 'smooth'
                  });
                }
              }}
              className={`relative px-4 py-1.5 text-xs font-semibold rounded-lg transition-all duration-300 select-none ${
                activeTab === tab.id
                  ? 'text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {activeTab === tab.id && (
                <motion.div
                  layoutId="activeTabGlow"
                  className="absolute inset-0 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 shadow-[0_0_15px_rgba(59,130,246,0.3)] z-0"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
              <span className="relative z-10">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────
          Stacked Sections Layout
          ──────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-12 w-full mt-4">
        {/* ====================================================================
            1. OVERVIEW & PEERS SECTION
            ==================================================================== */}
        <section id="overview" className="scroll-mt-24 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white tracking-tight">Company Overview & Peers</h2>
            <div className="h-px flex-grow bg-white/5" />
          </div>
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Profile Card */}
            <div className="flex-grow lg:w-2/3 flex flex-col gap-6">
              <div className="glass-card p-6 flex flex-col gap-4">
                <div>
                  <h3 className="text-base font-bold text-white uppercase tracking-wider">Company Description</h3>
                  <div className="h-px w-10 bg-blue-500 mt-1" />
                </div>
                <p className="text-sm leading-relaxed text-zinc-300 font-medium">
                  {initialData.profile?.company_profile}
                </p>
              </div>

              {/* Key Ratios Grid */}
              <div className="glass-card p-6 flex flex-col gap-4">
                <div>
                  <h3 className="text-base font-bold text-white uppercase tracking-wider">Key Valuation Ratios</h3>
                  <div className="h-px w-10 bg-indigo-500 mt-1" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {initialData.keyRatios?.map((ratio, index) => {
                    const compNum = parsePercent(ratio.company_value);
                    const secNum = parsePercent(ratio.sector_value);
                    
                    return (
                      <div key={index} className="flex flex-col p-3.5 rounded-xl bg-zinc-900/40 border border-white/5 hover:border-white/10 hover:bg-zinc-900/60 transition-all">
                        <span className="text-xs font-semibold text-zinc-400">{ratio.name}</span>
                        <div className="flex items-baseline justify-between mt-1.5">
                          <span className="text-base font-extrabold text-white font-mono">{ratio.company_value}</span>
                          <span className="text-xs text-zinc-500">Sector Avg: <span className="font-mono text-zinc-400 font-semibold">{ratio.sector_value}</span></span>
                        </div>
                        {/* Visual progress bar comparison */}
                        <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden mt-3 relative">
                          <div 
                            className={`h-full rounded-full bg-zinc-600`}
                            style={{ width: `${Math.min(100, Math.max(10, (secNum ? (compNum / secNum) * 50 : 50)))}%` }}
                          />
                          {secNum > 0 && (
                            <div 
                              className="absolute top-0 bottom-0 w-0.5 bg-indigo-500" 
                              style={{ left: '50%' }}
                              title="Sector Average Line"
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Sidebar Competitors */}
            <div className="lg:w-1/3 flex flex-col gap-6">
              <div className="glass-card p-6 flex flex-col gap-4">
                <div>
                  <h3 className="text-base font-bold text-white uppercase tracking-wider">Peer Group Competitors</h3>
                  <div className="h-px w-10 bg-cyan-500 mt-1" />
                </div>
                
                <div className="flex flex-col gap-3">
                  {initialData.competitors?.map((competitor, idx) => {
                    const hasSymbol = !!competitor.symbol;
                    return (
                      <div 
                        key={idx} 
                        className="p-4 rounded-xl bg-zinc-900/30 border border-white/5 hover:border-white/10 hover:bg-zinc-900/50 transition-all flex flex-col gap-2 relative group"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-sm font-bold text-white">
                            {competitor.symbol || competitor.instrument_key.split('|')[1]}
                          </span>
                          <span className="text-[10px] text-zinc-500 font-semibold">
                            {competitor.sector_market_cap_inr?.formatted}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-400 leading-normal line-clamp-3">
                          {competitor.company_profile}
                        </p>
                        
                        {hasSymbol && (
                          <Link
                            href={`/fundamentals/${competitor.symbol}`}
                            className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-blue-400 hover:text-blue-300 transition-colors self-end"
                          >
                            Explore Fundamentals
                            <svg className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                          </Link>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ====================================================================
            2. FINANCIAL STATEMENTS SECTION
            ==================================================================== */}
        <section id="financials" className="scroll-mt-24 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white tracking-tight">Financial Statements</h2>
            <div className="h-px flex-grow bg-white/5" />
          </div>
          <div className="flex flex-col gap-6">
            <div className="glass-card p-6 flex flex-col gap-6">
              {/* Financial Sub tabs */}
              <div className="flex items-center justify-between border-b border-white/5 pb-4">
                <div className="flex gap-2">
                  {([
                    { id: 'income', label: 'Income Statement' },
                    { id: 'balance', label: 'Balance Sheet' },
                    { id: 'cash', label: 'Cash Flow' }
                  ] as const).map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setFinancialSubTab(tab.id)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                        financialSubTab === tab.id
                          ? 'bg-blue-600/10 text-blue-400 border-blue-500/20 shadow-[0_0_10px_rgba(59,130,246,0.05)]'
                          : 'bg-zinc-900/40 text-zinc-400 border-white/5 hover:text-zinc-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">
                  Figures in <span className="text-zinc-300 font-bold">{initialData.incomeStatement?.units_in || 'Crore'} INR</span>
                </span>
              </div>

              {/* Sub Tab Charts Rendering */}
              <div className="w-full h-80 relative">
                {!isMounted ? (
                  <div className="w-full h-full flex items-center justify-center text-zinc-500 text-sm">
                    Rendering statement graphs...
                  </div>
                ) : financialSubTab === 'income' ? (
                  incomeChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={incomeChartData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                        <defs>
                          <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                            <stop offset="95%" stopColor="#2563eb" stopOpacity={0.1}/>
                          </linearGradient>
                          <linearGradient id="colorProf" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                            <stop offset="95%" stopColor="#059669" stopOpacity={0.1}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                        <XAxis dataKey="period" stroke="#71717a" fontSize={11} tickLine={false} />
                        <YAxis stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => v.toLocaleString('en-IN')} />
                        <Tooltip
                          contentStyle={{ background: '#090d16', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.75rem' }}
                          labelStyle={{ color: '#9ca3af', fontWeight: '600', fontSize: '11px', marginBottom: '4px' }}
                          itemStyle={{ fontSize: '12px' }}
                          formatter={(value: any) => [value != null ? (typeof value === 'number' ? value.toLocaleString('en-IN') : value) + ' Cr' : '', '']}
                        />
                        <Legend wrapperStyle={{ fontSize: '11px', marginTop: '10px' }} />
                        <Bar dataKey="Revenue" fill="url(#colorRev)" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Net Profit" fill="url(#colorProf)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-500 text-sm">
                      No historical revenue information available for chart rendering.
                    </div>
                  )
                ) : financialSubTab === 'balance' ? (
                  balanceChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={balanceChartData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                        <defs>
                          <linearGradient id="colorAssets" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.8}/>
                            <stop offset="95%" stopColor="#0891b2" stopOpacity={0.1}/>
                          </linearGradient>
                          <linearGradient id="colorLiabs" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.7}/>
                            <stop offset="95%" stopColor="#dc2626" stopOpacity={0.1}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                        <XAxis dataKey="period" stroke="#71717a" fontSize={11} tickLine={false} />
                        <YAxis stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => v.toLocaleString('en-IN')} />
                        <Tooltip
                          contentStyle={{ background: '#090d16', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.75rem' }}
                          labelStyle={{ color: '#9ca3af', fontWeight: '600', fontSize: '11px', marginBottom: '4px' }}
                          itemStyle={{ fontSize: '12px' }}
                          formatter={(value: any) => [value != null ? (typeof value === 'number' ? value.toLocaleString('en-IN') : value) + ' Cr' : '', '']}
                        />
                        <Legend wrapperStyle={{ fontSize: '11px', marginTop: '10px' }} />
                        <Bar name="Total Assets" dataKey="total_asset" fill="url(#colorAssets)" radius={[4, 4, 0, 0]} />
                        <Bar name="Total Liabilities" dataKey="total_liability" fill="url(#colorLiabs)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-500 text-sm">
                      No asset summaries available for chart rendering.
                    </div>
                  )
                ) : (
                  cashFlowChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={cashFlowChartData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                        <defs>
                          <linearGradient id="colorOp" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorInv" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorFin" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                        <XAxis dataKey="period" stroke="#71717a" fontSize={11} tickLine={false} />
                        <YAxis stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => v.toLocaleString('en-IN')} />
                        <Tooltip
                          contentStyle={{ background: '#090d16', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.75rem' }}
                          labelStyle={{ color: '#9ca3af', fontWeight: '600', fontSize: '11px', marginBottom: '4px' }}
                          itemStyle={{ fontSize: '12px' }}
                          formatter={(value: any) => [value != null ? (typeof value === 'number' ? value.toLocaleString('en-IN') : value) + ' Cr' : '', '']}
                        />
                        <Legend wrapperStyle={{ fontSize: '11px', marginTop: '10px' }} />
                        <Area type="monotone" name="Operating Cash" dataKey="Operating" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorOp)" />
                        <Area type="monotone" name="Investing Cash" dataKey="Investing" stroke="#f59e0b" strokeWidth={2} fillOpacity={1} fill="url(#colorInv)" />
                        <Area type="monotone" name="Financing Cash" dataKey="Financing" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorFin)" />
                        <Line type="monotone" name="Net Cash Flow" dataKey="Net Flow" stroke="#e4e4e7" strokeWidth={2} dot={{ r: 3 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-500 text-sm">
                      No cash flow matrices available for chart rendering.
                    </div>
                  )
                )}
              </div>
            </div>

            {/* Detailed Statement Table - ALWAYS OPEN */}
            <div className="glass-card p-6 flex flex-col gap-4">
              <div>
                <h4 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                  </svg>
                  Detailed Financial Statement Table
                </h4>
                <div className="h-px w-8 bg-blue-500 mt-1" />
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[600px] text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-zinc-400 font-semibold uppercase">
                      <th className="py-2.5 px-3">Particular Line Item</th>
                      {/* Grab periods from statement rows */}
                      {(() => {
                        const statement = financialSubTab === 'income' 
                          ? initialData.incomeStatement 
                          : financialSubTab === 'balance' 
                            ? initialData.balanceSheet 
                            : initialData.cashFlow;
                        
                        const firstRow = statement?.full_statement?.[0];
                        return firstRow?.history.map((h, i) => (
                          <th key={i} className="py-2.5 px-3 text-right font-mono">{h.period}</th>
                        )) || null;
                      })()}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-medium">
                    {(() => {
                      const statement = financialSubTab === 'income' 
                        ? initialData.incomeStatement 
                        : financialSubTab === 'balance' 
                          ? initialData.balanceSheet 
                          : initialData.cashFlow;
                      
                      if (!statement?.full_statement || statement.full_statement.length === 0) {
                        return (
                          <tr>
                            <td className="py-4 text-center text-zinc-500" colSpan={4}>No details available.</td>
                          </tr>
                        );
                      }

                      return statement.full_statement.map((row, index) => (
                        <tr key={index} className="hover:bg-white/2 transition-colors">
                          <td className="py-2.5 px-3 text-zinc-300 font-semibold">{row.particular}</td>
                          {row.history.map((h, i) => (
                            <td key={i} className="py-2.5 px-3 text-right font-mono text-zinc-400">
                              {h.value.toLocaleString('en-IN')}
                            </td>
                          ))}
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        {/* ====================================================================
            3. SHAREHOLDING PATTERN SECTION
            ==================================================================== */}
        <section id="shareholding" className="scroll-mt-24 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white tracking-tight">Shareholding Pattern</h2>
            <div className="h-px flex-grow bg-white/5" />
          </div>
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Latest Donut Chart */}
            <div className="lg:w-1/2 glass-card p-6 flex flex-col gap-4">
              <div>
                <h3 className="text-base font-bold text-white uppercase tracking-wider">
                  Ownership Structure ({latestShareholdingPeriod || 'Latest Quarter'})
                </h3>
                <div className="h-px w-10 bg-violet-500 mt-1" />
              </div>

              <div className="w-full h-64 relative flex items-center justify-center">
                {!isMounted ? (
                  <span className="text-zinc-500 text-xs">Loading donut chart...</span>
                ) : latestShareholdingPieData.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={latestShareholdingPieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={4}
                          dataKey="value"
                        >
                          {latestShareholdingPieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ background: '#090d16', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.5rem' }}
                          itemStyle={{ fontSize: '11px' }}
                          formatter={(value: any) => [value != null ? (typeof value === 'number' ? `${value.toFixed(2)}%` : value) : '', '']}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    {/* Center Content */}
                    <div className="absolute text-center flex flex-col items-center">
                      <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Institutions</span>
                      <span className="text-lg font-black text-white font-mono">
                        {(() => {
                          const fii = latestShareholdingPieData.find(d => d.name === 'FII')?.value || 0;
                          const dii = latestShareholdingPieData.find(d => d.name === 'DII')?.value || 0;
                          return (fii + dii).toFixed(1);
                        })()}%
                      </span>
                    </div>
                  </>
                ) : (
                  <span className="text-zinc-500 text-sm">No ownership structure points.</span>
                )}
              </div>

              {/* Donut Legend Table */}
              <div className="flex flex-col gap-2 mt-2">
                {latestShareholdingPieData.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-zinc-900/30 border border-white/2">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }} />
                      <span className="text-xs font-semibold text-zinc-300">{item.name}</span>
                    </div>
                    <span className="font-mono text-xs font-bold text-white">{item.value.toFixed(2)}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Historical Trend Stacked Bar */}
            <div className="lg:w-1/2 glass-card p-6 flex flex-col gap-4">
              <div>
                <h3 className="text-base font-bold text-white uppercase tracking-wider">
                  Quarterly Ownership Trends
                </h3>
                <div className="h-px w-10 bg-indigo-500 mt-1" />
              </div>

              <div className="w-full h-80">
                {!isMounted ? (
                  <div className="w-full h-full flex items-center justify-center text-zinc-500 text-xs">
                    Loading trends...
                  </div>
                ) : shareholdingHistoricalData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={shareholdingHistoricalData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                      <XAxis dataKey="period" stroke="#71717a" fontSize={11} tickLine={false} />
                      <YAxis stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} unit="%" />
                      <Tooltip
                        contentStyle={{ background: '#090d16', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.75rem' }}
                        labelStyle={{ color: '#9ca3af', fontWeight: '600', fontSize: '11px', marginBottom: '4px' }}
                        itemStyle={{ fontSize: '12px' }}
                        formatter={(value: any) => [value != null ? (typeof value === 'number' ? `${value.toFixed(2)}%` : value) : '', '']}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px', marginTop: '10px' }} />
                      {initialData.shareHoldings.map((cat, idx) => (
                        <Bar 
                          key={idx}
                          dataKey={cat.category} 
                          stackId="a" 
                          fill={PIE_COLORS[idx % PIE_COLORS.length]} 
                          radius={idx === initialData.shareHoldings.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-500 text-sm">
                    No quarterly history trend points.
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ====================================================================
            4. CORPORATE ACTIONS SECTION
            ==================================================================== */}
        <section id="actions" className="scroll-mt-24 flex flex-col gap-4 pb-12">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white tracking-tight">Corporate Actions Timeline</h2>
            <div className="h-px flex-grow bg-white/5" />
          </div>
          <div className="glass-card p-6 flex flex-col gap-6">
            <div>
              <h3 className="text-base font-bold text-white uppercase tracking-wider">Corporate Actions Timeline</h3>
              <div className="h-px w-10 bg-amber-500 mt-1" />
            </div>

            {initialData.corporateActions?.length > 0 ? (
              <div className="relative pl-6 border-l border-zinc-800 flex flex-col gap-8 ml-3 py-2">
                {initialData.corporateActions.map((action, idx) => {
                  const isDiv = action.name.toLowerCase().includes('dividend');
                  const isSplit = action.name.toLowerCase().includes('split');
                  const isBonus = action.name.toLowerCase().includes('bonus');
                  
                  const markerColor = isDiv 
                    ? 'bg-emerald-500 ring-emerald-500/20' 
                    : isSplit 
                      ? 'bg-blue-500 ring-blue-500/20' 
                      : isBonus 
                        ? 'bg-violet-500 ring-violet-500/20' 
                        : 'bg-zinc-500 ring-zinc-500/20';

                  const borderHoverColor = isDiv 
                    ? 'hover:border-emerald-500/30' 
                    : isSplit 
                      ? 'hover:border-blue-500/30' 
                      : isBonus 
                        ? 'hover:border-violet-500/30' 
                        : 'hover:border-zinc-500/30';

                  return (
                    <motion.div
                      key={idx}
                      className={`relative p-5 rounded-2xl bg-zinc-900/30 border border-white/5 ${borderHoverColor} hover:bg-zinc-900/50 transition-all flex flex-col md:flex-row md:items-start justify-between gap-4 group`}
                      initial={{ opacity: 0, x: -10 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: idx * 0.05 }}
                    >
                      {/* Dot marker */}
                      <div className={`absolute -left-[31px] top-7 w-3.5 h-3.5 rounded-full ${markerColor} ring-4 transition-transform group-hover:scale-110`} />

                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-base font-extrabold text-white">{action.name}</span>
                          <span className="font-mono text-[10px] text-zinc-500 font-semibold px-2 py-0.5 rounded bg-white/5 border border-white/5">
                            Ex-Date: {action.expiry_date}
                          </span>
                        </div>
                        
                        {/* Event Details Grid */}
                        <div className="flex flex-wrap gap-x-6 gap-y-1.5 mt-2">
                          {action.event_details?.map((detail, dIdx) => (
                            <div key={dIdx} className="text-xs">
                              <span className="text-zinc-500 font-semibold">{detail.key}:</span>{' '}
                              <span className="text-zinc-300 font-bold">{detail.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Visual details summary badge */}
                      {(action.amount != null || action.ratio != null) && (
                        <div className="flex items-center self-start md:self-center">
                          <span className={`text-sm font-extrabold font-mono px-4 py-2 rounded-xl bg-white/5 border border-white/5 ${
                            isDiv ? 'text-emerald-400' : isSplit ? 'text-blue-400' : 'text-violet-400'
                          }`}>
                            {action.amount != null ? `₹${action.amount.toFixed(2)}` : action.ratio}
                          </span>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="py-12 text-center text-zinc-500 text-sm">
                No corporate actions listed in the database.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
