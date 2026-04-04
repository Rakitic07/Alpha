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
  preloadedHistory?: HistoryEntry[];  // skip fetch if provided
}

type HistoryEntry = { date: string; rank: number; compositeScore: number };
type ChartPoint   = { dateStr: string; rank: number; rankAbove: number; rankBelow: number; dataLength: number };

function fmtShort(s: string) {
  try { return format(parseISO(s), 'd MMM'); } catch { return s; }
}
function fmtFull(s: string) {
  try { return format(parseISO(s), 'd MMM yyyy'); } catch { return s; }
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RankTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
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

    </div>
  );
};

// ── Dots ──────────────────────────────────────────────────────────────────────

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
        <circle cx={cx} cy={cy} r={9} fill={color} fillOpacity={0.10}>
          <animate attributeName="r"            values="9;22;9"      dur="2.6s" repeatCount="indefinite" />
          <animate attributeName="fill-opacity" values="0.10;0;0.10" dur="2.6s" repeatCount="indefinite" />
        </circle>
        <circle cx={cx} cy={cy} r={6} fill={color} fillOpacity={0.16}>
          <animate attributeName="r"            values="6;13;6"         dur="2.6s" begin="0.3s" repeatCount="indefinite" />
          <animate attributeName="fill-opacity" values="0.16;0.03;0.16" dur="2.6s" begin="0.3s" repeatCount="indefinite" />
        </circle>
        <circle cx={cx} cy={cy} r={4} fill={color} stroke="rgba(255,255,255,0.4)" strokeWidth={1.2} />
      </g>
    );
  }
  return null;  // only render last dot
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RankActiveDot = (props: any) => {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null) return null;
  const color = payload.rank <= 50 ? '#22c55e' : '#f43f5e';
  return (
    <g key="active-dot">
      <circle cx={cx} cy={cy} r={12} fill={color} fillOpacity={0.14} />
      <circle cx={cx} cy={cy} r={5}  fill={color} stroke="#fff" strokeWidth={1.5} />
    </g>
  );
};

// ── Stat Card ─────────────────────────────────────────────────────────────────

