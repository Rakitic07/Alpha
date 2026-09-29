'use client';

import { useState, useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLightbulb, faTriangleExclamation, faBookOpen } from '@fortawesome/free-solid-svg-icons';

type Group = 'Chart basics' | 'Overlays' | 'Oscillators';

interface Topic {
  id: string;
  group: Group;
  title: string;
  color: string;
  tagline: string;
  what: string[];
  read: string[];
  example: string;
  caution: string;
  formula?: string;
}

/** Verbose, layman-friendly study notes for every marker & indicator on the chart. */
const TOPICS: Topic[] = [
  {
    id: 'candles',
    group: 'Chart basics',
    title: 'Candlesticks',
    color: '#e5e7eb',
    tagline: "Each candle is one time period's whole price story.",
    what: [
      'A candlestick squeezes four prices into a single shape: the Open, High, Low and Close (OHLC) of that period. The thick part is the "body" (from open to close), and the thin lines poking out are the "wicks" (the highest and lowest prices touched).',
      'Green (bullish) means the close finished ABOVE the open — buyers won that period. Red (bearish) means the close finished BELOW the open — sellers won.',
    ],
    read: [
      'A long body = a strong, one-sided move. A tiny body = indecision / a tug of war.',
      'A long lower wick means buyers rejected lower prices (a sign of support). A long upper wick means sellers rejected higher prices (a sign of resistance).',
    ],
    example:
      'On a 5-minute chart a candle opens at ₹100, dips to ₹98, rallies to ₹104 and closes at ₹103.5. It prints green with a small lower wick and a tiny upper wick — buyers were in control almost the entire period.',
    caution: 'One candle on its own rarely means much. Always read it together with the trend and the volume below it.',
  },
  {
    id: 'swings',
    group: 'Chart basics',
    title: 'Swings — HH / HL / LH / LL',
    color: '#10b981',
    tagline: 'The skeleton that tells you which way the trend is pointing.',
    what: [
      'A swing high is a local peak; a swing low is a local trough. We label each new peak/trough by comparing it with the previous one of the same kind.',
      'HH = Higher High, HL = Higher Low → these build an UP-trend. LH = Lower High, LL = Lower Low → these build a DOWN-trend.',
    ],
    read: [
      'A healthy uptrend looks like a staircase of Higher Highs and Higher Lows. A downtrend is the mirror image: Lower Highs and Lower Lows.',
      'The first time an uptrend prints a Lower High (LH) or Lower Low (LL), momentum may be shifting — an early warning to tighten up.',
    ],
    example:
      'A stock peaks at ₹250, pulls back to ₹240, makes a new peak at ₹262 (HH) and a higher pullback low of ₹248 (HL) — a textbook uptrend. If the next peak only reaches ₹258 (an LH), buyers are starting to tire.',
    caution:
      'Swings need a few candles on each side to confirm, so the most recent bars can re-label as new candles print.',
  },
  {
    id: 'donchian',
    group: 'Chart basics',
    title: 'Donchian Channel (DC High / Low)',
    color: '#38bdf8',
    tagline: "The ceiling and floor of the price's recent range.",
    what: [
      'DC High is the highest high of the last N candles; DC Low is the lowest low. Here N = 20 prior bars. Picture it as the box the price has been trading inside.',
    ],
    read: [
      'Price pressing against the DC High = testing resistance / near a breakout. Pressing the DC Low = testing support / near a breakdown.',
      'A wide box means a volatile, trending stock. A narrow box means quiet consolidation — often the calm before a move.',
    ],
    example:
      'If over the last 20 candles the highest high was ₹512 and the lowest low ₹486, the Donchian box is ₹486–₹512. A candle that closes at ₹515 pokes above the ceiling → a possible breakout.',
    caution:
      'The channel only marks the levels. The actual signal comes when price CLOSES beyond it — ideally with a jump in volume.',
    formula: 'DC High = max(high, last 20 bars) · DC Low = min(low, last 20 bars)',
  },
  {
    id: 'breakout',
    group: 'Chart basics',
    title: 'Breakout / Breakdown (▲ BO / ▼ BD)',
    color: '#f59e0b',
    tagline: 'Price escaping its recent range — often the start of a fresh move.',
    what: [
      'A Breakout is a close ABOVE the Donchian High (buyers overpower the ceiling). A Breakdown is a close BELOW the Donchian Low (sellers crack the floor).',
      'The ▲ BO / ▼ BD marker on the chart shows the candle where the current run first began.',
    ],
    read: [
      'The best breakouts arrive with a volume surge — check the volume ratio in the header (e.g. 2.0× = twice the average volume).',
      'A breakout on weak volume has a higher chance of being a "fakeout" that snaps back into the range.',
    ],
    example:
      'AEROFLEX chops between ₹180–₹200 for weeks, then closes at ₹206 on 3× its average volume → a breakout. The BO-start marker anchors where the push began, and the scanner ranks it near the top because volume × distance-cleared is large.',
    caution:
      'Breakouts do fail. Many traders wait for a clean close beyond the level, or a "retest" where price dips back to the level and holds, before committing.',
  },
  {
    id: 'volume',
    group: 'Chart basics',
    title: 'Volume',
    color: '#9ca3af',
    tagline: 'How many shares changed hands — the fuel behind every move.',
    what: [
      'The faint bars along the bottom of each candle show the volume traded in that period. High volume = strong participation and conviction; low volume = thin, half-hearted interest.',
    ],
    read: [
      'Rising price + rising volume = a healthy, believable trend.',
      'Rising price + FALLING volume = a weak move that may stall.',
      'A volume spike right at a breakout adds credibility; a spike after a long, extended move can instead signal exhaustion (a possible top/bottom).',
    ],
    example:
      'A stock grinds quietly higher, then one candle prints 4× the average volume as it clears resistance — that surge says larger players just stepped in.',
    caution: 'Volume only means something relative to its OWN recent average, never as a raw number.',
  },
  {
    id: 'ema',
    group: 'Overlays',
    title: 'EMA — Exponential Moving Average (9 / 21 / 50)',
    color: '#38bdf8',
    tagline: 'A smoothed trend line that reacts quickly to recent prices.',
    what: [
      'A moving average smooths out the noise by averaging recent closes into one line. The Exponential version weights the newest candles more heavily, so it turns faster than a plain (simple) average.',
      'EMA 9 = fast (for scalps), EMA 21 = the intraday trend baseline, EMA 50 = the medium-term trend.',
    ],
    read: [
      'Price above a rising EMA = uptrend; price below a falling EMA = downtrend.',
      'The EMA often acts as dynamic support/resistance — pullbacks that touch it and bounce can be low-risk entries in the direction of the trend.',
      'When a fast EMA crosses above a slower EMA, momentum is turning up (and the opposite when it crosses below).',
    ],
    example:
      'On the 5-minute chart price keeps dipping to the rising EMA 21 near ₹193 and pushing higher each time — traders use those "dips to the EMA" as entries that ride the existing trend.',
    caution:
      'In sideways, choppy markets EMAs "whipsaw" — they give many false crosses. They shine in clearly trending conditions.',
    formula: 'EMA = price × k + prevEMA × (1 − k), where k = 2 / (period + 1)',
  },
  {
    id: 'sma200',
    group: 'Overlays',
    title: 'SMA 200 — the long-term line in the sand',
    color: '#e879f9',
    tagline: 'The big-picture trend filter every institution watches.',
    what: [
      'The Simple Moving Average of the last 200 periods, with every candle weighted equally. It is the classic "are we bullish or bearish overall?" line.',
    ],
    read: [
      'Trading above the 200 = long-term bullish bias; below it = bearish bias.',
      'Reclaiming (crossing back above) or losing the 200 is a widely-followed event that can attract or scare off big money.',
    ],
    example:
      'A stock above a flat-to-rising 200-SMA pulls back to touch it and finds buyers — many funds treat that zone as "value inside an uptrend".',
    caution: 'It is slow by design — excellent for context, poor for precise entry timing.',
  },
  {
    id: 'vwap',
    group: 'Overlays',
    title: 'VWAP — Volume-Weighted Average Price',
    color: '#facc15',
    tagline: "The day's true average price, weighted by how much traded at each level.",
    what: [
      'VWAP is a running average of price weighted by volume, measured from the session open. It resets every trading day. Big institutions benchmark their fills against it, which is why it matters.',
    ],
    read: [
      'Price above VWAP = buyers in control intraday (dips back to VWAP can be long opportunities).',
      'Price below VWAP = sellers in control (rallies up to VWAP can be short opportunities).',
      'VWAP acts like a magnet and a battleground — a lot of intraday fights happen right at it.',
    ],
    example:
      'A stock opens strong with VWAP sitting at ₹512. Every dip to ₹512 gets bought and it grinds higher all day — a classic "above VWAP, buy the dip" session.',
    caution:
      'VWAP is an INTRADAY tool. On daily/weekly candles it resets every single bar and loses its meaning — use it on 1m–1h charts.',
  },
  {
    id: 'bb',
    group: 'Overlays',
    title: 'Bollinger Bands (20, 2)',
    color: '#94a3b8',
    tagline: 'A volatility envelope that breathes in and out with the market.',
    what: [
      'A middle line (20-period SMA) with an upper and a lower band placed 2 standard deviations away. The bands widen when volatility rises and squeeze together when it falls.',
    ],
    read: [
      'A tight "squeeze" (very narrow bands) often comes BEFORE a big move — energy is building up.',
      'Price riding the upper band = strong upward momentum; hugging the lower band = strong downward momentum.',
      'In a sideways range, tags of the outer bands can mark stretched extremes that snap back toward the middle.',
    ],
    example:
      'After days of a narrow squeeze around ₹300, the bands suddenly balloon open as price rockets to ₹320 while riding the upper band — the squeeze "released".',
    caution:
      'Touching a band is NOT an automatic buy/sell. In a strong trend, price can "walk the band" for a long time without reversing.',
    formula: 'Middle = SMA(20) · Upper/Lower = Middle ± 2 × standard deviation',
  },
  {
    id: 'supertrend',
    group: 'Overlays',
    title: 'Supertrend (10, 3)',
    color: '#4ade80',
    tagline: 'A trailing trend line that flips colour to call the trend.',
    what: [
      'Supertrend plots a single line that sits BELOW price and turns green in an uptrend, then flips ABOVE price and turns red in a downtrend. It is built from the ATR (volatility), so it automatically gives the market more room when things are wild and hugs closer when quiet.',
      'The two numbers are the ATR period (10) and the multiplier (3). A bigger multiplier = a looser line with fewer flips; a smaller one = tighter and more sensitive.',
    ],
    read: [
      'Line green and below price = stay long / trend is up. Line red and above price = stay short / trend is down.',
      'The moment the line flips from red to green (or green to red) is the trade trigger — it also doubles as a ready-made trailing stop-loss.',
    ],
    example:
      'On a 15-minute chart the Supertrend flips green at ₹244 and trails beneath the rally the whole way to ₹268, only flipping red once price finally closes back below it — one clean trend captured with a built-in stop.',
    caution:
      'In a sideways market Supertrend whipsaws badly, flipping again and again for small losses. It rewards patience in trends and punishes choppy ranges — pair it with ADX to confirm a trend actually exists.',
    formula: 'Bands = (high + low)/2 ± 3 × ATR(10); line flips on a close through the band',
  },
  {
    id: 'psar',
    group: 'Overlays',
    title: 'Parabolic SAR',
    color: '#e2e8f0',
    tagline: 'A dotted trailing stop that accelerates as the trend runs.',
    what: [
      'SAR stands for "Stop And Reverse". It prints a dot each period: dots BELOW price (green) during an uptrend, dots ABOVE price (red) during a downtrend. The dots start slow and then accelerate toward price the longer a trend lasts.',
      'When price finally crosses the dots, the SAR flips to the other side — that flip is both an exit and a potential reversal entry.',
    ],
    read: [
      'Dots under the candles = uptrend intact; use the dot as your trailing stop and drag it up as it rises.',
      'A flip of the dots from below to above (or vice-versa) marks the trend change.',
    ],
    example:
      'A stock trends up with SAR dots climbing beneath it from ₹98 to ₹112. Price then stalls and cracks below the last dot at ₹110 — the dots jump above price, telling the trailing-stop trader to book out.',
    caution:
      'Parabolic SAR is designed for trending markets only. In a range it flips constantly and generates a stream of false signals — switch it off when price is going nowhere.',
    formula: 'SARnext = SAR + AF × (EP − SAR), AF steps 0.02 → 0.20',
  },
  {
    id: 'macd',
    group: 'Oscillators',
    title: 'MACD (12, 26, 9)',
    color: '#22d3ee',
    tagline: 'A momentum meter with built-in buy/sell crossovers.',
    what: [
      'The MACD line = EMA(12) − EMA(26): the gap between a fast and a slow trend. The Signal line = EMA(9) of the MACD line. The histogram (bars) = MACD − Signal.',
      'Together they show whether momentum is building or fading, and in which direction.',
    ],
    read: [
      'MACD crossing ABOVE its signal line = bullish → this is the ▲ buy marker on the price chart. Crossing BELOW = bearish → the ▼ sell marker.',
      'A histogram growing taller = momentum accelerating; shrinking bars = momentum fading even if price still drifts.',
      'MACD above the zero line = overall up-momentum; below zero = down-momentum.',
    ],
    example:
      'On IOLCP the MACD dips, then crosses back above its signal near the lows while the histogram flips from red to green — a ▲ buy signal prints right as price turns up.',
    caution:
      'MACD is built from averages, so it lags. In choppy markets crossovers come thick and fast and can mislead — combine it with trend structure (HH/HL).',
  },
  {
    id: 'rsi',
    group: 'Oscillators',
    title: 'RSI (14) — overbought / oversold',
    color: '#fb923c',
    tagline: 'A 0–100 speed gauge for how stretched a move has become.',
    what: [
      'RSI compares the strength of recent up-moves versus down-moves over 14 periods and plots it on a 0–100 scale.',
      'Above 70 = overbought (stretched to the upside). Below 30 = oversold (stretched to the downside).',
    ],
    read: [
      'In a range: >70 hints "too hot, may pull back" and <30 hints "too cold, may bounce".',
      'Divergence is the powerful signal: price makes a new high but RSI makes a LOWER high = weakening momentum (bearish divergence). The reverse is bullish divergence.',
    ],
    example:
      'A stock spikes to ₹150 with RSI at 82 (deeply overbought). It stalls and drifts back to ₹142 as RSI cools off to 60.',
    caution:
      'In a strong trend RSI can stay overbought (or oversold) for a long time. Never short a rocket just because RSI > 70 — wait for price/structure to confirm.',
  },
  {
    id: 'stoch',
    group: 'Oscillators',
    title: 'Stochastic (14, 3, 3)',
    color: '#34d399',
    tagline: "Where did the close land inside its recent range?",
    what: [
      'The Stochastic plots where the close sits between the recent high and low, on a 0–100 scale. %K is the main line and %D is its smoothed signal line.',
      'Above 80 = overbought, below 20 = oversold.',
    ],
    read: [
      'In a range, %K turning up from below 20 (especially crossing above %D) is a bounce cue; turning down from above 80 is a fade cue.',
      'Like RSI, watch for divergences between the oscillator and price for the highest-quality signals.',
    ],
    example:
      '%K drops to 12 (oversold), then crosses back above %D and starts climbing — an early hint that the pullback is ending.',
    caution:
      'Stochastic fires very often in trends. It is best used in range-bound conditions, or filtered by the higher-timeframe trend direction.',
    formula: '%K = (close − lowN) / (highN − lowN) × 100, then smoothed',
  },
  {
    id: 'adx',
    group: 'Oscillators',
    title: 'ADX / DMI (14)',
    color: '#f472b6',
    tagline: 'Measures how STRONG a trend is — not which direction.',
    what: [
      'ADX (the pink line) rates trend strength from 0 to 100. It is deliberately blind to direction — a high ADX just means "there is a powerful trend", up OR down.',
      'Alongside it sit two direction lines from the DMI: +DI (green, buying pressure) and −DI (red, selling pressure). Which one is on top tells you the direction.',
    ],
    read: [
      'ADX below 20 = weak / no trend (a range — trend systems will struggle). ADX above 25 and rising = a genuine trend worth following. Above 40 = very strong.',
      '+DI above −DI = bulls in charge; −DI above +DI = bears in charge. The cross of these two lines is a directional signal, confirmed when ADX is above 25.',
    ],
    example:
      'A stock breaks out and ADX climbs from 15 to 32 while +DI pulls firmly above −DI — the scanner-worthy combination of "strong trend + pointing up". Trend-following tools like Supertrend work best in exactly this regime.',
    caution:
      'ADX lags and can peak after the easy money is made. A very high, turning-down ADX can mean the trend is getting tired, not that a new one is starting.',
    formula: 'ADX = Wilder-smoothed DX, DX = 100 × |+DI − −DI| / (+DI + −DI)',
  },
  {
    id: 'atr',
    group: 'Oscillators',
    title: 'ATR (14) — volatility',
    color: '#eab308',
    tagline: 'How much this stock typically moves — your position-sizing ruler.',
    what: [
      'Average True Range measures the average size of each candle (including gaps) over 14 periods, in rupees. A high ATR = a wild, fast-moving stock; a low ATR = a calm, slow one.',
      'ATR says NOTHING about direction — only about how big the swings are.',
    ],
    read: [
      'Use ATR to set stops and targets that respect the stock\'s nature: e.g. a stop 1.5–2× ATR away is wide enough to avoid random noise.',
      'A sudden jump in ATR flags a volatility expansion — often around news, breakouts or breakdowns. A shrinking ATR signals a quiet coil that may precede a move.',
    ],
    example:
      'Stock A has an ATR of ₹2 and Stock B an ATR of ₹18. The same ₹5 stop is far too tight for B (it breathes ₹18 a day) but far too loose for A — ATR right-sizes the risk for each.',
    caution:
      'ATR is a raw rupee figure, so you cannot compare it across stocks of very different prices without normalising (e.g. ATR as a % of price).',
    formula: 'TR = max(high−low, |high−prevClose|, |low−prevClose|); ATR = Wilder MA of TR',
  },
  {
    id: 'obv',
    group: 'Oscillators',
    title: 'OBV — On-Balance Volume',
    color: '#2dd4bf',
    tagline: 'A running tally of volume that reveals accumulation vs distribution.',
    what: [
      'OBV adds the whole period\'s volume on an up-close day and subtracts it on a down-close day, building one cumulative line. The idea: volume leads price, so smart money\'s footprints show up in OBV first.',
      'The absolute number does not matter — only the DIRECTION and SLOPE of the line do.',
    ],
    read: [
      'OBV rising with price = the move is backed by real buying (accumulation) — healthy.',
      'The classic edge is DIVERGENCE: price grinds to a new high but OBV fails to — buyers are quietly thinning out, a warning. Price new low but OBV holding up = quiet accumulation.',
    ],
    example:
      'A stock drifts sideways near ₹400 but OBV keeps climbing for two weeks — someone is accumulating on the quiet. Price then breaks out to ₹430, "confirming" what OBV had already hinted.',
    caution:
      'OBV treats a tiny up-close and a huge up-close the same (it uses full volume either way), so it can be noisy. Read the trend of the line, not every wiggle.',
    formula: 'OBV += volume if close>prevClose, −= volume if close<prevClose',
  },
];

