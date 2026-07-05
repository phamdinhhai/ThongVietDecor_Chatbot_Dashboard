import { NextResponse } from 'next/server';
import { getUserContext, getAllowedPageIds } from '@/lib/tenant';
import { getCustomerKpis, getRevenueKpis, getConversionRate, getDashboardAnalytics } from '@/lib/queries';

export const revalidate = 60;

export async function GET() {
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const pageIds = await getAllowedPageIds(ctx);

  const [customer, revenue, conversion, analytics] = await Promise.all([
    getCustomerKpis(pageIds),
    getRevenueKpis(pageIds),
    getConversionRate(pageIds),
    getDashboardAnalytics(pageIds),
  ]);

  return NextResponse.json({ customer, revenue, conversion, analytics });
}
