'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export function StateBreakdownChart({ data }: { data: Record<string, number> }) {
  const chartData = Object.entries(data).map(([state, count]) => ({ state, count }));

  if (chartData.length === 0) {
    return <p className="py-8 text-center text-sm text-neutral-400">Chưa có dữ liệu.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={chartData}>
        <XAxis dataKey="state" fontSize={12} stroke="#888780" />
        <YAxis fontSize={12} stroke="#888780" allowDecimals={false} />
        <Tooltip />
        <Bar dataKey="count" fill="#378ADD" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
