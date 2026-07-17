'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AdsReport, AdsReportLevel, AllowedAdAccount } from '@/lib/meta-ads/queries';

type AdsApiResponse = AdsReport & {
  currency: string | null; mixedCurrency: boolean; moneyAggregationAllowed: boolean;
  accounts: AllowedAdAccount[]; resultLabel: string | null;
  filters: { dateFrom: string; dateTo: string; level: AdsReportLevel; accountId: string | null };
};

type FilterState = { dateFrom: string; dateTo: string; level: AdsReportLevel; accountId: string };

function initialFilters(): FilterState {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - 29);
  return { dateFrom: start.toISOString().slice(0, 10), dateTo: end.toISOString().slice(0, 10), level: 'campaign', accountId: '' };
}

function compact(value: number | null): string {
  return value === null ? '—' : new Intl.NumberFormat('vi-VN', { notation: value >= 10_000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value);
}

function money(value: number | null, currency: string | null, allowed = true): string {
  if (value === null || !currency || !allowed) return '—';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
}

function percent(value: number | null): string {
  return value === null ? '—' : `${(value * 100).toFixed(2)}%`;
}

function statusLabel(status: string | null): string {
  const labels: Record<string, string> = {
    ACTIVE: 'Đang phân phối', PAUSED: 'Đã tạm dừng', CAMPAIGN_PAUSED: 'Campaign tạm dừng',
    ADSET_PAUSED: 'Nhóm quảng cáo tạm dừng', ARCHIVED: 'Đã lưu trữ', WITH_ISSUES: 'Có vấn đề',
  };
  return status ? labels[status] ?? status.replaceAll('_', ' ').toLowerCase() : 'Chưa rõ';
}

function MetricCard({ label, value, helper, accent }: { label: string; value: string; helper: string; accent: string }) {
  return (
    <article className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.07] p-5 backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:bg-white/[0.1]">
      <div className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${accent}`} />
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-3 truncate text-2xl font-bold tracking-tight text-white">{value}</p>
      <p className="mt-2 text-xs text-slate-400">{helper}</p>
    </article>
  );
}

function StatePanel({ title, detail, action }: { title: string; detail: string; action?: () => void }) {
  return (
    <div className="card flex min-h-[320px] flex-col items-center justify-center p-8 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-2xl">◈</div>
      <h3 className="text-lg font-bold text-surface-950">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-surface-500">{detail}</p>
      {action && <button id="ads-retry-button" onClick={action} className="mt-5 rounded-xl bg-surface-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600">Thử lại</button>}
    </div>
  );
}

export function AdsPerformance() {
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [data, setData] = useState<AdsApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [requestKey, setRequestKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    const params = new URLSearchParams({ date_from: filters.dateFrom, date_to: filters.dateTo, level: filters.level });
    if (filters.accountId) params.set('account_id', filters.accountId);
    try {
      const response = await fetch(`/api/ads/performance?${params}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Report request failed');
      setData(await response.json());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [filters, requestKey]);

  useEffect(() => { void load(); }, [load]);

  const levelLabel = filters.level === 'campaign' ? 'chiến dịch' : filters.level === 'adset' ? 'nhóm quảng cáo' : 'quảng cáo';
  const rows = data?.rows ?? [];
  const resultConfigured = Boolean(data?.resultLabel);
  const metricCards = useMemo(() => data ? [
    { label: 'Chi tiêu', value: money(data.summary.spend, data.currency, data.moneyAggregationAllowed), helper: data.mixedCurrency ? 'Chọn một tài khoản để xem tiền tệ' : `Trong ${data.filters.dateFrom} → ${data.filters.dateTo}`, accent: 'from-fuchsia-500 to-violet-400' },
    { label: resultConfigured ? data.resultLabel! : 'Kết quả chính', value: resultConfigured ? compact(data.summary.primaryResults) : 'Chưa cấu hình', helper: resultConfigured ? `Chi phí / kết quả ${money(data.summary.costPerResult, data.currency)}` : 'Các conversion riêng vẫn hiển thị bên dưới', accent: 'from-cyan-400 to-blue-500' },
    { label: 'Lượt hiển thị', value: compact(data.summary.impressions), helper: `CPM ${money(data.summary.cpm, data.currency, data.moneyAggregationAllowed)}`, accent: 'from-amber-300 to-orange-500' },
    { label: 'Clicks (tất cả)', value: compact(data.summary.clicks), helper: `CTR ${percent(data.summary.ctr)} · CPC ${money(data.summary.cpc, data.currency, data.moneyAggregationAllowed)}`, accent: 'from-emerald-400 to-teal-500' },
    { label: 'Inline link clicks', value: compact(data.summary.inlineLinkClicks), helper: `Link CTR ${percent(data.summary.inlineLinkCtr)}`, accent: 'from-pink-400 to-rose-500' },
    { label: 'Tiếp cận chính xác', value: compact(data.summary.reach), helper: data.summary.reach === null ? 'Chưa có snapshot ở cấp báo cáo này' : `Tần suất ${compact(data.summary.frequency)}`, accent: 'from-indigo-400 to-sky-400' },
  ] : [], [data, resultConfigured]);

  if (loading && !data) return <StatePanel title="Đang dựng báo cáo quảng cáo" detail="Đang tải facts và snapshot đúng cấp báo cáo. Dữ liệu chatbot không bị tải lại." />;
  if (error && !data) return <StatePanel title="Chưa thể tải báo cáo Ads" detail="Máy chủ không trả về dữ liệu hợp lệ. Hãy thử lại; nếu lỗi tiếp diễn, dùng request ID trong response để kiểm tra logs." action={() => setRequestKey((key) => key + 1)} />;
  if (data && data.accounts.length === 0) return <StatePanel title="Chưa có tài khoản quảng cáo" detail="Tenant này chưa được super admin gắn Meta Ad Account. Hãy hoàn tất account inventory và onboarding trước khi đồng bộ." />;

  return (
    <div className="space-y-5 animate-fade-in">
      <section className="relative overflow-hidden rounded-[28px] bg-[#070b18] p-5 text-white shadow-2xl sm:p-7">
        <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-fuchsia-600/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-cyan-500/15 blur-3xl" />
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Meta Ads intelligence</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Hiệu suất từ quảng cáo đến chuyển đổi</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Số liệu được đồng bộ server-side, cô lập theo tenant và bảo toàn đúng reporting grain của Meta.</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400"><span className={`h-2 w-2 rounded-full ${data?.freshness ? 'bg-emerald-400 shadow-[0_0_10px_#34d399]' : 'bg-amber-400'}`} />{data?.freshness ? `Đồng bộ ${new Date(data.freshness).toLocaleString('vi-VN')}` : 'Chưa có lần đồng bộ'}</div>
        </div>

        <div className="relative mt-6 grid grid-cols-1 gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs font-semibold text-slate-400">Tài khoản
            <select id="ads-account-filter" value={filters.accountId} onChange={(event) => setFilters((current) => ({ ...current, accountId: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-cyan-400">
              <option value="">Tất cả tài khoản</option>{data?.accounts.map((account) => <option key={account.ad_account_id} value={account.ad_account_id}>{account.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-400">Từ ngày<input id="ads-date-from" type="date" value={filters.dateFrom} onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-cyan-400" /></label>
          <label className="text-xs font-semibold text-slate-400">Đến ngày<input id="ads-date-to" type="date" value={filters.dateTo} onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-cyan-400" /></label>
          <label className="text-xs font-semibold text-slate-400">Cấp báo cáo
            <select id="ads-level-filter" value={filters.level} onChange={(event) => setFilters((current) => ({ ...current, level: event.target.value as AdsReportLevel }))} className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-cyan-400"><option value="campaign">Chiến dịch</option><option value="adset">Nhóm quảng cáo</option><option value="ad">Quảng cáo</option></select>
          </label>
        </div>

        {data?.mixedCurrency && <div className="relative mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">Nhiều loại tiền tệ đang được chọn. Các tổng tiền bị ẩn để tránh phép cộng sai; hãy chọn một tài khoản.</div>}
        <div className="relative mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{metricCards.map((card) => <MetricCard key={card.label} {...card} />)}</div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="card p-5 xl:col-span-2">
          <div className="mb-5 flex items-end justify-between"><div><h3 className="font-bold text-surface-950">Nhịp chi tiêu theo ngày</h3><p className="mt-1 text-xs text-surface-500">Dùng additive daily facts, không cộng reach theo ngày.</p></div><span className="badge badge-brand">{data?.timeseries.length ?? 0} ngày</span></div>
          <div className="h-72"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data?.timeseries ?? []}><defs><linearGradient id="adsSpend" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366f1" stopOpacity={0.4}/><stop offset="100%" stopColor="#6366f1" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e2e8f0"/><XAxis dataKey="date" tick={{ fontSize: 11 }} axisLine={false} tickLine={false}/><YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false}/><Tooltip formatter={(value: number) => money(value, data?.currency ?? null, data?.moneyAggregationAllowed)} /><Area type="monotone" dataKey="spend" stroke="#6366f1" strokeWidth={2.5} fill="url(#adsSpend)" /></AreaChart></ResponsiveContainer></div>
        </div>
        <div className="card p-5"><h3 className="font-bold text-surface-950">Conversion signals</h3><p className="mt-1 text-xs text-surface-500">Các event được giữ riêng, không cộng overlap.</p><div className="mt-5 space-y-3">{[['Hội thoại bắt đầu', data?.summary.messagingConversationsStarted], ['Lead', data?.summary.leads], ['Purchase', data?.summary.purchases], ['Landing page views', data?.summary.landingPageViews]].map(([label, value]) => <div key={String(label)} className="flex items-center justify-between rounded-xl bg-surface-50 px-4 py-3"><span className="text-sm text-surface-600">{label}</span><strong className="text-surface-950">{compact(Number(value ?? 0))}</strong></div>)}</div></div>
      </section>

      <section className="card overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-surface-200 p-5 sm:flex-row sm:items-end sm:justify-between"><div><h3 className="font-bold text-surface-950">Hiệu suất theo {levelLabel}</h3><p className="mt-1 text-xs text-surface-500">Delivery lấy từ effective_status · Reach lấy snapshot cùng cấp.</p></div><span className="text-xs text-surface-400">{data?.totalRows ?? 0} mục</span></div>
        {rows.length === 0 ? <div className="p-12 text-center text-sm text-surface-500">Không có dữ liệu trong khoảng ngày đã chọn.</div> : <div className="overflow-x-auto"><table className="w-full"><thead className="bg-surface-50 text-left"><tr><th className="data-table-th">{levelLabel}</th><th className="data-table-th">Phân phối</th><th className="data-table-th text-right">Chi tiêu</th><th className="data-table-th text-right">Kết quả</th><th className="data-table-th text-right">Hiển thị</th><th className="data-table-th text-right">Clicks</th><th className="data-table-th text-right">Link clicks</th><th className="data-table-th text-right">Reach</th></tr></thead><tbody className="divide-y divide-surface-100">{rows.map((row) => <tr key={`${row.ad_account_id}-${row.entity_id}`} className="transition hover:bg-brand-50/30"><td className="data-table-td"><div className="font-semibold text-surface-900">{row.entity_name}</div><div className="mt-0.5 text-[11px] text-surface-400">{row.entity_id}</div></td><td className="data-table-td"><span className={`badge ${row.effective_status === 'ACTIVE' ? 'badge-success' : row.effective_status?.includes('PAUSED') ? 'badge-neutral' : 'badge-warning'}`}>{statusLabel(row.effective_status)}</span></td><td className="data-table-td text-right font-medium">{money(row.spend, data?.currency ?? null, data?.moneyAggregationAllowed)}</td><td className="data-table-td text-right">{resultConfigured ? compact(row.primary_results) : '—'}</td><td className="data-table-td text-right">{compact(row.impressions)}</td><td className="data-table-td text-right">{compact(row.clicks)}</td><td className="data-table-td text-right">{compact(row.inline_link_clicks)}</td><td className="data-table-td text-right">{compact(row.reach)}</td></tr>)}</tbody></table></div>}
      </section>
    </div>
  );
}
