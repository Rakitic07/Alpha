'use client';

import { memo, useMemo } from 'react';
import { ResponsiveTreeMap } from '@nivo/treemap';
import { motion } from 'framer-motion';

interface MarketHeatmapProps {
  constituents: Array<{
    symbol: string;
    lastPrice: number;
    changePercent: number;
    volume: number;
    weight: number;
  }>;
  isMobile: boolean;
  // Index stats — integrated into the card header
  indexName?: string;
  indexValue?: number;
  indexChangePercent?: number;
  advancing?: number;
  declining?: number;
  unchanged?: number;
  loading?: boolean;
}

export default memo(function MarketHeatmap({
  constituents,
  isMobile,
  indexName,
  indexValue,
  indexChangePercent,
  advancing,
  declining,
  unchanged,
  loading,
}: MarketHeatmapProps) {
  if (!constituents || constituents.length === 0) return null;

  const count = constituents.length;

  // Dynamic height: scale up for indices with many constituents
  const height = useMemo(() => {
    if (isMobile) return count > 100 ? 500 : 350;
    if (count > 200) return 700;
    if (count > 100) return 600;
    return 500;
  }, [count, isMobile]);

  const treeData = useMemo(() => ({
    name: 'Market',
    color: 'transparent',
    children: constituents.map(c => ({
      name: c.symbol,
      value: Math.max(c.weight, 0.01),
      changePercent: c.changePercent,
      lastPrice: c.lastPrice,
    })),
  }), [constituents]);

  const hasIndexStats = indexName !== undefined;
  const total = (advancing ?? 0) + (declining ?? 0) + (unchanged ?? 0);
  const advPct = total > 0 ? ((advancing ?? 0) / total) * 100 : 0;
  const decPct = total > 0 ? ((declining ?? 0) / total) * 100 : 0;
  const unchPct = total > 0 ? ((unchanged ?? 0) / total) * 100 : 0;
  const isPositive = (indexChangePercent ?? 0) >= 0;

  return (
    <div className="bg-slate-900/50 rounded-2xl border border-white/5 p-1 flex flex-col" style={{ height }}>
      <div className="px-4 pt-4 pb-3 shrink-0">
        {hasIndexStats ? (
          /* Integrated index stats header */
          <div className="flex items-center justify-between gap-4 flex-wrap">
            {/* Left: name + value + change */}
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider truncate">
                  {indexName}
                </span>
                {loading && (
                  <span className="w-2.5 h-2.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />
                )}
              </div>
              {(indexValue ?? 0) > 0 && (
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-lg font-bold text-gray-100 tabular-nums">
                    {(indexValue ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </span>
                  <span className={`text-sm font-bold tabular-nums ${isPositive ? 'text-emerald-400' : 'text-rose-500'}`}>
                    {isPositive ? '+' : ''}{(indexChangePercent ?? 0).toFixed(2)}%
                  </span>
                </div>
              )}
            </div>
            {/* Right: Advance / Decline bar */}
            {total > 0 && (
              <div className="flex flex-col gap-1.5 shrink-0 min-w-[200px] max-w-[340px] flex-1">
                <div className="flex justify-between items-end px-0.5 font-mono tracking-tight">
                  <span className="text-sm font-bold text-emerald-400">{advancing}</span>
                  <span className="text-sm font-bold text-rose-500">{declining}</span>
                </div>
                <div className="relative h-2.5 w-full rounded-full overflow-hidden flex bg-slate-800 shadow-inner">
                  <motion.div
                    className="h-full bg-emerald-400"
                    initial={{ width: 0 }}
                    animate={{ width: `${advPct}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                  />
                  {unchPct > 0 && (
                    <motion.div
                      className="h-full bg-slate-600/80"
                      initial={{ width: 0 }}
                      animate={{ width: `${unchPct}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 }}
                    />
                  )}
                  <motion.div
                    className="h-full bg-rose-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${decPct}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Fallback: plain label */
          <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider">Market Heatmap</h3>
        )}
      </div>
      <div className="flex-1 w-full min-h-0" style={{ color: '#000' }}>
        <ResponsiveTreeMap
          data={treeData}
          identity="name"
          value="value"
          margin={{ top: 0, right: 4, bottom: 4, left: 4 }}
          labelSkipSize={isMobile ? 40 : 28}
          innerPadding={count > 100 ? 1 : 2}
          outerPadding={count > 100 ? 1 : 2}
          colors={(node) => {
            const d = node.data as { changePercent?: number };
            const p = d.changePercent;
            if (p === undefined) return 'rgba(0,0,0,0)';
            if (p >= 10) return '#059669';
            if (p >= 5) return '#10b981';
            if (p >= 3) return '#34d399';
            if (p >= 1.5) return '#6ee7b7';
            if (p > 0) return '#d1fae5';
            if (p === 0) return '#64748b';
            if (p > -1.5) return '#fee2e2';
            if (p > -3) return '#fca5a5';
            if (p > -5) return '#f87171';
            if (p > -10) return '#ef4444';
            return '#b91c1c';
          }}
          nodeOpacity={1}
          nodeComponent={({ node }) => {
            const d = node.data as { changePercent?: number; lastPrice?: number };
            const percent = d.changePercent;
            if (percent === undefined) return null;

            let textColor = '#ffffff';
            if (percent > 0 && percent < 5) textColor = '#0f172a';
            if (percent < 0 && percent > -5) textColor = '#0f172a';

            const shadow = textColor === '#ffffff' ? 'drop-shadow(0px 1px 2px rgba(0,0,0,0.6))' : 'none';

            // Show conditions — based on tile area
            const area = node.width * node.height;
            const showSymbol = area > 2500 && node.width > 30 && node.height > 18;
            const showPercent = area > 5000 && node.width > 42 && node.height > 34;

            // Font sizing — character width ~0.6x font size for sans-serif
            const symbolLen = (node.id || '').length;
            const CHAR_RATIO = 0.6;
            // Max font where text fits horizontally (with 82% width budget)
            const maxByWidth = (node.width * 0.82) / Math.max(symbolLen * CHAR_RATIO, 1);
            // Max font where text fits vertically (tighter when showing two lines)
            const maxByHeight = showPercent ? node.height * 0.28 : node.height * 0.42;
            // Scale naturally — no hard pixel cap so large tiles get large text
            const maxSize = isMobile ? 11 : 16;
            const fontSize = Math.min(Math.max(Math.min(maxByWidth, maxByHeight), 5), maxSize);
            const percentFontSize = Math.min(fontSize * 0.82, maxSize * 0.82);

            // Absolute Y positions — more reliable than dy offsets
            const cx = node.width / 2;
            const cy = node.height / 2;
            const symbolY = showPercent ? cy - fontSize * 0.55 : cy;
            const percentY = cy + percentFontSize * 0.9;

            return (
              <g
                style={{ cursor: 'default' }}
                transform={`translate(${node.x},${node.y})`}
                onMouseEnter={node.onMouseEnter}
                onMouseMove={node.onMouseMove}
                onMouseLeave={node.onMouseLeave}
              >
                <rect
                  width={node.width}
                  height={node.height}
                  fill={node.color}
                  stroke="#0f172a"
                  strokeWidth={count > 100 ? 1 : 2}
                  rx={count > 100 ? 1 : 3}
                  ry={count > 100 ? 1 : 3}
                />
                {showSymbol && (
                  <>
                    <text
                      x={cx}
                      y={symbolY}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={fontSize}
                      fontWeight="700"
                      fill={textColor}
                      style={{ pointerEvents: 'none', filter: shadow }}
                    >
                      {node.id}
                    </text>
                    {showPercent && typeof percent === 'number' && (
                      <text
                        x={cx}
                        y={percentY}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={percentFontSize}
                        fontWeight="600"
                        fill={textColor}
                        fillOpacity={textColor === '#ffffff' ? 0.9 : 0.8}
                        style={{ pointerEvents: 'none', filter: shadow }}
                      >
                        {percent > 0 ? '+' : ''}{percent.toFixed(1)}%
                      </text>
                    )}
                  </>
                )}
              </g>
            );
          }}
          enableLabel={false}
          theme={{
            tooltip: {
              container: { background: 'transparent', color: '#fff', padding: 0, borderRadius: '8px', boxShadow: 'none' },
            },
          }}
          tooltip={({ node }) => {
            const d = (node.data as unknown) as { changePercent: number; lastPrice: number };
            const isPositive = d.changePercent >= 0;
            return (
              <div className="backdrop-blur-md bg-slate-900/90 border border-white/10 p-3 rounded-xl shadow-2xl min-w-[140px]">
                <div className="font-bold text-white text-sm tracking-wide mb-1">{node.id}</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-gray-400 text-xs">₹{d.lastPrice?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                  <span className={`text-sm font-bold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                    {isPositive ? '+' : ''}{d.changePercent?.toFixed(2)}%
                  </span>
                </div>
              </div>
            );
          }}
        />
      </div>
    </div>
  );
});

