'use client';

import { Paper } from '@mui/material';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faDatabase } from '@fortawesome/free-solid-svg-icons';

interface DataFreshnessProps {
  freshness: {
    latestPriceDate: string | null;
    priceCount: number;
    latestRankDate: { filtered: string | null; all: string | null };
    rankCount: { filtered: number; all: number };
    totalPriceDates: number;
    totalRankDates: number;
  };
}

function formatDate(d: string | null): string {
  if (!d) return '—';
  try {
    return new Date(d + 'T12:00:00Z').toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  } catch { return d; }
}

function FreshnessRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between py-2 border-b border-white/[0.06] last:border-0">
      <span className="text-xs text-gray-400">{label}</span>
      <div className="text-right">
        <span className="text-sm font-semibold text-gray-100 tabular-nums">{value}</span>
        {sub && <span className="text-[10px] text-gray-500 ml-1.5">{sub}</span>}
      </div>
    </div>
  );
}

export default function DataFreshnessCard({ freshness }: DataFreshnessProps) {
  const { latestPriceDate, priceCount, latestRankDate, rankCount, totalPriceDates, totalRankDates } = freshness;

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.5,
        borderRadius: 3,
        border: '1px solid rgba(255,255,255,0.08)',
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <FontAwesomeIcon icon={faDatabase} className="text-sky-400" />
        <h3 className="text-sm font-bold text-white">Data Freshness</h3>
      </div>

      <div className="flex flex-col">
        <FreshnessRow
          label="Latest Prices"
          value={formatDate(latestPriceDate)}
          sub={`${priceCount.toLocaleString()} stocks`}
        />
        <FreshnessRow
          label="Filtered Rankings"
          value={formatDate(latestRankDate.filtered)}
          sub={`${rankCount.filtered} stocks`}
        />
        <FreshnessRow
          label="All Rankings"
          value={formatDate(latestRankDate.all)}
          sub={`${rankCount.all} stocks`}
        />
        <FreshnessRow
          label="Price History"
          value={`${totalPriceDates} trading days`}
        />
        <FreshnessRow
          label="Rank History"
          value={`${totalRankDates} trading days`}
        />
      </div>
    </Paper>
  );
}
