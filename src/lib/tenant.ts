import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseAdmin } from './supabase-admin';

export type UserContext = {
  userId: string;
  email: string;
  role: 'super_admin' | 'tenant_admin' | 'tenant_viewer';
  tenantId: string | null;
};

// Đọc session hiện tại từ cookie, tra bảng dashboard_users để biết role + tenant.
export async function getUserContext(): Promise<UserContext | null> {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => cookieStore.get(name)?.value,
        set: () => {},
        remove: () => {},
      },
    }
  );

  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;

  const admin = getSupabaseAdmin();
  const { data: row } = await admin
    .from('dashboard_users')
    .select('role, tenant_id')
    .eq('id', data.user.id)
    .single();

  if (!row) return null;

  return {
    userId: data.user.id,
    email: data.user.email ?? '',
    role: row.role,
    tenantId: row.tenant_id,
  };
}

// super_admin -> 'all' (không lọc). tenant_admin/viewer -> danh sách page_id cụ thể.
export async function getAllowedPageIds(ctx: UserContext): Promise<string[] | 'all'> {
  if (ctx.role === 'super_admin') return 'all';
  if (!ctx.tenantId) return [];

  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from('dashboard_tenant_pages')
    .select('page_id')
    .eq('tenant_id', ctx.tenantId);

  return (data ?? []).map((r) => r.page_id);
}
