'use client';

import { useState } from 'react';
import { DashboardClient, type Kpis } from './DashboardClient';
import { DataTable, type ColumnDef } from './DataTable';
import { AdsPerformance } from './AdsPerformance';

type CustomerRow = {
  display_id: number; source_id: number; session_id: string; name: string | null; phone: string | null;
  page: string | null; status: string; first_message: string | null; last_message: string | null;
};
type OrderRow = {
  display_id: number; source_id: number; order_key: string; name: string | null; phone: string | null;
  address: string | null; products: string | null; billing: string | null; billing_amount: number | null;
  notice: string | null; conversation_id: string | null; page: string | null; merged_rows: number;
};
type Tab = 'overview' | 'ads' | 'customers' | 'orders';

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
}
function formatVnd(value: number | null): string {
  return value && value > 0 ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value) : '—';
}
function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${status === 'Đã mua hàng' ? 'badge-success' : 'badge-neutral'}`}>{status}</span>;
}
function withPageColumn<T extends { page: string | null }>(columns: ColumnDef<T>[], show: boolean): ColumnDef<T>[] {
  return show ? [...columns, { key: 'page', label: 'Page', render: (row) => <span className="badge badge-brand">{row.page ?? '—'}</span> }] : columns;
}

const CUSTOMER_COLUMNS: ColumnDef<CustomerRow>[] = [
  { key: 'display_id', label: 'ID' }, { key: 'session_id', label: 'Session ID' }, { key: 'name', label: 'Tên' },
  { key: 'phone', label: 'SĐT', render: (row) => row.phone ?? <span className="text-surface-300">null</span> },
  { key: 'status', label: 'Trạng thái', render: (row) => <StatusBadge status={row.status} /> },
  { key: 'first_message', label: 'Lần đầu nhắn', render: (row) => formatDate(row.first_message) },
  { key: 'last_message', label: 'Lần cuối nhắn', render: (row) => formatDate(row.last_message) },
];
const ORDER_COLUMNS: ColumnDef<OrderRow>[] = [
  { key: 'display_id', label: 'ID' }, { key: 'name', label: 'Tên khách' }, { key: 'phone', label: 'SĐT' },
  { key: 'address', label: 'Địa chỉ' }, { key: 'products', label: 'Sản phẩm' },
  { key: 'billing_amount', label: 'Giá trị', render: (row) => row.billing_amount && row.billing_amount > 0
    ? <span className="font-semibold text-emerald-700">{formatVnd(row.billing_amount)}</span>
    : <span className="badge badge-warning">{row.billing ?? 'Cần kiểm tra'}</span> },
  { key: 'notice', label: 'Ghi chú' }, { key: 'conversation_id', label: 'Hội thoại' },
];

function TabIcon({ name }: { name: Tab }) {
  const props = { className: 'h-4 w-4', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return <svg {...props} aria-hidden="true">
    {name === 'overview' && <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>}
    {name === 'ads' && <><path d="M4 13.5V10l12-5v13l-12-4.5Z"/><path d="M16 9.5h2.5a2.5 2.5 0 0 1 0 5H16M6 14l1.5 5h4L10 15"/></>}
    {name === 'customers' && <><circle cx="9" cy="8" r="3"/><path d="M3.5 19c.8-3.4 2.8-5 5.5-5s4.7 1.6 5.5 5"/><circle cx="17" cy="9" r="2.2"/><path d="M15.5 14.5c2.3.2 3.8 1.7 4.4 4.5"/></>}
    {name === 'orders' && <><rect x="5" y="4" width="14" height="16" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/></>}
  </svg>;
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Tổng quan' }, { key: 'ads', label: 'Quảng cáo' },
  { key: 'customers', label: 'Khách hàng' }, { key: 'orders', label: 'Đơn hàng' },
];

export function DashboardTabs({ initialData, showPageColumn }: { initialData: Kpis; showPageColumn: boolean }) {
  const [tab, setTab] = useState<Tab>('overview');
  return <>
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-surface-200" aria-label="Khu vực dashboard">
      {TABS.map((item) => <button id={`tab-${item.key}`} key={item.key} onClick={() => setTab(item.key)} aria-selected={tab === item.key} className={`tab-btn ${tab === item.key ? 'tab-btn-active' : 'tab-btn-inactive'}`}><span className="mr-2 inline-flex align-[-2px]"><TabIcon name={item.key}/></span>{item.label}</button>)}
    </nav>
    {tab === 'overview' && <DashboardClient initialData={initialData}/>}
    {tab === 'ads' && <AdsPerformance/>}
    {tab === 'customers' && <section className="space-y-4 animate-slide-up"><div><h2 className="text-lg font-semibold text-surface-900">Danh sách khách đã nhắn</h2><p className="mt-1 text-sm text-surface-500">Dedup theo Customer ID, lấy số điện thoại từ order_list và thời điểm nhắn từ fb_chats.</p></div><DataTable<CustomerRow> key="customers" endpoint="/api/table/customers" columns={withPageColumn(CUSTOMER_COLUMNS, showPageColumn)} searchPlaceholder="Tìm theo tên, session, SĐT, page..."/></section>}
    {tab === 'orders' && <section className="space-y-4 animate-slide-up"><div><h2 className="text-lg font-semibold text-surface-900">Danh sách đơn hàng</h2><p className="mt-1 text-sm text-surface-500">Gộp duplicate theo conversation, số điện thoại, sản phẩm chuẩn hoá và giá trị đơn.</p></div><DataTable<OrderRow> key="orders" endpoint="/api/table/orders" columns={withPageColumn(ORDER_COLUMNS, showPageColumn)} searchPlaceholder="Tìm theo tên, SĐT, sản phẩm, page..."/></section>}
  </>;
}
