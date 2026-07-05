'use client';

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const COLORS: Record<string, string> = {
  'Đã mua hàng': '#10b981',
  'Chưa mua hàng': '#94a3b8',
  '0': '#94a3b8',
  '1': '#10b981',
  unknown: '#f59e0b',
};

export function StateBreakdownChart({ data }: { data: Record<string, number> }) {
  const chartData = Object.entries(data).map(([state, count]) => ({ state, count }));

  if (chartData.length === 0) {
    return <p className="py-10 text-center text-sm text-surface-400">Chưa có dữ liệu.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
        <XAxis dataKey="state" fontSize={12} stroke="#64748b" tickLine={false} axisLine={false} />
        <YAxis fontSize={12} stroke="#64748b" tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: '#f8fafc' }}
          contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 8px 24px rgb(15 23 42 / 0.08)' }}
        />
        <Bar dataKey="count" radius={[8, 8, 0, 0]}>
          {chartData.map((entry) => (
            <Cell key={entry.state} fill={COLORS[entry.state] ?? '#6366f1'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
