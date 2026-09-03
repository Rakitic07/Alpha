'use client';

import { useState, useCallback, useEffect, useRef, useMemo, memo } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import Link from 'next/link';
import StatsBar from './StatsBar';
import RulesInfoModal from './RulesInfoModal';
import RankHistoryModal from './RankHistoryModal';
import QueryEditorModal from './QueryEditorModal';
import { getScreenerData, syncScreener, getRankHistoriesBatch, type ScreenerRow, type ScreenerStats } from '@/app/actions/screener';
import { listScreenerQueries, type SavedQuery } from '@/app/actions/screener-queries';
import { applyScreenerFilters, countActiveFilters, type ScreenerQueryFilters } from '@/lib/screener/filter-query';

interface ScreenerClientProps {
  initialData: { rows: ScreenerRow[]; stats: ScreenerStats };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMcap(cr: number): string {
  if (!cr || cr <= 0) return '—';
  return Math.round(cr).toLocaleString('en-IN');
}

const MCAP_BADGE: Record<string, { label: string; cls: string }> = {
  'Large Cap': { label: 'Large', cls: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  'Large':     { label: 'Large', cls: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  'Mid Cap':   { label: 'Mid',   cls: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  'Mid':       { label: 'Mid',   cls: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  'Small Cap': { label: 'Small', cls: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' },
  'Small':     { label: 'Small', cls: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' },
  'Micro Cap': { label: 'Micro', cls: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  'Micro':     { label: 'Micro', cls: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
};

function getRankAccent(rank: number, inPortfolio: boolean, isPrefiltered: boolean = false): string {
  if (isPrefiltered) {
    if (rank <= 30) return 'rgb(34,197,94)';
    if (rank <= 50) return 'rgb(234,179,8)';
    return 'rgba(239,68,68,0.6)';
  }
  if (inPortfolio) return 'rgb(99,102,241)';
  if (rank <= 50) return 'rgb(34,197,94)';
  return 'rgba(239,68,68,0.6)';
}

function getRankTextColor(rank: number, isPrefiltered: boolean = false): string {
  if (isPrefiltered) {
    if (rank <= 30) return 'text-green-400';
    if (rank <= 50) return 'text-yellow-400';
    return 'text-red-400';
  }
  if (rank <= 50) return 'text-green-400';
  return 'text-red-400';
}

// ─── Badge Tooltip ───────────────────────────────────────────────────────────

interface BadgeTooltipProps {
  label: string;
  badgeCls: string;
  lines: string[];
  icon?: React.ReactNode;
}

function BadgeTooltip({ label, badgeCls, lines, icon }: BadgeTooltipProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);

  const reposition = useCallback(() => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({ top: r.top - 8, left: r.left });
  }, []);

  const handleEnter = useCallback(() => {
    reposition();
    setOpen(true);
  }, [reposition]);

  const handleLeave = useCallback(() => setOpen(false), []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const tooltip = open && pos && lines.length > 0 && typeof document !== 'undefined'
    ? createPortal(
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{ top: pos.top, left: pos.left, transform: 'translateY(-100%)' }}
        >
          <div
            className="rounded-xl border border-zinc-700/60 bg-zinc-950/95 backdrop-blur-md shadow-2xl overflow-hidden"
            style={{ minWidth: '200px', maxWidth: '300px', boxShadow: '0 8px 32px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.04)' }}
          >
            {/* Header */}
            <div className="px-3 py-2 border-b border-zinc-800/80 flex items-center gap-1.5">
              {icon && <span className="text-zinc-400 flex items-center">{icon}</span>}
              <span className="text-[10px] font-black tracking-widest uppercase" style={{ color: 'inherit' }}>
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold tracking-wider border ${badgeCls}`}>{label}</span>
              </span>
            </div>
            {/* Lines */}
            <div className="px-3 py-2.5 flex flex-col gap-2">
              {lines.map((line, i) => {
                const isAsm = line.startsWith('⚠');
                const isLock = line.startsWith('🔒');
                return (
                  <div key={i} className="flex items-start gap-2">
                    <span className={`mt-0.5 shrink-0 w-1.5 h-1.5 rounded-full ${
                      isLock ? 'bg-amber-400' : isAsm ? 'bg-orange-400' : 'bg-zinc-500'
                    }`} />
                    <span className={`text-[11px] leading-snug ${
                      isLock ? 'text-amber-300' : isAsm ? 'text-orange-300' : 'text-zinc-300'
                    }`}>{line}</span>
                  </div>
                );
              })}
            </div>
          </div>
          {/* Arrow */}
          <div className="ml-3 w-2.5 h-2.5 rotate-45 -mt-1.5 bg-zinc-950 border-b border-r border-zinc-700/60" />
        </div>,
        document.body
      )
    : null;

  return (
    <span
      ref={ref}
      className="relative inline-flex shrink-0"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onClick={e => { e.stopPropagation(); reposition(); setOpen(v => !v); }}
    >
      <span
        className={`text-[9px] px-1.5 h-4 rounded border leading-none flex items-center gap-0.5 font-extrabold tracking-wider cursor-pointer ${badgeCls}`}
      >
        {icon}
        {label}
      </span>
      {tooltip}
    </span>
  );
}

// ─── Price Sparkline ─────────────────────────────────────────────────────────

function buildSparklinePath(data: number[], w: number, h: number): string | null {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = 2;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * (w - pad * 2) + pad;
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return 'M ' + pts.join(' L ');
}

const Sparkline = memo(function Sparkline({ data }: { data: number[] }) {
  const w = 240, h = 36;
  const path = buildSparklinePath(data, w, h);
  if (!path) return <span className="text-zinc-600 text-xs">—</span>;
  const isUp = data[data.length - 1] >= data[0];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', overflow: 'visible' }}>
      <path d={path} fill="none" stroke={isUp ? '#10b981' : '#f43f5e'} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
});

// ─── DMA Swatches (5 dots: 10/20/50/100/200) ────────────────────────────────

const DMA_PERIODS = [10, 20, 50, 100, 200] as const;

const DMASwatches = memo(function DMASwatches({ swatches }: { swatches: ScreenerRow['dmaSwatches'] }) {
  const vals = [swatches.above10, swatches.above20, swatches.above50, swatches.above100, swatches.above200];
  return (
    <div className="flex gap-0.5">
      {DMA_PERIODS.map((period, i) => (
        <div
          key={period}
          title={`${vals[i] ? 'Above' : 'Below'} ${period} DMA`}
          className={`w-3.5 h-3.5 rounded-sm ${vals[i] ? 'bg-emerald-500' : 'bg-rose-500/70'}`}
        />
      ))}
    </div>
  );
});

// ─── ATH Swatches (5 dots: 10/15/20/25/30%) ────────────────────────────────

const ATH_THRESHOLDS = [10, 15, 20, 25, 30];

const ATHSwatches = memo(function ATHSwatches({ athProximity }: { athProximity: number }) {
  const awayPct = (1 - athProximity) * 100;
  return (
    <div className="flex gap-0.5">
      {ATH_THRESHOLDS.map(t => (
        <div
          key={t}
          title={`${awayPct <= t ? 'Within' : 'Beyond'} ${t}% of ATH (${awayPct.toFixed(1)}% away)`}
          className={`w-3.5 h-3.5 rounded-sm ${awayPct <= t ? 'bg-emerald-500' : 'bg-rose-500/70'}`}
        />
      ))}
    </div>
  );
});

// ─── Table skeleton row ──────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="border-b border-zinc-800/30 animate-pulse">
      <td className="px-2 py-3"><div className="h-4 w-4 bg-zinc-800 rounded mx-auto" /></td>
      <td className="pl-5 pr-2 py-3">
        <div className="h-7 w-7 bg-zinc-800 rounded" />
      </td>
      <td className="px-1 py-3"><div className="h-3 w-5 bg-zinc-800 rounded mx-auto" /></td>
      <td className="px-3 py-3">
        <div className="flex flex-col gap-1.5">
          <div className="h-4 w-24 bg-zinc-800 rounded" />
          <div className="h-3 w-36 bg-zinc-800/50 rounded" />
        </div>
      </td>
      <td className="px-1 py-3"><div className="h-3.5 w-14 bg-zinc-800 rounded mx-auto" /></td>
      <td className="px-1 py-3"><div className="h-3.5 w-14 bg-zinc-800 rounded mx-auto" /></td>
      <td className="px-1 py-3"><div className="h-3.5 w-12 bg-zinc-800 rounded mx-auto" /></td>
      <td className="px-3 py-3 hidden md:table-cell"><div className="h-9 bg-zinc-800/50 rounded" /></td>
      <td className="px-1 py-3"><div className="h-3.5 w-10 bg-zinc-800 rounded mx-auto" /></td>
      <td className="px-2 py-3">
        <div className="flex gap-0.5 justify-center">
          {[...Array(5)].map((_, i) => <div key={i} className="w-3.5 h-3.5 bg-zinc-800 rounded-sm" />)}
        </div>
      </td>
      <td className="px-2 py-3">
        <div className="flex gap-0.5 justify-center">
          {[...Array(5)].map((_, i) => <div key={i} className="w-3.5 h-3.5 bg-zinc-800 rounded-sm" />)}
        </div>
      </td>
      <td className="px-1 py-3"><div className="h-3.5 w-12 bg-zinc-800 rounded mx-auto" /></td>
    </tr>
  );
}

// ─── Table header cell ────────────────────────────────────────────────────────

const TH_BASE = 'px-3 py-4 text-sm font-bold text-zinc-300 uppercase tracking-wider select-none';

// Shared column set for CSV export + clipboard "copy rows" (keeps them in sync).
const EXPORT_COLUMNS: { header: string; get: (r: ScreenerRow) => string | number }[] = [
  { header: 'Rank',          get: r => (r.rank === 9999 ? '' : r.rank) },
  { header: 'Symbol',        get: r => r.symbol },
  { header: 'Company',       get: r => r.companyName },
  { header: 'CMP',           get: r => r.currentPrice.toFixed(2) },
  { header: 'Day Chg %',     get: r => (r.dayChangePct == null ? '' : r.dayChangePct.toFixed(2)) },
  { header: 'Score',         get: r => r.compositeScore.toFixed(4) },
  { header: 'Avg Sharpe',    get: r => r.avgSharpe.toFixed(4) },
  { header: 'ATH Proximity', get: r => r.athProximity.toFixed(4) },
  { header: '200 DMA %',     get: r => r.aboveDma200Pct.toFixed(2) },
  { header: 'Turnover Cr',   get: r => r.medianTurnoverCr.toFixed(2) },
  { header: 'Market Cap Cr', get: r => r.marketCapCr.toFixed(0) },
  { header: 'Category',      get: r => r.marketCapCategory || '' },
  { header: 'Rank Change',   get: r => r.rankChange ?? '' },
];

/** Quote a CSV field only when it contains a comma, quote or newline. */
function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function SortHeader({
  field, current, dir, onClick, children, center, pl, title,
}: {
  field: string; current: string; dir: 'asc' | 'desc';
  onClick: (f: string) => void; children: React.ReactNode; center?: boolean; pl?: string; title?: string;
}) {
  return (
    <th
      className={`${TH_BASE} cursor-pointer hover:text-zinc-200 transition-colors${pl ? ` ${pl}` : ''}`}
      onClick={() => onClick(field)}
      title={title}
    >
      <span className={`flex items-center gap-0.5 ${center ? 'justify-center' : ''}`}>
        {children}
        {current === field && <span className="text-emerald-400 ml-0.5">{dir === 'asc' ? '↑' : '↓'}</span>}
      </span>
    </th>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ScreenerClient({ initialData }: ScreenerClientProps) {
  const [rows, setRows] = useState<ScreenerRow[]>(initialData.rows);
  const [stats, setStats] = useState<ScreenerStats>(initialData.stats);
  const [activeTab, setActiveTab] = useState<'all' | 'prefiltered' | 'portfolio'>('portfolio');
  const [hidePortfolio, setHidePortfolio] = useState(true);
  const [signalFilter, setSignalFilter] = useState<'hold' | 'warning' | 'exit' | null>(null);
  const [loading, setLoading] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStep, setSyncStep] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState(0);
  const [sortField, setSortField] = useState('rank');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<string>('');
  // Search + saved queries
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<ScreenerQueryFilters>({});
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [activeQueryId, setActiveQueryId] = useState<number | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  // Row selection + copy feedback
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  const copyMsgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rankHistoryCacheRef = useRef<Record<string, { date: string; rank: number; compositeScore: number }[]>>({});

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/screener/progress');
        if (res.ok) {
          const json = await res.json();
          if (json.step)     setSyncStep(json.step);
          if (json.progress != null) setSyncProgress(json.progress);
        }
      } catch {
        // ignore transient errors during polling
      }
    }, 2000);
  }, [stopPolling]);

  // Clean up polling on unmount
  useEffect(() => () => stopPolling(), [stopPolling]);

  const prefetchRankHistories = useCallback(async (tabRows: ScreenerRow[], rType: 'filtered' | 'all') => {
    // Silently pre-load all visible symbols in one DB round-trip
    const syms = tabRows.map(r => r.symbol);
    if (syms.length === 0) return;
    try {
      const batch = await getRankHistoriesBatch(syms, rType);
      rankHistoryCacheRef.current = { ...rankHistoryCacheRef.current, ...batch };
    } catch {
      // non-fatal — modal will fall back to per-symbol fetch
    }
  }, []);

  // Prefetch rank histories for the initial pre-filtered rows (background, non-blocking)
  useEffect(() => {
    prefetchRankHistories(initialData.rows, 'filtered');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);  // only on mount — initialData is stable

  const handleTabChange = useCallback(async (tab: 'all' | 'prefiltered' | 'portfolio') => {
    setActiveTab(tab);
    setSignalFilter(null);
    setLoading(true);
    try {
      const data = await getScreenerData(tab);
      setRows(data.rows);
      setStats(data.stats);
      const rType = tab === 'all' ? 'all' : 'filtered';
      prefetchRankHistories(data.rows, rType);  // background prefetch — non-blocking
    } finally {
      setLoading(false);
    }
  }, [prefetchRankHistories]);

  // Manual tab switch (via StatsBar) clears the active saved query but keeps filters.
  const handleManualTabChange = useCallback((tab: 'all' | 'prefiltered' | 'portfolio') => {
    setActiveQueryId(null);
    handleTabChange(tab);
  }, [handleTabChange]);

  // Load saved queries once; apply the default query if the user has one.
  useEffect(() => {
    (async () => {
      try {
        const qs = await listScreenerQueries();
        setSavedQueries(qs);
        const def = qs.find(q => q.isDefault);
        if (def) {
          setActiveQueryId(def.id);
          setFilters(def.filters);
          if (def.sortField) { setSortField(def.sortField); setSortDir(def.sortDir ?? 'asc'); }
          if (def.baseTab !== 'portfolio') handleTabChange(def.baseTab);
        }
      } catch {
        // non-fatal — saved queries just won't be available
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeQuery = useMemo(
    () => savedQueries.find(q => q.id === activeQueryId) ?? null,
    [savedQueries, activeQueryId],
  );
  // Only surface saved queries that belong to the currently-active tab, so each
  // tab keeps its own independent dropdown.
  const visibleQueries = useMemo(
    () => savedQueries.filter(q => q.baseTab === activeTab),
    [savedQueries, activeTab],
  );
  const filterCount = useMemo(() => countActiveFilters(filters), [filters]);

  // Applying a saved query never switches tabs — it only applies filters/sort
  // within the current tab. (Dropdown is already scoped to this tab.)
  const handleSelectQuery = useCallback((id: number | null) => {
    if (id == null) { setActiveQueryId(null); setFilters({}); return; }
    const q = savedQueries.find(s => s.id === id);
    if (!q) return;
    setActiveQueryId(id);
    setFilters(q.filters);
    if (q.sortField) { setSortField(q.sortField); setSortDir(q.sortDir ?? 'asc'); }
  }, [savedQueries]);

  const handleQuerySaved = useCallback((q: SavedQuery) => {
    setSavedQueries(prev => {
      const others = prev.filter(x => x.id !== q.id);
      const cleaned = q.isDefault ? others.map(x => ({ ...x, isDefault: false })) : others;
      return [...cleaned, q].sort(
        (a, b) => (Number(b.isDefault) - Number(a.isDefault)) || a.name.localeCompare(b.name),
      );
    });
    setActiveQueryId(q.id);
  }, []);

  const handleQueryDeleted = useCallback((id: number) => {
    setSavedQueries(prev => prev.filter(x => x.id !== id));
    setActiveQueryId(cur => (cur === id ? null : cur));
  }, []);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setSyncStep('Starting...');
    setSyncProgress(0);
    startPolling();
    try {
      const result = await syncScreener();
      if (result.success) {
        const data = await getScreenerData(activeTab);
        setRows(data.rows);
        setStats(data.stats);
      }
    } finally {
      stopPolling();
      setSyncing(false);
      setSyncStep(null);
      setSyncProgress(0);
    }
  }, [activeTab, startPolling, stopPolling]);

  const handleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir(field === 'score' || field === 'rankChange' ? 'desc' : 'asc'); }
  };

  // Download exactly what is currently in view (filters + search + sort applied).
  const handleExportCSV = () => {
    if (!displayRows.length) return;
    const header = EXPORT_COLUMNS.map(c => csvCell(c.header)).join(',');
    const body = displayRows.map(r => EXPORT_COLUMNS.map(c => csvCell(c.get(r))).join(','));
    const csv = [header, ...body].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `screener-${activeTab}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Row selection + clipboard copy ──
  const flashCopy = (msg: string) => {
    setCopyMsg(msg);
    if (copyMsgTimer.current) clearTimeout(copyMsgTimer.current);
    copyMsgTimer.current = setTimeout(() => setCopyMsg(null), 1800);
  };

  const writeClipboard = async (text: string, okMsg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      flashCopy(okMsg);
    } catch {
      flashCopy('Copy failed — clipboard blocked');
    }
  };

  // Rows to act on: the selected ones, or the whole visible set when none picked.
  const copyTargets = () =>
    selected.size ? displayRows.filter(r => selected.has(r.symbol)) : displayRows;

  const copySymbols = () => {
    const rowsToCopy = copyTargets();
    if (!rowsToCopy.length) return;
    writeClipboard(
      rowsToCopy.map(r => r.symbol).join('\n'),
      `Copied ${rowsToCopy.length} symbol${rowsToCopy.length > 1 ? 's' : ''}`,
    );
  };

  const copyRowsWithHeader = () => {
    const rowsToCopy = copyTargets();
    if (!rowsToCopy.length) return;
    // Tab-separated so it pastes cleanly into Excel / Google Sheets.
    const header = EXPORT_COLUMNS.map(c => c.header).join('\t');
    const body = rowsToCopy.map(r => EXPORT_COLUMNS.map(c => String(c.get(r))).join('\t'));
    writeClipboard(
      [header, ...body].join('\n'),
      `Copied ${rowsToCopy.length} row${rowsToCopy.length > 1 ? 's' : ''} with header`,
    );
  };

  const toggleRow = (symbol: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol); else next.add(symbol);
      return next;
    });
  };

  // Toggle select-all across the currently-visible rows only.
  const toggleSelectAll = () => {
    setSelected(prev => {
      const next = new Set(prev);
      const allSel = displayRows.length > 0 && displayRows.every(r => next.has(r.symbol));
      for (const r of displayRows) {
        if (allSel) next.delete(r.symbol); else next.add(r.symbol);
      }
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const displayRows = useMemo(() => {
    let filtered = [...rows];
    if (activeTab === 'prefiltered' && hidePortfolio) {
      filtered = filtered.filter(r => !r.inPortfolio);
    }

    if (activeTab === 'portfolio' && signalFilter) {
      filtered = filtered.filter(r => {
        if (signalFilter === 'hold') {
          return !r.exitSignal;
        } else if (signalFilter === 'warning') {
          return r.exitSignal?.signalType === 'yellow';
        } else if (signalFilter === 'exit') {
          return r.exitSignal?.signalType === 'red';
        }
        return true;
      });
    }

    // Saved-query filters + live search bar
    const merged: ScreenerQueryFilters = { ...filters, search: search.trim() || filters.search };
    filtered = applyScreenerFilters(filtered, merged, activeTab);

    return filtered.sort((a, b) => {
      // Pin active exit stocks (red signal, not protected) to the end of the table on the portfolio tab
      if (activeTab === 'portfolio') {
        const aIsExit = a.exitSignal?.signalType === 'red' && !a.exitSignal?.protected;
        const bIsExit = b.exitSignal?.signalType === 'red' && !b.exitSignal?.protected;
        if (aIsExit && !bIsExit) return 1;
        if (!aIsExit && bIsExit) return -1;
      }

      // For rank sort: unranked stocks (rank=9999, e.g. BE) are placed
      // by their compositeScore relative to ranked stocks so they appear
      // at their natural score position rather than pinned to the bottom.
      if (sortField === 'rank' || sortField === 'default') {
        const aUnranked = a.rank === 9999;
        const bUnranked = b.rank === 9999;
        if (!aUnranked && !bUnranked) {
          // Both ranked — sort by rank asc/desc normally
          return sortDir === 'asc' ? a.rank - b.rank : b.rank - a.rank;
        }
        if (aUnranked && bUnranked) {
          // Both unranked — sort by score desc (higher score = better position)
          return b.compositeScore - a.compositeScore;
        }
        // One ranked, one unranked: find where unranked's score fits
        const rankedRow = aUnranked ? b : a;
        const unrankedRow = aUnranked ? a : b;
        // Unranked goes after ranked stock if ranked score > unranked score
        const cmp = rankedRow.compositeScore - unrankedRow.compositeScore;
        // aUnranked: a is unranked; if cmp > 0 ranked is better, so a goes after => +1
        return aUnranked ? cmp : -cmp;
      }

      let cmp = 0;
      switch (sortField) {
        case 'symbol': cmp = a.symbol.localeCompare(b.symbol); break;
        case 'mcap':   cmp = a.marketCapCr - b.marketCapCr; break;
        case 'dd': {
          if (activeTab === 'portfolio') {
            const aDd = a.drawdownSinceEntry ?? 0;
            const bDd = b.drawdownSinceEntry ?? 0;
            cmp = aDd - bDd;
          } else {
            cmp = a.athProximity - b.athProximity;
          }
          break;
        }
        case 'score':      cmp = a.compositeScore - b.compositeScore; break;
        case 'rankChange': cmp = (a.rankChange ?? 0) - (b.rankChange ?? 0); break;
        case 'cmp':        cmp = a.currentPrice - b.currentPrice; break;
        case 'chg':        cmp = (a.dayChangePct ?? 0) - (b.dayChangePct ?? 0); break;
        default:           cmp = a.rank - b.rank;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [rows, sortField, sortDir, activeTab, hidePortfolio, signalFilter, filters, search]);

  const isClickableTab = activeTab === 'all' || activeTab === 'prefiltered' || activeTab === 'portfolio';

  return (
    <motion.div className="flex flex-col gap-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-3xl font-bold">
          <span className="gradient-text">Momentum Screener</span>
        </h1>
        <div className="flex items-center gap-2">
          {/* Sync button */}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="px-3 py-1.5 text-[10px] font-medium text-zinc-400 hover:text-white bg-zinc-800/50 hover:bg-zinc-700/50 border border-white/5 rounded-lg transition-all disabled:opacity-50"
          >
            {syncing ? (
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
                Syncing...
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                Sync
              </span>
            )}
          </button>

          {/* CSV Export button */}
          <button
            onClick={handleExportCSV}
            disabled={!displayRows.length}
            className="px-2 py-1.5 text-[10px] font-medium text-zinc-400 hover:text-white bg-zinc-800/50 hover:bg-zinc-700/50 border border-white/5 rounded-lg transition-all disabled:opacity-30"
            title="Export CSV"
          >
            {/* Download icon */}
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>

          <button
            onClick={() => setRulesOpen(true)}
            className="px-2 py-1.5 text-[10px] font-medium text-zinc-400 hover:text-white bg-zinc-800/50 hover:bg-zinc-700/50 border border-white/5 rounded-lg transition-all"
            title="Strategy Rules"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </button>
        </div>
      </div>

      {/* Sync progress bar */}
      {syncing && (
        <div className="flex flex-col gap-1">
          <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-500"
              style={{ width: `${syncProgress}%` }}
            />
          </div>
          {syncStep && (
            <span className="text-[10px] text-zinc-400">{syncStep}</span>
          )}
        </div>
      )}

      {/* Stats Bar */}
      <StatsBar
        stats={stats}
        activeTab={activeTab}
        onTabChange={handleManualTabChange}
        filteredCount={displayRows.length}
        hidePortfolio={hidePortfolio}
        onHidePortfolioChange={setHidePortfolio}
        signalFilter={signalFilter}
        onSignalFilterChange={setSignalFilter}
      />

      {/* Search + saved-query toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-0">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search symbol or company…"
            className="w-full bg-zinc-900/60 border border-zinc-800/60 rounded-lg pl-9 pr-8 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500/40"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
              title="Clear search"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>

        {/* Saved query dropdown */}
        <div className="relative">
          <select
            value={visibleQueries.some(q => q.id === activeQueryId) ? (activeQueryId ?? '') : ''}
            onChange={(e) => handleSelectQuery(e.target.value ? Number(e.target.value) : null)}
            className="appearance-none bg-zinc-900/60 border border-zinc-800/60 rounded-lg pl-3 pr-8 py-2 text-sm text-zinc-200 outline-none focus:border-blue-500/40 cursor-pointer min-w-[160px]"
            title="Saved queries for this tab"
          >
            <option value="">Default view</option>
            {visibleQueries.map((q) => (
              <option key={q.id} value={q.id}>{q.isDefault ? '★ ' : ''}{q.name}</option>
            ))}
          </select>
          <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
        </div>

        {/* Filters button */}
        <button
          onClick={() => setEditorOpen(true)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
            filterCount > 0
              ? 'border-blue-500/40 bg-blue-500/10 text-blue-300'
              : 'border-zinc-800/60 bg-zinc-900/60 text-zinc-400 hover:text-white'
          }`}
          title="Filter builder"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M6 10h12M10 16h4" /></svg>
          <span className="hidden sm:inline">Filters</span>
          {filterCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-blue-500/30 text-[10px] font-bold text-blue-200">{filterCount}</span>
          )}
        </button>

        {(filterCount > 0 || activeQueryId != null) && (
          <button
            onClick={() => { setFilters({}); setActiveQueryId(null); }}
            className="px-3 py-2 rounded-lg border border-zinc-800/60 bg-zinc-900/60 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
            title="Clear filters"
          >
            Clear
          </button>
        )}
      </div>

      {/* Selection / copy bar */}
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="text-zinc-500">
          {selected.size > 0
            ? <><span className="text-blue-300 font-semibold">{selected.size}</span> selected</>
            : <>Copy acts on all <span className="text-zinc-300 font-semibold">{displayRows.length}</span> visible</>}
        </span>
        <button
          onClick={copySymbols}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-800/60 bg-zinc-900/60 text-zinc-300 hover:text-white hover:border-zinc-700 transition-colors"
          title="Copy stock symbols, one per line"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16h8M8 12h8M8 8h4M6 4h9l5 5v11a1 1 0 01-1 1H6a1 1 0 01-1-1V5a1 1 0 011-1z" /></svg>
          Copy names
        </button>
        <button
          onClick={copyRowsWithHeader}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-800/60 bg-zinc-900/60 text-zinc-300 hover:text-white hover:border-zinc-700 transition-colors"
          title="Copy full rows with header (tab-separated, pastes into Excel/Sheets)"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
          Copy rows + header
        </button>
        {selected.size > 0 && (
          <button
            onClick={clearSelection}
            className="px-2.5 py-1.5 rounded-lg text-zinc-400 hover:text-white transition-colors"
          >
            Clear selection
          </button>
        )}
        {copyMsg && (
          <span className="flex items-center gap-1 text-emerald-400 font-medium">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            {copyMsg}
          </span>
        )}
      </div>

      {/* Table */}
      <div
        className="overflow-auto rounded-lg border border-zinc-800/60"
        style={{ maxHeight: 'calc(100vh - 226px)' }}
      >
        <table className="w-full text-sm" style={{ tableLayout: 'fixed', minWidth: '1160px' }}>
            <colgroup>
              <col style={{ width: '3%',  minWidth: '40px' }} />
              <col style={{ width: '4%',  minWidth: '56px' }} />
              <col style={{ width: '4%',  minWidth: '48px' }} />
              <col style={{ width: '16%', minWidth: '170px' }} />
              <col style={{ width: '7%',  minWidth: '80px' }} />
              <col style={{ width: '8%',  minWidth: '92px' }} />
              <col style={{ width: '7%',  minWidth: '80px' }} />
              <col style={{ width: '13%', minWidth: '140px' }} />
              <col style={{ width: '6%',  minWidth: '64px' }} />
              <col style={{ width: '9%',  minWidth: '100px' }} />
              <col style={{ width: '9%',  minWidth: '100px' }} />
              <col style={{ width: '6%',  minWidth: '60px' }} />
            </colgroup>

            <thead className="sticky top-0 z-10 bg-slate-900 border-b border-zinc-800/60">
              <tr>
                <th className={`${TH_BASE} text-center px-2`} title="Select all visible rows">
                  <input
                    type="checkbox"
                    className="accent-blue-500 w-4 h-4 align-middle cursor-pointer"
                    checked={displayRows.length > 0 && displayRows.every(r => selected.has(r.symbol))}
                    ref={(el) => {
                      if (el) {
                        const someSel = displayRows.some(r => selected.has(r.symbol));
                        const allSel = displayRows.length > 0 && displayRows.every(r => selected.has(r.symbol));
                        el.indeterminate = someSel && !allSel;
                      }
                    }}
                    onChange={toggleSelectAll}
                  />
                </th>
                <SortHeader field="rank"   current={sortField} dir={sortDir} onClick={handleSort} pl="pl-5" title="Momentum rank (lower is stronger)">#</SortHeader>
                <SortHeader field="rankChange" current={sortField} dir={sortDir} onClick={handleSort} center title="Rank change vs previous session">Δ</SortHeader>
                <SortHeader field="symbol" current={sortField} dir={sortDir} onClick={handleSort} title="Stock symbol / company">Stock</SortHeader>
                <SortHeader field="mcap"   current={sortField} dir={sortDir} onClick={handleSort} center title="Market capitalisation (₹ crore)">Marketcap</SortHeader>
                <SortHeader field="cmp"    current={sortField} dir={sortDir} onClick={handleSort} center title="CMP — Current Market Price">CMP</SortHeader>
                <SortHeader field="chg"    current={sortField} dir={sortDir} onClick={handleSort} center title="Chg — Day's price change %">Chg</SortHeader>
                <th className={`${TH_BASE} hidden md:table-cell`} title="Trend — recent price sparkline">Trend</th>
                <SortHeader field="score"  current={sortField} dir={sortDir} onClick={handleSort} center title="Score — Composite momentum score (higher is stronger)">Score</SortHeader>
                <th className={`${TH_BASE} text-center`} title="DMA — Daily Moving Averages: above/below 10 / 20 / 50 / 100 / 200-day">DMA</th>
                <th className={`${TH_BASE} text-center`} title="ATH — All-Time High proximity: within 10 / 15 / 20 / 25 / 30%">ATH</th>
                <SortHeader field="dd" current={sortField} dir={sortDir} onClick={handleSort} center title="DD — Drawdown from ATH (since-entry drawdown on Portfolio tab)">DD</SortHeader>
              </tr>
            </thead>

            <tbody className="divide-y divide-zinc-800/30">
              {loading ? (
                [...Array(12)].map((_, i) => <SkeletonRow key={i} />)
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-zinc-500 text-sm">
                      <span>No rankings yet.</span>
                      <span className="text-xs text-zinc-600">Trigger a sync to run the pipeline.</span>
                    </div>
                  </td>
                </tr>
              ) : displayRows.map(row => {
                const exit = activeTab === 'portfolio' ? row.exitSignal : undefined;
                const isExitCandidate = !!exit && exit.signalType === 'red' && !exit.protected;
                const isWarning        = !!exit && exit.signalType === 'yellow';
                const isProtected      = !!exit && exit.protected;

                // All-tab tier: portfolio > pre-filtered > universe-only
                const isAllTab = activeTab === 'all';
                const allTier = isAllTab
                  ? row.inPortfolio ? 'portfolio'
                  : row.isPreFiltered ? 'prefiltered'
                  : 'normal'
                  : null;

                const accentColor = isAllTab
                  ? (allTier === 'portfolio' || allTier === 'prefiltered') ? 'rgb(34,197,94)'
                  : 'rgb(39,39,42)'
                  : isExitCandidate
                    ? 'rgb(239,68,68)'
                    : isWarning
                      ? 'rgb(234,179,8)'
                      : isProtected
                        ? 'rgb(234,179,8)'
                        : row.isUnranked
                          ? 'rgb(63,63,70)'
                          : getRankAccent(row.rank, row.inPortfolio, activeTab === 'prefiltered');

                const rowBg = isAllTab
                  ? (allTier === 'portfolio' || allTier === 'prefiltered') ? 'bg-emerald-950/20 hover:bg-emerald-950/30'
                  : 'bg-zinc-950 hover:bg-zinc-800/40'
                  : isExitCandidate           ? 'bg-red-500/[0.08] hover:bg-red-500/[0.13]'
                  : isWarning                 ? 'bg-amber-500/[0.06] hover:bg-amber-500/[0.11]'
                  : isProtected               ? 'bg-amber-500/[0.03] hover:bg-amber-500/[0.08]'
                  : row.isUnranked            ? 'bg-zinc-950'
                  : row.inPortfolio && activeTab !== 'portfolio' ? 'bg-indigo-950/30 hover:bg-indigo-950/40'
                  : 'bg-zinc-950 hover:bg-zinc-800/60';

                return (
                  <tr
                    key={row.symbol}
                    onClick={() => {
                      if (isClickableTab) {
                        setSelectedSymbol(row.symbol);
                        setSelectedCompany(row.companyName);
                      }
                    }}
                    className={`transition-colors ${isClickableTab ? 'cursor-pointer' : ''} ${rowBg} ${selected.has(row.symbol) ? 'ring-1 ring-inset ring-blue-500/40' : ''}`}
                  >
                    {/* Select checkbox */}
                    <td className="px-2 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="accent-blue-500 w-4 h-4 cursor-pointer align-middle"
                        checked={selected.has(row.symbol)}
                        onChange={() => toggleRow(row.symbol)}
                      />
                    </td>

                    {/* Rank — left accent bar */}
                    <td className="pl-5 pr-2 py-3" style={{ boxShadow: `inset 5px 0 0 ${accentColor}` }}>
                      {row.isUnranked ? (
                        <span className="text-zinc-600 text-xs">—</span>
                      ) : (
                        <span className={`font-mono text-xl font-black tabular-nums leading-none ${
                          isAllTab
                            ? (allTier === 'portfolio' || allTier === 'prefiltered') ? 'text-emerald-400'
                            : 'text-zinc-400'
                            : getRankTextColor(row.rank, activeTab === 'prefiltered')
                        }`}>
                          {row.rank}
                        </span>
                      )}
                    </td>

                    {/* Rank change */}
                    <td className="px-1 py-3 text-center">
                      {!row.isUnranked && (
                        row.rankChange == null || row.rankChange === 0
                          ? <span className="text-zinc-600 text-xs">—</span>
                          : <span className={`font-mono text-xs font-semibold tabular-nums ${row.rankChange > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {row.rankChange > 0 ? `↑${row.rankChange}` : `↓${Math.abs(row.rankChange)}`}
                            </span>
                      )}
                    </td>

                    {/* Stock info */}
                    <td className="flex flex-col px-3 py-3 gap-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`font-bold text-base truncate leading-none ${
                          isExitCandidate
                            ? 'text-red-300'
                            : isWarning
                              ? 'text-amber-300'
                              : isProtected
                                ? 'text-amber-100/90'
                                : 'text-white'
                        }`}>{row.symbol}</span>
                        {/* Exit / Warning / Caution signal badges */}
                        {exit && activeTab === 'portfolio' && exit.signalType === 'red' && (() => {
                          const exitLines = [
                            exit.isUnranked
                              ? (exit.unrankedReason ? `Dropped: ${exit.unrankedReason}` : 'Dropped from screener universe')
                              : exit.byRank ? 'Rank > 50' : '',
                            exit.byFilter ? 'Below 200 DMA or outside 25% of ATH' : '',
                            exit.by50Dma ? 'Below 50 DMA' : '',
                            exit.byDrawdown ? 'Dropped > 25% since entry' : '',
                            exit.protected ? '🔒 Min hold not met (< 14 days)' : '',
                            row.asmInfo ? `⚠ ASM ${row.asmInfo.type}-${row.asmInfo.stage}: ${row.asmInfo.desc}` : '',
                          ].filter(Boolean) as string[];
                          return (
                            <BadgeTooltip
                              label={exit.protected ? 'LOCKED' : 'EXIT'}
                              badgeCls={exit.protected
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                : 'bg-red-500/20 text-red-300 border-red-500/40'}
                              lines={exitLines}
                            />
                          );
                        })()}
                        {exit && activeTab === 'portfolio' && exit.signalType === 'yellow' && (() => {
                          const cautionLines = [
                            exit.byRank && !exit.isUnranked ? 'Rank 51–60 (watch zone)' : '',
                            exit.isBE ? 'Moved to BE (T+0) settlement category' : '',
                            exit.by50Dma ? 'Below 50 DMA' : '',
                            exit.byDrawdownWarn && !exit.byDrawdown ? 'Dropped > 20% since entry (warn zone)' : '',
                            row.asmInfo ? `⚠ ASM ${row.asmInfo.type}-${row.asmInfo.stage}: ${row.asmInfo.desc}` : '',
                          ].filter(Boolean) as string[];
                          return (
                            <BadgeTooltip
                              label="CAUTION"
                              badgeCls="bg-amber-500/20 text-amber-300 border-amber-500/40"
                              lines={cautionLines}
                            />
                          );
                        })()}
                        {/* ASM badge — only shown outside portfolio tab */}
                        {row.asmInfo && activeTab !== 'portfolio' && (
                          <BadgeTooltip
                            label={`ASM ${row.asmInfo.type}-${row.asmInfo.stage}`}
                            badgeCls="bg-amber-500/20 text-amber-300 border-amber-500/40"
                            lines={[row.asmInfo.desc]}
                            icon={
                              <svg className="w-2.5 h-2.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                              </svg>
                            }
                          />
                        )}
                        {(() => {
                          const b = MCAP_BADGE[row.marketCapCategory || ''];
                          return b ? (
                            <span className={`text-[9px] px-1.5 h-4 border rounded font-medium leading-none shrink-0 flex items-center ${b.cls}`}>
                              {b.label}
                            </span>
                          ) : null;
                        })()}
                      </div>
                      <div className="text-[11px] text-zinc-500 truncate leading-tight mt-0.5">
                        {row.companyName}
                      </div>
                    </td>

                    {/* Mcap */}
                    <td className="px-1 py-3 text-center">
                      <span className="font-mono text-xs tabular-nums text-zinc-400">
                        {formatMcap(row.marketCapCr)}
                      </span>
                    </td>

                    {/* CMP */}
                    <td className="px-1 py-3 text-center">
                      {row.currentPrice > 0 ? (
                        <span className="font-mono text-xs font-semibold tabular-nums text-zinc-200">
                          ₹{row.currentPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </span>
                      ) : (
                        <span className="text-zinc-700 text-xs">—</span>
                      )}
                    </td>

                    {/* Day change */}
                    <td className="px-1 py-3 text-center">
                      {row.dayChangePct == null ? (
                        <span className="text-zinc-700 text-xs">—</span>
                      ) : (
                        <span className={`font-mono text-xs font-semibold tabular-nums ${row.dayChangePct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {row.dayChangePct >= 0 ? '+' : ''}{row.dayChangePct.toFixed(2)}%
                        </span>
                      )}
                    </td>

                    {/* Price trend sparkline */}
                    <td className="px-3 py-3 hidden md:table-cell">
                      <Sparkline data={row.sparklineData} />
                    </td>

                    {/* Score */}
                    <td className="px-1 py-3 text-center">
                      {row.isUnranked && row.compositeScore === 0 ? (
                        <span className="text-zinc-700 text-xs">—</span>
                      ) : (
                        <span className={`font-mono text-xs font-semibold tabular-nums ${row.isUnranked ? 'text-zinc-500' : 'text-zinc-300'}`}>
                          {row.compositeScore.toFixed(2)}
                        </span>
                      )}
                    </td>

                    {/* DMA swatches (10/20/50/100/200) */}
                    <td className="px-2 py-3">
                      <div className="flex justify-center">
                        <DMASwatches swatches={row.dmaSwatches} />
                      </div>
                    </td>

                    {/* ATH swatches */}
                    <td className="px-2 py-3">
                      <div className="flex justify-center">
                        {row.currentPrice > 0 ? (
                          <ATHSwatches athProximity={row.athProximity} />
                        ) : (
                          <span className="text-zinc-700 text-xs">—</span>
                        )}
                      </div>
                    </td>

                    {/* DD — drawdown */}
                    <td className="px-1 py-3 text-center">
                      {row.currentPrice > 0 ? (() => {
                        const athDd = -((1 - row.athProximity) * 100);
                        
                        const isPortfolioTab = activeTab === 'portfolio';
                        const hasEntryDd = isPortfolioTab && row.drawdownSinceEntry !== undefined && row.drawdownSinceEntry !== null;
                        const entryDd = row.drawdownSinceEntry ?? 0;
                        const isSame = hasEntryDd && Math.abs(athDd - entryDd) < 0.05;

                        // Primary value is drawdown since entry on portfolio tab, else ATH drawdown
                        const primaryDd = hasEntryDd ? entryDd : athDd;
                        const cls = primaryDd >= -5 ? 'text-emerald-400' : primaryDd >= -15 ? 'text-yellow-400' : primaryDd >= -30 ? 'text-orange-400' : 'text-red-400';

                        return (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className={`font-mono text-xs font-semibold tabular-nums ${cls}`}>
                              {primaryDd.toFixed(1)}%
                            </span>
                            {hasEntryDd && !isSame && (
                              <span className="font-mono text-[10px] text-zinc-500 tabular-nums leading-none mt-0.5" title="Drawdown from All-Time High">
                                ({athDd.toFixed(1)}%)
                              </span>
                            )}
                          </div>
                        );
                      })() : (
                        <span className="text-zinc-700 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
      </div>

      <RulesInfoModal open={rulesOpen} onClose={() => setRulesOpen(false)} />

      <QueryEditorModal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        baseTab={activeTab}
        filters={filters}
        activeQuery={activeQuery}
        onApply={setFilters}
        onSaved={handleQuerySaved}
        onDeleted={handleQueryDeleted}
      />

      {selectedSymbol && (
        <RankHistoryModal
          symbol={selectedSymbol}
          companyName={selectedCompany}
          rankType={activeTab === 'all' ? 'all' : 'filtered'}
          onClose={() => setSelectedSymbol(null)}
          preloadedHistory={rankHistoryCacheRef.current[selectedSymbol]}
        />
      )}
    </motion.div>
  );
}
