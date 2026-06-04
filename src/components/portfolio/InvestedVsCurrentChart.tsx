'use client';

import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  ComposedChart,
  Line,
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
  if (absValue >= 10000000) {
    return `${(value / 10000000).toFixed(2)}Cr`;
  } else if (absValue >= 100000) {
    return `${(value / 100000).toFixed(2)}L`;
  } else if (absValue >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return value.toFixed(0);
};

const formatCurrency = (num: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(num);

export default function InvestedVsCurrentChart({ data }: { data: DataPoint[] }) {
  const [dateRange, setDateRange] = useState<DateRange>('ALL');

  const filteredData = useMemo(() => {
    if (!data || data.length === 0) return [];

    const now = new Date();
    let startDate: Date;
    const endDate: Date = now;

    switch (dateRange) {
      case '1M':
        startDate = subMonths(now, 1);
        break;
      case '3M':
        startDate = subMonths(now, 3);
        break;
      case '6M':
        startDate = subMonths(now, 6);
        break;
      case 'YTD':
        startDate = startOfYear(now);
        break;
      case '1Y':
        startDate = subYears(now, 1);
        break;
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
    totalEquity: d.totalEquity ?? 0,
  }));

  // One tick per unique year-month
  const monthTicks = (() => {
    const seen = new Set<string>();
    const ticks: string[] = [];
    for (const d of chartData) {
      const ym = d.dateStr.slice(0, 7);
      if (!seen.has(ym)) { seen.add(ym); ticks.push(d.dateStr); }
    }
    return ticks;
  })();

  // Dynamic Y-axis domain — rescales whenever the filtered window changes
  const yDomain = useMemo(() => {
    if (chartData.length === 0) return ['auto', 'auto'] as const;
    const allValues = chartData.flatMap(d => [d.investedCapital, d.totalEquity]).filter(v => isFinite(v));
    const dataMin = Math.min(...allValues);
    const dataMax = Math.max(...allValues);
    const range = dataMax - dataMin || dataMax * 0.1;
    const pad = range * 0.05;
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
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Invested vs Current Value</span>
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
                '&:hover': {
                  backgroundColor: 'rgba(16, 185, 129, 0.3)',
                },
              },
              '&:hover': {
                backgroundColor: 'rgba(255,255,255,0.05)',
              },
              '&.Mui-focusVisible': {
                outline: 'none !important',
                boxShadow: 'none !important',
              },
              '&:focus': {
                outline: 'none !important',
                boxShadow: 'none !important',
              },
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
            <defs>
              <linearGradient id="investedGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="currentGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
              </linearGradient>
            </defs>

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

            {/* Invested Capital — filled area below */}
            <Area
              type="monotone"
              dataKey="investedCapital"
              name="Invested"
              stroke="#f59e0b"
              strokeWidth={2}
              fill="url(#investedGradient)"
              dot={false}
              activeDot={{ r: 5, fill: '#f59e0b', strokeWidth: 2, stroke: '#fff' }}
            />

            {/* Current Value — line on top */}
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
          { label: 'Invested', color: '#f59e0b' },
          { label: 'Current Value', color: '#10b981' },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-2 opacity-70">
            <span className="w-6 h-1.5 rounded-full shadow-sm" style={{ backgroundColor: item.color }} />
            <span className="text-[11px] font-medium tracking-wide text-gray-300">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const invested = payload.find((p: any) => p.name === 'Invested')?.value ?? 0;
    const current = payload.find((p: any) => p.name === 'Current Value')?.value ?? 0;
    const pnl = current - invested;
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
