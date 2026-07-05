import { NextRequest, NextResponse } from 'next/server';
import { getUserContext, getAllowedPageIds } from '@/lib/tenant';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

const DEFAULT_PAGE_SIZE = 25;

// Loại dấu phẩy/ngoặc khỏi từ khoá tìm kiếm để không phá cú pháp filter .or() của
// PostgREST (dùng dấu phẩy để phân tách điều kiện), và giới hạn độ dài tránh query quá dài.
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

  // Đổi tên cột về key ASCII gọn cho frontend (cột gốc có dấu/khoảng trắng/viết hoa).
  let query = admin
    .from('customer_data')
    .select(
      'ten:"Tên", customer_label:"Customer Label", facebook_label, state:"State", spam_mark, notice:"Notice", page_id:"Page id"',
      { count: 'exact' }
    );

  if (pageIds !== 'all') {
    query = pageIds.length ? query.in('Page id', pageIds) : query.eq('Page id', '__none__');
  }
  if (q) {
    query = query.or(`"Tên".ilike.%${q}%,"Customer Label".ilike.%${q}%,facebook_label.ilike.%${q}%`);
  }

  query = query.order('id', { ascending: false }).range(page * pageSize, page * pageSize + pageSize - 1);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ rows: data ?? [], total: count ?? 0 });
}
