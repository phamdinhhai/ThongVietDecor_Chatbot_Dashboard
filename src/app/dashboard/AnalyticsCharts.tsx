'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type ChartPoint = { label: string; value: number };

const CHART_HEIGHT = 260;
const GRID_COLOR = '#e2e8f0';
const AXIS_COLOR = '#64748b';
const BAR_COLOR = '#4f46e5';
const BAR_COLOR_MUTED = '#0f766e';
const BAR_RADIUS: [number, number, number, number] = [3, 3, 0, 0];
const HORIZONTAL_BAR_RADIUS: [number, number, number, number] = [0, 3, 3, 0];

const TOOLTIP_STYLE = {
  borderRadius: 10,
  border: '1px solid #e2e8f0',
  boxShadow: '0 8px 24px rgb(15 23 42 / 0.08)',
  fontSize: 12,
};

function EmptyState() {
  return <p className="flex h-[220px] items-center justify-center text-sm text-surface-400">Chưa có dữ liệu</p>;
}

function formatDayLabel(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function StandardVerticalBarChart({
  data,
  tickFormatter,
  barColor = BAR_COLOR,
}: {
  data: ChartPoint[];
  tickFormatter?: (value: string) => string;
  barColor?: string;
}) {
  if (!data || data.length === 0) return <EmptyState />;

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID_COLOR} />
        <XAxis
          dataKey="label"
          fontSize={11}
          stroke={AXIS_COLOR}
          tickLine={false}
          axisLine={false}
          tickFormatter={tickFormatter}
        />
        <YAxis fontSize={11} stroke={AXIS_COLOR} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#f8fafc' }} />
        <Bar dataKey="value" fill={barColor} radius={BAR_RADIUS} name="Số lượng" barSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ChatByDayChart({ data }: { data: ChartPoint[] }) {
  return <StandardVerticalBarChart data={data} tickFormatter={formatDayLabel} />;
}

export function ChatByHourChart({ data }: { data: ChartPoint[] }) {
  return <StandardVerticalBarChart data={data} />;
}

export function ChatByWeekdayChart({ data }: { data: ChartPoint[] }) {
  return <StandardVerticalBarChart data={data} />;
}

export function TopProductsChart({ data }: { data: ChartPoint[] }) {
  if (!data || data.length === 0) return <EmptyState />;

  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 38)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={GRID_COLOR} />
        <XAxis type="number" fontSize={11} stroke={AXIS_COLOR} tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="label"
          fontSize={10}
          stroke={AXIS_COLOR}
          tickLine={false}
          axisLine={false}
          width={96}
          tick={{ textAnchor: 'end' }}
        />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#f8fafc' }} />
        <Bar dataKey="value" fill={BAR_COLOR_MUTED} radius={HORIZONTAL_BAR_RADIUS} name="Số lượng" barSize={20} />
      </BarChart>
    </ResponsiveContainer>
  );
}
