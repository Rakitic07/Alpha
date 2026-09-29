'use client';

import { useState, useMemo, useEffect, useRef, memo } from 'react';
import { ResponsiveTreeMap } from '@nivo/treemap';
import { ResponsivePie } from '@nivo/pie';
import { formatNumber } from '@/lib/format';
import { motion } from 'framer-motion';
import StockChartModal from '@/components/chart/StockChartModal';

export interface PortfolioHoldingItem {
  symbol: string;
  currentValue: number;
  dayChangePercent: number;
  dayChange?: number;
  currentPrice?: number;
  marketCapCategory?: string;
  sector?: string;
  formattedValue: string;
  totalPnlPercent?: number;
}

interface PortfolioHeatmapProps {
  data: {
    allHoldings: PortfolioHoldingItem[];
  };
  isMobile: boolean;
  privacyMode: boolean;
  downloading?: boolean;
}

type ViewMode = 'treemap' | 'allocation' | 'bars';

const VIEW_OPTIONS: Array<{ id: ViewMode; label: string }> = [
  { id: 'treemap', label: 'Treemap' },
  { id: 'allocation', label: 'Allocation' },
  { id: 'bars', label: 'Bars' },
];

const STORAGE_KEY = 'portfolioHeatmapView';

export function getHeatmapColor(percent: number | undefined): string {
  if (percent === undefined) return 'rgba(0,0,0,0)';
  if (percent >= 10) return '#059669'; // Emerald 600
  if (percent >= 5) return '#10b981';  // Emerald 500
  if (percent >= 3) return '#34d399';  // Emerald 400
  if (percent >= 1.5) return '#6ee7b7'; // Emerald 300
  if (percent > 0) return '#d1fae5';   // Emerald 100
  if (percent === 0) return '#64748b'; // Slate 500
  if (percent > -1.5) return '#fee2e2'; // Red 100
  if (percent > -3) return '#fca5a5';   // Red 300
  if (percent > -5) return '#f87171';   // Red 400
  if (percent > -10) return '#ef4444';  // Red 500
  return '#b91c1c';                     // Red 700
}

export function getHeatmapTextColor(percent: number | undefined): string {
  if (percent === undefined) return '#ffffff';
  if (percent > 0 && percent < 5) return '#0f172a';
  if (percent < 0 && percent > -5) return '#0f172a';
  return '#ffffff';
}

export function getCapColor(cap: string | undefined): string {
  const c = (cap || '').toLowerCase();
  if (c.includes('large')) return 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30';
  if (c.includes('mid')) return 'bg-violet-500/20 text-violet-400 border border-violet-500/30';
  if (c.includes('small')) return 'bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/30';
  if (c.includes('micro')) return 'bg-lime-500/20 text-lime-400 border border-lime-500/30';
  return 'bg-slate-700/50 text-gray-400 border border-white/5';
}