function Stat({
  label, value, sub, color = 'text-gray-100', delay = 0,
}: { label: string; value: string; sub?: string; color?: string; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay, ease: 'easeOut' }}
      className="flex-1 min-w-0 bg-slate-800/40 border border-white/[0.07] rounded-2xl px-4 py-4 flex flex-col gap-1"
    >
      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">{label}</span>
      <span className={`text-2xl font-black tabular-nums leading-tight ${color}`}>{value}</span>
      {sub && <span className="text-[10px] text-gray-500">{sub}</span>}
    </motion.div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export default function RankHistoryModal({
  symbol, companyName, rankType, onClose, preloadedHistory,
}: RankHistoryModalProps) {
  const [history, setHistory] = useState<HistoryEntry[]>(preloadedHistory ?? []);
  const [loading, setLoading] = useState(!preloadedHistory);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (preloadedHistory) return;  // already have data — no fetch needed
    let cancelled = false;
    setLoading(true); setError(null);
    getRankHistory(symbol, rankType)
      .then(data => { if (!cancelled) { setHistory(data); setLoading(false); } })
      .catch(err  => { if (!cancelled) { setError((err as Error).message ?? 'Error'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [symbol, rankType, preloadedHistory]);

  const ranks     = history.map(d => d.rank);
  const current   = ranks.at(-1) ?? null;
  const best      = ranks.length ? Math.min(...ranks) : null;
  const avgRank   = ranks.length ? ranks.reduce((a, b) => a + b, 0) / ranks.length : null;
  const top50Days = ranks.filter(r => r <= 50).length;
  const top50Pct  = ranks.length ? Math.round((top50Days / ranks.length) * 100) : 0;
  const maxRank   = ranks.length ? Math.max(...ranks) + 15 : 120;

  const n = Math.min(ranks.length, 7);
  const earlyAvg  = n > 0 ? ranks.slice(0,  n).reduce((a, b) => a + b, 0) / n : null;
  const recentAvg = n > 0 ? ranks.slice(-n).reduce((a, b) => a + b, 0) / n : null;
  const trend = earlyAvg !== null && recentAvg !== null
    ? earlyAvg - recentAvg > 2 ? 'improving' : recentAvg - earlyAvg > 2 ? 'worsening' : 'stable'
    : null;

  const chartData: ChartPoint[] = history.map(d => ({
    dateStr:    d.date,
    rank:       d.rank,
    rankAbove:  Math.min(d.rank, 50),  // clamped: fills green zone (line→50) only
    rankBelow:  Math.max(d.rank, 50),  // clamped: fills red zone  (50→floor) always
    dataLength: history.length,
  }));

  const isTop50Now = current !== null && current <= 50;

  // ── Gradient split position ────────────────────────────────────────────────
  // Same technique as IntradayPnLChart: calculate where rank-50 falls in the
  // chart domain (0–100%) so the gradient transitions EXACTLY at the dashed line.
  // Domain: reversed, from yDomainMin (top) to maxRank (bottom).
  // In screen space: rank yDomainMin → y=0 (top), rank maxRank → y=1 (bottom).
  const yDomainMin  = -2;  // gives rank #1 dot breathing room at top
  const domainRange = maxRank - yDomainMin;
  // Where rank 50 sits in the 0→1 gradient space
  const gradStop    = Math.round((50 - yDomainMin) / domainRange * 100);
  // baseValue fills from the rank line downward to maxRank (chart floor)
  const fillBase    = maxRank;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
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

            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2 className="text-2xl font-black text-white tracking-tight">{symbol}</h2>
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/25">
                    {rankType === 'filtered' ? 'Pre-filtered' : 'All stocks'}
                  </span>
                  {trend && (
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                      trend === 'improving' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
                      : trend === 'worsening' ? 'bg-rose-500/15 text-rose-400 border-rose-500/25'
                      : 'bg-zinc-500/15 text-zinc-400 border-zinc-500/20'
                    }`}>
                      {trend === 'improving' ? '↑ Improving' : trend === 'worsening' ? '↓ Worsening' : '→ Stable'}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-400 mt-1.5">{companyName}</p>
              </div>
              <button onClick={onClose}
                className="p-2 text-gray-500 hover:text-white rounded-xl hover:bg-white/8 transition-colors shrink-0"
                aria-label="Close">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
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
                {/* Chart */}
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.05, ease: 'easeOut' }}
                  className="h-[380px]"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 40, right: 28, left: 0, bottom: 4 }}>
                      <defs>
                        {/* Stroke gradient: green line above rank-50, red below */}
                        <linearGradient id="rankStroke" x1="0" y1="40" x2="0" y2="376" gradientUnits="userSpaceOnUse">
                          <stop offset="0%"              stopColor="#22c55e" />
                          <stop offset={`${gradStop}%`}  stopColor="#4ade80" />
                          <stop offset={`${gradStop}%`}  stopColor="#fb7185" />
                          <stop offset="100%"            stopColor="#f43f5e" />
                        </linearGradient>
                        {/* Glow (same as stroke but wider) */}
                        <linearGradient id="rankGlow" x1="0" y1="40" x2="0" y2="376" gradientUnits="userSpaceOnUse">
                          <stop offset="0%"              stopColor="#22c55e" stopOpacity={0.18} />
                          <stop offset={`${gradStop}%`}  stopColor="#22c55e" stopOpacity={0.18} />
                          <stop offset={`${gradStop}%`}  stopColor="#f43f5e" stopOpacity={0.18} />
                          <stop offset="100%"            stopColor="#f43f5e" stopOpacity={0.18} />
                        </linearGradient>
                      </defs>

                      <ReferenceArea y1={yDomainMin} y2={50}      fill="rgba(34,197,94,0.03)"  stroke="none" ifOverflow="visible" />
                      <ReferenceArea y1={50}         y2={maxRank} fill="rgba(244,63,94,0.03)"  stroke="none" ifOverflow="visible" />

                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />

                      <XAxis dataKey="dateStr" stroke="#1f2937" tick={{ fill: '#4b5563', fontSize: 10 }}
                        tickLine={false} axisLine={{ stroke: '#1f2937' }} tickFormatter={fmtShort}
                        interval={Math.max(1, Math.floor(chartData.length / 8))} />
                      <YAxis reversed domain={[yDomainMin, maxRank]} stroke="#1f2937"
                        tick={{ fill: '#4b5563', fontSize: 10 }} tickLine={false}
                        axisLine={{ stroke: '#1f2937' }} tickFormatter={v => v > 0 ? `#${v}` : ''}
                        width={40} allowDataOverflow />

                      <Tooltip content={<RankTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.06)', strokeWidth: 1 }} />

                      <ReferenceLine y={50} stroke="#f59e0b" strokeDasharray="6 4" strokeWidth={1.5} strokeOpacity={0.55} />

                      {best && best <= 50 && best !== current && best > 1 && (
                        <ReferenceLine y={best} stroke="#22c55e" strokeDasharray="3 4" strokeWidth={1} strokeOpacity={0.35}
                          label={{ value: `Best #${best}`, position: 'insideTopRight', fill: '#22c55e', fontSize: 9, opacity: 0.6 }} />
                      )}

                      {/* Red fill: rankBelow = max(rank,50), fills from rank-50-floor to chart floor.
                           Clamped at 50 so good stocks always show the red zone background. */}
                      <Area type="monotone" dataKey="rankBelow" baseValue={fillBase}
                        fill="#f43f5e" fillOpacity={0.14} stroke="none"
                        isAnimationActive={false} legendType="none"
                        dot={false} activeDot={false} />

                      {/* Green fill: rankAbove = min(rank,50), fills from line down to rank-50.
                           Clamped at 50 so bad stocks (rank>50) produce zero fill. */}
                      <Area type="monotone" dataKey="rankAbove" baseValue={50}
                        fill="#22c55e" fillOpacity={0.22} stroke="none"
                        isAnimationActive={false} legendType="none"
                        dot={false} activeDot={false} />

                      {/* Glow line — wide soft halo behind the main stroke */}
                      <Line type="natural" dataKey="rank"
                        stroke="url(#rankGlow)" strokeWidth={5} dot={false} activeDot={false}
                        isAnimationActive={false} legendType="none" />

                      {/* Main line — gradient stroke only (no fill), with last-dot */}
                      <Line
                        type="natural"
                        dataKey="rank"
                        stroke="url(#rankStroke)"
                        strokeWidth={1.5}
                        fill="none"
                        isAnimationActive
                        animationDuration={800}
                        animationEasing="ease-out"
                        dot={(props: any) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
                          <RankDot {...props} dataLength={chartData.length} />
                        )}
                        activeDot={<RankActiveDot />}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </motion.div>

                {/* Stats */}
                <div className="flex gap-3">
                  <Stat label="Current" value={current !== null ? `#${current}` : '—'}
                    color={isTop50Now ? 'text-emerald-400' : 'text-rose-400'}
                    delay={0.15} />
                  <Stat label="Best Ever" value={best !== null ? `#${best}` : '—'}
                    color="text-emerald-400" delay={0.22} />
                  <Stat label="Avg Rank" value={avgRank !== null ? `#${avgRank.toFixed(1)}` : '—'}
                    color={avgRank !== null && avgRank <= 50 ? 'text-emerald-400'
                      : avgRank !== null && avgRank <= 75 ? 'text-amber-400' : 'text-rose-400'}
                    delay={0.29} />
                  <Stat label="In Top 50" value={`${top50Days}d`}
                    color={top50Pct >= 70 ? 'text-emerald-400' : top50Pct >= 40 ? 'text-amber-400' : 'text-rose-400'}
                    delay={0.36} />
                </div>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
