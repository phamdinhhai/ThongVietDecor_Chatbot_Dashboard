'use client';

import { useState } from 'react';
import { DashboardClient, type Kpis } from './DashboardClient';
import { DataTable, type ColumnDef } from './DataTable';

type CustomerRow = {
  id: number;
  session_id: string;
  name: string | null;
  phone: string | null;
  page: string | null;
  status: 'Đã mua hàng' | 'Chưa mua hàng' | string;
  first_message: string | null;
  last_message: string | null;
};

type OrderRow = {
  order_key: string;
  name: string | null;
  phone: string | null;
  address: string | null;
  products: string | null;
  billing: string | null;
  billing_amount: number | null;
  notice: string | null;
  conversation_id: string | null;
  page: string | null;
  merged_rows: number;
};

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatVnd(value: number | null): string {
  if (!value || value <= 0) return '—';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);
}

function StatusBadge({ status }: { status: string }) {
  const bought = status === 'Đã mua hàng';
  return <span className={`badge ${bought ? 'badge-success' : 'badge-neutral'}`}>{status}</span>;
}

function withPageColumn<T extends { page: string | null }>(columns: ColumnDef<T>[], show: boolean): ColumnDef<T>[] {
  if (!show) return columns;
  return [...columns, { key: 'page', label: 'Page', render: (row) => <span className="badge badge-brand">{row.page ?? '—'}</span> }];
}

const CUSTOMER_BASE_COLUMNS: ColumnDef<CustomerRow>[] = [
  { key: 'id', label: 'ID' },
  { key: 'session_id', label: 'Session ID' },
  { key: 'name', label: 'Tên' },
  { key: 'phone', label: 'SĐT', render: (row) => row.phone ?? <span className="text-surface-300">null</span> },
  { key: 'status', label: 'Trạng thái', render: (row) => <StatusBadge status={row.status} /> },
  { key: 'first_message', label: 'Lần đầu nhắn', render: (row) => formatDate(row.first_message) },
  { key: 'last_message', label: 'Lần cuối nhắn', render: (row) => formatDate(row.last_message) },
];

const ORDER_BASE_COLUMNS: ColumnDef<OrderRow>[] = [
  { key: 'name', label: 'Tên khách' },
  { key: 'phone', label: 'SĐT' },
  { key: 'address', label: 'Địa chỉ' },
  { key: 'products', label: 'Sản phẩm' },
  {
    key: 'billing_amount',
    label: 'Giá trị',
    render: (row) => row.billing_amount && row.billing_amount > 0
      ? <span className="font-semibold text-emerald-700">{formatVnd(row.billing_amount)}</span>
      : <span className="badge badge-warning">{row.billing ?? 'Cần kiểm tra'}</span>,
  },
  { key: 'notice', label: 'Ghi chú' },
  {
    key: 'merged_rows',
    label: 'Gộp',
    render: (row) => row.merged_rows > 1 ? <span className="badge badge-warning">{row.merged_rows} dòng</span> : '—',
  },
  { key: 'conversation_id', label: 'Hội thoại' },
];

const TABS = [
  { key: 'overview', label: 'Tổng quan', icon: '📊' },
  { key: 'customers', label: 'Khách hàng', icon: '👥' },
  { key: 'orders', label: 'Đơn hàng', icon: '🛍️' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export function DashboardTabs({
  initialData,
  showPageColumn,
}: {
  initialData: Kpis;
  showPageColumn: boolean;
}) {
  const [tab, setTab] = useState<TabKey>('overview');

  return (
    <>
      <nav className="mb-6 flex gap-1 border-b border-surface-200">
        {TABS.map((t) => (
          <button
            id={`tab-${t.key}`}
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`tab-btn ${tab === t.key ? 'tab-btn-active' : 'tab-btn-inactive'}`}
          >
            <span className="mr-2">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'overview' && <DashboardClient initialData={initialData} />}

      {tab === 'customers' && (
        <section className="space-y-4 animate-slide-up">
          <div>
            <h2 className="text-lg font-semibold text-surface-900">Danh sách khách đã nhắn</h2>
            <p className="mt-1 text-sm text-surface-500">
              Dedup theo Customer ID, lấy số điện thoại từ order_list và thời điểm nhắn từ fb_chats.
            </p>
          </div>
          <DataTable<CustomerRow>
            key="customers"
            endpoint="/api/table/customers"
            columns={withPageColumn(CUSTOMER_BASE_COLUMNS, showPageColumn)}
            searchPlaceholder="Tìm theo tên, session, SĐT, page..."
          />
        </section>
      )}

      {tab === 'orders' && (
        <section className="space-y-4 animate-slide-up">
          <div>
            <h2 className="text-lg font-semibold text-surface-900">Danh sách đơn hàng</h2>
            <p className="mt-1 text-sm text-surface-500">
              Gộp đơn theo conversation + ID Lọc, chuẩn hoá số điện thoại và giá trị đơn.
            </p>
          </div>
          <DataTable<OrderRow>
            key="orders"
            endpoint="/api/table/orders"
            columns={withPageColumn(ORDER_BASE_COLUMNS, showPageColumn)}
            searchPlaceholder="Tìm theo tên, SĐT, sản phẩm, page..."
          />
        </section>
      )}
    </>
  );
}