const GROUPS: Group[] = ['Chart basics', 'Overlays', 'Oscillators'];

export default function StudyPanel({ initialTopicId }: { initialTopicId?: string }) {
  const [sel, setSel] = useState<string>(
    () => (initialTopicId && TOPICS.some((t) => t.id === initialTopicId) ? initialTopicId : TOPICS[0].id),
  );
  const topic = useMemo(() => TOPICS.find((t) => t.id === sel) ?? TOPICS[0], [sel]);

  return (
    <div className="flex h-full min-h-0 gap-3">
      {/* Topic list */}
      <nav className="w-44 sm:w-60 shrink-0 overflow-y-auto pr-1 -ml-1">
        <div className="flex items-center gap-1.5 px-2 pb-2 text-[11px] font-semibold text-indigo-300">
          <FontAwesomeIcon icon={faBookOpen} className="w-3 h-3" />
          Study library
        </div>
        {GROUPS.map((g) => (
          <div key={g} className="mb-2">
            <p className="px-2 py-1 text-[9px] uppercase tracking-wider text-gray-600">{g}</p>
            {TOPICS.filter((t) => t.group === g).map((t) => {
              const on = t.id === sel;
              return (
                <button
                  key={t.id}
                  onClick={() => setSel(t.id)}
                  title={t.title}
                  className={`w-full flex items-start gap-2 px-2 py-1.5 rounded-lg text-left text-[11.5px] transition-colors ${
                    on ? 'bg-indigo-500/15 text-indigo-200' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                  }`}
                >
                  <span className="mt-[5px] w-2 h-2 rounded-full shrink-0" style={{ background: t.color }} />
                  <span className="min-w-0 leading-snug break-words">{t.title}</span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Content */}
      <article className="flex-1 min-w-0 overflow-y-auto pr-1.5">
        <header className="mb-4">
          <div className="flex items-center gap-2.5">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ background: topic.color }} />
            <h3 className="text-lg font-bold text-gray-100">{topic.title}</h3>
          </div>
          <p className="mt-1 text-[13px] text-gray-400 italic">{topic.tagline}</p>
        </header>

        <Section heading="What it is">
          {topic.what.map((p, i) => (
            <p key={i} className="mb-2 text-[12.5px] leading-relaxed text-gray-300">
              {p}
            </p>
          ))}
        </Section>

        <Section heading="How to read it">
          <ul className="space-y-1.5">
            {topic.read.map((p, i) => (
              <li key={i} className="flex gap-2 text-[12.5px] leading-relaxed text-gray-300">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-400/70 shrink-0" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </Section>

        {topic.formula && (
          <div className="mb-4 rounded-lg border border-white/5 bg-slate-950/50 px-3 py-2">
            <p className="text-[9px] uppercase tracking-wider text-gray-600 mb-1">Formula</p>
            <code className="text-[11.5px] text-sky-300/90 font-mono">{topic.formula}</code>
          </div>
        )}

        <Callout
          icon={faLightbulb}
          tone="emerald"
          title="Example"
          body={topic.example}
        />
        <Callout
          icon={faTriangleExclamation}
          tone="amber"
          title="Watch out"
          body={topic.caution}
        />

        <p className="mt-4 text-[10.5px] text-gray-600">
          Educational content only — not investment advice. Always combine signals and manage risk.
        </p>
      </article>
    </div>
  );
}

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="mb-4">
      <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">{heading}</h4>
      {children}
    </section>
  );
}

function Callout({
  icon,
  tone,
  title,
  body,
}: {
  icon: any;
  tone: 'emerald' | 'amber';
  title: string;
  body: string;
}) {
  const tones = {
    emerald: 'border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-300',
    amber: 'border-amber-500/20 bg-amber-500/[0.06] text-amber-300',
  } as const;
  return (
    <div className={`mb-3 rounded-xl border px-3 py-2.5 ${tones[tone]}`}>
      <div className="flex items-center gap-1.5 mb-1 text-[11px] font-bold uppercase tracking-wide">
        <FontAwesomeIcon icon={icon} className="w-3 h-3" />
        {title}
      </div>
      <p className="text-[12.5px] leading-relaxed text-gray-300">{body}</p>
    </div>
  );
}
