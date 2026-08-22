/**
 * Pure technical-indicator math for the Radar chart.
 *
 * No I/O, no framework imports — safe on both server and client. All series are
 * index-aligned to the input candle array; positions that can't be computed yet
 * (not enough history) are `null` so the chart can `connectNulls`/skip them.
 */

import type { Candle } from './candles';

export type IndicatorId =
  | 'ema9'
  | 'ema21'
  | 'ema50'
  | 'sma200'
  | 'vwap'
  | 'bb'
  | 'supertrend'
  | 'psar'
  | 'macd'
  | 'rsi'
  | 'stoch'
  | 'adx'
  | 'atr'
  | 'obv';

export interface IndicatorMeta {
  id: IndicatorId;
  label: string;
  short: string;
  /** overlay = drawn on the price axis; panel = its own sub-chart below. */
  kind: 'overlay' | 'panel';
  color: string;
  desc: string;
}

/** Registry that drives the indicator picker dropdown. */
export const INDICATORS: IndicatorMeta[] = [
  { id: 'ema9',   label: 'EMA 9',            short: 'EMA9',  kind: 'overlay', color: '#f59e0b', desc: 'Fast trend — reacts quickly, good for scalps' },
  { id: 'ema21',  label: 'EMA 21',           short: 'EMA21', kind: 'overlay', color: '#38bdf8', desc: 'Intraday trend baseline' },
  { id: 'ema50',  label: 'EMA 50',           short: 'EMA50', kind: 'overlay', color: '#a78bfa', desc: 'Medium trend / dynamic support-resistance' },
  { id: 'sma200', label: 'SMA 200',          short: 'SMA200',kind: 'overlay', color: '#e879f9', desc: 'Long-term trend filter' },
  { id: 'vwap',   label: 'VWAP',             short: 'VWAP',  kind: 'overlay', color: '#facc15', desc: 'Volume-weighted avg price (intraday fair value)' },
  { id: 'bb',     label: 'Bollinger Bands',  short: 'BB',    kind: 'overlay', color: '#64748b', desc: '20,2 volatility envelope — squeeze & expansion' },
  { id: 'supertrend', label: 'Supertrend (10,3)', short: 'ST', kind: 'overlay', color: '#4ade80', desc: 'Trend line that flips green/red for buy/sell' },
  { id: 'psar',   label: 'Parabolic SAR',    short: 'PSAR',  kind: 'overlay', color: '#e2e8f0', desc: 'Trailing-stop dots; a flip = trend change' },
  { id: 'macd',   label: 'MACD (12,26,9)',   short: 'MACD',  kind: 'panel',   color: '#22d3ee', desc: 'Momentum + buy/sell crossover signals' },
  { id: 'rsi',    label: 'RSI (14)',         short: 'RSI',   kind: 'panel',   color: '#fb923c', desc: 'Overbought (>70) / oversold (<30)' },
  { id: 'stoch',  label: 'Stochastic (14,3,3)', short: 'STOCH', kind: 'panel', color: '#34d399', desc: 'Overbought (>80) / oversold (<20) momentum' },
  { id: 'adx',    label: 'ADX / DMI (14)',   short: 'ADX',   kind: 'panel',   color: '#f472b6', desc: 'Trend strength (>25 strong) + direction' },
  { id: 'atr',    label: 'ATR (14)',         short: 'ATR',   kind: 'panel',   color: '#eab308', desc: 'Volatility in ₹ — size stops & targets' },
  { id: 'obv',    label: 'OBV',              short: 'OBV',   kind: 'panel',   color: '#2dd4bf', desc: 'Cumulative volume flow — confirms/diverges price' },
];

export const INDICATOR_MAP: Record<IndicatorId, IndicatorMeta> = INDICATORS.reduce(
  (m, i) => ((m[i.id] = i), m),
  {} as Record<IndicatorId, IndicatorMeta>,
);

type Series = (number | null)[];

