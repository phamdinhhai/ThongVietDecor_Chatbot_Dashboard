'use client';

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const GRID_COLOR = '#e2e8f0';
const AXIS_COLOR = '#64748b';
const BAR_RADIUS: [number, number, number, number] = [3, 3, 0, 0];
const COLORS: Record<string, string> = {
  'Đã mua hàng': '#0f766e',
  'Chưa mua hàng': '#4f46e5',
  '0': '#4f46e5',
  '1': '#0f766e',
  unknown: '#64748b',
};

export function StateBreakdownChart({ data }: { data: Record<string, number> }) {
  const chartData = Object.entries(data).map(([state, count]) => ({ state, count }));

  if (chartData.length === 0) {
    return <p className="flex h-[220px] items-center justify-center text-sm text-surface-400">Chưa có dữ liệu.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={chartData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID_COLOR} />
        <XAxis dataKey="state" fontSize={11} stroke={AXIS_COLOR} tickLine={false} axisLine={false} />
        <YAxis fontSize={11} stroke={AXIS_COLOR} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: '#f8fafc' }}
          contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', boxShadow: '0 8px 24px rgb(15 23 42 / 0.08)', fontSize: 12 }}
        />
        <Bar dataKey="count" radius={BAR_RADIUS} barSize={22} name="Số lượng">
          {chartData.map((entry) => (
            <Cell key={entry.state} fill={COLORS[entry.state] ?? COLORS.unknown} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
