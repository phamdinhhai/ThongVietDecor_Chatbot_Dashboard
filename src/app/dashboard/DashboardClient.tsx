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

type TabIconName = 'overview' | 'customers' | 'orders';
type MetricIconName = 'customers' | 'orders' | 'revenue' | 'conversion' | 'product';

const REFRESH_MS = 60_000;

function formatVnd(value: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);
}

function MetricIcon({ name }: { name: MetricIconName }) {
  const baseProps = {
    className: 'h-5 w-5',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  return (
    <svg {...baseProps} aria-hidden="true">
      {name === 'customers' && (
        <>
          <circle cx="9" cy="8" r="3" />
          <path d="M3.5 19c.8-3.4 2.8-5 5.5-5s4.7 1.6 5.5 5" />
          <circle cx="17" cy="9" r="2.2" />
          <path d="M15.5 14.5c2.3.2 3.8 1.7 4.4 4.5" />
        </>
      )}
      {name === 'orders' && (
        <>
          <rect x="5" y="4" width="14" height="16" rx="2" />
          <path d="M9 8h6M9 12h6M9 16h4" />
        </>
      )}
      {name === 'revenue' && (
        <>
          <rect x="3.5" y="6" width="17" height="12" rx="2" />
          <circle cx="12" cy="12" r="2.4" />
          <path d="M6.5 9.5v5M17.5 9.5v5" />
        </>
      )}
      {name === 'conversion' && (
        <>
          <path d="M4 5h16l-6.2 7.1v4.8L10.2 19v-6.9L4 5Z" />
          <path d="M9 5h6" />
        </>
      )}
      {name === 'product' && (
        <>
          <path d="M12 3.8 19 7.7v8.6l-7 3.9-7-3.9V7.7l7-3.9Z" />
          <path d="M5.4 8 12 11.8 18.6 8M12 11.8v8" />
        </>
      )}
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

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          label="Tổng khách hàng"
          value={data.customer.total.toLocaleString('vi-VN')}
          hint={`${data.conversion.sessionCount.toLocaleString('vi-VN')} hội thoại có tin nhắn`}
          tone="brand"
          icon={<MetricIcon name="customers" />}
        />
        <KpiCard
          label="Tổng đơn hàng"
          value={data.revenue.totalOrders.toLocaleString('vi-VN')}
          hint={`${data.revenue.ordersNeedingVerification.toLocaleString('vi-VN')} đơn cần xác minh · ${data.revenue.ordersCollapsedAsRevision.toLocaleString('vi-VN')} đơn sửa đã gộp`}
          tone="emerald"
          icon={<MetricIcon name="orders" />}
        />
        <KpiCard
          label="Doanh thu"
          value={formatVnd(data.revenue.totalRevenue)}
          hint={`Giá trị trung bình ${formatVnd(avgRevenue)} / đơn`}
          tone="amber"
          icon={<MetricIcon name="revenue" />}
        />
        <KpiCard
          label="Tỷ lệ chuyển đổi"
          value={`${(data.conversion.rate * 100).toFixed(1)}%`}
          hint={`${data.conversion.orderCount.toLocaleString('vi-VN')} đơn / ${data.conversion.sessionCount.toLocaleString('vi-VN')} hội thoại`}
          tone="violet"
          icon={<MetricIcon name="conversion" />}
        />
        <KpiCard
          label="Sản phẩm hot"
          value={topProduct?.label ?? '—'}
          hint={topProduct ? `${topProduct.value.toLocaleString('vi-VN')} sản phẩm đã đặt` : 'Chưa có dữ liệu'}
          tone="sky"
          icon={<MetricIcon name="product" />}
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
