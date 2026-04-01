'use client';

import { memo } from 'react';

interface RankChangeCellProps {
  change: number | null;
}

export default memo(function RankChangeCell({ change }: RankChangeCellProps) {
  if (change === null || change === 0) {
    return <span className="text-gray-500 text-xs">—</span>;
  }

  const isUp = change > 0;
  return (
    <span className={`text-xs font-medium tabular-nums ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
      {isUp ? '↑' : '↓'}{Math.abs(change)}
    </span>
  );
});