export default memo(function PortfolioHeatmap({ data, isMobile, privacyMode, downloading }: PortfolioHeatmapProps) {
  const allHoldings = useMemo(() => data?.allHoldings ?? [], [data?.allHoldings]);

  // Treemap is the canonical default; only override from an explicit saved choice.
  const [view, setView] = useState<ViewMode>('treemap');
  // Selecting a holding (tile / slice / row) opens the interactive chart modal.
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      stored = null;
    }
    if (stored && VIEW_OPTIONS.some(o => o.id === stored)) {
      setView(stored as ViewMode);
    }
  }, []);

  const updateView = (next: ViewMode) => {
    setView(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore persistence failures (private mode etc.)
    }
  };

  const selectedHolding = useMemo(() => {
    if (!selectedSymbol) return null;
    return allHoldings.find(h => h.symbol === selectedSymbol) || null;
  }, [selectedSymbol, allHoldings]);

  if (allHoldings.length === 0) return null;

  const containerHeight = isMobile ? 420 : 500;

  return (
    <div
      className="bg-slate-900/50 rounded-2xl border border-white/5 p-1 flex flex-col transition-all duration-200"
      style={{ height: containerHeight }}
    >
      <div className="px-5 pt-4 pb-2 shrink-0 flex items-center justify-between gap-3">
        <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider whitespace-nowrap">Portfolio Heatmap</h3>
        <div className="flex items-center gap-0.5 rounded-lg bg-slate-800/70 border border-white/5 p-0.5">
          {VIEW_OPTIONS.map(opt => (
            <button
              key={opt.id}
              type="button"
              onClick={() => updateView(opt.id)}
              aria-pressed={view === opt.id}
              className={`px-2.5 py-1 rounded-md text-[10px] font-semibold tracking-wide transition-colors ${
                view === opt.id
                  ? 'bg-slate-600/80 text-white shadow'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-slate-700/40'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 w-full min-h-0" style={{ color: '#000' }}>
        {view === 'treemap' && (
          <TreemapView
            holdings={allHoldings}
            isMobile={isMobile}
            privacyMode={privacyMode}
            selectedSymbol={selectedSymbol}
            onSelect={setSelectedSymbol}
            downloading={downloading}
          />
        )}
        {view === 'allocation' && (
          <AllocationView
            holdings={allHoldings}
            isMobile={isMobile}
            privacyMode={privacyMode}
            onSelect={setSelectedSymbol}
          />
        )}
        {view === 'bars' && (
          <BarsView holdings={allHoldings} privacyMode={privacyMode} onSelect={setSelectedSymbol} />
        )}
      </div>

      {/* Interactive Stock Chart Modal */}
      <StockChartModal
        symbol={selectedSymbol}
        isOpen={Boolean(selectedSymbol)}
        onClose={() => setSelectedSymbol(null)}
        holding={selectedHolding}
        privacyMode={privacyMode}
      />
    </div>
  );
});

function TreemapView({
  holdings,
  isMobile,
  privacyMode,
  selectedSymbol,
  onSelect,
  downloading,
}: {
  holdings: PortfolioHoldingItem[];
  isMobile: boolean;
  privacyMode: boolean;
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
  downloading?: boolean;
}) {
  const totalValue = useMemo(
    () => holdings.reduce((sum, h) => sum + (h.currentValue || 0), 0),
    [holdings]
  );

  const treeData = useMemo(
    () => ({
      name: 'Portfolio',
      color: 'transparent',
      children: holdings.map(h => ({ ...h, name: h.symbol, value: Math.max(h.currentValue, 1) })),
    }),
    [holdings]
  );

  return (
    <div className="h-full w-full relative">
      <ResponsiveTreeMap
        data={treeData}
        identity="name"
        value="value"
        valueFormat={val => formatNumber(val, 0, 0)}
        margin={isMobile ? { top: 0, right: 4, bottom: 4, left: 4 } : { top: 0, right: 8, bottom: 8, left: 8 }}
        labelSkipSize={isMobile ? 18 : 28}
        innerPadding={isMobile ? 2 : 3}
        outerPadding={isMobile ? 2 : 3}
        colors={node => getHeatmapColor((node.data as { dayChangePercent?: number }).dayChangePercent)}
        nodeOpacity={1}
        nodeComponent={({ node }) => {
          const d = node.data as { dayChangePercent?: number; currentValue?: number };
          const percent = d.dayChangePercent;
          if (percent === undefined) return null;

          const isSelected = selectedSymbol === node.id;
          const textColor = getHeatmapTextColor(percent);
          const pad = isMobile ? 2 : 3;
          const availW = Math.max(0, node.width - pad * 2 - 2);
          const availH = Math.max(0, node.height - pad * 2 - 2);

          const CHAR_RATIO = 0.58;
          const minPercentH = isMobile ? 26 : 30;
          const minPercentW = isMobile ? 30 : 36;
          const showPercent = availH >= minPercentH && availW >= minPercentW;

          const maxFs = isMobile ? 9.5 : 12;
          const minReadableFs = isMobile ? 6 : 7;

          const maxByH = showPercent ? availH * 0.32 : availH * 0.46;
          const maxByW = availW / Math.max(node.id.length * CHAR_RATIO, 1);

          let fs = Math.min(maxByW, maxByH, maxFs);
          let displaySymbol = node.id;

          if (fs < minReadableFs) {
            const charsAtMin = Math.floor(availW / (minReadableFs * CHAR_RATIO));
            if (charsAtMin >= 4) {
              displaySymbol = node.id.slice(0, charsAtMin - 1) + '…';
              const fsTrimmed = Math.min(availW / (displaySymbol.length * CHAR_RATIO), maxByH, maxFs);
              fs = Math.max(fsTrimmed, minReadableFs);
            } else if (charsAtMin >= 2 && availH >= 16) {
              displaySymbol = node.id.slice(0, charsAtMin);
              fs = minReadableFs;
            } else {
              displaySymbol = '';
            }
          }

          const percentFs = Math.min(fs * 0.85, isMobile ? 8.5 : 10);
          const cx = node.width / 2;
          const cy = node.height / 2;
          const symbolY = showPercent ? cy - fs * 0.5 : cy;
          const percentY = cy + percentFs * 0.9;
          const clipId = `hm-${node.id.replace(/[^a-z0-9]/gi, '_')}`;

          return (
            <motion.g
              key={node.id}
              initial={downloading ? false : { opacity: 0, scale: 0.9, x: node.x, y: node.y }}
              animate={{ opacity: 1, scale: 1, x: node.x, y: node.y }}
              transition={downloading ? { duration: 0 } : {
                type: 'spring',
                damping: 20,
                stiffness: 300,
                delay: (node.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 20) / 100,
              }}
              style={{ cursor: 'pointer' }}
              onMouseEnter={node.onMouseEnter}
              onMouseMove={node.onMouseMove}
              onMouseLeave={node.onMouseLeave}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(node.id);
              }}
            >
              <defs>
                <clipPath id={clipId}>
                  <rect
                    x={pad}
                    y={pad}
                    width={Math.max(0, node.width - pad * 2)}
                    height={Math.max(0, node.height - pad * 2)}
                    rx={2}
                    ry={2}
                  />
                </clipPath>
              </defs>
              <rect
                width={node.width}
                height={node.height}
                fill={node.color}
                stroke={isSelected ? '#38bdf8' : '#0f172a'}
                strokeWidth={isSelected ? 3 : (isMobile ? 1.5 : 2)}
                rx={3}
                ry={3}
                className={isSelected ? 'filter drop-shadow-[0_0_6px_rgba(56,189,248,0.8)]' : ''}
              />
              {displaySymbol && (
                <g clipPath={`url(#${clipId})`} style={{ pointerEvents: 'none' }}>
                  <text
                    x={cx}
                    y={symbolY}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={fs}
                    fontWeight="700"
                    fill={textColor}
                    style={{ filter: textColor === '#ffffff' ? 'drop-shadow(0px 1px 2px rgba(0,0,0,0.6))' : 'none' }}
                  >
                    {displaySymbol}
                  </text>
                  {showPercent && (
                    <text
                      x={cx}
                      y={percentY}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={percentFs}
                      fontWeight="600"
                      fill={textColor}
                      fillOpacity={textColor === '#ffffff' ? 0.9 : 0.8}
                      style={{ filter: textColor === '#ffffff' ? 'drop-shadow(0px 1px 2px rgba(0,0,0,0.6))' : 'none' }}
                    >
                      {percent > 0 ? '+' : ''}{percent.toFixed(1)}%
                    </text>
                  )}
                </g>
              )}
            </motion.g>
          );
        }}
        enableLabel={false}
        theme={{ tooltip: { container: { background: 'transparent', color: '#fff', padding: 0, borderRadius: '8px', boxShadow: 'none' } } }}
        tooltip={({ node }) => {
          const d = (node.data as unknown) as PortfolioHoldingItem;
          const isPositive = (d.dayChangePercent ?? 0) >= 0;
          const holdingVal = d.currentValue ?? 0;
          const weight = totalValue > 0 ? ((holdingVal / totalValue) * 100).toFixed(1) : null;
          return (
            <div className="backdrop-blur-md bg-slate-900/95 border border-white/10 p-3 rounded-xl shadow-2xl min-w-[170px] pointer-events-none">
              <div className="flex items-center justify-between gap-4 mb-1.5">
                <span className="font-bold text-white text-sm tracking-wide">{d.symbol}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${getCapColor(d.marketCapCategory)}`}>
                  {d.marketCapCategory || 'Stock'}
                </span>
              </div>
              {d.sector && <div className="text-[10px] text-amber-400 mb-1.5">{d.sector}</div>}
              <div className="flex items-baseline gap-2 mt-1">
                <span className={`text-base font-bold tabular-nums ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {isPositive ? '+' : ''}{d.dayChangePercent?.toFixed(2)}%
                </span>
                {weight && (
                  <span className="text-[11px] text-gray-400 font-mono">
                    ({weight}%)
                  </span>
                )}
              </div>
              <div className="mt-2 pt-2 border-t border-white/5 flex justify-between text-[11px] text-gray-400">
                <span>Value</span>
                <span className="text-gray-200 font-mono">{privacyMode ? '****' : `₹${d.formattedValue}`}</span>
              </div>
            </div>
          );
        }}
      />
    </div>
  );
}

