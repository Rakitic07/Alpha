'use client';

import { memo, useMemo, useState, useEffect, useRef, useCallback, Fragment } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from 'recharts';
import { format } from 'date-fns';
import type { Candle, Pivot, Timeframe, SwingLabel, PivotType, BreakoutDirection } from '@/lib/charts/candles';
import {
  ema,
  sma,
  rsi as rsiCalc,
  macd as macdCalc,
  macdCrosses,
  vwap as vwapCalc,
  bollinger,
  stochastic as stochCalc,
  supertrend as superCalc,
  psar as psarCalc,
  adx as adxCalc,
  atr as atrCalc,
  obv as obvCalc,
  INDICATOR_MAP,
  type IndicatorId,
} from '@/lib/charts/indicators';

const UP = '#10b981';
const DOWN = '#ef4444';
const GRID = '#1f2937';
const AXIS = '#6b7280';

interface CandlestickChartProps {
  candles: Candle[];
  pivots: Pivot[];
  donchianHigh: number | null;
  donchianLow: number | null;
  timeframe: Timeframe;
  height?: number;
  breakoutStartIndex?: number;
  breakoutDirection?: BreakoutDirection;
  /** Live/last price to mark with a moving horizontal line + right-axis tag. */
  currentPrice?: number | null;
  /** Day change % — drives the marker colour (green up / red down). */
  currentChangePct?: number | null;
  /** Active indicators to overlay / panel below the price chart. */
  indicators?: IndicatorId[];
  /** Changing this (e.g. `${symbol}-${timeframe}`) resets zoom/pan to the full view. */
  resetKey?: string;
}

const MIN_CANDLES = 8;

interface Row {
  i: number;
  label: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  up: boolean;
  range: [number, number]; // [low, high] — drives the range bar geometry
  pivot?: SwingLabel;
  pivotType?: PivotType;
  sig?: 'buy' | 'sell'; // MACD crossover marker (only when MACD is active)
  // Overlay values (present only when the corresponding indicator is active).
  ema9?: number | null;
  ema21?: number | null;
  ema50?: number | null;
  sma200?: number | null;
  vwap?: number | null;
  bbUpper?: number | null;
  bbMid?: number | null;
  bbLower?: number | null;
  // Oscillator-panel values.
  macd?: number | null;
  signal?: number | null;
  hist?: number | null;
  rsi?: number | null;
  stochK?: number | null;
  stochD?: number | null;
  stUp?: number | null; // Supertrend value while bullish
  stDown?: number | null; // Supertrend value while bearish
  psar?: number | null;
  adx?: number | null;
  plusDI?: number | null;
  minusDI?: number | null;
  atr?: number | null;
  obv?: number | null;
}

function fmtPrice(v: number): string {
  return v >= 1000 ? v.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : v.toFixed(2);
}

const SWING_DESC: Record<SwingLabel, string> = {
  HH: 'Higher High',
  HL: 'Higher Low',
  LH: 'Lower High',
  LL: 'Lower Low',
};

const OVERLAY_KEYS: { id: IndicatorId; key: keyof Row }[] = [
  { id: 'ema9', key: 'ema9' },
  { id: 'ema21', key: 'ema21' },
  { id: 'ema50', key: 'ema50' },
  { id: 'sma200', key: 'sma200' },
  { id: 'vwap', key: 'vwap' },
];

const ST_UP = '#22c55e';
const ST_DOWN = '#ef4444';

function CandleTooltip({ active, payload, showIndicators }: any) {
  if (!active || !payload || !payload.length) return null;
  const d: Row | undefined = payload[0]?.payload;
  if (!d) return null;
  const color = d.up ? UP : DOWN;
  const chg = d.open ? ((d.close - d.open) / d.open) * 100 : 0;
  const swingBull = d.pivot === 'HH' || d.pivot === 'HL';
  const overlays = showIndicators
    ? OVERLAY_KEYS.filter((o) => typeof d[o.key] === 'number')
    : [];
  return (
    <div className="bg-slate-900/95 backdrop-blur-sm border border-white/10 rounded-xl px-3 py-2 shadow-2xl text-[11px]">
      <p className="text-gray-400 mb-1.5 font-medium">{d.label}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 tabular-nums">
        <span className="text-gray-500">O</span><span className="text-gray-200 text-right">{fmtPrice(d.open)}</span>
        <span className="text-gray-500">H</span><span className="text-gray-200 text-right">{fmtPrice(d.high)}</span>
        <span className="text-gray-500">L</span><span className="text-gray-200 text-right">{fmtPrice(d.low)}</span>
        <span className="text-gray-500">C</span>
        <span className="text-right font-semibold" style={{ color }}>{fmtPrice(d.close)}</span>
        <span className="text-gray-500">Chg</span>
        <span className="text-right font-semibold" style={{ color }}>{chg >= 0 ? '+' : ''}{chg.toFixed(2)}%</span>
        <span className="text-gray-500">Vol</span>
        <span className="text-gray-200 text-right">{d.volume.toLocaleString('en-IN')}</span>
      </div>
      {overlays.length > 0 && (
        <div className="mt-1.5 pt-1.5 border-t border-white/8 grid grid-cols-2 gap-x-4 gap-y-0.5 tabular-nums">
          {overlays.map((o) => (
            <Fragment key={o.id}>
              <span className="text-gray-500">{INDICATOR_MAP[o.id].short}</span>
              <span className="text-right" style={{ color: INDICATOR_MAP[o.id].color }}>
                {fmtPrice(d[o.key] as number)}
              </span>
            </Fragment>
          ))}
        </div>
      )}
      {d.sig && (
        <div className="mt-1.5 pt-1.5 border-t border-white/8 flex items-center justify-between gap-3">
          <span className="text-gray-500">MACD</span>
          <span className="font-bold" style={{ color: d.sig === 'buy' ? UP : DOWN }}>
            {d.sig === 'buy' ? '▲ Buy signal' : '▼ Sell signal'}
          </span>
        </div>
      )}
      {d.pivot && (
        <div className="mt-1.5 pt-1.5 border-t border-white/8 flex items-center justify-between gap-3">
          <span className="text-gray-500">Swing</span>
          <span className="font-bold" style={{ color: swingBull ? UP : DOWN }}>
            {d.pivot} · {SWING_DESC[d.pivot]}
          </span>
        </div>
      )}
    </div>
  );
}

