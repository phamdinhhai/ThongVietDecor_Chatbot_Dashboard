'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type ChartPoint = { label: string; value: number };

const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: '1px solid #e2e8f0',
  boxShadow: '0 8px 24px rgb(15 23 42 / 0.08)',
  fontSize: 12,
};

function EmptyState() {
  return <p className="flex h-[200px] items-center justify-center text-sm text-surface-400">Chưa có dữ liệu</p>;
}

export function ChatByDayChart({ data }: { data: ChartPoint[] }) {
  if (!data || data.length === 0) return <EmptyState />;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
        <XAxis
          dataKey="label"
          fontSize={11}
          stroke="#64748b"
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: string) => {
            const d = new Date(v);
            return `${d.getDate()}/${d.getMonth() + 1}`;
          }}
        />
        <YAxis fontSize={11} stroke="#64748b" tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ stroke: '#c7d2fe' }} />
        <Area
          type="monotone"
          dataKey="value"
          stroke="#6366f1"
          strokeWidth={2}
          fill="url(#areaGradient)"
          name="Tin nhắn"
          dot={false}
          activeDot={{ r: 4, fill: '#6366f1' }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function ChatByHourChart({ data }: { data: ChartPoint[] }) {
  if (!data || data.length === 0) return <EmptyState />;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
        <XAxis dataKey="label" fontSize={10} stroke="#64748b" tickLine={false} axisLine={false} />
        <YAxis fontSize={11} stroke="#64748b" tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#f8fafc' }} />
        <Bar dataKey="value" fill="#0ea5e9" radius={[4, 4, 0, 0]} name="Tin nhắn" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ChatByWeekdayChart({ data }: { data: ChartPoint[] }) {
  if (!data || data.length === 0) return <EmptyState />;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
        <XAxis dataKey="label" fontSize={12} stroke="#64748b" tickLine={false} axisLine={false} />
        <YAxis fontSize={11} stroke="#64748b" tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#f8fafc' }} />
        <Bar dataKey="value" fill="#8b5cf6" radius={[6, 6, 0, 0]} name="Tin nhắn" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TopProductsChart({ data }: { data: ChartPoint[] }) {
  if (!data || data.length === 0) return <EmptyState />;

  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 38)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
        <XAxis type="number" fontSize={11} stroke="#64748b" tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="label"
          fontSize={10}
          stroke="#64748b"
          tickLine={false}
          axisLine={false}
          width={140}
          tick={{ textAnchor: 'end' }}
        />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#f8fafc' }} />
        <Bar dataKey="value" fill="#10b981" radius={[0, 6, 6, 0]} name="Đơn đặt" barSize={20} />
      </BarChart>
    </ResponsiveContainer>
  );
}
