'use client';

import { useEffect, useMemo, useState } from 'react';
import { KpiCard } from './KpiCard';
import { StateBreakdownChart } from './StateBreakdownChart';
import { ChatByDayChart, ChatByHourChart, ChatByWeekdayChart, TopProductsChart } from './AnalyticsCharts';
import type { AnalyticsData } from '@/lib/queries';

export type Kpis = {
  customer: { total: number; spamCount: number; spamRate: number; stateBreakdown: Record<string, number> };
  revenue: {
    totalOrders: number;
    totalRevenue: number;
    ordersNeedingVerification: number;
    ordersCollapsedAsRevision: number;
    duplicateRowsRemoved: number;
  };
  conversion: { sessionCount: number; orderCount: number; rate: number };
  analytics: AnalyticsData;
};

const REFRESH_MS = 60_000;

function formatVnd(value: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);
}

function orderHint(revenue: Kpis['revenue']): string | undefined {
  const parts: string[] = [];
  if (revenue.ordersNeedingVerification > 0) parts.push(`${revenue.ordersNeedingVerification.toLocaleString('vi-VN')} cần xác minh`);
  if (revenue.ordersCollapsedAsRevision > 0) parts.push(`${revenue.ordersCollapsedAsRevision.toLocaleString('vi-VN')} gộp sửa đơn`);
  if (revenue.duplicateRowsRemoved > 0) parts.push(`${revenue.duplicateRowsRemoved.toLocaleString('vi-VN')} dòng trùng loại`);
  return parts.length ? parts.join(' · ') : undefined;
}

function Icon({ path }: { path: string }) {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  );
}

export function DashboardClient({ initialData }: { initialData: Kpis }) {
  const [data, setData] = useState<Kpis>(initialData);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/kpis', { cache: 'no-store' });
        if (!res.ok) return;
        const json = await res.json();
        setData(json);
        setLastUpdated(new Date());
      } catch {
        // Ignore one refresh failure; next interval will retry.
      }
    }, REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

  const topProduct = useMemo(() => data.analytics.topProducts?.[0], [data.analytics.topProducts]);
  const avgRevenue = data.revenue.totalOrders > 0 ? data.revenue.totalRevenue / data.revenue.totalOrders : 0;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-surface-950 via-brand-950 to-surface-900 p-6 text-white shadow-glow animate-slide-up">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-2 inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-brand-100 ring-1 ring-white/15">
              Live analytics • tự động cập nhật mỗi {REFRESH_MS / 1000}s
            </p>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Hiệu suất chatbot bán hàng</h2>
            <p className="mt-2 max-w-2xl text-sm text-surface-300">
              Tổng hợp khách nhắn tin, đơn hàng, doanh thu và phân bổ thời gian tương tác từ dữ liệu Supabase.
            </p>
          </div>
          <div className="text-sm text-surface-300">
            Cập nhật lúc <span className="font-semibold text-white">{lastUpdated.toLocaleTimeString('vi-VN')}</span>
          </div>
        </div>
      </section>

      {/* KPI Cards */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <KpiCard
          label="Tổng khách hàng"
          value={data.customer.total.toLocaleString('vi-VN')}
          hint={`${data.conversion.sessionCount.toLocaleString('vi-VN')} hội thoại có tin nhắn`}
          gradient="linear-gradient(135deg, #6366f1, #0ea5e9)"
          icon={<Icon path="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m-7.5-2.962a3.75 3.75 0 1 0-7.5 0 3.75 3.75 0 0 0 7.5 0Zm9-2.25a2.25 2.25 0 1 0-4.5 0 2.25 2.25 0 0 0 4.5 0ZM9 13.5a6 6 0 0 0-6 6v.75h12v-.75a6 6 0 0 0-6-6Z" />}
        />
        <KpiCard
          label="Tổng đơn hàng"
          value={data.revenue.totalOrders.toLocaleString('vi-VN')}
          hint={orderHint(data.revenue)}
          gradient="linear-gradient(135deg, #10b981, #14b8a6)"
          icon={<Icon path="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007Z" />}
        />
        <KpiCard
          label="Doanh thu"
          value={formatVnd(data.revenue.totalRevenue)}
          hint={`TB ${formatVnd(avgRevenue)} / đơn`}
          gradient="linear-gradient(135deg, #f59e0b, #f97316)"
          icon={<Icon path="M12 6v12m-3-9.818c.879-.517 1.877-.81 3-.81 1.123 0 2.121.293 3 .81M9 15.818c.879.517 1.877.81 3 .81 1.123 0 2.121-.293 3-.81M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />}
        />
        <KpiCard
          label="Chuyển đổi"
          value={`${(data.conversion.rate * 100).toFixed(1)}%`}
          hint={`${data.conversion.orderCount.toLocaleString('vi-VN')} đơn / ${data.conversion.sessionCount.toLocaleString('vi-VN')} hội thoại`}
          gradient="linear-gradient(135deg, #8b5cf6, #ec4899)"
          icon={<Icon path="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.63-1.238m-19.5 9.2 4.5-4.5m0 0 4.5 4.5m-4.5-4.5V3" />}
        />
        <KpiCard
          label="Sản phẩm hot"
          value={topProduct?.label ?? '—'}
          hint={topProduct ? `${topProduct.value.toLocaleString('vi-VN')} lượt đặt` : 'Chưa có dữ liệu'}
          gradient="linear-gradient(135deg, #06b6d4, #3b82f6)"
          icon={<Icon path="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />}
        />
        <KpiCard
          label="Cần chuẩn hoá"
          value={data.analytics.quality.zeroBillingCount.toLocaleString('vi-VN')}
          hint="billing không có số / COD"
          gradient="linear-gradient(135deg, #f43f5e, #fb7185)"
          icon={<Icon path="M12 9v3.75m0 3.75h.008v.008H12v-.008Zm-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.948 3.378c-.866-1.5-3.03-1.5-3.896 0L2.697 16.126Z" />}
        />
      </section>

      {/* Charts */}
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="card p-5 xl:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-surface-900">Tin nhắn theo ngày</h3>
            <span className="badge badge-brand">fb_chats</span>
          </div>
          <ChatByDayChart data={data.analytics.chatByDay} />
        </div>
        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-surface-900">Sản phẩm đặt nhiều</h3>
            <span className="badge badge-success">Top 8</span>
          </div>
          <TopProductsChart data={data.analytics.topProducts} />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card p-5">
          <h3 className="mb-4 font-semibold text-surface-900">Theo giờ trong ngày</h3>
          <ChatByHourChart data={data.analytics.chatByHour} />
        </div>
        <div className="card p-5">
          <h3 className="mb-4 font-semibold text-surface-900">Theo ngày trong tuần</h3>
          <ChatByWeekdayChart data={data.analytics.chatByWeekday} />
        </div>
        <div className="card p-5">
          <h3 className="mb-4 font-semibold text-surface-900">Trạng thái khách hàng</h3>
          <StateBreakdownChart data={data.customer.stateBreakdown} />
        </div>
      </section>
    </div>
  );
}