/** IST day key so VWAP resets per trading session. */
function dayKeyIST(ms: number): string {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/** EMA that tolerates leading `null`s (seeds with an SMA of the first `period` valid points). */
export function ema(values: Series, period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let prev: number | null = null;
  let seedSum = 0;
  let seedCount = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) continue;
    if (prev == null) {
      seedSum += v;
      seedCount++;
      if (seedCount === period) {
        prev = seedSum / period;
        out[i] = prev;
      }
      continue;
    }
    prev = (v - prev) * k + prev;
    out[i] = prev;
  }
  return out;
}

/** Simple moving average. */
export function sma(values: Series, period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  let sum = 0;
  const window: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) {
      // reset-safe: push 0 but don't count — keep it simple by skipping nulls
      window.push(0);
    } else {
      window.push(v);
    }
    sum += window[window.length - 1];
    if (window.length > period) sum -= window.shift() as number;
    if (window.length === period) out[i] = sum / period;
  }
  return out;
}

/** Wilder's RSI. */
export function rsi(closes: number[], period = 14): Series {
  const out: Series = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = closes[i] - closes[i - 1];
    if (ch >= 0) gain += ch;
    else loss -= ch;
  }
  let avgG = gain / period;
  let avgL = loss / period;
  out[period] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  for (let i = period + 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    const g = ch > 0 ? ch : 0;
    const l = ch < 0 ? -ch : 0;
    avgG = (avgG * (period - 1) + g) / period;
    avgL = (avgL * (period - 1) + l) / period;
    out[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  }
  return out;
}

export interface MACDResult {
  macd: Series;
  signal: Series;
  hist: Series;
}

/** MACD line, signal line and histogram. */
export function macd(closes: number[], fast = 12, slow = 26, signalP = 9): MACDResult {
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macdLine: Series = closes.map((_, i) =>
    emaFast[i] != null && emaSlow[i] != null ? (emaFast[i] as number) - (emaSlow[i] as number) : null,
  );
  const signal = ema(macdLine, signalP);
  const hist: Series = macdLine.map((v, i) =>
    v != null && signal[i] != null ? v - (signal[i] as number) : null,
  );
  return { macd: macdLine, signal, hist };
}

/** MACD/signal crossover points → intraday buy/sell markers. */
export function macdCrosses(m: MACDResult): { index: number; type: 'buy' | 'sell' }[] {
  const out: { index: number; type: 'buy' | 'sell' }[] = [];
  for (let i = 1; i < m.macd.length; i++) {
    const a = m.macd[i - 1];
    const b = m.signal[i - 1];
    const c = m.macd[i];
    const d = m.signal[i];
    if (a == null || b == null || c == null || d == null) continue;
    if (a <= b && c > d) out.push({ index: i, type: 'buy' });
    else if (a >= b && c < d) out.push({ index: i, type: 'sell' });
  }
  return out;
}

/** Session-anchored VWAP (resets each IST trading day). */
export function vwap(candles: Candle[]): Series {
  const out: Series = new Array(candles.length).fill(null);
  let day = '';
  let pv = 0;
  let vol = 0;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const d = dayKeyIST(c.time);
    if (d !== day) {
      day = d;
      pv = 0;
      vol = 0;
    }
    const tp = (c.high + c.low + c.close) / 3;
    pv += tp * (c.volume || 0);
    vol += c.volume || 0;
    out[i] = vol > 0 ? pv / vol : c.close;
  }
  return out;
}

export interface BollingerResult {
  mid: Series;
  upper: Series;
  lower: Series;
}

/** SMA over a nullable series that only emits when the whole window is valid. */
function smaStrict(values: Series, period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    let ok = true;
    for (let j = i - period + 1; j <= i; j++) {
      const v = values[j];
      if (v == null) {
        ok = false;
        break;
      }
      sum += v;
    }
    if (ok) out[i] = sum / period;
  }
  return out;
}

export interface StochResult {
  k: Series; // slow %K
  d: Series; // %D (signal)
}

/**
 * Stochastic oscillator (0–100). Overbought > 80, oversold < 20.
 * %K = SMA(kSmooth) of raw %K; %D = SMA(dPeriod) of %K.
 */
