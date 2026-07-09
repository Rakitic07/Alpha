'use client';

import dynamic from 'next/dynamic';

const SectorHistoryChart = dynamic(() => import('./SectorHistoryChart'), {
  loading: () => <div className="h-[400px] glass-card animate-pulse" />,
  ssr: false
});

 
export default function SectorHistoryChartWrapper(props: any) {
  return <SectorHistoryChart {...props} />;
}
