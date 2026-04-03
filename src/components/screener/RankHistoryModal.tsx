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
type ChartPoint  = { dateStr: string; rank: number };

// ── Helpers ──────────────────────────────────────────────────────────────────

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
  const rank = payload[0]?.value as number | undefined;
  if (rank == null) return null;
  const top50 = rank <= 50;
  return (
    <div className="bg-slate-900/95 border border-white/10 rounded-xl px-4 py-3 shadow-2xl backdrop-blur-md min-w-[130px]">
      <p className="text-[11px] text-gray-400 mb-2">{fmtFull(label)}</p>
      <div className="flex items-center gap-2">
        <span className={`text-3xl font-black tabular-nums leading-none ${top50 ? 'text-emerald-400' : 'text-indigo-400'}`}>
          #{rank}
        </span>
      </div>
      <p className={`text-[10px] font-semibold mt-1.5 ${top50 ? 'text-emerald-500' : 'text-slate-500'}`}>
        {top50 ? '✓ In Top 50' : `${rank - 50} below top 50`}
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
  const color  = top50 ? '#22c55e' : '#818cf8';
  const isLast = index === dataLength - 1;
  if (isLast) {
    return (
      <g key="last-dot">
        <circle cx={cx} cy={cy} r={14} fill={color} fillOpacity={0.1} />
        <circle cx={cx} cy={cy} r={5}  fill={color} stroke="rgba(255,255,255,0.3)" strokeWidth={1.5} />
        <text x={cx} y={cy - 14} textAnchor="middle" fontSize={10} fontWeight="700" fill={color}>
          #{payload.rank}
        </text>
      </g>
    );
  }
  return <circle key={`dot-${index}`} cx={cx} cy={cy} r={2.5} fill={color} fillOpacity={0.75} />;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RankActiveDot = (props: any) => {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null) return null;
  const color = payload.rank <= 50 ? '#22c55e' : '#818cf8';
  return (
    <g key="active-dot">
      <circle cx={cx} cy={cy} r={12} fill={color} fillOpacity={0.15} />
      <circle cx={cx} cy={cy} r={5.5} fill={color} stroke="#fff" strokeWidth={2} />
    </g>
  );
};

// ── Stat Card ─────────────────────────────────────────────────────────────────