/** Right-axis price tag for the live "current price" ReferenceLine. */
function CurrentPriceTag(props: any) {
  const { viewBox, value, color } = props;
  if (!viewBox || value == null) return null;
  const { x, y, width } = viewBox;
  const right = x + width;
  const w = 48;
  const h = 16;
  return (
    <g>
      <circle cx={right} cy={y} r={2.5} fill={color} />
      <rect x={right + 1} y={y - h / 2} width={w} height={h} rx={3} fill={color} />
      <text x={right + 1 + w / 2} y={y + 3.6} textAnchor="middle" fontSize={10} fontWeight={800} fill="#0b1220">
        {fmtPrice(value)}
      </text>
    </g>
  );
}

/** Custom label for the breakout/breakdown ReferenceLine. */
function BreakoutLabel(props: any) {
  const { viewBox, value, color } = props;
  if (!viewBox) return null;
  const { x, y } = viewBox;
  return (
    <text x={x - 6} y={y + 11} textAnchor="end" fill={color} fontSize={9} fontWeight={700}>
      {value}
    </text>
  );
}

/**
 * Custom candle renderer (v3-safe). Draws the wick, body, a bottom-anchored
 * volume sub-bar, the swing label, and MACD buy/sell markers.
 */
function CandleShape(props: any) {
  const { x, width, y, height, payload, background, volMax, activeIndex } = props;
  if (!payload || width == null || height == null) return null;

  const { open, high, low, close, up, volume, pivot, pivotType, i, sig } = payload as Row;
  const color = up ? UP : DOWN;
  const active = activeIndex === i;
  const cx = x + width / 2;
  const span = high - low || 1;
  const priceToY = (p: number) => y + ((high - p) / span) * height;

  const yOpen = priceToY(open);
  const yClose = priceToY(close);
  const bodyTop = Math.min(yOpen, yClose);
  const bodyH = Math.max(1, Math.abs(yClose - yOpen));
  const bodyW = Math.max(1.5, Math.min(14, width * 0.7));

  let volRect = null;
  if (background && typeof background.height === 'number' && volMax > 0) {
    const volH = (volume / volMax) * (background.height * 0.18);
    const volY = background.y + background.height - volH;
    volRect = (
      <rect x={cx - bodyW / 2} y={volY} width={bodyW} height={volH} fill={color} opacity={active ? 0.85 : 0.22} />
    );
  }

  let pivotEl = null;
  if (pivot) {
    const isHigh = pivotType === 'high';
    const py = priceToY(isHigh ? high : low) + (isHigh ? -8 : 14);
    const bullish = pivot === 'HH' || pivot === 'HL';
    pivotEl = (
      <text x={cx} y={py} textAnchor="middle" fontSize={9} fontWeight={700} fill={bullish ? UP : DOWN} opacity={0.9}>
        {pivot}
      </text>
    );
  }

  // MACD buy/sell arrows anchored just outside the candle.
  let sigEl = null;
  if (sig === 'buy') {
    const ty = priceToY(low) + 10;
    sigEl = <path d={`M ${cx} ${ty} l -4 7 l 8 0 z`} fill={UP} opacity={0.95} />;
  } else if (sig === 'sell') {
    const ty = priceToY(high) - 10;
    sigEl = <path d={`M ${cx} ${ty} l -4 -7 l 8 0 z`} fill={DOWN} opacity={0.95} />;
  }

  return (
    <g style={active ? { filter: `drop-shadow(0 0 5px ${color})` } : undefined}>
      {volRect}
      <line x1={cx} x2={cx} y1={priceToY(high)} y2={priceToY(low)} stroke={color} strokeWidth={active ? 1.6 : 1} opacity={active ? 1 : 0.9} />
      <rect x={cx - bodyW / 2} y={bodyTop} width={bodyW} height={bodyH} fill={color} rx={0.5} />
      {pivotEl}
      {sigEl}
    </g>
  );
}

/** Parabolic-SAR dot — green when below price (bullish), red when above (bearish). */
function PsarDot(props: any) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null || !payload || typeof payload.psar !== 'number') return null;
  const bull = payload.psar < payload.close;
  return <circle cx={cx} cy={cy} r={1.6} fill={bull ? UP : DOWN} opacity={0.9} />;
}

/** A tiny candlestick glyph used in the legend. */
function CandleGlyph({ up }: { up: boolean }) {
  const c = up ? UP : DOWN;
  return (
    <svg width="9" height="15" viewBox="0 0 9 15" className="shrink-0">
      <line x1="4.5" x2="4.5" y1="0.5" y2="14.5" stroke={c} strokeWidth="1.2" />
      <rect x="1.5" y="4" width="6" height="7" rx="1.2" fill={c} />
    </svg>
  );
}

function LegendDivider() {
  return <span className="hidden md:inline-block w-px h-3.5 bg-white/10 mx-0.5" />;
}