export function stochastic(
  candles: Candle[],
  kPeriod = 14,
  kSmooth = 3,
  dPeriod = 3,
): StochResult {
  const n = candles.length;
  const rawK: Series = new Array(n).fill(null);
  for (let i = kPeriod - 1; i < n; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (candles[j].high > hh) hh = candles[j].high;
      if (candles[j].low < ll) ll = candles[j].low;
    }
    const denom = hh - ll;
    rawK[i] = denom === 0 ? 50 : ((candles[i].close - ll) / denom) * 100;
  }
  const k = smaStrict(rawK, kSmooth);
  const d = smaStrict(k, dPeriod);
  return { k, d };
}

/** Bollinger Bands (SMA basis ± mult·stddev). */
export function bollinger(closes: number[], period = 20, mult = 2): BollingerResult {
  const mid = sma(closes, period);
  const upper: Series = new Array(closes.length).fill(null);
  const lower: Series = new Array(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    const basis = mid[i];
    if (basis == null) continue;
    let sq = 0;
    for (let j = i - period + 1; j <= i; j++) sq += (closes[j] - basis) ** 2;
    const sd = Math.sqrt(sq / period);
    upper[i] = basis + mult * sd;
    lower[i] = basis - mult * sd;
  }
  return { mid, upper, lower };
}