function Stat({
  label, value, sub, color = 'text-gray-100',
}: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="flex-1 min-w-0 bg-slate-800/50 border border-white/[0.06] rounded-2xl px-4 py-3.5 flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">{label}</span>
      <span className={`text-xl font-black tabular-nums leading-tight ${color}`}>{value}</span>
      {sub && <span className="text-[10px] text-gray-500 mt-0.5">{sub}</span>}
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export default function RankHistoryModal({
  symbol, companyName, rankType, onClose,
}: RankHistoryModalProps) {
  const [history, setHistory]   = useState<HistoryEntry[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error,   setError]     = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    getRankHistory(symbol, rankType)
      .then(data  => { if (!cancelled) { setHistory(data);  setLoading(false); } })
      .catch(err  => { if (!cancelled) { setError((err as Error).message ?? 'Error'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [symbol, rankType]);

  // ── Derived stats ──────────────────────────────────────────────────────────
  const ranks      = history.map(d => d.rank);
  const current    = ranks.at(-1)  ?? null;
  const best       = ranks.length  ? Math.min(...ranks) : null;
  const avgRank    = ranks.length  ? ranks.reduce((a, b) => a + b, 0) / ranks.length : null;
  const top50Days  = ranks.filter(r => r <= 50).length;
  const top50Pct   = ranks.length  ? Math.round((top50Days / ranks.length) * 100) : 0;
  const maxRank    = ranks.length  ? Math.max(...ranks) + 12 : 110;

  // Trend: compare avg of last 7 vs avg of first 7
  const n = Math.min(ranks.length, 7);
  const earlyAvg  = n > 0 ? ranks.slice(0, n).reduce((a, b) => a + b, 0) / n : null;
  const recentAvg = n > 0 ? ranks.slice(-n).reduce((a, b) => a + b, 0) / n : null;
  const trend = earlyAvg !== null && recentAvg !== null
    ? (earlyAvg - recentAvg > 2 ? 'improving' : recentAvg - earlyAvg > 2 ? 'worsening' : 'stable')
    : null;

  // Chart data — inject dataLength so dots know which is last
  const chartData: (ChartPoint & { dataLength: number })[] = history.map((d, i) => ({
    dateStr: d.date,
    rank: d.rank,
    dataLength: history.length,
  }));

  const isTop50Now = current !== null && current <= 50;

  // ── Render ─────────────────────────────────────────────────────────────────
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
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        />

        {/* Panel */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1,    y: 0  }}
          exit={{    opacity: 0, scale: 0.96, y: 16 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative w-full max-w-3xl bg-[#0f1623] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          <div className="p-6 flex flex-col gap-5">

            {/* ── Header ───────────────────────────────────────────────────── */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-2xl font-black text-white tracking-tight">{symbol}</h2>

                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/25">
                    {rankType === 'filtered' ? 'Pre-filtered' : 'All stocks'}
                  </span>

                  {trend && (
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                      trend === 'improving'
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
                        : trend === 'worsening'
                        ? 'bg-red-500/15 text-red-400 border-red-500/25'
                        : 'bg-zinc-500/15 text-zinc-400 border-zinc-500/25'
                    }`}>
                      {trend === 'improving' ? '↑ Improving' : trend === 'worsening' ? '↓ Worsening' : '→ Stable'}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-400 mt-1">{companyName}</p>
              </div>

              <button
                onClick={onClose}
                className="p-1.5 text-gray-500 hover:text-white rounded-lg hover:bg-white/8 transition-colors shrink-0 mt-0.5"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* ── Body ─────────────────────────────────────────────────────── */}
            {loading ? (
              <div className="h-[420px] flex flex-col items-center justify-center gap-3">
                <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-gray-500">Loading history…</p>
              </div>
            ) : error ? (
              <div className="h-[420px] flex items-center justify-center">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            ) : history.length === 0 ? (
              <div className="h-[420px] flex items-center justify-center">
                <p className="text-sm text-gray-500">No ranking history found for {symbol}.</p>
              </div>
            ) : (
              <>
                {/* ── Chart ──────────────────────────────────────────────── */}
                <div className="bg-slate-800/20 border border-white/[0.05] rounded-2xl p-4">

                  {/* Chart header */}
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
                      Rank History · last {ranks.length} days
                    </p>
                    <div className="flex items-center gap-4 text-[10px] text-gray-500">
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block w-4 h-[1px] bg-amber-400/60" style={{ borderTop: '1px dashed #f59e0b' }} />
                        Rank 50
                      </span>
                      {best && best <= 50 && best > 1 && (
                        <span className="flex items-center gap-1.5 text-emerald-500/70">
                          <span className="inline-block w-4 h-[1px]" style={{ borderTop: '1px dashed #22c55e' }} />
                          Best #{best}
                        </span>
                      )}
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block w-4 h-[2px] rounded bg-indigo-400" />
                        Your rank
                      </span>
                    </div>
                  </div>

                  {/* Chart */}
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={chartData}
                        margin={{ top: 16, right: 20, left: -4, bottom: 4 }}
                      >
                        <defs>
                          <linearGradient id="rankAreaGradient" x1="0" y1="1" x2="0" y2="0">
                            <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.22} />
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0.01} />
                          </linearGradient>
                        </defs>

                        {/* Top-50 green background zone */}
                        <ReferenceArea
                          y1={1} y2={50}
                          fill="rgba(34,197,94,0.06)"
                          stroke="none"
                          ifOverflow="visible"
                        />

                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />

                        <XAxis
                          dataKey="dateStr"
                          stroke="#374151"
                          tick={{ fill: '#6b7280', fontSize: 10 }}
                          tickLine={false}
                          axisLine={{ stroke: '#1f2937' }}
                          tickFormatter={fmtShort}
                          interval={Math.max(1, Math.floor(chartData.length / 7))}
                        />
                        <YAxis
                          reversed
                          domain={[1, maxRank]}
                          stroke="#374151"
                          tick={{ fill: '#6b7280', fontSize: 10 }}
                          tickLine={false}
                          axisLine={{ stroke: '#1f2937' }}
                          tickFormatter={v => `#${v}`}
                          width={38}
                          allowDataOverflow
                        />

                        <Tooltip
                          content={<RankTooltip />}
                          cursor={{ stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1 }}
                        />

                        {/* Rank-50 threshold line */}
                        <ReferenceLine
                          y={50}
                          stroke="#f59e0b"
                          strokeDasharray="6 3"
                          strokeWidth={1.2}
                          strokeOpacity={0.55}
                        />

                        {/* Best rank line (if achieved top-50 and different from current) */}
                        {best && best <= 50 && best > 1 && best !== current && (
                          <ReferenceLine
                            y={best}
                            stroke="#22c55e"
                            strokeDasharray="4 3"
                            strokeWidth={1}
                            strokeOpacity={0.4}
                          />
                        )}

                        {/* Area fill */}
                        <Area
                          type="monotone"
                          dataKey="rank"
                          stroke="transparent"
                          fill="url(#rankAreaGradient)"
                          fillOpacity={1}
                          baseValue={maxRank}
                          isAnimationActive={false}
                        />

                        {/* Main rank line */}
                        <Line
                          type="monotone"
                          dataKey="rank"
                          stroke="#6366f1"
                          strokeWidth={2.5}
                          dot={(props: any) => (
                            <RankDot
                              {...props}
                              dataLength={chartData.length}
                            />
                          )}
                          activeDot={<RankActiveDot />}
                          isAnimationActive
                          animationDuration={600}
                          animationEasing="ease-out"
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* ── Stats ──────────────────────────────────────────────── */}
                <div className="flex gap-3">
                  <Stat
                    label="Current"
                    value={current !== null ? `#${current}` : '—'}
                    color={isTop50Now ? 'text-emerald-400' : 'text-indigo-400'}
                    sub={isTop50Now ? 'Top 50 ✓' : undefined}
                  />
                  <Stat
                    label="Best"
                    value={best !== null ? `#${best}` : '—'}
                    color="text-emerald-400"
                  />
                  <Stat
                    label="Avg Rank"
                    value={avgRank !== null ? `#${avgRank.toFixed(1)}` : '—'}
                    color={avgRank !== null && avgRank <= 50 ? 'text-emerald-400' : avgRank !== null && avgRank <= 75 ? 'text-amber-400' : 'text-gray-300'}
                  />
                  <Stat
                    label="In Top 50"
                    value={`${top50Days}d`}
                    sub={`${top50Pct}% of ${ranks.length} days`}
                    color={top50Pct >= 70 ? 'text-emerald-400' : top50Pct >= 40 ? 'text-amber-400' : 'text-gray-300'}
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