/** Bottom legend explaining the chart's markers, terminology and active indicators. */
function ChartLegend({
  activeOverlays,
  hasMacd,
  hasSuper,
  hasPsar,
}: {
  activeOverlays: IndicatorId[];
  hasMacd: boolean;
  hasSuper: boolean;
  hasPsar: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3.5 gap-y-1.5 border-t border-white/5 px-3 pt-2.5 text-[10.5px] font-medium text-gray-400">
      <span className="flex items-center gap-1.5"><CandleGlyph up /><span>Bullish</span></span>
      <span className="flex items-center gap-1.5"><CandleGlyph up={false} /><span>Bearish</span></span>
      <span className="flex items-center gap-1.5">
        <span className="flex items-end gap-[2px] h-3.5" aria-hidden>
          <span className="w-[3px] h-2 rounded-[1px] bg-gray-400/35" />
          <span className="w-[3px] h-3.5 rounded-[1px] bg-gray-400/35" />
          <span className="w-[3px] h-1.5 rounded-[1px] bg-gray-400/35" />
        </span>
        <span>Volume</span>
      </span>

      <LegendDivider />

      <span className="flex items-center gap-1.5">
        <span className="font-bold tracking-tight" style={{ color: UP }}>HH·HL</span>
        <span className="text-gray-500">Higher high / low</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="font-bold tracking-tight" style={{ color: DOWN }}>LH·LL</span>
        <span className="text-gray-500">Lower high / low</span>
      </span>

      <LegendDivider />

      <span className="flex items-center gap-1.5">
        <span className="inline-flex flex-col justify-center gap-[3px]" aria-hidden>
          <span className="w-5 border-t border-dashed" style={{ borderColor: UP }} />
          <span className="w-5 border-t border-dashed" style={{ borderColor: DOWN }} />
        </span>
        <span className="text-gray-500">Donchian H / L</span>
      </span>

      <LegendDivider />

      <span className="flex items-center gap-1.5">
        <span className="font-bold" style={{ color: UP }}>▲ BO</span>
        <span className="font-bold" style={{ color: DOWN }}>▼ BD</span>
        <span className="text-gray-500">Breakout / breakdown start</span>
      </span>

      <LegendDivider />

      <span className="flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1" aria-hidden>
          <span className="w-4 border-t border-dashed border-gray-300/70" />
          <span className="px-1 rounded-[2px] bg-gray-300/80 text-[8px] font-bold text-slate-900 leading-none">₹</span>
        </span>
        <span className="text-gray-500">Current price</span>
      </span>

      {(activeOverlays.length > 0 || hasMacd || hasSuper || hasPsar) && <LegendDivider />}

      {activeOverlays.map((id) => (
        <span key={id} className="flex items-center gap-1.5">
          <span className="w-4 border-t-2" style={{ borderColor: INDICATOR_MAP[id].color }} />
          <span className="text-gray-400">{INDICATOR_MAP[id].short}</span>
        </span>
      ))}

      {hasSuper && (
        <span className="flex items-center gap-1.5">
          <span className="inline-flex items-center" aria-hidden>
            <span className="w-2.5 border-t-2" style={{ borderColor: ST_UP }} />
            <span className="w-2.5 border-t-2" style={{ borderColor: ST_DOWN }} />
          </span>
          <span className="text-gray-500">Supertrend</span>
        </span>
      )}

      {hasPsar && (
        <span className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-[3px]" aria-hidden>
            <span className="w-1 h-1 rounded-full" style={{ background: UP }} />
            <span className="w-1 h-1 rounded-full" style={{ background: DOWN }} />
          </span>
          <span className="text-gray-500">Parabolic SAR</span>
        </span>
      )}

      {hasMacd && (
        <span className="flex items-center gap-1.5">
          <span className="font-bold" style={{ color: UP }}>▲</span>
          <span className="font-bold" style={{ color: DOWN }}>▼</span>
          <span className="text-gray-500">MACD buy / sell</span>
        </span>
      )}
    </div>
  );
}

function MacdTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="bg-slate-900/95 border border-white/10 rounded-lg px-2.5 py-1.5 shadow-xl text-[10.5px] tabular-nums">
      <p className="text-gray-400 mb-1">{d.label}</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        <span className="text-gray-500">MACD</span><span className="text-cyan-300 text-right">{d.macd?.toFixed(2) ?? '—'}</span>
        <span className="text-gray-500">Signal</span><span className="text-amber-300 text-right">{d.signal?.toFixed(2) ?? '—'}</span>
        <span className="text-gray-500">Hist</span>
        <span className="text-right" style={{ color: (d.hist ?? 0) >= 0 ? UP : DOWN }}>{d.hist?.toFixed(2) ?? '—'}</span>
      </div>
    </div>
  );
}

function RsiTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0]?.payload;
  if (!d || d.rsi == null) return null;
  const zone = d.rsi >= 70 ? 'Overbought' : d.rsi <= 30 ? 'Oversold' : 'Neutral';
  const color = d.rsi >= 70 ? DOWN : d.rsi <= 30 ? UP : AXIS;
  return (
    <div className="bg-slate-900/95 border border-white/10 rounded-lg px-2.5 py-1.5 shadow-xl text-[10.5px] tabular-nums">
      <p className="text-gray-400 mb-1">{d.label}</p>
      <div className="flex items-center justify-between gap-3">
        <span className="text-gray-500">RSI</span>
        <span className="font-semibold" style={{ color }}>{d.rsi.toFixed(1)} · {zone}</span>
      </div>
    </div>
  );
}

function StochTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0]?.payload;
  if (!d || d.stochK == null) return null;
  const zone = d.stochK >= 80 ? 'Overbought' : d.stochK <= 20 ? 'Oversold' : 'Neutral';
  const color = d.stochK >= 80 ? DOWN : d.stochK <= 20 ? UP : AXIS;
  return (
    <div className="bg-slate-900/95 border border-white/10 rounded-lg px-2.5 py-1.5 shadow-xl text-[10.5px] tabular-nums">
      <p className="text-gray-400 mb-1">{d.label}</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        <span className="text-gray-500">%K</span><span className="text-emerald-300 text-right">{d.stochK.toFixed(1)}</span>
        <span className="text-gray-500">%D</span><span className="text-sky-300 text-right">{d.stochD?.toFixed(1) ?? '—'}</span>
      </div>
      <div className="mt-1 pt-1 border-t border-white/8 text-right font-semibold" style={{ color }}>{zone}</div>
    </div>
  );
}

function AdxTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0]?.payload;
  if (!d || d.adx == null) return null;
  const strength = d.adx >= 40 ? 'Very strong' : d.adx >= 25 ? 'Strong trend' : d.adx >= 20 ? 'Building' : 'Weak / range';
  return (
    <div className="bg-slate-900/95 border border-white/10 rounded-lg px-2.5 py-1.5 shadow-xl text-[10.5px] tabular-nums">
      <p className="text-gray-400 mb-1">{d.label}</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        <span className="text-gray-500">ADX</span><span className="text-pink-300 text-right">{d.adx.toFixed(1)}</span>
        <span className="text-gray-500">+DI</span><span className="text-emerald-300 text-right">{d.plusDI?.toFixed(1) ?? '—'}</span>
        <span className="text-gray-500">−DI</span><span className="text-red-300 text-right">{d.minusDI?.toFixed(1) ?? '—'}</span>
      </div>
      <div className="mt-1 pt-1 border-t border-white/8 text-right font-semibold text-gray-300">{strength}</div>
    </div>
  );
}

function AtrTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0]?.payload;
  if (!d || d.atr == null) return null;
  return (
    <div className="bg-slate-900/95 border border-white/10 rounded-lg px-2.5 py-1.5 shadow-xl text-[10.5px] tabular-nums">
      <p className="text-gray-400 mb-1">{d.label}</p>
      <div className="flex items-center justify-between gap-3">
        <span className="text-gray-500">ATR</span>
        <span className="font-semibold text-amber-300">₹{d.atr.toFixed(2)}</span>
      </div>
    </div>
  );
}

function ObvTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0]?.payload;
  if (!d || d.obv == null) return null;
  return (
    <div className="bg-slate-900/95 border border-white/10 rounded-lg px-2.5 py-1.5 shadow-xl text-[10.5px] tabular-nums">
      <p className="text-gray-400 mb-1">{d.label}</p>
      <div className="flex items-center justify-between gap-3">
        <span className="text-gray-500">OBV</span>
        <span className="font-semibold text-teal-300">{d.obv.toLocaleString('en-IN')}</span>
      </div>
    </div>
  );
}

