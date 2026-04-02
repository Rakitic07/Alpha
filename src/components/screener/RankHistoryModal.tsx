'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getRankHistory } from '@/app/actions/screener';

interface RankHistoryModalProps {
  symbol: string;
  companyName: string;
  rankType: 'filtered' | 'all';
  onClose: () => void;
}

type HistoryEntry = { date: string; rank: number; compositeScore: number };

// ── Chart ──────────────────────────────────────────────────────────────────

function RankChart({ data }: { data: HistoryEntry[] }) {
  if (data.length === 0) return null;

  const width = 380;
  const height = 180;
  const padding = { top: 20, right: 20, bottom: 30, left: 40 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const ranks = data.map(d => d.rank);
  const minRank = 1;
  const maxRank = Math.max(...ranks, 50) + 10;

  const xScale = (i: number) =>
    data.length === 1
      ? padding.left + plotW / 2
      : padding.left + (i / (data.length - 1)) * plotW;

  // Inverted: rank 1 maps to top (padding.top), higher ranks map downward
  const yScale = (rank: number) =>
    padding.top + ((rank - minRank) / (maxRank - minRank)) * plotH;

  const points = data.map((d, i) => ({ x: xScale(i), y: yScale(d.rank) }));
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');

  const rank50Y = yScale(50);
  const firstDate = formatDateShort(data[0].date);
  const lastDate = formatDateShort(data[data.length - 1].date);

  // Y-axis tick values
  const yTicks = [1, 25, 50, maxRank - 10];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      style={{ display: 'block' }}
      aria-label={`Rank history chart`}
    >
      <defs>
        <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#818cf8" />
        </linearGradient>
        <linearGradient id="areaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0.01" />
        </linearGradient>
      </defs>

      {/* Grid lines */}
      {yTicks.map(tick => {
        const y = yScale(tick);
        if (y < padding.top || y > padding.top + plotH) return null;
        return (
          <line
            key={tick}
            x1={padding.left}
            x2={padding.left + plotW}
            y1={y}
            y2={y}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={1}
          />
        );
      })}

      {/* Rank-50 reference line */}
      {rank50Y >= padding.top && rank50Y <= padding.top + plotH && (
        <line
          x1={padding.left}
          x2={padding.left + plotW}
          y1={rank50Y}
          y2={rank50Y}
          stroke="#f59e0b"
          strokeWidth={1}
          strokeDasharray="4 3"
          opacity={0.6}
        />
      )}

      {/* Area fill */}
      {points.length > 1 && (
        <path
          d={`${pathD} L ${points[points.length - 1].x.toFixed(2)} ${(padding.top + plotH).toFixed(2)} L ${points[0].x.toFixed(2)} ${(padding.top + plotH).toFixed(2)} Z`}
          fill="url(#areaGrad)"
        />
      )}

      {/* Main line */}
      {points.length > 1 && (
        <path
          d={pathD}
          fill="none"
          stroke="url(#lineGrad)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}

      {/* Dots */}
      {points.map((p, i) => {
        const isLast = i === points.length - 1;
        return (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={isLast ? 4.5 : 2.5}
            fill={isLast ? '#818cf8' : '#6366f1'}
            stroke={isLast ? 'rgba(129,140,248,0.35)' : 'none'}
            strokeWidth={isLast ? 4 : 0}
          />
        );
      })}

      {/* Y-axis labels */}
      {yTicks.map(tick => {
        const y = yScale(tick);
        if (y < padding.top - 2 || y > padding.top + plotH + 2) return null;
        return (
          <text
            key={tick}
            x={padding.left - 6}
            y={y + 4}
            textAnchor="end"
            fontSize={9}
            fill="rgba(156,163,175,0.8)"
          >
            {tick}
          </text>
        );
      })}

      {/* X-axis labels */}
      <text
        x={padding.left}
        y={height - 4}
        textAnchor="middle"
        fontSize={9}
        fill="rgba(156,163,175,0.7)"
      >
        {firstDate}
      </text>
      {data.length > 1 && (
        <text
          x={padding.left + plotW}
          y={height - 4}
          textAnchor="middle"
          fontSize={9}
          fill="rgba(156,163,175,0.7)"
        >
          {lastDate}
        </text>
      )}

      {/* Rank-50 label */}
      {rank50Y >= padding.top && rank50Y <= padding.top + plotH && (
        <text
          x={padding.left + plotW + 2}
          y={rank50Y + 3}
          fontSize={8}
          fill="rgba(245,158,11,0.7)"
        >
          50
        </text>
      )}
    </svg>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDateShort(dateStr: string): string {
  // dateStr may be a full ISO string or YYYY-MM-DD
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// ── Stat Card ──────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex-1 min-w-0 bg-slate-800/60 border border-white/8 rounded-xl px-3 py-2.5 flex flex-col gap-0.5">
      <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wide truncate">{label}</span>
      <span className="text-sm font-semibold text-gray-100 tabular-nums">{value}</span>
    </div>
  );
}

// ── Modal ──────────────────────────────────────────────────────────────────

export default function RankHistoryModal({
  symbol,
  companyName,
  rankType,
  onClose,
}: RankHistoryModalProps) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getRankHistory(symbol, rankType)
      .then(data => {
        if (!cancelled) {
          setHistory(data);
          setLoading(false);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError((err as Error).message ?? 'Failed to load history');
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [symbol, rankType]);

  // Derived stats
  const ranks = history.map(d => d.rank);
  const currentRank = ranks.length > 0 ? ranks[ranks.length - 1] : null;
  const bestRank = ranks.length > 0 ? Math.min(...ranks) : null;
  const appearances = ranks.length;
  const avgRank = ranks.length > 0
    ? (ranks.reduce((a, b) => a + b, 0) / ranks.length).toFixed(1)
    : '—';

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />

        {/* Panel */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-md bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          <div className="p-6 flex flex-col gap-5">

            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-white truncate">{symbol}</h2>
                  <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    {rankType === 'filtered' ? 'Filtered' : 'All'}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5 truncate">{companyName}</p>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors shrink-0"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-gray-500">Loading history…</p>
              </div>
            ) : error ? (
              <div className="flex items-center justify-center py-10">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            ) : history.length === 0 ? (
              <div className="flex items-center justify-center py-10">
                <p className="text-sm text-gray-500">No ranking history found for {symbol}.</p>
              </div>
            ) : (
              <>
                {/* Chart */}
                <div className="bg-slate-800/30 border border-white/5 rounded-xl p-3">
                  <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-2">
                    50-Day Rank History
                  </p>
                  <RankChart data={history} />
                  <div className="flex items-center gap-3 mt-2">
                    <span className="flex items-center gap-1.5 text-[10px] text-amber-400/80">
                      <span className="inline-block w-4 border-t border-dashed border-amber-400/70" />
                      Rank 50
                    </span>
                    <span className="flex items-center gap-1.5 text-[10px] text-indigo-400/80">
                      <span className="inline-block w-4 border-t-2 border-indigo-400" />
                      Your rank
                    </span>
                  </div>
                </div>

                {/* Stats */}
                <div className="flex gap-2">
                  <StatCard label="Current" value={currentRank !== null ? `#${currentRank}` : '—'} />
                  <StatCard label="Best" value={bestRank !== null ? `#${bestRank}` : '—'} />
                  <StatCard label="Days" value={appearances} />
                  <StatCard label="Avg Rank" value={avgRank !== '—' ? `#${avgRank}` : '—'} />
                </div>
              </>
            )}

          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
