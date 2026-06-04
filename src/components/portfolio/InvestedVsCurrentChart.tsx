'use client';

import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  Line,
  Customized,
} from 'recharts';
import { format, subMonths, subYears, startOfYear, parseISO } from 'date-fns';
import { useState, useMemo } from 'react';
import { ToggleButton, ToggleButtonGroup } from '@mui/material';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faScaleBalanced } from '@fortawesome/free-solid-svg-icons';

type DataPoint = {
  date: Date | string;
  investedCapital: number;
  totalEquity: number;
};

type DateRange = '1M' | '3M' | '6M' | 'YTD' | '1Y' | 'ALL';

const formatIndianNumber = (value: number) => {
  const abs = Math.abs(value);
  if (abs >= 10000000) return `${(value / 10000000).toFixed(2)}Cr`;
  if (abs >= 100000)   return `${(value / 100000).toFixed(2)}L`;
  if (abs >= 1000)     return `${(value / 1000).toFixed(1)}K`;
  return value.toFixed(0);
};

const formatCurrency = (num: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(num);

// ─── Gap fill: pixel-perfect SVG paths between the two lines ──────────────────
// Uses Recharts' `offset` (plot-area bounds) passed to every Customized child.
// chartData and yDomain are passed as explicit props on <Customized>.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const GapFill = ({ chartData: cd, yDomain, offset }: any) => {
  if (!cd?.length || !offset || !yDomain) return null;

  const { left, top, width, height } = offset as {
    left: number; top: number; width: number; height: number;
  };
  if (!width || !height) return null;

  const [yMin, yMax] = yDomain as [number, number];
  if (yMax === yMin) return null;

  const n = cd.length;
  if (n < 2) return null;

  // ── coordinate helpers ──────────────────────────────────────────────────────
  // Recharts uses a point scale for all-line charts: first point at `left`,
  // last at `left + width`, evenly spaced.
  const toX = (i: number) => (n === 1 ? left + width / 2 : left + (i / (n - 1)) * width);
  // SVG y=0 is at top; higher values → smaller y number
  const toY = (v: number) => top + height - (height * (v - yMin)) / (yMax - yMin);

  type Pt = { x: number; yi: number; yc: number }; // yi = invested px, yc = current px

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pts: Pt[] = cd.map((d: any, i: number) => ({
    x:  toX(i),
    yi: toY(d.investedCapital),
    yc: toY(d.totalEquity),
  }));

  // profit: current value above invested ⟹ pixel yc < pixel yi
  const inProfit = (p: Pt) => p.yc <= p.yi;

  // Linear interpolation of the exact crossing pixel
  const cross = (a: Pt, b: Pt): Pt => {
    const da = a.yc - a.yi, db = b.yc - b.yi;
    const t = da / (da - db);
    return {
      x:  a.x  + t * (b.x  - a.x),
      yi: a.yi + t * (b.yi - a.yi),
      yc: a.yc + t * (b.yc - a.yc),
    };
  };

  // ── split into profit / loss segments ──────────────────────────────────────
  type Seg = { profit: boolean; pts: Pt[] };
  const segs: Seg[] = [];
  let cur: Seg = { profit: inProfit(pts[0]), pts: [pts[0]] };

  for (let i = 1; i < pts.length; i++) {
    if (inProfit(pts[i]) !== inProfit(pts[i - 1])) {
      const c = cross(pts[i - 1], pts[i]);
      cur.pts.push(c);
      segs.push(cur);
      cur = { profit: inProfit(pts[i]), pts: [c] };
    }
    cur.pts.push(pts[i]);
  }
  segs.push(cur);

  // ── build closed SVG polygons ───────────────────────────────────────────────
  const buildPath = ({ pts: sp }: Seg) => {
    if (sp.length < 2) return '';
    // Forward along currentEquity line, then back along investedCapital line
    const fwd = sp.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.yc.toFixed(1)}`).join(' ');
    const bwd = [...sp].reverse().map(p => `L${p.x.toFixed(1)},${p.yi.toFixed(1)}`).join(' ');
    return `${fwd} ${bwd}Z`;
  };

  return (
    <g>
      {segs.map((seg, i) => (
        <path
          key={i}
          d={buildPath(seg)}
          // Direct rgba — avoids SVG defs / url() resolution order issues
          fill={seg.profit ? 'rgba(16,185,129,0.22)' : 'rgba(239,68,68,0.22)'}
          stroke="none"
        />
      ))}
    </g>
  );
};

// ─── Main chart component ─────────────────────────────────────────────────────
export default function InvestedVsCurrentChart({ data }: { data: DataPoint[] }) {
  const [dateRange, setDateRange] = useState<DateRange>('ALL');

  const filteredData = useMemo(() => {
    if (!data || data.length === 0) return [];
    const now = new Date();
    const endDate = now;
    let startDate: Date;
    switch (dateRange) {
      case '1M': startDate = subMonths(now, 1); break;
      case '3M': startDate = subMonths(now, 3); break;
      case '6M': startDate = subMonths(now, 6); break;
      case 'YTD': startDate = startOfYear(now); break;
      case '1Y': startDate = subYears(now, 1); break;
      case 'ALL': default: return data;
    }
    return data.filter(d => {
      const date = typeof d.date === 'string' ? parseISO(d.date) : new Date(d.date);
      return date >= startDate && date <= endDate;
    });
  }, [data, dateRange]);

  if (!data || data.length === 0) {
    return (
      <div className="glass-card p-8 text-center animate-fade-in">
        <FontAwesomeIcon icon={faScaleBalanced} className="text-4xl text-gray-600 mb-4 block" />
        <p className="text-gray-400">No data to display</p>
      </div>
    );
  }

  const chartData = filteredData.map(d => ({
    ...d,
    dateStr: format(new Date(d.date), 'yyyy-MM-dd'),
    date: new Date(d.date),
    investedCapital: d.investedCapital ?? 0,
    totalEquity:     d.totalEquity     ?? 0,
  }));

  const monthTicks = (() => {
    const seen = new Set<string>(); const ticks: string[] = [];
    for (const d of chartData) {
      const ym = d.dateStr.slice(0, 7);
      if (!seen.has(ym)) { seen.add(ym); ticks.push(d.dateStr); }
    }
    return ticks;
  })();

  const yDomain = useMemo((): [number, number] => {
    if (chartData.length === 0) return [0, 1];
    const vals = chartData.flatMap(d => [d.investedCapital, d.totalEquity]).filter(isFinite);
    const dMin = Math.min(...vals), dMax = Math.max(...vals);
    const range = dMax - dMin || dMax * 0.1;
    return [Math.max(0, dMin - range * 0.05), dMax + range * 0.05];
  }, [chartData]);

  const handleDateRangeChange = (_e: React.MouseEvent<HTMLElement>, v: DateRange | null) => {
    if (v) setDateRange(v);
  };

  return (
    <div className="animate-fade-in-up w-full h-full flex flex-col">
      {/* Header + Controls */}
      <div className="flex flex-col md:flex-row items-center justify-between mb-4 gap-4">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 flex items-center justify-center">
            <FontAwesomeIcon icon={faScaleBalanced} className="text-emerald-400 text-lg" />
          </div>
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Invested vs Current Value</span>
        </div>

        <ToggleButtonGroup value={dateRange} exclusive onChange={handleDateRangeChange} size="small"
          sx={{
            height: '32px',
            backgroundColor: 'rgba(15,23,42,0.4)',
            '& .MuiToggleButton-root': {
              color: '#9ca3af', border: '1px solid rgba(255,255,255,0.1)',
              fontSize: '0.7rem', fontWeight: 600, padding: '0 12px', textTransform: 'none',
              '&.Mui-selected': {
                backgroundColor: 'rgba(16,185,129,0.2)', color: '#10b981',
                borderColor: 'rgba(16,185,129,0.4)',
                '&:hover': { backgroundColor: 'rgba(16,185,129,0.3)' },
              },
              '&:hover': { backgroundColor: 'rgba(255,255,255,0.05)' },
              '&.Mui-focusVisible, &:focus': { outline: 'none !important', boxShadow: 'none !important' },
            },
          }}
        >
          <ToggleButton value="1M">1M</ToggleButton>
          <ToggleButton value="3M">3M</ToggleButton>
          <ToggleButton value="6M">6M</ToggleButton>
          <ToggleButton value="YTD">YTD</ToggleButton>
          <ToggleButton value="1Y">1Y</ToggleButton>
          <ToggleButton value="ALL">ALL</ToggleButton>
        </ToggleButtonGroup>
      </div>

      <div className="h-[300px] md:h-[400px] w-full mt-4">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 5, left: 5, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />

            <XAxis
              dataKey="dateStr"
              stroke="#6b7280"
              tickFormatter={(v) => format(parseISO(v), "MMM ''yy")}
              ticks={monthTicks}
              tick={{ fill: '#9ca3af', fontSize: 11 }}
              tickLine={{ stroke: '#4b5563' }}
              axisLine={{ stroke: '#374151' }}
              minTickGap={30}
            />
            <YAxis
              stroke="#6b7280"
              tick={{ fill: '#9ca3af', fontSize: 11 }}
              tickLine={{ stroke: '#4b5563' }}
              axisLine={{ stroke: '#374151' }}
              tickFormatter={formatIndianNumber}
              domain={yDomain}
              allowDataOverflow={false}
              width={72}
            />

            <Tooltip content={<CustomTooltip />} />

            {/* Gap fill — must come before the Line elements so lines render on top */}
            <Customized
              component={GapFill}
              // These extra props are merged with the chart state props inside Customized
              chartData={chartData}
              yDomain={yDomain}
            />

            <Line
              type="monotone" dataKey="investedCapital" name="Invested"
              stroke="#f59e0b" strokeWidth={2} dot={false}
              activeDot={{ r: 5, fill: '#f59e0b', strokeWidth: 2, stroke: '#fff' }}
            />
            <Line
              type="monotone" dataKey="totalEquity" name="Current Value"
              stroke="#10b981" strokeWidth={2.5} dot={false}
              activeDot={{ r: 6, fill: '#10b981', strokeWidth: 2, stroke: '#fff' }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 mt-4">
        {[
          { label: 'Invested',      color: '#f59e0b' },
          { label: 'Current Value', color: '#10b981' },
        ].map(item => (
          <div key={item.label} className="flex items-center gap-2 opacity-70">
            <span className="w-6 h-1.5 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="text-[11px] font-medium tracking-wide text-gray-300">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invested = payload.find((p: any) => p.name === 'Invested')?.value      ?? 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const current  = payload.find((p: any) => p.name === 'Current Value')?.value ?? 0;
  const pnl = current - invested;
  const pos = pnl >= 0;
  return (
    <div className="glass-card p-3 border border-white/10 shadow-xl bg-black/80 backdrop-blur-md min-w-[180px]">
      <p className="text-[10px] text-gray-400 mb-2">{format(parseISO(label), 'MMM dd, yyyy')}</p>
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between items-center gap-4 text-xs">
          <span className="font-medium text-amber-400">Invested</span>
          <span className="font-mono text-gray-200">{formatCurrency(invested)}</span>
        </div>
        <div className="flex justify-between items-center gap-4 text-xs">
          <span className="font-medium text-emerald-400">Current</span>
          <span className="font-mono text-gray-200">{formatCurrency(current)}</span>
        </div>
        <div className="border-t border-white/10 pt-1.5 mt-0.5 flex justify-between items-center gap-4 text-xs">
          <span className="font-medium text-gray-300">P&amp;L</span>
          <span className={`font-mono font-semibold ${pos ? 'text-emerald-400' : 'text-red-400'}`}>
            {pos ? '+' : ''}{formatCurrency(pnl)}
          </span>
        </div>
      </div>
    </div>
  );
};
