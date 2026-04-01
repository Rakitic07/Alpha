'use client';

import { memo } from 'react';
import { LineChart, Line } from 'recharts';

interface SparklineCellProps {
  data: number[];
}

export default memo(function SparklineCell({ data }: SparklineCellProps) {
  if (!data || data.length < 2) return <span className="text-gray-600 text-xs">—</span>;

  const isUp = data[data.length - 1] >= data[0];
  const color = isUp ? '#10b981' : '#f43f5e';
  const chartData = data.map((v, i) => ({ v }));

  return (
    <LineChart width={120} height={32} data={chartData}>
      <Line
        type="monotone"
        dataKey="v"
        stroke={color}
        strokeWidth={1.5}
        dot={false}
        isAnimationActive={false}
      />
    </LineChart>
  );
});