/** Donut allocation: slice size = portfolio weight, color = day change. */
type AllocDatum = {
  id: string;
  label: string;
  value: number;
  color: string;
  dayChangePercent: number;
  sector?: string;
  marketCapCategory?: string;
  formattedValue: string;
  weight: number;
};

function AllocationView({
  holdings,
  isMobile,
  privacyMode,
  onSelect,
}: {
  holdings: PortfolioHoldingItem[];
  isMobile: boolean;
  privacyMode: boolean;
  onSelect: (symbol: string) => void;
}) {
  const total = holdings.reduce((sum, h) => sum + h.currentValue, 0);
  const sorted = [...holdings].sort((a, b) => b.currentValue - a.currentValue);
  const [activeId, setActiveId] = useState<string | null>(null);
  const legendRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Keep the active holding visible in the legend — auto-scroll it into view
  // when hovering a slice whose row is currently scrolled out of sight.
  useEffect(() => {
    if (!activeId) return;
    const el = legendRefs.current.get(activeId);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeId]);

  // Show every holding as its own slice (largest first).
  const pieData: AllocDatum[] = sorted.map(h => ({
    id: h.symbol,
    label: h.symbol,
    value: h.currentValue,
    color: getHeatmapColor(h.dayChangePercent),
    dayChangePercent: h.dayChangePercent,
    sector: h.sector,
    marketCapCategory: h.marketCapCategory,
    formattedValue: h.formattedValue,
    weight: total > 0 ? (h.currentValue / total) * 100 : 0,
  }));

  const active = pieData.find(d => d.id === activeId) ?? null;

  // Center label rendered as SVG text anchored at the donut's exact geometric
  // center (centerX/centerY). textAnchor="middle" guarantees perfect horizontal
  // centering regardless of legend width or SVG scaling.
  const CenterLayer = ({ centerX, centerY }: { centerX: number; centerY: number }) => {
    const cx = centerX;
    if (active) {
      const changeColor = active.dayChangePercent >= 0 ? '#34d399' : '#f87171';
      const hasSector = Boolean(active.sector);
      const symbolY = hasSector ? centerY - 30 : centerY - 24;
      return (
        <g key={active.id} style={{ pointerEvents: 'none' }} className="alloc-center-fade">
          <text x={cx} y={symbolY} textAnchor="middle" fill="#ffffff" fontSize={14} fontWeight={700} letterSpacing={0.5}>
            {active.label}
          </text>
          {hasSector && (
            <text x={cx} y={centerY - 16} textAnchor="middle" fill="#fbbf24" fontSize={9} fontWeight={500}>
              {active.sector}
            </text>
          )}
          <text x={cx} y={centerY + 8} textAnchor="middle" fill="#ffffff" fontSize={26} fontWeight={800}>
            {active.weight.toFixed(1)}%
          </text>
          <text x={cx} y={centerY + 26} textAnchor="middle" fill={changeColor} fontSize={12} fontWeight={600}>
            {active.dayChangePercent >= 0 ? '+' : ''}
            {active.dayChangePercent.toFixed(2)}%
          </text>
          {!privacyMode && (
            <text x={cx} y={centerY + 42} textAnchor="middle" fill="#9ca3af" fontSize={10} fontFamily="monospace">
              ₹{active.formattedValue}
            </text>
          )}
        </g>
      );
    }
    return (
      <g key="__summary" style={{ pointerEvents: 'none' }} className="alloc-center-fade">
        <text x={cx} y={centerY - 6} textAnchor="middle" fill="#ffffff" fontSize={32} fontWeight={800}>
          {holdings.length}
        </text>
        <text x={cx} y={centerY + 14} textAnchor="middle" fill="#9ca3af" fontSize={10} fontWeight={600} letterSpacing={3}>
          HOLDINGS
        </text>
        {!privacyMode && (
          <text x={cx} y={centerY + 34} textAnchor="middle" fill="#d1d5db" fontSize={12} fontFamily="monospace">
            ₹{formatNumber(total, 0, 0)}
          </text>
        )}
      </g>
    );
  };

  return (
    <motion.div
      className="flex h-full w-full items-stretch gap-2 px-2 pb-2"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
    >
      {/* Donut */}
      <div className="relative flex-1 min-w-0">
        <ResponsivePie
          data={pieData}
          margin={{ top: 12, right: 12, bottom: 12, left: 12 }}
          innerRadius={0.66}
          padAngle={0.7}
          cornerRadius={3}
          activeId={activeId}
          onActiveIdChange={(id) => setActiveId(id as string | null)}
          activeInnerRadiusOffset={7}
          activeOuterRadiusOffset={16}
          colors={{ datum: 'data.color' }}
          borderWidth={1.5}
          borderColor={{ from: 'color', modifiers: [['darker', 0.6]] }}
          enableArcLabels={false}
          enableArcLinkLabels={false}
          animate
          motionConfig="gentle"
          transitionMode="pushIn"
          isInteractive
          onMouseEnter={(datum) => setActiveId(datum.id as string)}
          onMouseLeave={() => setActiveId(null)}
          onClick={(datum) => onSelect(datum.id as string)}
          theme={{
            text: { fontSize: isMobile ? 8 : 10 },
            tooltip: { container: { background: 'transparent', padding: 0, boxShadow: 'none' } },
          }}
          tooltip={() => null}
          layers={['arcs', CenterLayer]}
        />
      </div>

      {/* Legend — every holding, scrollable */}
      {!isMobile && (
        <div className="w-[190px] shrink-0 overflow-y-auto custom-scrollbar pr-1">
          <div className="flex flex-col gap-0.5">
            {pieData.map((d, i) => {
              const isActive = d.id === activeId;
              return (
                <motion.button
                  key={d.id}
                  type="button"
                  ref={(el: HTMLButtonElement | null) => {
                    if (el) legendRefs.current.set(d.id, el);
                    else legendRefs.current.delete(d.id);
                  }}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.25, delay: Math.min(i * 0.012, 0.4) }}
                  onMouseEnter={() => setActiveId(d.id)}
                  onMouseLeave={() => setActiveId(null)}
                  onClick={() => onSelect(d.id)}
                  className={`group flex items-center gap-2 rounded-md px-2 py-1 text-left transition-colors ${
                    isActive ? 'bg-slate-700/60' : 'hover:bg-slate-800/60'
                  }`}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-[3px] ring-1 ring-black/30 transition-transform group-hover:scale-125"
                    style={{ background: d.color }}
                  />
                  <span className="flex-1 min-w-0 truncate text-[11px] font-medium text-gray-200">{d.label}</span>
                  <span className="shrink-0 text-[10px] font-semibold text-gray-400 tabular-nums">{d.weight.toFixed(1)}%</span>
                  <span
                    className={`shrink-0 w-11 text-right text-[10px] font-semibold tabular-nums ${
                      d.dayChangePercent >= 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {d.dayChangePercent >= 0 ? '+' : ''}
                    {d.dayChangePercent.toFixed(1)}%
                  </span>
                </motion.button>
              );
            })}
          </div>
        </div>
      )}
    </motion.div>
  );
}

/** Diverging day-change bars: gainers extend right (green), losers left (red). */
function BarsView({
  holdings,
  privacyMode,
  onSelect,
}: {
  holdings: PortfolioHoldingItem[];
  privacyMode: boolean;
  onSelect: (symbol: string) => void;
}) {
  const sorted = [...holdings].sort((a, b) => b.dayChangePercent - a.dayChangePercent);
  const maxAbs = Math.max(...sorted.map(h => Math.abs(h.dayChangePercent)), 0.01);

  return (
    <div className="h-full overflow-y-auto px-4 pb-3 custom-scrollbar">
      <div className="flex flex-col gap-1">
        {sorted.map(h => {
          const pct = h.dayChangePercent;
          const isPositive = pct >= 0;
          const width = (Math.abs(pct) / maxAbs) * 48; // % of half-track (leave headroom)
          const barColor = isPositive ? '#10b981' : '#ef4444';
          return (
            <button
              key={h.symbol}
              type="button"
              onClick={() => onSelect(h.symbol)}
              className="group flex items-center gap-2 h-6 w-full text-left cursor-pointer rounded hover:bg-slate-800/50 transition-colors"
            >
              <span className="w-20 shrink-0 text-[11px] font-semibold text-gray-200 truncate">{h.symbol}</span>

              <div className="relative flex-1 h-4">
                {/* center axis */}
                <div className="absolute inset-y-0 left-1/2 w-px bg-white/15" />
                {/* diverging bar */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 h-3 rounded-sm transition-[width]"
                  style={{
                    background: barColor,
                    width: `${width}%`,
                    ...(isPositive ? { left: '50%' } : { right: '50%' }),
                  }}
                />
              </div>

              <span
                className={`w-16 shrink-0 text-right text-[11px] font-bold tabular-nums ${
                  isPositive ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {isPositive ? '+' : ''}
                {pct.toFixed(2)}%
              </span>
              <span className="w-14 shrink-0 text-right text-[10px] font-mono text-gray-500 hidden sm:inline">
                {privacyMode ? '****' : `₹${h.formattedValue}`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
