import { NextResponse } from 'next/server';
import { getUserContext, getAllowedPageIds } from '@/lib/tenant';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function GET() {
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const pageIds = await getAllowedPageIds(ctx);
  const admin = getSupabaseAdmin();

  let q = admin.from('order_list').select('*');
  if (pageIds !== 'all') {
    q = pageIds.length ? q.in('page_id', pageIds) : q.eq('page_id', '__none__');
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const csv = toCsv(data ?? []);

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="don_hang.csv"',
    },
  });
}

function toCsv(rows: Record<string, any>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(
      headers.map((h) => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(',')
    );
  }
  return lines.join('\n');
}
