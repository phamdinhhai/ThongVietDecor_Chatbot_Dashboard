import { NextRequest, NextResponse } from 'next/server';
import { getUserContext, getAllowedPageIds } from '@/lib/tenant';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

const DEFAULT_PAGE_SIZE = 25;

function sanitizeSearch(raw: string): string {
  return raw.replace(/[%_]/g, '').trim().slice(0, 100);
}

export async function GET(req: NextRequest) {
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const pageIds = await getAllowedPageIds(ctx);
  const { searchParams } = new URL(req.url);

  const page     = Math.max(0, Math.trunc(Number(searchParams.get('page') ?? 0)) || 0);
  const pageSize = Math.min(100, Math.max(1, Math.trunc(Number(searchParams.get('pageSize') ?? DEFAULT_PAGE_SIZE)) || DEFAULT_PAGE_SIZE));
  const q        = sanitizeSearch(searchParams.get('q') ?? '');

  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc('get_order_list_v2', {
    p_page_ids: pageIds === 'all' ? null : pageIds,
    p_search:   q,
    p_offset:   page * pageSize,
    p_limit:    pageSize,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as any[];
  const total = rows.length > 0 ? Number(rows[0].row_count) : 0;
  const cleaned = rows.map(({ row_count: _, ...rest }) => rest);

  return NextResponse.json({ rows: cleaned, total });
}
