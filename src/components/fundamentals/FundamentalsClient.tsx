'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import StockSearch from '@/components/fundamentals/StockSearch';

import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from 'recharts';
import { CompanyFundamentals, FinancialStatement } from '@/lib/upstox/fundamentals';

// Heavy chart types — lazy loaded to avoid blocking initial page render
const BarChart = dynamic(() => import('recharts').then(m => m.BarChart), { ssr: false });
const Bar = dynamic(() => import('recharts').then(m => m.Bar), { ssr: false });
const AreaChart = dynamic(() => import('recharts').then(m => m.AreaChart), { ssr: false });
const Area = dynamic(() => import('recharts').then(m => m.Area), { ssr: false });
const Line = dynamic(() => import('recharts').then(m => m.Line), { ssr: false });

interface FundamentalsClientProps {
  symbol: string;
  resolvedName: string;
  resolvedIsin: string;
  initialData: CompanyFundamentals;
}

// Color constants
const PIE_COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#f59e0b', '#ec4899'];
const CHART_TOOLTIP_STYLE = {
  background: 'rgba(9, 13, 22, 0.95)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '0.75rem',
  backdropFilter: 'blur(12px)',
};
const CHART_LABEL_STYLE = { color: '#9ca3af', fontWeight: '600', fontSize: '11px', marginBottom: '4px' };
const CHART_ITEM_STYLE = { fontSize: '12px' };

// Section header component matching dashboard pattern
function SectionHeader({ icon, label, color = 'violet' }: { icon: React.ReactNode; label: string; color?: string }) {
  const colorMap: Record<string, string> = {
    violet: 'from-violet-500/20 to-violet-500/5 text-violet-400',
    blue: 'from-blue-500/20 to-blue-500/5 text-blue-400',
    emerald: 'from-emerald-500/20 to-emerald-500/5 text-emerald-400',
    amber: 'from-amber-500/20 to-amber-500/5 text-amber-400',
    indigo: 'from-indigo-500/20 to-indigo-500/5 text-indigo-400',
    cyan: 'from-cyan-500/20 to-cyan-500/5 text-cyan-400',
  };
  const classes = colorMap[color] || colorMap.violet;
  const [gradientClasses, textClass] = classes.split(' text-');

  return (
    <div className="flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradientClasses} flex items-center justify-center text-${textClass}`}>
        {icon}
      </div>
      <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{label}</span>
    </div>
  );
}

// Skeleton placeholder for charts
function ChartSkeleton({ height = 'h-80' }: { height?: string }) {
  return <div className={`w-full ${height} bg-slate-800/30 rounded-xl animate-pulse`} />;
}

// Format currency value
function formatCrValue(value: any): string {
  if (value == null) return '';
  const num = typeof value === 'number' ? value : parseFloat(value);
  if (isNaN(num)) return String(value);
  return num.toLocaleString('en-IN') + ' Cr';
}

