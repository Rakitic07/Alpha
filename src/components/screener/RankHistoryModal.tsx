'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { getRankHistory } from '@/app/actions/screener';

interface RankHistoryModalProps {
  symbol: string;
  companyName: string;
  rankType: 'filtered' | 'all';
  onClose: () => void;
}

type HistoryEntry = { date: string; rank: number; compositeScore: number };

type ChartPoint = {
  dateStr: string;
  rank: number;
  rankGood: number | null;  // rank when ≤ 50, else null
  rankBad:  number | null;  // rank when > 50, else null
  dataLength: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtShort(s: string) {
  try { return format(parseISO(s), 'd MMM'); } catch { return s; }
}
function fmtFull(s: string) {
  try { return format(parseISO(s), 'd MMM yyyy'); } catch { return s; }
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RankTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  // rank comes from the main 'rank' line payload
  const entry = payload.find((p: { dataKey: string }) => p.dataKey === 'rank');
  const rank  = entry?.value as number | undefined;
  if (rank == null) return null;
  const top50 = rank <= 50;
  return (
    <div className="bg-[#0c1220]/98 border border-white/10 rounded-xl px-4 py-3.5 shadow-2xl backdrop-blur-md min-w-[140px]">
      <p className="text-[11px] text-gray-400 mb-2.5 font-medium">{fmtFull(label)}</p>
      <span className={`text-4xl font-black tabular-nums leading-none ${top50 ? 'text-emerald-400' : 'text-rose-400'}`}>
        #{rank}
      </span>
      <p className={`text-[10px] font-semibold mt-2 ${top50 ? 'text-emerald-500/80' : 'text-rose-500/80'}`}>
        {top50 ? `✓ In Top 50 · ${50 - rank} above cutoff` : `✗ Outside Top 50 · ${rank - 50} below cutoff`}
      </p>
    </div>
  );
};

// ── Custom Dot ────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RankDot = (props: any) => {
  const { cx, cy, payload, index, dataLength } = props;
  if (cx == null || cy == null) return null;
  const top50  = payload.rank <= 50;
  const color  = top50 ? '#22c55e' : '#f43f5e';
  const isLast = index === dataLength - 1;
  if (isLast) {
    return (
      <g key="last-dot">
        <circle cx={cx} cy={cy} r={16} fill={color} fillOpacity={0.08} />
        <circle cx={cx} cy={cy} r={8}  fill={color} fillOpacity={0.15} />
        <circle cx={cx} cy={cy} r={4.5} fill={color} stroke="rgba(255,255,255,0.35)" strokeWidth={1.5} />
        <text x={cx} y={cy - 20} textAnchor="middle" fontSize={11} fontWeight="800" fill={color} letterSpacing="-0.3">
          #{payload.rank}
        </text>
      </g>
    );
  }
  return <circle key={`dot-${index}`} cx={cx} cy={cy} r={2.5} fill={color} fillOpacity={0.7} />;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RankActiveDot = (props: any) => {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null) return null;
  const color = payload.rank <= 50 ? '#22c55e' : '#f43f5e';
  return (
    <g key="active-dot">
      <circle cx={cx} cy={cy} r={14} fill={color} fillOpacity={0.12} />
      <circle cx={cx} cy={cy} r={6}  fill={color} stroke="#fff" strokeWidth={2} />
    </g>
  );
};

// ── Stat Card ─────────────────────────────────────────────────────────────────

