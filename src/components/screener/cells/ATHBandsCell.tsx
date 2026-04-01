'use client';

import { memo } from 'react';

interface ATHBandsCellProps {
  athProximity: number; // 0 to 1.0 (1.0 = at ATH)
}

/** 6 dots for 5%/10%/15%/20%/25%/30% ATH proximity bands */
export default memo(function ATHBandsCell({ athProximity }: ATHBandsCellProps) {
  const awayPct = (1 - athProximity) * 100;
  const thresholds = [5, 10, 15, 20, 25, 30];

  return (
    <div className="flex items-center gap-1">
      {thresholds.map(t => (
        <span
          key={t}
          className={`w-2.5 h-2.5 rounded-sm ${
            awayPct <= t ? 'bg-emerald-500' : 'bg-rose-500'
          }`}
          title={`${awayPct <= t ? 'Within' : 'Beyond'} ${t}% of ATH`}
        />
      ))}
    </div>
  );
});