export default function FundamentalsClient({
  symbol,
  resolvedName,
  resolvedIsin,
  initialData,
}: FundamentalsClientProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'financials' | 'shareholding' | 'actions'>('overview');
  const [financialSubTab, setFinancialSubTab] = useState<'income' | 'balance' | 'cash'>('income');
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Scroll spy for sticky nav
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
        { rootMargin: '-10% 0px -50% 0px' }
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

  // ── Data Parsing ──────────────────────────────────────────────────────────

  const getStatementRow = (statement: FinancialStatement, keywords: string[]) => {
    return statement?.full_statement?.find(row =>
      keywords.some(kw => row.particular.toLowerCase().includes(kw.toLowerCase()))
    );
  };

  // Income Statement Chart Data
  const incomeChartData = useMemo(() => {
    if (!initialData.incomeStatement?.full_statement) return [];
    const revRow = getStatementRow(initialData.incomeStatement, ['sales', 'revenue', 'earned', 'turnover']);
    const profRow = getStatementRow(initialData.incomeStatement, ['net profit', 'profit after tax', 'pat', 'income']);
    if (!revRow && !profRow) return [];
    const periods = new Set<string>();
    revRow?.history.forEach(h => periods.add(h.period));
    profRow?.history.forEach(h => periods.add(h.period));
    return Array.from(periods)
      .sort((a, b) => (parseInt(a.replace(/\D/g, '')) || 0) - (parseInt(b.replace(/\D/g, '')) || 0))
      .map(period => ({
        period,
        Revenue: revRow?.history.find(h => h.period === period)?.value || 0,
        'Net Profit': profRow?.history.find(h => h.period === period)?.value || 0,
      }));
  }, [initialData.incomeStatement]);

  // Balance Sheet Chart Data
  const balanceChartData = useMemo(() => {
    if (initialData.balanceSheet?.history && initialData.balanceSheet.history.length > 0) {
      return [...initialData.balanceSheet.history].sort((a, b) =>
        (parseInt(a.period.replace(/\D/g, '')) || 0) - (parseInt(b.period.replace(/\D/g, '')) || 0)
      );
    }
    if (!initialData.balanceSheet?.full_statement) return [];
    const assetRow = getStatementRow(initialData.balanceSheet, ['total asset', 'assets', 'net block', 'capital']);
    const liabRow = getStatementRow(initialData.balanceSheet, ['total liability', 'liabilities', 'borrowings', 'reserves']);
    const periods = new Set<string>();
    assetRow?.history.forEach(h => periods.add(h.period));
    liabRow?.history.forEach(h => periods.add(h.period));
    return Array.from(periods)
      .sort((a, b) => (parseInt(a.replace(/\D/g, '')) || 0) - (parseInt(b.replace(/\D/g, '')) || 0))
      .map(period => ({
        period,
        total_asset: assetRow?.history.find(h => h.period === period)?.value || 0,
        total_liability: liabRow?.history.find(h => h.period === period)?.value || 0,
      }));
  }, [initialData.balanceSheet]);

  // Cash Flow Chart Data
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
      .sort((a, b) => (parseInt(a.replace(/\D/g, '')) || 0) - (parseInt(b.replace(/\D/g, '')) || 0))
      .map(period => ({
        period,
        Operating: opRow?.history.find(h => h.period === period)?.value || 0,
        Investing: invRow?.history.find(h => h.period === period)?.value || 0,
        Financing: finRow?.history.find(h => h.period === period)?.value || 0,
        'Net Flow': netRow?.history.find(h => h.period === period)?.value || 0,
      }));
  }, [initialData.cashFlow]);

  // Shareholding Data
  const shareholdingPeriods = useMemo(() => {
    if (!initialData.shareHoldings || initialData.shareHoldings.length === 0) return [];
    const periods = new Set<string>();
    initialData.shareHoldings.forEach(sh => sh.history.forEach(h => periods.add(h.period)));
    return Array.from(periods).sort((a, b) => {
      const parsePeriod = (p: string) => {
        const parts = p.split(' ');
        const year = parseInt(parts[1]) || 0;
        const months: Record<string, number> = { Jan:1, Feb:2, Mar:3, Apr:4, May:5, Jun:6, Jul:7, Aug:8, Sep:9, Oct:10, Nov:11, Dec:12 };
        return year * 100 + (months[parts[0]] || 0);
      };
      return parsePeriod(a) - parsePeriod(b);
    });
  }, [initialData.shareHoldings]);

  const latestShareholdingPeriod = shareholdingPeriods[shareholdingPeriods.length - 1];

  const latestShareholdingPieData = useMemo(() => {
    if (!initialData.shareHoldings || !latestShareholdingPeriod) return [];
    return initialData.shareHoldings
      .map(cat => ({
        name: cat.category,
        value: cat.history.find(h => h.period === latestShareholdingPeriod)?.percentage || 0,
      }))
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

  // Key Ratios extraction
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

  const getRatioSectorValue = (name: string) => {
    return initialData.keyRatios?.find(r => {
      const lowerName = r.name.toLowerCase().trim();
      const lowerQuery = name.toLowerCase().trim();
      if (lowerQuery === 'p/e' || lowerQuery === 'p/e ratio') return lowerName === 'p/e' || lowerName === 'p/e ratio' || lowerName.includes('p/e');
      if (lowerQuery === 'p/b' || lowerQuery === 'p/b ratio') return lowerName === 'p/b' || lowerName === 'p/b ratio' || lowerName.includes('p/b');
      return lowerName.includes(lowerQuery);
    })?.sector_value || '—';
  };

  const headPE = getRatioValue('p/e ratio');
  const headROE = getRatioValue('roe');
  const headPB = getRatioValue('p/b ratio');
  const headDivYield = getRatioValue('dividend yield');

  const parsePercent = (valStr: string) => parseFloat(valStr.replace('%', '')) || 0;

  // Radar chart data for key ratios
  const radarData = useMemo(() => {
    if (!initialData.keyRatios) return [];
    return initialData.keyRatios.map(r => ({
      ratio: r.name,
      Company: parsePercent(r.company_value),
      Sector: parsePercent(r.sector_value),
    }));
  }, [initialData.keyRatios]);

  // ── Quick Stats Cards Configuration ─────────────────────────────────────

  const quickStats = [
    {
      title: 'Market Cap',
      value: initialData.profile?.sector_market_cap_inr?.formatted || '—',
      subtitle: initialData.profile?.sector_market_cap_usd?.formatted || '',
      iconColor: 'text-blue-400',
      gradientFrom: 'from-blue-500/20',
      gradientTo: 'to-blue-500/5',
      glowBg: 'rgba(59, 130, 246, 0.06)',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
    },
    {
      title: 'P/E Ratio',
      value: headPE,
      subtitle: `Sector: ${getRatioSectorValue('p/e')}`,
      iconColor: 'text-violet-400',
      gradientFrom: 'from-violet-500/20',
      gradientTo: 'to-violet-500/5',
      glowBg: 'rgba(139, 92, 246, 0.06)',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
    {
      title: 'ROE',
      value: headROE,
      subtitle: `P/B: ${headPB}`,
      iconColor: 'text-emerald-400',
      gradientFrom: 'from-emerald-500/20',
      gradientTo: 'to-emerald-500/5',
      glowBg: 'rgba(16, 185, 129, 0.06)',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      ),
    },
    {
      title: 'Dividend Yield',
      value: headDivYield,
      subtitle: `Sector: ${getRatioSectorValue('dividend yield')}`,
      iconColor: 'text-amber-400',
      gradientFrom: 'from-amber-500/20',
      gradientTo: 'to-amber-500/5',
      glowBg: 'rgba(245, 158, 11, 0.06)',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M12 16v0" />
        </svg>
      ),
    },
  ];

  // ── Scroll Helper ─────────────────────────────────────────────────────────

  const scrollToSection = (id: string) => {
    setActiveTab(id as any);
    const element = document.getElementById(id);
    if (element) {
      const offset = 80;
      const bodyRect = document.body.getBoundingClientRect().top;
      const elementRect = element.getBoundingClientRect().top;
      const offsetPosition = elementRect - bodyRect - offset;
      window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* ═══════════════════════════════════════════════════════════════════════
          HEADER
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-white/5 pb-5 animate-fade-in-up">
        <div className="flex items-center gap-3">
          <Link
            href="/fundamentals"
            title="Back to Fundamentals Search"
            className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-white/5 to-white/0 border border-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all shadow-md group"
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
              <span className="font-mono text-sm px-2.5 py-0.5 rounded-lg bg-white/5 text-zinc-400 border border-white/5">
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
          <div className="w-full sm:w-60">
            <StockSearch size="sm" placeholder="Search other stock..." />
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          QUICK STAT CARDS — Dashboard-style with gradient icon containers
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {quickStats.map((card, i) => (
          <div
            key={i}
            className={`bg-slate-900/50 rounded-2xl border border-white/5 overflow-hidden glass-card p-5 flex flex-col justify-between group hover:border-white/10 transition-all duration-300 animate-fade-in-up stagger-${i + 1}`}
            style={{ backgroundImage: `radial-gradient(circle at 10% 10%, ${card.glowBg}, transparent)` }}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{card.title}</p>
                <h3 className="text-xl md:text-2xl font-bold text-white mt-2 tracking-tight font-mono truncate">{card.value}</h3>
                <p className="text-xs text-zinc-500 mt-1 font-medium">{card.subtitle}</p>
              </div>
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${card.gradientFrom} ${card.gradientTo} flex items-center justify-center flex-shrink-0 ${card.iconColor}`}>
                {card.icon}
              </div>
            </div>
            <div className="h-0.5 mt-4 bg-gradient-to-r from-transparent via-white/5 to-transparent scale-x-0 group-hover:scale-x-100 transition-transform duration-500" />
          </div>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          STICKY ANCHOR NAVIGATION
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="sticky top-0 z-40 bg-[#090d16]/90 backdrop-blur-xl py-3.5 border-b border-white/5 -mx-4 px-4 md:-mx-6 md:px-6 flex items-center justify-between gap-4 animate-fade-in-up stagger-5">
        <span className="hidden md:inline font-bold text-sm text-zinc-300">
          {resolvedName} <span className="font-mono text-zinc-500">({symbol})</span>
        </span>
        <div className="flex p-1 rounded-xl bg-slate-900/60 border border-white/5 backdrop-blur-md relative overflow-hidden justify-between sm:justify-start w-full md:w-auto">
          {([
            { id: 'overview', label: 'Overview & Peers' },
            { id: 'financials', label: 'Financials' },
            { id: 'shareholding', label: 'Shareholding' },
            { id: 'actions', label: 'Corp. Actions' },
          ] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => scrollToSection(tab.id)}
              className={`relative px-4 py-1.5 text-xs font-semibold rounded-lg transition-all duration-300 select-none ${
                activeTab === tab.id ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'
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

      {/* ═══════════════════════════════════════════════════════════════════════
          STACKED SECTIONS
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col gap-8 md:gap-12 w-full mt-2">

        {/* ╔══════════════════════════════════════════════════════════════════╗
            ║  1. OVERVIEW & PEERS                                           ║
            ╚══════════════════════════════════════════════════════════════════╝ */}
        <section id="overview" className="scroll-mt-24 flex flex-col gap-6">
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Left Column: Profile + Ratios */}
            <div className="flex-grow lg:w-2/3 flex flex-col gap-6">
              {/* Company Description */}
              <div className="bg-slate-900/50 rounded-2xl border border-white/5 overflow-hidden glass-card p-6 animate-fade-in-up stagger-1">
                <SectionHeader
                  icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>}
                  label="Company Profile"
                  color="blue"
                />
                <p className="text-sm leading-relaxed text-zinc-300 font-medium mt-4">
                  {initialData.profile?.company_profile}
                </p>
              </div>

              {/* Key Ratios with Radar Chart */}
              <div className="bg-slate-900/50 rounded-2xl border border-white/5 overflow-hidden glass-card p-6 animate-fade-in-up stagger-2">
                <SectionHeader
                  icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
                  label="Key Valuation Ratios"
                  color="indigo"
                />

                {/* Radar Chart - Company vs Sector */}
                {isMounted && radarData.length > 0 && (
                  <div className="w-full h-72 mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                        <PolarGrid stroke="rgba(255,255,255,0.06)" />
                        <PolarAngleAxis dataKey="ratio" tick={{ fill: '#9ca3af', fontSize: 11, fontWeight: 600 }} />
                        <PolarRadiusAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} />
                        <Radar name="Company" dataKey="Company" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} strokeWidth={2} />
                        <Radar name="Sector" dataKey="Sector" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} strokeWidth={2} strokeDasharray="4 4" />
                        <Legend wrapperStyle={{ fontSize: '11px', marginTop: '8px' }} />
                        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelStyle={CHART_LABEL_STYLE} itemStyle={CHART_ITEM_STYLE} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Ratio Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                  {initialData.keyRatios?.map((ratio, index) => {
                    const compNum = parsePercent(ratio.company_value);
                    const secNum = parsePercent(ratio.sector_value);
                    // For ROA/ROE/ROCE, higher is better. For P/E, P/B, EV/EBITDA, lower is better
                    const higherIsBetter = ['roa', 'roe', 'roce', 'dividend yield'].some(k => ratio.name.toLowerCase().includes(k));
                    const isFavorable = higherIsBetter ? compNum >= secNum : compNum <= secNum;
                    const barWidth = Math.min(100, Math.max(10, secNum ? (compNum / secNum) * 50 : 50));

                    return (
                      <div key={index} className="flex flex-col p-4 rounded-xl bg-gradient-to-br from-white/[0.03] to-white/0 border border-white/5 hover:border-white/10 transition-all group">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-zinc-400">{ratio.name}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${isFavorable ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                            {isFavorable ? '✓ Favorable' : '△ Watch'}
                          </span>
                        </div>
                        <div className="flex items-baseline justify-between mt-2">
                          <span className="text-lg font-extrabold text-white font-mono">{ratio.company_value}</span>
                          <span className="text-[11px] text-zinc-500">Sector: <span className="font-mono text-zinc-400 font-semibold">{ratio.sector_value}</span></span>
                        </div>
                        {/* Animated comparison bar */}
                        <div className="w-full h-1.5 bg-slate-800/80 rounded-full overflow-hidden mt-3 relative">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ease-out ${isFavorable ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' : 'bg-gradient-to-r from-amber-500 to-amber-400'}`}
                            style={{ width: `${barWidth}%` }}
                          />
                          {secNum > 0 && (
                            <div className="absolute top-0 bottom-0 w-0.5 bg-indigo-500/60" style={{ left: '50%' }} title="Sector Average" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right Column: Competitors */}
            <div className="lg:w-1/3 flex flex-col gap-6">
              <div className="bg-slate-900/50 rounded-2xl border border-white/5 overflow-hidden glass-card p-6 animate-fade-in-up stagger-3">
                <SectionHeader
                  icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
                  label="Peer Competitors"
                  color="cyan"
                />

                <div className="flex flex-col gap-3 mt-4">
                  {initialData.competitors?.map((competitor, idx) => {
                    const hasSymbol = !!competitor.symbol;
                    return (
                      <div
                        key={idx}
                        className="p-4 rounded-xl bg-gradient-to-br from-white/[0.03] to-white/0 border border-white/5 hover:border-white/10 hover:bg-white/[0.03] transition-all flex flex-col gap-2 relative group"
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
                            className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-blue-400 hover:text-blue-300 transition-colors self-end group/link"
                          >
                            Explore Fundamentals
                            <svg className="w-3.5 h-3.5 transition-transform group-hover/link:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                          </Link>
                        )}
                      </div>
                    );
                  })}

                  {(!initialData.competitors || initialData.competitors.length === 0) && (
                    <div className="py-8 text-center text-zinc-500 text-sm">No peer data available.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ╔══════════════════════════════════════════════════════════════════╗
            ║  2. FINANCIAL STATEMENTS                                        ║
            ╚══════════════════════════════════════════════════════════════════╝ */}
        <section id="financials" className="scroll-mt-24 flex flex-col gap-6">
          {/* Chart Card */}
          <div className="bg-slate-900/50 rounded-2xl border border-white/5 overflow-hidden glass-card p-6">
            <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
              <SectionHeader
                icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
                label="Financial Statements"
                color="blue"
              />
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">
                Figures in <span className="text-zinc-300 font-bold">{initialData.incomeStatement?.units_in || 'Crore'} INR</span>
              </span>
            </div>

            {/* Sub Tabs */}
            <div className="flex gap-2 mb-6">
              {([
                { id: 'income', label: 'Income Statement', color: 'blue' },
                { id: 'balance', label: 'Balance Sheet', color: 'cyan' },
                { id: 'cash', label: 'Cash Flow', color: 'emerald' }
              ] as const).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setFinancialSubTab(tab.id)}
                  className={`px-4 py-2 text-xs font-semibold rounded-xl border transition-all duration-200 ${
                    financialSubTab === tab.id
                      ? 'bg-blue-600/10 text-blue-400 border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.08)]'
                      : 'bg-white/[0.02] text-zinc-400 border-white/5 hover:text-zinc-200 hover:bg-white/[0.04]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Chart Area */}
            <div className="w-full h-80 relative">
              {!isMounted ? (
                <ChartSkeleton />
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
                      <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelStyle={CHART_LABEL_STYLE} itemStyle={CHART_ITEM_STYLE} formatter={(value: any) => [formatCrValue(value), '']} />
                      <Legend wrapperStyle={{ fontSize: '11px', marginTop: '10px' }} />
                      <Bar dataKey="Revenue" fill="url(#colorRev)" radius={[4, 4, 0, 0]} animationDuration={800} />
                      <Bar dataKey="Net Profit" fill="url(#colorProf)" radius={[4, 4, 0, 0]} animationDuration={800} animationBegin={200} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <EmptyState message="No revenue data available" />
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
                      <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelStyle={CHART_LABEL_STYLE} itemStyle={CHART_ITEM_STYLE} formatter={(value: any) => [formatCrValue(value), '']} />
                      <Legend wrapperStyle={{ fontSize: '11px', marginTop: '10px' }} />
                      <Bar name="Total Assets" dataKey="total_asset" fill="url(#colorAssets)" radius={[4, 4, 0, 0]} animationDuration={800} />
                      <Bar name="Total Liabilities" dataKey="total_liability" fill="url(#colorLiabs)" radius={[4, 4, 0, 0]} animationDuration={800} animationBegin={200} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <EmptyState message="No balance sheet data available" />
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
                      <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelStyle={CHART_LABEL_STYLE} itemStyle={CHART_ITEM_STYLE} formatter={(value: any) => [formatCrValue(value), '']} />
                      <Legend wrapperStyle={{ fontSize: '11px', marginTop: '10px' }} />
                      <Area type="monotone" name="Operating" dataKey="Operating" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorOp)" animationDuration={800} />
                      <Area type="monotone" name="Investing" dataKey="Investing" stroke="#f59e0b" strokeWidth={2} fillOpacity={1} fill="url(#colorInv)" animationDuration={800} animationBegin={200} />
                      <Area type="monotone" name="Financing" dataKey="Financing" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorFin)" animationDuration={800} animationBegin={400} />
                      <Line type="monotone" name="Net Cash" dataKey="Net Flow" stroke="#e4e4e7" strokeWidth={2} dot={{ r: 3, fill: '#e4e4e7' }} animationDuration={1000} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : <EmptyState message="No cash flow data available" />
              )}
            </div>
          </div>

          {/* Statement Table */}
          <div className="bg-slate-900/50 rounded-2xl border border-white/5 overflow-hidden glass-card p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-500/5 flex items-center justify-center">
                <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              </div>
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Detailed Statement</span>
            </div>

            <div className="overflow-x-auto rounded-xl">
              <table className="w-full text-left border-collapse min-w-[600px] text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-zinc-400 font-semibold uppercase bg-slate-900/30">
                    <th className="py-3 px-4 sticky left-0 bg-slate-900/80 backdrop-blur-md z-10">Line Item</th>
                    {(() => {
                      const statement = financialSubTab === 'income'
                        ? initialData.incomeStatement
                        : financialSubTab === 'balance'
                          ? initialData.balanceSheet
                          : initialData.cashFlow;
                      return statement?.full_statement?.[0]?.history.map((h, i) => (
                        <th key={i} className="py-3 px-4 text-right font-mono">{h.period}</th>
                      )) || null;
                    })()}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {(() => {
                    const statement = financialSubTab === 'income'
                      ? initialData.incomeStatement
                      : financialSubTab === 'balance'
                        ? initialData.balanceSheet
                        : initialData.cashFlow;

                    if (!statement?.full_statement || statement.full_statement.length === 0) {
                      return (
                        <tr>
                          <td className="py-8 text-center text-zinc-500" colSpan={10}>No statement details available.</td>
                        </tr>
                      );
                    }

                    return statement.full_statement.map((row, index) => (
                      <tr key={index} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-2.5 px-4 text-zinc-300 font-semibold sticky left-0 bg-[#0d1117]/80 backdrop-blur-sm">{row.particular}</td>
                        {row.history.map((h, i) => (
                          <td key={i} className={`py-2.5 px-4 text-right font-mono ${h.value < 0 ? 'text-red-400' : 'text-zinc-400'}`}>
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
        </section>

        {/* ╔══════════════════════════════════════════════════════════════════╗
            ║  3. SHAREHOLDING PATTERN                                        ║
            ╚══════════════════════════════════════════════════════════════════╝ */}
        <section id="shareholding" className="scroll-mt-24 flex flex-col gap-6">
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Donut Chart */}
            <div className="lg:w-1/2 bg-slate-900/50 rounded-2xl border border-white/5 overflow-hidden glass-card p-6">
              <SectionHeader
                icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" /><path strokeLinecap="round" strokeLinejoin="round" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" /></svg>}
                label={`Ownership (${latestShareholdingPeriod || 'Latest'})`}
                color="violet"
              />

              <div className="w-full h-64 relative flex items-center justify-center mt-4">
                {!isMounted ? (
                  <ChartSkeleton height="h-64" />
                ) : latestShareholdingPieData.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={latestShareholdingPieData}
                          cx="50%" cy="50%"
                          innerRadius={65} outerRadius={90}
                          paddingAngle={3}
                          dataKey="value"
                          animationDuration={800}
                          animationBegin={100}
                        >
                          {latestShareholdingPieData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} className="hover:opacity-80 transition-opacity" />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={CHART_TOOLTIP_STYLE}
                          itemStyle={{ fontSize: '12px' }}
                          formatter={(value: any) => [typeof value === 'number' ? `${value.toFixed(2)}%` : value, '']}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    {/* Center Content */}
                    <div className="absolute text-center flex flex-col items-center">
                      <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Institutions</span>
                      <span className="text-2xl font-black text-white font-mono">
                        {(() => {
                          const fii = latestShareholdingPieData.find(d => d.name.toLowerCase().includes('fii'))?.value || 0;
                          const dii = latestShareholdingPieData.find(d => d.name.toLowerCase().includes('dii') || d.name.toLowerCase().includes('mutual'))?.value || 0;
                          return (fii + dii).toFixed(1);
                        })()}%
                      </span>
                    </div>
                  </>
                ) : <EmptyState message="No ownership data" />}
              </div>

              {/* Legend */}
              <div className="flex flex-col gap-2 mt-4">
                {latestShareholdingPieData.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-colors">
                    <div className="flex items-center gap-2.5">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }} />
                      <span className="text-xs font-semibold text-zinc-300">{item.name}</span>
                    </div>
                    <span className="font-mono text-xs font-bold text-white">{item.value.toFixed(2)}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Historical Stacked Bars */}
            <div className="lg:w-1/2 bg-slate-900/50 rounded-2xl border border-white/5 overflow-hidden glass-card p-6">
              <SectionHeader
                icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" /></svg>}
                label="Quarterly Ownership Trends"
                color="indigo"
              />

              <div className="w-full h-80 mt-4">
                {!isMounted ? (
                  <ChartSkeleton />
                ) : shareholdingHistoricalData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={shareholdingHistoricalData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                      <XAxis dataKey="period" stroke="#71717a" fontSize={11} tickLine={false} />
                      <YAxis stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} unit="%" />
                      <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelStyle={CHART_LABEL_STYLE} itemStyle={CHART_ITEM_STYLE} formatter={(value: any) => [typeof value === 'number' ? `${value.toFixed(2)}%` : value, '']} />
                      <Legend wrapperStyle={{ fontSize: '11px', marginTop: '10px' }} />
                      {initialData.shareHoldings.map((cat, idx) => (
                        <Bar
                          key={idx}
                          dataKey={cat.category}
                          stackId="a"
                          fill={PIE_COLORS[idx % PIE_COLORS.length]}
                          radius={idx === initialData.shareHoldings.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                          animationDuration={800}
                          animationBegin={idx * 100}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                ) : <EmptyState message="No quarterly trends available" />}
              </div>
            </div>
          </div>
        </section>

        {/* ╔══════════════════════════════════════════════════════════════════╗
            ║  4. CORPORATE ACTIONS                                           ║
            ╚══════════════════════════════════════════════════════════════════╝ */}
        <section id="actions" className="scroll-mt-24 flex flex-col gap-6 pb-12">
          <div className="bg-slate-900/50 rounded-2xl border border-white/5 overflow-hidden glass-card p-6">
            <SectionHeader
              icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
              label="Corporate Actions Timeline"
              color="amber"
            />

            {initialData.corporateActions?.length > 0 ? (
              <div className="relative pl-6 border-l-2 border-slate-800 flex flex-col gap-6 ml-3 py-4 mt-4">
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
                      className={`relative p-5 rounded-2xl bg-gradient-to-br from-white/[0.03] to-white/0 border border-white/5 ${borderHoverColor} hover:bg-white/[0.03] transition-all flex flex-col md:flex-row md:items-start justify-between gap-4 group`}
                      initial={{ opacity: 0, x: -10 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: idx * 0.05 }}
                    >
                      {/* Timeline dot */}
                      <div className={`absolute -left-[31px] top-7 w-3.5 h-3.5 rounded-full ${markerColor} ring-4 transition-transform group-hover:scale-125`} />

                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-base font-extrabold text-white">{action.name}</span>
                          <span className="font-mono text-[10px] text-zinc-500 font-semibold px-2 py-0.5 rounded-lg bg-white/5 border border-white/5">
                            Ex: {action.expiry_date}
                          </span>
                        </div>

                        {/* Event Details */}
                        <div className="flex flex-wrap gap-x-6 gap-y-1.5 mt-1">
                          {action.event_details?.map((detail, dIdx) => (
                            <div key={dIdx} className="text-xs">
                              <span className="text-zinc-500 font-semibold">{detail.key}:</span>{' '}
                              <span className="text-zinc-300 font-bold">{detail.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Amount Badge */}
                      {(action.amount != null || action.ratio != null) && (
                        <div className="flex items-center self-start md:self-center flex-shrink-0">
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
              <div className="py-12 text-center text-zinc-500 text-sm mt-4">
                No corporate actions listed.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

// Empty state component
function EmptyState({ message }: { message: string }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center text-zinc-500 gap-2">
      <svg className="w-8 h-8 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
      </svg>
      <span className="text-sm">{message}</span>
    </div>
  );
}