const CandlestickChart = memo(function CandlestickChart({
  candles,
  pivots,
  donchianHigh,
  donchianLow,
  timeframe,
  height = 460,
  breakoutStartIndex,
  breakoutDirection,
  currentPrice,
  currentChangePct,
  indicators = [],
  resetKey,
}: CandlestickChartProps) {
  const intraday = timeframe !== '1D' && timeframe !== '1W' && timeframe !== '1M';

  const active = useMemo(() => new Set(indicators), [indicators]);
  const activeOverlays = useMemo(
    () => (['ema9', 'ema21', 'ema50', 'sma200', 'vwap'] as IndicatorId[]).filter((id) => active.has(id)),
    [active],
  );
  const showBB = active.has('bb');
  const showSuper = active.has('supertrend');
  const showPsar = active.has('psar');
  const showMacd = active.has('macd');
  const showRsi = active.has('rsi');
  const showStoch = active.has('stoch');
  const showAdx = active.has('adx');
  const showAtr = active.has('atr');
  const showObv = active.has('obv');

  const containerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<{ start: number; end: number } | null>(null);
  const [hoverI, setHoverI] = useState<number | null>(null);
  const dragRef = useRef<{ x: number; start: number; size: number } | null>(null);

  useEffect(() => {
    setView(null);
    setHoverI(null);
  }, [resetKey]);

  // ---- Indicator series (computed over the FULL candle array, index-aligned) ----
  const series = useMemo(() => {
    const closes = candles.map((c) => c.close);
    return {
      ema9: active.has('ema9') ? ema(closes, 9) : null,
      ema21: active.has('ema21') ? ema(closes, 21) : null,
      ema50: active.has('ema50') ? ema(closes, 50) : null,
      sma200: active.has('sma200') ? sma(closes, 200) : null,
      vwap: active.has('vwap') ? vwapCalc(candles) : null,
      bb: showBB ? bollinger(closes, 20, 2) : null,
      supertrend: showSuper ? superCalc(candles, 10, 3) : null,
      psar: showPsar ? psarCalc(candles) : null,
      macd: showMacd ? macdCalc(closes) : null,
      rsi: showRsi ? rsiCalc(closes, 14) : null,
      stoch: showStoch ? stochCalc(candles) : null,
      adx: showAdx ? adxCalc(candles, 14) : null,
      atr: showAtr ? atrCalc(candles, 14) : null,
      obv: showObv ? obvCalc(candles) : null,
    };
  }, [candles, active, showBB, showSuper, showPsar, showMacd, showRsi, showStoch, showAdx, showAtr, showObv]);

  const sigByIndex = useMemo(() => {
    const m = new Map<number, 'buy' | 'sell'>();
    if (series.macd) for (const c of macdCrosses(series.macd)) m.set(c.index, c.type);
    return m;
  }, [series.macd]);

  const rows: Row[] = useMemo(() => {
    const pivotByIndex = new Map<number, Pivot>();
    for (const p of pivots) pivotByIndex.set(p.index, p);
    return candles.map((c, i) => {
      const piv = pivotByIndex.get(i);
      return {
        i,
        label: format(new Date(c.time), intraday ? 'dd MMM HH:mm' : 'dd MMM yyyy'),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
        up: c.close >= c.open,
        range: [c.low, c.high] as [number, number],
        pivot: piv?.label,
        pivotType: piv?.type,
        sig: showMacd ? sigByIndex.get(i) : undefined,
        ema9: series.ema9 ? series.ema9[i] : undefined,
        ema21: series.ema21 ? series.ema21[i] : undefined,
        ema50: series.ema50 ? series.ema50[i] : undefined,
        sma200: series.sma200 ? series.sma200[i] : undefined,
        vwap: series.vwap ? series.vwap[i] : undefined,
        bbUpper: series.bb ? series.bb.upper[i] : undefined,
        bbMid: series.bb ? series.bb.mid[i] : undefined,
        bbLower: series.bb ? series.bb.lower[i] : undefined,
        macd: series.macd ? series.macd.macd[i] : undefined,
        signal: series.macd ? series.macd.signal[i] : undefined,
        hist: series.macd ? series.macd.hist[i] : undefined,
        rsi: series.rsi ? series.rsi[i] : undefined,
        stochK: series.stoch ? series.stoch.k[i] : undefined,
        stochD: series.stoch ? series.stoch.d[i] : undefined,
        stUp: series.supertrend && series.supertrend.dir[i] === 1 ? series.supertrend.line[i] : undefined,
        stDown: series.supertrend && series.supertrend.dir[i] === -1 ? series.supertrend.line[i] : undefined,
        psar: series.psar ? series.psar[i] : undefined,
        adx: series.adx ? series.adx.adx[i] : undefined,
        plusDI: series.adx ? series.adx.plusDI[i] : undefined,
        minusDI: series.adx ? series.adx.minusDI[i] : undefined,
        atr: series.atr ? series.atr[i] : undefined,
        obv: series.obv ? series.obv[i] : undefined,
      };
    });
  }, [candles, pivots, intraday, series, sigByIndex, showMacd]);

  const clampView = useCallback(
    (start: number, size: number): { start: number; end: number } | null => {
      const len = rows.length;
      const s = Math.min(len, Math.max(MIN_CANDLES, Math.round(size)));
      if (s >= len) return null;
      const st = Math.min(len - s, Math.max(0, Math.round(start)));
      return { start: st, end: st + s - 1 };
    },
    [rows.length],
  );

  const visibleRows = useMemo(() => {
    if (!view) return rows;
    return rows.slice(view.start, view.end + 1);
  }, [rows, view]);

  const { priceMin, priceMax, volMax } = useMemo(() => {
    if (visibleRows.length === 0) return { priceMin: 0, priceMax: 1, volMax: 1 };
    let lo = Infinity;
    let hi = -Infinity;
    let vHi = 0;
    for (const r of visibleRows) {
      if (r.low < lo) lo = r.low;
      if (r.high > hi) hi = r.high;
      // include price-axis overlays so they don't clip
      if (showBB) {
        if (typeof r.bbLower === 'number' && r.bbLower < lo) lo = r.bbLower;
        if (typeof r.bbUpper === 'number' && r.bbUpper > hi) hi = r.bbUpper;
      }
      for (const ov of [r.stUp, r.stDown, r.psar]) {
        if (typeof ov === 'number') {
          if (ov < lo) lo = ov;
          if (ov > hi) hi = ov;
        }
      }
      if (r.volume > vHi) vHi = r.volume;
    }
    const pad = (hi - lo) * 0.08 || hi * 0.02 || 1;
    return { priceMin: lo - pad, priceMax: hi + pad, volMax: vHi || 1 };
  }, [visibleRows, showBB]);

  // Auto domains for the extra oscillator panels.
  const panelDomain = useCallback(
    (key: 'atr' | 'obv' | 'adx'): [number, number] => {
      let lo = Infinity;
      let hi = -Infinity;
      for (const r of visibleRows) {
        const vals: (number | null | undefined)[] =
          key === 'adx' ? [r.adx, r.plusDI, r.minusDI] : [r[key]];
        for (const v of vals) {
          if (typeof v === 'number') {
            if (v < lo) lo = v;
            if (v > hi) hi = v;
          }
        }
      }
      if (!Number.isFinite(lo)) return key === 'obv' ? [-1, 1] : [0, 1];
      const pad = (hi - lo) * 0.1 || Math.abs(hi) * 0.1 || 1;
      const min = key === 'obv' ? lo - pad : Math.min(0, lo - pad);
      return [min, hi + pad];
    },
    [visibleRows],
  );

  // MACD panel domain (symmetric around 0).
  const macdDomain = useMemo<[number, number]>(() => {
    if (!showMacd) return [-1, 1];
    let m = 0;
    for (const r of visibleRows) {
      const mv = series.macd?.macd[r.i];
      const sv = series.macd?.signal[r.i];
      const hv = series.macd?.hist[r.i];
      for (const v of [mv, sv, hv]) if (typeof v === 'number') m = Math.max(m, Math.abs(v));
    }
    const pad = m * 0.15 || 1;
    return [-(m + pad), m + pad];
  }, [showMacd, visibleRows, series.macd]);

  const tickInterval = Math.max(0, Math.floor(visibleRows.length / 7) - 1);

  const LEFT_PAD = 6;
  const RIGHT_PAD = 60;

  const zoomAt = useCallback(
    (clientX: number, factor: number) => {
      const el = containerRef.current;
      const len = rows.length;
      if (!el || len === 0) return;
      const cur = view ?? { start: 0, end: len - 1 };
      const size = cur.end - cur.start + 1;
      const rect = el.getBoundingClientRect();
      const plotW = Math.max(1, rect.width - LEFT_PAD - RIGHT_PAD);
      let frac = (clientX - rect.left - LEFT_PAD) / plotW;
      frac = Math.min(1, Math.max(0, frac));
      const centerIdx = cur.start + frac * (size - 1);
      const newSize = size * factor;
      const nextStart = centerIdx - frac * (newSize - 1);
      setView(clampView(nextStart, newSize));
    },
    [rows.length, view, clampView],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(e.clientX, e.deltaY < 0 ? 0.82 : 1 / 0.82);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const zoomButton = useCallback(
    (factor: number) => {
      const el = containerRef.current;
      const rect = el?.getBoundingClientRect();
      zoomAt(rect ? rect.left + rect.width / 2 : 0, factor);
    },
    [zoomAt],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const len = rows.length;
      const cur = view ?? { start: 0, end: len - 1 };
      const size = cur.end - cur.start + 1;
      if (size >= len) return;
      dragRef.current = { x: e.clientX, start: cur.start, size };
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    [rows.length, view],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      const el = containerRef.current;
      if (!drag || !el) return;
      const rect = el.getBoundingClientRect();
      const plotW = Math.max(1, rect.width - LEFT_PAD - RIGHT_PAD);
      const candlePx = plotW / drag.size;
      const deltaIdx = -(e.clientX - drag.x) / candlePx;
      setView(clampView(drag.start + deltaIdx, drag.size));
    },
    [clampView],
  );

  const endDrag = useCallback(() => {
    dragRef.current = null;
  }, []);

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center text-gray-500 text-sm" style={{ height }}>
        No candle data available
      </div>
    );
  }

  const zoomed = view != null;
  const isPannable = zoomed;

  const markerColor =
    typeof currentChangePct === 'number'
      ? currentChangePct >= 0 ? UP : DOWN
      : rows[rows.length - 1]?.up ? UP : DOWN;

  const PANEL_H = 96;
  // Shared axis geometry so panels align column-for-column with the price chart.
  const panelMargin = { top: 4, right: 8, left: 4, bottom: 2 };

  return (
    <div
      ref={containerRef}
      className={`radar-chart relative select-none flex flex-col outline-none ${isPannable ? 'cursor-grab active:cursor-grabbing' : ''}`}
      style={{ height: '100%', minHeight: height, touchAction: 'none', WebkitTapHighlightColor: 'transparent' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
    >
      {/* Price chart */}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={visibleRows}
            margin={{ top: 10, right: 8, left: 4, bottom: 4 }}
            barCategoryGap="18%"
            onMouseMove={(s: any) => {
              const idx = s?.activeTooltipIndex;
              const r = idx != null ? visibleRows[Number(idx)] : undefined;
              setHoverI(r ? r.i : null);
            }}
            onMouseLeave={() => setHoverI(null)}
          >
            <XAxis
              dataKey="i"
              type="category"
              tickFormatter={(i) => {
                const lbl = rows[i as number]?.label ?? '';
                return intraday ? lbl.replace(/^\d{2} \w{3} /, '') : lbl.replace(/ \d{4}$/, '');
              }}
              tick={{ fill: AXIS, fontSize: 10 }}
              axisLine={{ stroke: GRID }}
              tickLine={false}
              interval={tickInterval}
              minTickGap={16}
            />
            <YAxis
              yAxisId="price"
              orientation="right"
              domain={[priceMin, priceMax]}
              tick={{ fill: AXIS, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={52}
              allowDecimals
              tickFormatter={(v) => fmtPrice(v as number)}
            />

            <Tooltip content={<CandleTooltip showIndicators={activeOverlays.length > 0} />} cursor={{ fill: '#ffffff', fillOpacity: 0.04 }} />

            {donchianHigh != null && (
              <ReferenceLine yAxisId="price" y={donchianHigh} stroke={UP} strokeDasharray="4 4" strokeOpacity={0.5} label={{ value: 'DC High', position: 'insideTopLeft', fill: UP, fontSize: 9 }} />
            )}
            {donchianLow != null && (
              <ReferenceLine yAxisId="price" y={donchianLow} stroke={DOWN} strokeDasharray="4 4" strokeOpacity={0.5} label={{ value: 'DC Low', position: 'insideBottomLeft', fill: DOWN, fontSize: 9 }} />
            )}

            {typeof breakoutStartIndex === 'number' && breakoutStartIndex >= 0 && breakoutDirection && breakoutDirection !== 'none' && (
              <ReferenceLine
                yAxisId="price"
                x={breakoutStartIndex}
                stroke={breakoutDirection === 'breakdown' ? DOWN : UP}
                strokeDasharray="3 3"
                strokeOpacity={0.75}
                label={<BreakoutLabel value={breakoutDirection === 'breakdown' ? '▼ BD start' : '▲ BO start'} color={breakoutDirection === 'breakdown' ? DOWN : UP} />}
              />
            )}

            {/* Bollinger envelope (drawn under the candles) */}
            {showBB && (
              <>
                <Line yAxisId="price" dataKey="bbUpper" stroke={INDICATOR_MAP.bb.color} strokeWidth={1} strokeOpacity={0.55} dot={false} isAnimationActive={false} connectNulls />
                <Line yAxisId="price" dataKey="bbMid" stroke={INDICATOR_MAP.bb.color} strokeWidth={1} strokeDasharray="3 3" strokeOpacity={0.5} dot={false} isAnimationActive={false} connectNulls />
                <Line yAxisId="price" dataKey="bbLower" stroke={INDICATOR_MAP.bb.color} strokeWidth={1} strokeOpacity={0.55} dot={false} isAnimationActive={false} connectNulls />
              </>
            )}

            {/* Candles + volume + swing labels + signal markers */}
            <Bar
              yAxisId="price"
              dataKey="range"
              isAnimationActive={false}
              background={{ fill: 'transparent' }}
              shape={(p: any) => <CandleShape {...p} volMax={volMax} activeIndex={hoverI} />}
            />

            {/* Moving-average overlays (drawn on top of candles) */}
            {activeOverlays.map((id) => (
              <Line
                key={id}
                yAxisId="price"
                dataKey={id}
                stroke={INDICATOR_MAP[id].color}
                strokeWidth={1.6}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            ))}

            {/* Supertrend — colour flips between bullish (green) and bearish (red) */}
            {showSuper && (
              <>
                <Line yAxisId="price" dataKey="stUp" stroke={ST_UP} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
                <Line yAxisId="price" dataKey="stDown" stroke={ST_DOWN} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
              </>
            )}

            {/* Parabolic SAR — trailing-stop dots */}
            {showPsar && (
              <Line yAxisId="price" dataKey="psar" stroke="transparent" strokeWidth={0} isAnimationActive={false} dot={<PsarDot />} activeDot={false} />
            )}

            {currentPrice != null && (
              <ReferenceLine yAxisId="price" y={currentPrice} stroke={markerColor} strokeDasharray="2 3" strokeOpacity={0.85} label={<CurrentPriceTag value={currentPrice} color={markerColor} />} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* MACD sub-panel */}
      {showMacd && (
        <div className="border-t border-white/5" style={{ height: PANEL_H }}>
          <div className="flex items-center justify-between px-3 pt-1">
            <span className="text-[9.5px] font-semibold uppercase tracking-wider text-cyan-300/80">MACD 12 26 9</span>
          </div>
          <ResponsiveContainer width="100%" height={PANEL_H - 16}>
            <ComposedChart data={visibleRows} margin={panelMargin} barCategoryGap="18%">
              <XAxis dataKey="i" type="category" hide />
              <YAxis yAxisId="macd" orientation="right" domain={macdDomain} width={52} tick={{ fill: AXIS, fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(v) => (v as number).toFixed(1)} />
              <Tooltip content={<MacdTooltip />} cursor={{ fill: '#ffffff', fillOpacity: 0.04 }} />
              <ReferenceLine yAxisId="macd" y={0} stroke={GRID} />
              <Bar yAxisId="macd" dataKey="hist" isAnimationActive={false} barSize={5}>
                {visibleRows.map((r) => (
                  <Cell key={r.i} fill={(series.macd?.hist[r.i] ?? 0) >= 0 ? UP : DOWN} fillOpacity={0.55} />
                ))}
              </Bar>
              <Line yAxisId="macd" dataKey="macd" stroke="#22d3ee" strokeWidth={1.4} dot={false} isAnimationActive={false} connectNulls />
              <Line yAxisId="macd" dataKey="signal" stroke="#f59e0b" strokeWidth={1.4} dot={false} isAnimationActive={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* RSI sub-panel */}
      {showRsi && (
        <div className="border-t border-white/5" style={{ height: PANEL_H }}>
          <div className="flex items-center justify-between px-3 pt-1">
            <span className="text-[9.5px] font-semibold uppercase tracking-wider text-orange-300/80">RSI 14</span>
          </div>
          <ResponsiveContainer width="100%" height={PANEL_H - 16}>
            <ComposedChart data={visibleRows} margin={panelMargin}>
              <XAxis dataKey="i" type="category" hide />
              <YAxis yAxisId="rsi" orientation="right" domain={[0, 100]} ticks={[30, 50, 70]} width={52} tick={{ fill: AXIS, fontSize: 9 }} axisLine={false} tickLine={false} />
              <Tooltip content={<RsiTooltip />} cursor={{ fill: '#ffffff', fillOpacity: 0.04 }} />
              {/* Overbought / oversold zones */}
              <ReferenceArea yAxisId="rsi" y1={70} y2={100} fill={DOWN} fillOpacity={0.08} />
              <ReferenceArea yAxisId="rsi" y1={0} y2={30} fill={UP} fillOpacity={0.08} />
              <ReferenceLine yAxisId="rsi" y={70} stroke={DOWN} strokeDasharray="3 3" strokeOpacity={0.5} label={{ value: 'OB 70', position: 'insideTopLeft', fill: DOWN, fontSize: 8 }} />
              <ReferenceLine yAxisId="rsi" y={30} stroke={UP} strokeDasharray="3 3" strokeOpacity={0.5} label={{ value: 'OS 30', position: 'insideBottomLeft', fill: UP, fontSize: 8 }} />
              <ReferenceLine yAxisId="rsi" y={50} stroke={GRID} />
              <Line yAxisId="rsi" dataKey="rsi" stroke={INDICATOR_MAP.rsi.color} strokeWidth={1.4} dot={false} isAnimationActive={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Stochastic sub-panel (overbought / oversold) */}
      {showStoch && (
        <div className="border-t border-white/5" style={{ height: PANEL_H }}>
          <div className="flex items-center justify-between px-3 pt-1">
            <span className="text-[9.5px] font-semibold uppercase tracking-wider text-emerald-300/80">Stoch 14 3 3</span>
            <span className="text-[9px] text-gray-600">%K %D · OB 80 / OS 20</span>
          </div>
          <ResponsiveContainer width="100%" height={PANEL_H - 16}>
            <ComposedChart data={visibleRows} margin={panelMargin}>
              <XAxis dataKey="i" type="category" hide />
              <YAxis yAxisId="stoch" orientation="right" domain={[0, 100]} ticks={[20, 50, 80]} width={52} tick={{ fill: AXIS, fontSize: 9 }} axisLine={false} tickLine={false} />
              <Tooltip content={<StochTooltip />} cursor={{ fill: '#ffffff', fillOpacity: 0.04 }} />
              <ReferenceArea yAxisId="stoch" y1={80} y2={100} fill={DOWN} fillOpacity={0.08} />
              <ReferenceArea yAxisId="stoch" y1={0} y2={20} fill={UP} fillOpacity={0.08} />
              <ReferenceLine yAxisId="stoch" y={80} stroke={DOWN} strokeDasharray="3 3" strokeOpacity={0.5} label={{ value: 'OB 80', position: 'insideTopLeft', fill: DOWN, fontSize: 8 }} />
              <ReferenceLine yAxisId="stoch" y={20} stroke={UP} strokeDasharray="3 3" strokeOpacity={0.5} label={{ value: 'OS 20', position: 'insideBottomLeft', fill: UP, fontSize: 8 }} />
              <ReferenceLine yAxisId="stoch" y={50} stroke={GRID} />
              <Line yAxisId="stoch" dataKey="stochK" stroke="#34d399" strokeWidth={1.4} dot={false} isAnimationActive={false} connectNulls />
              <Line yAxisId="stoch" dataKey="stochD" stroke="#38bdf8" strokeWidth={1.2} strokeDasharray="3 2" dot={false} isAnimationActive={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ADX / DMI sub-panel (trend strength + direction) */}
      {showAdx && (
        <div className="border-t border-white/5" style={{ height: PANEL_H }}>
          <div className="flex items-center justify-between px-3 pt-1">
            <span className="text-[9.5px] font-semibold uppercase tracking-wider text-pink-300/80">ADX / DMI 14</span>
            <span className="text-[9px] text-gray-600">ADX · +DI · −DI · &gt;25 strong</span>
          </div>
          <ResponsiveContainer width="100%" height={PANEL_H - 16}>
            <ComposedChart data={visibleRows} margin={panelMargin}>
              <XAxis dataKey="i" type="category" hide />
              <YAxis yAxisId="adx" orientation="right" domain={panelDomain('adx')} width={52} tick={{ fill: AXIS, fontSize: 9 }} axisLine={false} tickLine={false} />
              <Tooltip content={<AdxTooltip />} cursor={{ fill: '#ffffff', fillOpacity: 0.04 }} />
              <ReferenceLine yAxisId="adx" y={25} stroke="#f472b6" strokeDasharray="3 3" strokeOpacity={0.5} label={{ value: '25', position: 'insideTopLeft', fill: '#f472b6', fontSize: 8 }} />
              <Line yAxisId="adx" dataKey="plusDI" stroke="#34d399" strokeWidth={1.2} dot={false} isAnimationActive={false} connectNulls />
              <Line yAxisId="adx" dataKey="minusDI" stroke={DOWN} strokeWidth={1.2} dot={false} isAnimationActive={false} connectNulls />
              <Line yAxisId="adx" dataKey="adx" stroke="#f472b6" strokeWidth={1.8} dot={false} isAnimationActive={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ATR sub-panel (volatility) */}
      {showAtr && (
        <div className="border-t border-white/5" style={{ height: PANEL_H }}>
          <div className="flex items-center justify-between px-3 pt-1">
            <span className="text-[9.5px] font-semibold uppercase tracking-wider text-amber-300/80">ATR 14</span>
            <span className="text-[9px] text-gray-600">avg true range (₹)</span>
          </div>
          <ResponsiveContainer width="100%" height={PANEL_H - 16}>
            <ComposedChart data={visibleRows} margin={panelMargin}>
              <XAxis dataKey="i" type="category" hide />
              <YAxis yAxisId="atr" orientation="right" domain={panelDomain('atr')} width={52} tick={{ fill: AXIS, fontSize: 9 }} axisLine={false} tickLine={false} />
              <Tooltip content={<AtrTooltip />} cursor={{ fill: '#ffffff', fillOpacity: 0.04 }} />
              <Line yAxisId="atr" dataKey="atr" stroke="#eab308" strokeWidth={1.6} dot={false} isAnimationActive={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* OBV sub-panel (cumulative volume flow) */}
      {showObv && (
        <div className="border-t border-white/5" style={{ height: PANEL_H }}>
          <div className="flex items-center justify-between px-3 pt-1">
            <span className="text-[9.5px] font-semibold uppercase tracking-wider text-teal-300/80">OBV</span>
            <span className="text-[9px] text-gray-600">on-balance volume</span>
          </div>
          <ResponsiveContainer width="100%" height={PANEL_H - 16}>
            <ComposedChart data={visibleRows} margin={panelMargin}>
              <XAxis dataKey="i" type="category" hide />
              <YAxis yAxisId="obv" orientation="right" domain={panelDomain('obv')} width={52} tick={{ fill: AXIS, fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => (Math.abs(v) >= 1e5 ? `${(v / 1e5).toFixed(1)}L` : Math.abs(v) >= 1e3 ? `${(v / 1e3).toFixed(0)}k` : `${v}`)} />
              <Tooltip content={<ObvTooltip />} cursor={{ fill: '#ffffff', fillOpacity: 0.04 }} />
              <ReferenceLine yAxisId="obv" y={0} stroke={GRID} />
              <Line yAxisId="obv" dataKey="obv" stroke="#2dd4bf" strokeWidth={1.6} dot={false} isAnimationActive={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Zoom toolbar */}
      <div className="relative flex items-center justify-center border-t border-white/5 py-1.5" onPointerDown={(e) => e.stopPropagation()}>
        <div className="inline-flex items-center rounded-lg border border-white/10 bg-slate-800/70 backdrop-blur-sm shadow-sm overflow-hidden">
          <button type="button" onClick={() => zoomButton(0.7)} title="Zoom in" className="h-6 w-9 grid place-items-center text-gray-300 hover:text-white hover:bg-white/10 transition-colors text-base leading-none">+</button>
          <span className="w-px h-4 bg-white/10" />
          <button type="button" onClick={() => zoomButton(1 / 0.7)} title="Zoom out" className="h-6 w-9 grid place-items-center text-gray-300 hover:text-white hover:bg-white/10 transition-colors text-base leading-none">−</button>
          <span className="w-px h-4 bg-white/10" />
          <button type="button" onClick={() => setView(null)} disabled={!zoomed} title="Reset zoom" className="h-6 px-2.5 grid place-items-center text-[10px] font-semibold tracking-wide text-gray-300 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-35 disabled:hover:bg-transparent disabled:cursor-default">RESET</button>
        </div>
        <span className="absolute right-3 top-1/2 -translate-y-1/2 hidden md:inline text-[9.5px] text-gray-600">scroll · drag</span>
      </div>

      <ChartLegend activeOverlays={activeOverlays} hasMacd={showMacd} hasSuper={showSuper} hasPsar={showPsar} />
    </div>
  );
});

export default CandlestickChart;
