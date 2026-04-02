'use client';

import { memo } from 'react';
import type { ScreenerStats } from '@/app/actions/screener';

interface StatsBarProps {
  stats: ScreenerStats;
  activeTab: 'all' | 'prefiltered' | 'portfolio' | 'others';
  onTabChange: (tab: 'all' | 'prefiltered' | 'portfolio' | 'others') => void;
  filteredCount: number;
}

export default memo(function StatsBar({ stats, activeTab, onTabChange, filteredCount }: StatsBarProps) {
  const { total, allTotal, portfolioCount, rankedPortfolioCount, rankBuckets, mcapBreakdown } = stats;
  const othersCount = total - rankedPortfolioCount;
  const totalMcap = mcapBreakdown.large + mcapBreakdown.mid + mcapBreakdown.small + mcapBreakdown.micro;

  const tabs = [
    { key: 'all' as const,         label: 'All',          count: allTotal },
    { key: 'prefiltered' as const, label: 'Pre-filtered', count: total },
    { key: 'portfolio' as const,   label: 'Portfolio',    count: portfolioCount },
    { key: 'others' as const,      label: 'Others',       count: othersCount },
  ];

  return (
    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
      {/* Tabs */}
      <div className="flex items-center gap-1 bg-slate-800/50 border border-white/5 rounded-xl p-1">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => onTabChange(tab.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-slate-700 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {tab.label} <span className="text-gray-500 ml-0.5">({tab.count})</span>
          </button>
        ))}
      </div>

      {/* Portfolio rank distribution + Market cap breakdown — always rendered to prevent layout jump */}
      <div className={`flex items-center gap-4 text-[11px] transition-opacity duration-150 ${activeTab !== 'portfolio' ? 'opacity-0 pointer-events-none' : ''}`}>
          {/* Portfolio rank buckets */}
          <div className="flex items-center gap-2 bg-slate-800/30 border border-white/5 rounded-lg px-3 py-1.5">
            <StatPill label="TOP 25" value={rankBuckets.top25} color="text-emerald-400" />
            <StatPill label="26-50" value={rankBuckets.top50} color="text-yellow-400" />
            <StatPill label="50+" value={rankBuckets.above50} color="text-orange-400" />
          </div>

          {/* Market cap breakdown */}
          <div className="hidden md:flex items-center gap-2 bg-slate-800/30 border border-white/5 rounded-lg px-3 py-1.5">
            <McapPill label="LARGE" value={mcapBreakdown.large} total={totalMcap} color="text-blue-400" />
            <McapPill label="MID" value={mcapBreakdown.mid} total={totalMcap} color="text-yellow-400" />
            <McapPill label="SMALL" value={mcapBreakdown.small} total={totalMcap} color="text-green-400" />
            <McapPill label="MICRO" value={mcapBreakdown.micro} total={totalMcap} color="text-purple-400" />
          </div>
      </div>
    </div>
  );
});

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-gray-500 font-medium uppercase tracking-wider" style={{ fontSize: '9px' }}>{label}</span>
      <span className={`font-bold tabular-nums ${color}`}>{value}</span>
    </div>
  );
}

function McapPill({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex flex-col items-center">
      <span className="text-gray-500 font-medium uppercase tracking-wider" style={{ fontSize: '9px' }}>{label}</span>
      <span className={`font-bold tabular-nums ${color}`}>{pct}%</span>
    </div>
  );
}
