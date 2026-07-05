'use client';

import { useEffect, useState } from 'react';
import { KpiCard } from './KpiCard';
import { StateBreakdownChart } from './StateBreakdownChart';

type Kpis = {
  customer: {
    totalRows: number;
    uniqueCount: number;
    duplicateRowCount: number;
    duplicateGroupCount: number;
    avgSpamMark: number;
    stateBreakdown: Record<string, number>;
  };
  revenue: {
    totalRevenue: number;
    totalOrders: number;
    confirmedOrders: number;
    unverifiedRowCount: number;
  };
};

type DataQuality = {
  customer: {
    totalRows: number;
    uniqueCount: number;
    duplicateRowCount: number;
    duplicateGroupCount: number;
    sampleDuplicates: { customerId: string; pageId: string; rowIds: number[]; keptRowId: number }[];
  };
  order: {
    totalRows: number;
    unverifiedRowCount: number;
    phoneFormatIssueCount: number;
    billingFormatIssueCount: number;
  };
};

const REFRESH_MS = 60_000; // 60s — trong khoảng 30s-5 phút đã chọn

export function DashboardClient({ initialData }: { initialData: Kpis }) {
  const [data, setData] = useState<Kpis>(initialData);
  const [quality, setQuality] = useState<DataQuality | null>(null);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  useEffect(() => {
    async function refresh() {
      try {
        const [kpisRes, qualityRes] = await Promise.all([
          fetch('/api/kpis', { cache: 'no-store' }),
          fetch('/api/data-quality', { cache: 'no-store' }),
        ]);
        if (kpisRes.ok) setData(await kpisRes.json());
        if (qualityRes.ok) setQuality(await qualityRes.json());
        setLastUpdated(new Date());
      } catch {
        // Bỏ qua lỗi 1 lần refresh, thử lại ở chu kỳ tiếp theo.
      }
    }
    refresh();
    const interval = setInterval(refresh, REFRESH_MS);
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
        <KpiCard
          label="Khách hàng (đã khử trùng)"
          value={data.customer.uniqueCount.toLocaleString('vi-VN')}
          hint={`${data.customer.totalRows.toLocaleString('vi-VN')} dòng thô, ${data.customer.duplicateRowCount} dòng trùng`}
        />
        <KpiCard
          label="Tổng đơn hàng"
          value={data.revenue.totalOrders.toLocaleString('vi-VN')}
          hint={`${data.revenue.confirmedOrders} xác nhận, ${data.revenue.unverifiedRowCount} cần kiểm tra`}
        />
        <KpiCard label="Doanh thu" value={`${data.revenue.totalRevenue.toLocaleString('vi-VN')}đ`} />
        <KpiCard
          label="spam_mark trung bình"
          value={data.customer.avgSpamMark.toFixed(1)}
          hint="Chưa có ngưỡng phân loại spam"
        />
      </section>

      <section className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <h2 className="mb-4 text-sm font-medium text-neutral-700">Phân bố trạng thái khách hàng (State)</h2>
          <StateBreakdownChart data={data.customer.stateBreakdown} />
        </div>

        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <h2 className="mb-4 text-sm font-medium text-neutral-700">Chất lượng dữ liệu</h2>
          {!quality ? (
            <p className="text-sm text-neutral-400">Đang tải...</p>
          ) : (
            <ul className="space-y-2 text-sm">
              <li className="flex justify-between">
                <span className="text-neutral-500">Khách hàng trùng lặp</span>
                <span className="font-medium text-neutral-900">
                  {quality.customer.duplicateGroupCount} nhóm ({quality.customer.duplicateRowCount} dòng thừa)
                </span>
              </li>
              <li className="flex justify-between">
                <span className="text-neutral-500">Đơn hàng thiếu &quot;ID Lọc&quot;</span>
                <span className="font-medium text-neutral-900">{quality.order.unverifiedRowCount} dòng</span>
              </li>
              <li className="flex justify-between">
                <span className="text-neutral-500">Số điện thoại sai định dạng</span>
                <span className="font-medium text-neutral-900">{quality.order.phoneFormatIssueCount} dòng</span>
              </li>
              <li className="flex justify-between">
                <span className="text-neutral-500">Billing không parse được</span>
                <span className="font-medium text-neutral-900">{quality.order.billingFormatIssueCount} dòng</span>
              </li>
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
