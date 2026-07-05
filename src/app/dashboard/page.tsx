import { redirect } from 'next/navigation';
import { getUserContext, getAllowedPageIds } from '@/lib/tenant';
import { getCustomerKpis, getRevenueKpis, getConversionRate, getDashboardAnalytics } from '@/lib/queries';
import { DashboardTabs } from './DashboardTabs';

export const revalidate = 60;

export default async function DashboardPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const pageIds = await getAllowedPageIds(ctx);

  const [customer, revenue, conversion, analytics] = await Promise.all([
    getCustomerKpis(pageIds),
    getRevenueKpis(pageIds),
    getConversionRate(pageIds),
    getDashboardAnalytics(pageIds),
  ]);

  return (
    <main className="min-h-screen bg-surface-50">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-surface-200 bg-white/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-glow">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 0 1 1.037-.443 48.261 48.261 0 0 0 5.69-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-semibold text-surface-900">Chatbot Dashboard</h1>
              <p className="text-xs text-surface-400">Phân tích & quản lý đơn hàng</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="/api/export"
              className="hidden rounded-lg border border-surface-200 px-3 py-1.5 text-xs font-medium text-surface-600 transition-colors hover:border-brand-300 hover:text-brand-600 sm:inline-flex"
            >
              ↓ Xuất CSV
            </a>
            <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
              {ctx.role === 'super_admin' ? '🔑 Super Admin' : ctx.email}
            </span>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <DashboardTabs
          initialData={{ customer, revenue, conversion, analytics }}
          showPageColumn={ctx.role === 'super_admin'}
        />
      </div>
    </main>
  );
}
