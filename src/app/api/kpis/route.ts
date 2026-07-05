import { NextResponse } from 'next/server';
import { getUserContext, getAllowedPageIds } from '@/lib/tenant';
import { getCustomerKpis, getRevenueKpis, getConversionRate } from '@/lib/queries';

// Cache 60s ở tầng ISR — khớp với lựa chọn "auto-refresh 30s-5 phút".
// Chỉnh số này nếu muốn refresh nhanh/chậm hơn.
export const revalidate = 60;

export async function GET() {
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const pageIds = await getAllowedPageIds(ctx);

  const [customer, revenue, conversion] = await Promise.all([
    getCustomerKpis(pageIds),
    getRevenueKpis(pageIds),
    getConversionRate(pageIds),
  ]);

  return NextResponse.json({ customer, revenue, conversion });
}
