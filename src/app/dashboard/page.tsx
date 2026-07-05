import { redirect } from 'next/navigation';
import { getUserContext, getAllowedPageIds } from '@/lib/tenant';
import { getCustomerKpis, getRevenueKpis } from '@/lib/queries';
import { DashboardClient } from './DashboardClient';

export const revalidate = 60;

export default async function DashboardPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const pageIds = await getAllowedPageIds(ctx);

  const [customer, revenue] = await Promise.all([
    getCustomerKpis(pageIds),
    getRevenueKpis(pageIds),
  ]);

  return (
    <main className="min-h-screen bg-neutral-50 p-8">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-xl font-medium text-neutral-900">Dashboard chatbot</h1>
        <span className="text-sm text-neutral-500">
          {ctx.role === 'super_admin' ? 'Toàn bộ đơn vị' : ctx.email}
        </span>
      </header>

      <DashboardClient initialData={{ customer, revenue }} />
    </main>
  );
}
