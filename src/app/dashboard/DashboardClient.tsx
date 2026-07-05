'use client';

import { useEffect, useState } from 'react';
import { KpiCard } from './KpiCard';
import { StateBreakdownChart } from './StateBreakdownChart';

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
};

const REFRESH_MS = 60_000; // 60s — nằm trong khoảng 30s-5 phút đã chọn, chỉnh nếu cần

function orderHint(revenue: Kpis['revenue']): string | undefined {
  const parts: string[] = [];
  if (revenue.ordersNeedingVerification > 0) {
    parts.push(`${revenue.ordersNeedingVerification.toLocaleString('vi-VN')} cần xác minh (ID Lọc rỗng)`);
  }
  if (revenue.ordersCollapsedAsRevision > 0) {
    parts.push(`${revenue.ordersCollapsedAsRevision.toLocaleString('vi-VN')} đã gộp do sửa đơn`);
  }
  if (revenue.duplicateRowsRemoved > 0) {
    parts.push(`${revenue.duplicateRowsRemoved.toLocaleString('vi-VN')} dòng trùng đã loại`);
  }
  return parts.length ? parts.join(' · ') : undefined;
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
        // Bỏ qua lỗi 1 lần refresh, thử lại ở chu kỳ tiếp theo.
      }
    }, REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs text-neutral-400">
          Cập nhật lúc {lastUpdated.toLocaleTimeString('vi-VN')} (tự động mỗi {REFRESH_MS / 1000}s)
        </p>
        <a
          href="/api/export"
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
        >
          Xuất CSV đơn hàng
        </a>
      </div>

      <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Tổng khách hàng" value={data.customer.total.toLocaleString('vi-VN')} />
        <KpiCard
          label="Tỷ lệ spam"
          value={`${(data.customer.spamRate * 100).toFixed(1)}%`}
          hint={`${data.customer.spamCount.toLocaleString('vi-VN')} khách`}
        />
        <KpiCard
          label="Tổng đơn hàng"
          value={data.revenue.totalOrders.toLocaleString('vi-VN')}
          hint={orderHint(data.revenue)}
        />
        <KpiCard label="Doanh thu" value={`${data.revenue.totalRevenue.toLocaleString('vi-VN')}đ`} />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <h2 className="mb-4 text-sm font-medium text-neutral-700">Phân bố trạng thái khách hàng</h2>
          <StateBreakdownChart data={data.customer.stateBreakdown} />
        </div>

        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <h2 className="mb-4 text-sm font-medium text-neutral-700">Tỷ lệ chuyển đổi</h2>
          <p className="text-3xl font-medium text-neutral-900">
            {(data.conversion.rate * 100).toFixed(1)}%
          </p>
          <p className="mt-1 text-sm text-neutral-500">
            {data.conversion.orderCount.toLocaleString('vi-VN')} đơn /{' '}
            {data.conversion.sessionCount.toLocaleString('vi-VN')} hội thoại
          </p>
        </div>
      </section>
    </>
  );
}
