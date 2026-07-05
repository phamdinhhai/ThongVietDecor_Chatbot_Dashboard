import { NextResponse } from 'next/server';
import { getUserContext, getAllowedPageIds } from '@/lib/tenant';
import { getDataQualityReport } from '@/lib/queries';

export const revalidate = 60;

export async function GET() {
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const pageIds = await getAllowedPageIds(ctx);
  const report = await getDataQualityReport(pageIds);

  return NextResponse.json(report);
}
