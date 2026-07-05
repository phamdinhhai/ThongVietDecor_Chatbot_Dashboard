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

const ICON_PATHS = {
  users: 'M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 7.5a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z',
  orders: 'M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.008v.008H3.75V6.75Zm0 5.25h.008v.008H3.75V12Zm0 5.25h.008v.008H3.75v-.008Z',
  revenue: 'M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m-18-1.5h.75a.75.75 0 0 1 .75.75v.75m0-10.5h16.5m-16.5 0H3a.75.75 0 0 0-.75.75v.75m0 0h.75a.75.75 0 0 1 .75.75m13.5 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  conversion: 'M3 4.5h18M6.75 9h10.5M10.5 13.5h3M12 18v-4.5m0 0L9.75 15.75M12 13.5l2.25 2.25',
  product: 'm21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25m0-9L3 7.5m9 5.25v9M3 7.5v9l9 5.25',
  duplicate: 'M16.5 8.25V6A2.25 2.25 0 0 0 14.25 3.75h-8A2.25 2.25 0 0 0 4 6v8a2.25 2.25 0 0 0 2.25 2.25H8.5m3-8h6.25A2.25 2.25 0 0 1 20 10.5v6.25A2.25 2.25 0 0 1 17.75 19h-6.25A2.25 2.25 0 0 1 9.25 16.75V10.5A2.25 2.25 0 0 1 11.5 8.25Z',
} as const;

function formatVnd(value: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);
}

function Icon({ path }: { path: string }) {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-surface-950">{title}</h3>
        {subtitle && <p className="mt-1 text-sm text-surface-500">{subtitle}</p>}
      </div>
      {children}
    </section>
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
      <section className="rounded-3xl border border-surface-800 bg-surface-950 p-6 text-white shadow-card animate-slide-up">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-2 text-sm font-medium text-brand-200">Live analytics · cập nhật mỗi {REFRESH_MS / 1000}s</p>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Hiệu suất chatbot bán hàng</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-surface-300">
              Tổng hợp khách nhắn tin, đơn hàng, doanh thu và phân bổ thời gian tương tác từ dữ liệu Supabase.
            </p>
          </div>
          <div className="text-sm text-surface-300">
            Cập nhật lúc <span className="font-semibold text-white">{lastUpdated.toLocaleTimeString('vi-VN')}</span>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          label="Tổng khách hàng"
          value={data.customer.total.toLocaleString('vi-VN')}
          hint={`${data.conversion.sessionCount.toLocaleString('vi-VN')} hội thoại có tin nhắn`}
          tone="brand"
          icon={<Icon path={ICON_PATHS.users} />}
        />
        <KpiCard
          label="Tổng đơn hàng"
          value={data.revenue.totalOrders.toLocaleString('vi-VN')}
          hint={`${data.revenue.ordersNeedingVerification.toLocaleString('vi-VN')} đơn cần xác minh · ${data.revenue.ordersCollapsedAsRevision.toLocaleString('vi-VN')} đơn sửa đã gộp`}
          tone="emerald"
          icon={<Icon path={ICON_PATHS.orders} />}
        />
        <KpiCard
          label="Doanh thu"
          value={formatVnd(data.revenue.totalRevenue)}
          hint={`Giá trị trung bình ${formatVnd(avgRevenue)} / đơn`}
          tone="amber"
          icon={<Icon path={ICON_PATHS.revenue} />}
        />
        <KpiCard
          label="Tỷ lệ chuyển đổi"
          value={`${(data.conversion.rate * 100).toFixed(1)}%`}
          hint={`${data.conversion.orderCount.toLocaleString('vi-VN')} đơn / ${data.conversion.sessionCount.toLocaleString('vi-VN')} hội thoại`}
          tone="violet"
          icon={<Icon path={ICON_PATHS.conversion} />}
        />
        <KpiCard
          label="Sản phẩm hot"
          value={topProduct?.label ?? '—'}
          hint={topProduct ? `${topProduct.value.toLocaleString('vi-VN')} lượt đặt sau khi lọc trùng` : 'Chưa có dữ liệu'}
          tone="sky"
          icon={<Icon path={ICON_PATHS.product} />}
        />
        <KpiCard
          label="Dữ liệu trùng đã loại"
          value={data.analytics.quality.duplicateOrderRowsRemoved.toLocaleString('vi-VN')}
          hint={`${data.analytics.quality.duplicateChatRowsRemoved.toLocaleString('vi-VN')} tin nhắn trùng · ${data.revenue.duplicateRowsRemoved.toLocaleString('vi-VN')} dòng order trùng KPI`}
          tone="rose"
          icon={<Icon path={ICON_PATHS.duplicate} />}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ChartCard title="Tin nhắn theo ngày" subtitle="Số tin nhắn đã lọc trùng theo từng ngày">
            <ChatByDayChart data={data.analytics.chatByDay} />
          </ChartCard>
        </div>
        <ChartCard title="Sản phẩm đặt nhiều" subtitle="Top sản phẩm sau khi lọc đơn trùng">
          <TopProductsChart data={data.analytics.topProducts} />
        </ChartCard>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard title="Tin nhắn theo giờ" subtitle="Phân bổ trong ngày">
          <ChatByHourChart data={data.analytics.chatByHour} />
        </ChartCard>
        <ChartCard title="Tin nhắn theo thứ" subtitle="Phân bổ trong tuần">
          <ChatByWeekdayChart data={data.analytics.chatByWeekday} />
        </ChartCard>
        <ChartCard title="Trạng thái khách hàng" subtitle="Mua hàng so với chưa mua">
          <StateBreakdownChart data={data.customer.stateBreakdown} />
        </ChartCard>
      </section>
    </div>
  );
}
