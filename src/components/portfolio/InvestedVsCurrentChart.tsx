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

// Format number in Indian style (lakhs/crores)
const formatIndianNumber = (value: number) => {
  const absValue = Math.abs(value);
  if (absValue >= 10000000) return `${(value / 10000000).toFixed(2)}Cr`;
  if (absValue >= 100000)   return `${(value / 100000).toFixed(2)}L`;
  if (absValue >= 1000)     return `${(value / 1000).toFixed(1)}K`;
  return value.toFixed(0);
};

const formatCurrency = (num: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(num);

// ─── Gap fill drawn as custom SVG between the two lines ───────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CustomGapFill = ({ xAxisMap, yAxisMap, data }: any) => {
  if (!xAxisMap || !yAxisMap || !data?.length) return null;

  const xAxis = xAxisMap[Object.keys(xAxisMap)[0]];
  const yAxis = yAxisMap[Object.keys(yAxisMap)[0]];
  if (!xAxis?.scale || !yAxis?.scale) return null;

  const xScale = xAxis.scale;
  const yScale = yAxis.scale;
  // Point scale has no bandwidth; band scale has one
  const bw = typeof xScale.bandwidth === 'function' ? xScale.bandwidth() / 2 : 0;

  type Pt = { x: number; yi: number; yc: number };

  // Map raw data to pixel coordinates
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pts: Pt[] = (data as any[])
    .filter(d => d.dateStr && Number.isFinite(d.investedCapital) && Number.isFinite(d.totalEquity))
    .map(d => ({
      x:  (xScale(d.dateStr) ?? 0) + bw,
      yi: yScale(d.investedCapital) as number,   // pixel y for invested
      yc: yScale(d.totalEquity)    as number,    // pixel y for current value
    }));

  if (pts.length < 2) return null;

  // In SVG lower y = higher on screen → profit when yc ≤ yi
  const inProfit = (p: Pt) => p.yc <= p.yi;

  // Linear-interpolate the pixel crossing between two adjacent points
  const cross = (a: Pt, b: Pt): Pt => {
    const da = a.yc - a.yi;
    const db = b.yc - b.yi;
    const t  = da / (da - db);
    const x  = a.x  + t * (b.x  - a.x);
    const yi = a.yi + t * (b.yi - a.yi);
    return { x, yi, yc: yi }; // the two lines meet exactly at the crossing
  };

  // Split data into contiguous profit / loss segments
  type Seg = { isProfit: boolean; pts: Pt[] };
  const segments: Seg[] = [];
  let cur: Seg = { isProfit: inProfit(pts[0]), pts: [pts[0]] };

  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    if (inProfit(prev) !== inProfit(curr)) {
      const c = cross(prev, curr);
      cur.pts.push(c);
      segments.push(cur);
      cur = { isProfit: inProfit(curr), pts: [c, curr] };
    } else {
      cur.pts.push(curr);
    }
  }
  segments.push(cur);

  // Build a closed SVG polygon for each segment
  const buildPath = (seg: Seg): string => {
    const sp = seg.pts;
    if (sp.length < 2) return '';
    // Forward along the current-value line (top when in profit)
    const fwd = sp
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)},${p.yc.toFixed(1)}`)
      .join(' ');
    // Backward along the invested-capital line (bottom when in profit)
    const bwd = [...sp]
      .reverse()
      .map(p => `L ${p.x.toFixed(1)},${p.yi.toFixed(1)}`)
      .join(' ');
    return `${fwd} ${bwd} Z`;
  };

  return (
    <g>
      <defs>
        <linearGradient id="profitFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#10b981" stopOpacity={0.35} />
          <stop offset="100%" stopColor="#10b981" stopOpacity={0.06} />
        </linearGradient>
        <linearGradient id="lossFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#ef4444" stopOpacity={0.08} />
          <stop offset="100%" stopColor="#ef4444" stopOpacity={0.35} />
        </linearGradient>
      </defs>
      {segments.map((seg, i) => (
        <path
          key={i}
          d={buildPath(seg)}
          fill={seg.isProfit ? 'url(#profitFill)' : 'url(#lossFill)'}
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
    let startDate: Date;
    const endDate: Date = now;

    switch (dateRange) {
      case '1M': startDate = subMonths(now, 1); break;
      case '3M': startDate = subMonths(now, 3); break;
      case '6M': startDate = subMonths(now, 6); break;
      case 'YTD': startDate = startOfYear(now); break;
      case '1Y': startDate = subYears(now, 1);  break;
      case 'ALL':
      default:
        return data;
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

  // One tick per unique year-month
  const monthTicks = (() => {
    const seen  = new Set<string>();
    const ticks: string[] = [];
    for (const d of chartData) {
      const ym = d.dateStr.slice(0, 7);
      if (!seen.has(ym)) { seen.add(ym); ticks.push(d.dateStr); }
    }
    return ticks;
  })();

  // Dynamic Y-axis domain — rescales per time-period
  const yDomain = useMemo(() => {
    if (chartData.length === 0) return ['auto', 'auto'] as const;
    const vals = chartData.flatMap(d => [d.investedCapital, d.totalEquity]).filter(v => isFinite(v));
    const dataMin = Math.min(...vals);
    const dataMax = Math.max(...vals);
    const range   = dataMax - dataMin || dataMax * 0.1;
    const pad     = range * 0.05;
    return [Math.max(0, dataMin - pad), dataMax + pad] as [number, number];
  }, [chartData]);

  const handleDateRangeChange = (_event: React.MouseEvent<HTMLElement>, newRange: DateRange | null) => {
    if (newRange !== null) setDateRange(newRange);
  };

  return (
    <div className="animate-fade-in-up w-full h-full flex flex-col">
      {/* Header + Controls */}
      <div className="flex flex-col md:flex-row items-center justify-between mb-4 gap-4">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 flex items-center justify-center">
            <FontAwesomeIcon icon={faScaleBalanced} className="text-emerald-400 text-lg" />
          </div>
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            Invested vs Current Value
          </span>
        </div>

        <ToggleButtonGroup
          value={dateRange}
          exclusive
          onChange={handleDateRangeChange}
          size="small"
          sx={{
            height: '32px',
            backgroundColor: 'rgba(15, 23, 42, 0.4)',
            '& .MuiToggleButton-root': {
              color: '#9ca3af',
              border: '1px solid rgba(255,255,255,0.1)',
              fontSize: '0.7rem',
              fontWeight: 600,
              padding: '0 12px',
              textTransform: 'none',
              '&.Mui-selected': {
                backgroundColor: 'rgba(16, 185, 129, 0.2)',
                color: '#10b981',
                borderColor: 'rgba(16, 185, 129, 0.4)',
                '&:hover': { backgroundColor: 'rgba(16, 185, 129, 0.3)' },
              },
              '&:hover': { backgroundColor: 'rgba(255,255,255,0.05)' },
              '&.Mui-focusVisible': { outline: 'none !important', boxShadow: 'none !important' },
              '&:focus':            { outline: 'none !important', boxShadow: 'none !important' },
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
              tickFormatter={(value) => format(parseISO(value), "MMM ''yy")}
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
              tickFormatter={(value) => formatIndianNumber(value)}
              domain={yDomain}
              allowDataOverflow={false}
              width={72}
            />

            <Tooltip content={<CustomTooltip />} />

            {/* Dynamic gap fill — rendered before the lines so lines sit on top */}
            <Customized component={CustomGapFill} />

            {/* Invested Capital line */}
            <Line
              type="monotone"
              dataKey="investedCapital"
              name="Invested"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, fill: '#f59e0b', strokeWidth: 2, stroke: '#fff' }}
            />

            {/* Current Value line */}
            <Line
              type="monotone"
              dataKey="totalEquity"
              name="Current Value"
              stroke="#10b981"
              strokeWidth={2.5}
              dot={false}
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
          { label: 'Profit zone',   color: '#10b981', opacity: 0.4, isDash: true },
          { label: 'Loss zone',     color: '#ef4444', opacity: 0.4, isDash: true },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-2 opacity-70">
            {item.isDash ? (
              <span
                className="w-6 h-3 rounded-sm"
                style={{ backgroundColor: item.color, opacity: item.opacity ?? 1 }}
              />
            ) : (
              <span className="w-6 h-1.5 rounded-full" style={{ backgroundColor: item.color }} />
            )}
            <span className="text-[11px] font-medium tracking-wide text-gray-300">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invested = payload.find((p: any) => p.name === 'Invested')?.value      ?? 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const current  = payload.find((p: any) => p.name === 'Current Value')?.value ?? 0;
    const pnl        = current - invested;
    const isPositive = pnl >= 0;

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
            <span className={`font-mono font-semibold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
              {isPositive ? '+' : ''}{formatCurrency(pnl)}
            </span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};
