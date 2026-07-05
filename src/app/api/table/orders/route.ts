import { NextRequest, NextResponse } from 'next/server';
import { getUserContext, getAllowedPageIds } from '@/lib/tenant';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

const DEFAULT_PAGE_SIZE = 25;

function sanitizeSearch(raw: string): string {
  return raw.replace(/[,()]/g, ' ').trim().slice(0, 100);
}

export async function GET(req: NextRequest) {
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const pageIds = await getAllowedPageIds(ctx);
  const { searchParams } = new URL(req.url);
  const page = Math.max(0, Math.trunc(Number(searchParams.get('page') ?? 0)) || 0);
  const pageSize = Math.min(100, Math.max(1, Math.trunc(Number(searchParams.get('pageSize') ?? DEFAULT_PAGE_SIZE)) || DEFAULT_PAGE_SIZE));
  const q = sanitizeSearch(searchParams.get('q') ?? '');

  const admin = getSupabaseAdmin();

  // order_list.page_id là cột generated (thêm ở migration 001), không có dấu/khoảng trắng
  // nên không cần alias hay quote khi filter — khác với "Page id" bên customer_data.
  let query = admin
    .from('order_list')
    .select('name, phone, address, "order", billing, notice, conversation_id, id_loc:"ID Lọc", page_id', {
      count: 'exact',
    });

  if (pageIds !== 'all') {
    query = pageIds.length ? query.in('page_id', pageIds) : query.eq('page_id', '__none__');
  }
  if (q) {
    query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%,"order".ilike.%${q}%`);
  }

  query = query.order('id', { ascending: false }).range(page * pageSize, page * pageSize + pageSize - 1);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ rows: data ?? [], total: count ?? 0 });
}