function Stat({
  label, value, sub, color = 'text-gray-100',
}: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="flex-1 min-w-0 bg-slate-800/40 border border-white/[0.07] rounded-2xl px-4 py-4 flex flex-col gap-1">
      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">{label}</span>
      <span className={`text-2xl font-black tabular-nums leading-tight ${color}`}>{value}</span>
      {sub && <span className="text-[10px] text-gray-500">{sub}</span>}
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export default function RankHistoryModal({
  symbol, companyName, rankType, onClose,
}: RankHistoryModalProps) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    getRankHistory(symbol, rankType)
      .then(data => { if (!cancelled) { setHistory(data); setLoading(false); } })
      .catch(err => { if (!cancelled) { setError((err as Error).message ?? 'Error'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [symbol, rankType]);

  // ── Derived stats ─────────────────────────────────────────────────────────
  const ranks     = history.map(d => d.rank);
  const current   = ranks.at(-1) ?? null;
  const best      = ranks.length ? Math.min(...ranks) : null;
  const avgRank   = ranks.length ? ranks.reduce((a, b) => a + b, 0) / ranks.length : null;
  const top50Days = ranks.filter(r => r <= 50).length;
  const top50Pct  = ranks.length ? Math.round((top50Days / ranks.length) * 100) : 0;
  const maxRank   = ranks.length ? Math.max(...ranks) + 15 : 120;

  // Trend: compare avg of last 7 vs avg of first 7
  const n = Math.min(ranks.length, 7);
  const earlyAvg  = n > 0 ? ranks.slice(0, n).reduce((a, b) => a + b, 0) / n : null;
  const recentAvg = n > 0 ? ranks.slice(-n).reduce((a, b) => a + b, 0) / n : null;
  const trend = earlyAvg !== null && recentAvg !== null
    ? earlyAvg - recentAvg > 2 ? 'improving' : recentAvg - earlyAvg > 2 ? 'worsening' : 'stable'
    : null;

  // Chart data — split rank into good/bad for two-tone fill
  const chartData: ChartPoint[] = history.map(d => ({
    dateStr:    d.date,
    rank:       d.rank,
    rankGood:   d.rank <= 50 ? d.rank : null,
    rankBad:    d.rank >  50 ? d.rank : null,
    dataLength: history.length,
  }));

  const isTop50Now = current !== null && current <= 50;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1,    y: 0  }}
          exit={{    opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="relative w-full max-w-4xl bg-[#0c1220] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          <div className="p-7 flex flex-col gap-6">

            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2 className="text-2xl font-black text-white tracking-tight">{symbol}</h2>

                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/25">
                    {rankType === 'filtered' ? 'Pre-filtered' : 'All stocks'}
                  </span>

                  {trend && (
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                      trend === 'improving'
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
                        : trend === 'worsening'
                        ? 'bg-rose-500/15 text-rose-400 border-rose-500/25'
                        : 'bg-zinc-500/15 text-zinc-400 border-zinc-500/20'
                    }`}>
                      {trend === 'improving' ? '↑ Improving' : trend === 'worsening' ? '↓ Worsening' : '→ Stable'}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-400 mt-1.5">{companyName}</p>
              </div>

              <button
                onClick={onClose}
                className="p-2 text-gray-500 hover:text-white rounded-xl hover:bg-white/8 transition-colors shrink-0"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* ── Body ──────────────────────────────────────────────────────── */}
            {loading ? (
              <div className="h-[460px] flex flex-col items-center justify-center gap-3">
                <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-gray-500">Loading history…</p>
              </div>
            ) : error ? (
              <div className="h-[460px] flex items-center justify-center">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            ) : history.length === 0 ? (
              <div className="h-[460px] flex items-center justify-center">
                <p className="text-sm text-gray-500">No ranking history found for {symbol}.</p>
              </div>
            ) : (
              <>
                {/* ── Chart container ─────────────────────────────────────── */}
                <div className="bg-slate-800/20 border border-white/[0.05] rounded-2xl px-4 pt-5 pb-3">

                  {/* Chart legend */}
                  <div className="flex items-center justify-between mb-4 px-1">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
                      Rank History · {ranks.length} days
                    </p>
                    <div className="flex items-center gap-5 text-[10px]">
                      <span className="flex items-center gap-1.5 text-emerald-400/70">
                        <span className="w-3 h-3 rounded-sm inline-block bg-emerald-500/20 border border-emerald-500/30" />
                        Top 50 zone
                      </span>
                      <span className="flex items-center gap-1.5 text-rose-400/70">
                        <span className="w-3 h-3 rounded-sm inline-block bg-rose-500/15 border border-rose-500/25" />
                        Outside Top 50
                      </span>
                      <span className="flex items-center gap-1.5 text-amber-400/60">
                        <span className="inline-block w-5 border-t border-dashed border-amber-400/50" />
                        Rank 50
                      </span>
                    </div>
                  </div>

                  {/* Chart */}
                  <div className="h-[360px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={chartData}
                        margin={{ top: 24, right: 24, left: 0, bottom: 4 }}
                      >
                        <defs>
                          {/* Green gradient: fills downward from rank line to rank-50 baseline */}
                          <linearGradient id="rhGreenGrad" x1="0" y1="1" x2="0" y2="0">
                            <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.05} />
                            <stop offset="95%" stopColor="#22c55e" stopOpacity={0.28} />
                          </linearGradient>
                          {/* Red gradient: fills upward from rank-50 baseline to rank line */}
                          <linearGradient id="rhRedGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor="#f43f5e" stopOpacity={0.05} />
                            <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.25} />
                          </linearGradient>
                        </defs>

                        {/* Background: green zone (top 50) */}
                        <ReferenceArea
                          y1={1} y2={50}
                          fill="rgba(34,197,94,0.06)"
                          stroke="none"
                          ifOverflow="visible"
                        />
                        {/* Background: red zone (outside top 50) */}
                        <ReferenceArea
                          y1={50} y2={maxRank}
                          fill="rgba(244,63,94,0.05)"
                          stroke="none"
                          ifOverflow="visible"
                        />

                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="rgba(255,255,255,0.04)"
                          vertical={false}
                        />

                        <XAxis
                          dataKey="dateStr"
                          stroke="#1f2937"
                          tick={{ fill: '#4b5563', fontSize: 10 }}
                          tickLine={false}
                          axisLine={{ stroke: '#1f2937' }}
                          tickFormatter={fmtShort}
                          interval={Math.max(1, Math.floor(chartData.length / 8))}
                        />
                        <YAxis
                          reversed
                          domain={[1, maxRank]}
                          stroke="#1f2937"
                          tick={{ fill: '#4b5563', fontSize: 10 }}
                          tickLine={false}
                          axisLine={{ stroke: '#1f2937' }}
                          tickFormatter={v => `#${v}`}
                          width={40}
                          allowDataOverflow
                        />

                        <Tooltip
                          content={<RankTooltip />}
                          cursor={{ stroke: 'rgba(255,255,255,0.06)', strokeWidth: 1 }}
                        />

                        {/* Rank-50 threshold line */}
                        <ReferenceLine
                          y={50}
                          stroke="#f59e0b"
                          strokeDasharray="6 4"
                          strokeWidth={1.5}
                          strokeOpacity={0.5}
                        />

                        {/* Best rank reference (only if top-50 and distinct) */}
                        {best && best <= 50 && best !== current && best > 1 && (
                          <ReferenceLine
                            y={best}
                            stroke="#22c55e"
                            strokeDasharray="3 4"
                            strokeWidth={1}
                            strokeOpacity={0.35}
                            label={{
                              value: `Best #${best}`,
                              position: 'insideTopRight',
                              fill: '#22c55e',
                              fontSize: 9,
                              opacity: 0.6,
                            }}
                          />
                        )}

                        {/* Green fill — rank ≤ 50 zone, baseValue=50 draws up to threshold */}
                        <Area
                          type="monotone"
                          dataKey="rankGood"
                          baseValue={50}
                          stroke="transparent"
                          fill="url(#rhGreenGrad)"
                          fillOpacity={1}
                          connectNulls={false}
                          isAnimationActive={false}
                          dot={false}
                          activeDot={false}
                          legendType="none"
                        />

                        {/* Red fill — rank > 50 zone, baseValue=50 draws down from threshold */}
                        <Area
                          type="monotone"
                          dataKey="rankBad"
                          baseValue={50}
                          stroke="transparent"
                          fill="url(#rhRedGrad)"
                          fillOpacity={1}
                          connectNulls={false}
                          isAnimationActive={false}
                          dot={false}
                          activeDot={false}
                          legendType="none"
                        />

                        {/* Main rank line */}
                        <Line
                          type="monotone"
                          dataKey="rank"
                          stroke={isTop50Now ? '#6366f1' : '#6366f1'}
                          strokeWidth={2.5}
                          dot={(props: any) => (  // eslint-disable-line @typescript-eslint/no-explicit-any
                            <RankDot {...props} dataLength={chartData.length} />
                          )}
                          activeDot={<RankActiveDot />}
                          isAnimationActive
                          animationDuration={700}
                          animationEasing="ease-out"
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* ── Stats row ────────────────────────────────────────────── */}
                <div className="flex gap-3">
                  <Stat
                    label="Current"
                    value={current !== null ? `#${current}` : '—'}
                    color={isTop50Now ? 'text-emerald-400' : 'text-rose-400'}
                    sub={isTop50Now ? '✓ Top 50' : '✗ Outside 50'}
                  />
                  <Stat
                    label="Best Ever"
                    value={best !== null ? `#${best}` : '—'}
                    color="text-emerald-400"
                  />
                  <Stat
                    label="Avg Rank"
                    value={avgRank !== null ? `#${avgRank.toFixed(1)}` : '—'}
                    color={
                      avgRank !== null && avgRank <= 50 ? 'text-emerald-400'
                      : avgRank !== null && avgRank <= 75 ? 'text-amber-400'
                      : 'text-rose-400'
                    }
                  />
                  <Stat
                    label="In Top 50"
                    value={`${top50Days}d`}
                    sub={`${top50Pct}% of ${ranks.length} days`}
                    color={top50Pct >= 70 ? 'text-emerald-400' : top50Pct >= 40 ? 'text-amber-400' : 'text-rose-400'}
                  />
                </div>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
