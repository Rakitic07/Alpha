'use client';

import { Paper } from '@mui/material';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faDatabase, faCheckCircle, faTimesCircle, faExclamationTriangle } from '@fortawesome/free-solid-svg-icons';
import type { LastCronRun } from '@/app/actions/screener';

interface DataFreshnessProps {
  freshness: {
    latestPriceDate: string | null;
    priceCount: number;
    latestRankDate: { filtered: string | null; all: string | null };
    rankCount: { filtered: number; all: number };
    totalPriceDates: number;
    totalRankDates: number;
    lastCronRun: LastCronRun | null;
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

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit', hour12: true,
      timeZone: 'Asia/Kolkata',
    });
  } catch { return iso; }
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

function CronStatusBadge({ run }: { run: LastCronRun }) {
  const hasErrors = (run.errors?.length ?? 0) > 0 || !!run.details;
  const isSuccess = run.success && !hasErrors;

  if (isSuccess) {
    return (
      <div className="mt-3 flex items-start gap-2 p-2.5 rounded-lg bg-green-500/10 border border-green-500/20">
        <FontAwesomeIcon icon={faCheckCircle} className="text-green-400 mt-0.5 shrink-0 w-3 h-3" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-green-300 font-medium">Last run succeeded</p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {formatTime(run.timestamp)}
            {run.scored != null && ` · ${run.scored} stocks ranked`}
            {run.durationMs != null && ` · ${(run.durationMs / 1000).toFixed(0)}s`}
          </p>
        </div>
      </div>
    );
  }

  const errorMsg = run.details || run.errors?.[0] || 'Unknown error';
  return (
    <div className="mt-3 flex items-start gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
      <FontAwesomeIcon
        icon={hasErrors && run.success ? faExclamationTriangle : faTimesCircle}
        className="text-red-400 mt-0.5 shrink-0 w-3 h-3"
      />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-red-300 font-medium">
          {run.success ? 'Last run had errors' : 'Last run failed'}
        </p>
        <p className="text-[11px] text-gray-400 mt-0.5">{formatTime(run.timestamp)}</p>
        <p className="text-[11px] text-red-400/80 mt-0.5 truncate" title={errorMsg}>{errorMsg}</p>
      </div>
    </div>
  );
}

export default function DataFreshnessCard({ freshness }: DataFreshnessProps) {
  const { latestPriceDate, priceCount, latestRankDate, rankCount, totalPriceDates, totalRankDates, lastCronRun } = freshness;

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.5,
        borderRadius: 3,
        border: '1px solid rgba(255,255,255,0.08)',
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        height: '100%',
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

      {lastCronRun ? (
        <CronStatusBadge run={lastCronRun} />
      ) : (
        <div className="mt-3 p-2.5 rounded-lg bg-slate-800/40 border border-white/5">
          <p className="text-[11px] text-gray-500 text-center">No cron run recorded yet</p>
        </div>
      )}
    </Paper>
  );
}