/** True Range per bar. */
function trueRanges(candles: Candle[]): number[] {
  const n = candles.length;
  const tr = new Array(n).fill(0);
  if (n === 0) return tr;
  tr[0] = candles[0].high - candles[0].low;
  for (let i = 1; i < n; i++) {
    const h = candles[i].high;
    const l = candles[i].low;
    const pc = candles[i - 1].close;
    tr[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  }
  return tr;
}

/** Average True Range (Wilder) — volatility in price units. */
export function atr(candles: Candle[], period = 14): Series {
  const n = candles.length;
  const out: Series = new Array(n).fill(null);
  if (n < period) return out;
  const tr = trueRanges(candles);
  let prev = 0;
  for (let i = 0; i < period; i++) prev += tr[i];
  prev /= period;
  out[period - 1] = prev;
  for (let i = period; i < n; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}

export interface SupertrendResult {
  line: Series;
  dir: (1 | -1 | null)[]; // 1 = bullish (line below price), -1 = bearish
}

/** Supertrend — an ATR-based trailing trend line that flips on a close-through. */
export function supertrend(candles: Candle[], period = 10, mult = 3): SupertrendResult {
  const n = candles.length;
  const atrArr = atr(candles, period);
  const line: Series = new Array(n).fill(null);
  const dir: (1 | -1 | null)[] = new Array(n).fill(null);
  const fU = new Array(n).fill(NaN);
  const fL = new Array(n).fill(NaN);
  const st = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    const a = atrArr[i];
    if (a == null) continue;
    const mid = (candles[i].high + candles[i].low) / 2;
    const bU = mid + mult * a;
    const bL = mid - mult * a;
    if (i === 0 || isNaN(fU[i - 1])) {
      fU[i] = bU;
      fL[i] = bL;
    } else {
      fU[i] = bU < fU[i - 1] || candles[i - 1].close > fU[i - 1] ? bU : fU[i - 1];
      fL[i] = bL > fL[i - 1] || candles[i - 1].close < fL[i - 1] ? bL : fL[i - 1];
    }
    if (i === 0 || isNaN(st[i - 1])) {
      st[i] = candles[i].close <= fU[i] ? fU[i] : fL[i];
    } else if (st[i - 1] === fU[i - 1]) {
      st[i] = candles[i].close <= fU[i] ? fU[i] : fL[i];
    } else {
      st[i] = candles[i].close >= fL[i] ? fL[i] : fU[i];
    }
    line[i] = st[i];
    dir[i] = st[i] === fL[i] ? 1 : -1;
  }
  return { line, dir };
}

/** Parabolic SAR — trailing-stop dots (0.02 step, 0.2 max acceleration). */
export function psar(candles: Candle[], step = 0.02, max = 0.2): Series {
  const n = candles.length;
  const out: Series = new Array(n).fill(null);
  if (n < 2) return out;
  let bull = candles[1].close >= candles[0].close;
  let af = step;
  let ep = bull ? candles[0].high : candles[0].low;
  let sar = bull ? candles[0].low : candles[0].high;
  out[0] = sar;
  for (let i = 1; i < n; i++) {
    sar = sar + af * (ep - sar);
    const lowPrev = candles[i - 1].low;
    const lowPrev2 = candles[i >= 2 ? i - 2 : i - 1].low;
    const highPrev = candles[i - 1].high;
    const highPrev2 = candles[i >= 2 ? i - 2 : i - 1].high;
    if (bull) {
      sar = Math.min(sar, lowPrev, lowPrev2);
      if (candles[i].low < sar) {
        bull = false;
        sar = ep;
        ep = candles[i].low;
        af = step;
      } else if (candles[i].high > ep) {
        ep = candles[i].high;
        af = Math.min(max, af + step);
      }
    } else {
      sar = Math.max(sar, highPrev, highPrev2);
      if (candles[i].high > sar) {
        bull = true;
        sar = ep;
        ep = candles[i].high;
        af = step;
      } else if (candles[i].low < ep) {
        ep = candles[i].low;
        af = Math.min(max, af + step);
      }
    }
    out[i] = sar;
  }
  return out;
}

export interface ADXResult {
  adx: Series;
  plusDI: Series;
  minusDI: Series;
}

/** ADX / DMI (Wilder) — trend strength and direction. */
export function adx(candles: Candle[], period = 14): ADXResult {
  const n = candles.length;
  const adxS: Series = new Array(n).fill(null);
  const pDI: Series = new Array(n).fill(null);
  const mDI: Series = new Array(n).fill(null);
  if (n < period * 2) return { adx: adxS, plusDI: pDI, minusDI: mDI };

  const tr = trueRanges(candles);
  const plusDM = new Array(n).fill(0);
  const minusDM = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const up = candles[i].high - candles[i - 1].high;
    const dn = candles[i - 1].low - candles[i].low;
    plusDM[i] = up > dn && up > 0 ? up : 0;
    minusDM[i] = dn > up && dn > 0 ? dn : 0;
  }

  let trS = 0;
  let pS = 0;
  let mS = 0;
  for (let i = 1; i <= period; i++) {
    trS += tr[i];
    pS += plusDM[i];
    mS += minusDM[i];
  }
  const dx = new Array(n).fill(NaN);
  const fill = (i: number) => {
    const pdi = trS === 0 ? 0 : (100 * pS) / trS;
    const mdi = trS === 0 ? 0 : (100 * mS) / trS;
    pDI[i] = pdi;
    mDI[i] = mdi;
    const denom = pdi + mdi;
    dx[i] = denom === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / denom;
  };
  fill(period);
  for (let i = period + 1; i < n; i++) {
    trS = trS - trS / period + tr[i];
    pS = pS - pS / period + plusDM[i];
    mS = mS - mS / period + minusDM[i];
    fill(i);
  }

  const firstAdx = period * 2 - 1;
  if (firstAdx < n) {
    let sum = 0;
    for (let i = period; i <= firstAdx; i++) sum += dx[i];
    let prev = sum / period;
    adxS[firstAdx] = prev;
    for (let i = firstAdx + 1; i < n; i++) {
      prev = (prev * (period - 1) + dx[i]) / period;
      adxS[i] = prev;
    }
  }
  return { adx: adxS, plusDI: pDI, minusDI: mDI };
}

/** On-Balance Volume — cumulative volume flow. */
export function obv(candles: Candle[]): Series {
  const n = candles.length;
  const out: Series = new Array(n).fill(null);
  if (n === 0) return out;
  let v = 0;
  out[0] = 0;
  for (let i = 1; i < n; i++) {
    if (candles[i].close > candles[i - 1].close) v += candles[i].volume || 0;
    else if (candles[i].close < candles[i - 1].close) v -= candles[i].volume || 0;
    out[i] = v;
  }
  return out;
}
