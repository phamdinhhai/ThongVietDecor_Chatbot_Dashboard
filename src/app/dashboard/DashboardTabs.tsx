'use client';

import { useState } from 'react';
import { DashboardClient, type Kpis } from './DashboardClient';
import { DataTable, type ColumnDef } from './DataTable';

type CustomerRow = {
  ten: string;
  customer_label: string | null;
  facebook_label: string | null;
  state: number | null;
  spam_mark: string | null;
  notice: string | null;
  page_id: string | null;
};

type OrderRow = {
  name: string;
  phone: string | null;
  address: string | null;
  order: string | null;
  billing: string | null;
  notice: string | null;
  conversation_id: string | null;
  id_loc: string | null;
  page_id: string | null;
};

// "Page" chỉ hiện với super_admin — tenant thường chỉ thấy đúng page của mình nên cột
// này thừa/gây rối, chỉ có ích khi xem gộp nhiều tenant.
function withPageColumn<T extends { page_id: string | null }>(
  columns: ColumnDef<T>[],
  show: boolean
): ColumnDef<T>[] {
  if (!show) return columns;
  return [...columns, { key: 'page_id', label: 'Page' }];
}

const CUSTOMER_BASE_COLUMNS: ColumnDef<CustomerRow>[] = [
  { key: 'ten', label: 'Tên' },
  { key: 'customer_label', label: 'Nhãn KH' },
  { key: 'facebook_label', label: 'Nhãn Facebook' },
  { key: 'state', label: 'Trạng thái' },
  { key: 'spam_mark', label: 'Spam', render: (row) => (row.spam_mark ? 'Có' : '—') },
  { key: 'notice', label: 'Ghi chú' },
];

const ORDER_BASE_COLUMNS: ColumnDef<OrderRow>[] = [
  { key: 'name', label: 'Tên khách' },
  { key: 'phone', label: 'SĐT' },
  { key: 'address', label: 'Địa chỉ' },
  { key: 'order', label: 'Sản phẩm' },
  { key: 'billing', label: 'Giá trị' },
  { key: 'notice', label: 'Ghi chú' },
  { key: 'conversation_id', label: 'Conversation ID' },
  { key: 'id_loc', label: 'ID Lọc' },
];

const TABS = [
  { key: 'overview', label: 'Tổng quan' },
  { key: 'customers', label: 'Khách hàng' },
  { key: 'orders', label: 'Đơn hàng' },
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
      <div className="mb-6 flex gap-1 border-b border-neutral-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.key
                ? 'border-neutral-900 text-neutral-900'
                : 'border-transparent text-neutral-400 hover:text-neutral-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <DashboardClient initialData={initialData} />}

      {tab === 'customers' && (
        <DataTable<CustomerRow>
          key="customers"
          endpoint="/api/table/customers"
          columns={withPageColumn(CUSTOMER_BASE_COLUMNS, showPageColumn)}
          searchPlaceholder="Tìm theo tên, nhãn khách, nhãn Facebook..."
        />
      )}

      {tab === 'orders' && (
        <DataTable<OrderRow>
          key="orders"
          endpoint="/api/table/orders"
          columns={withPageColumn(ORDER_BASE_COLUMNS, showPageColumn)}
          searchPlaceholder="Tìm theo tên, SĐT, sản phẩm..."
        />
      )}
    </>
  );
}
