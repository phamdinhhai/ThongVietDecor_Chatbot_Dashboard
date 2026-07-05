import { getSupabaseAdmin } from './supabase-admin';

type PageScope = string[] | 'all';

// Các RPC function (xem supabase/migrations/002_kpi_rpc_functions.sql) nhận
// page_ids text[] với quy ước: NULL = không lọc (super_admin), mảng cụ thể = lọc
// đúng danh sách page_id được phép xem. Hàm này convert PageScope ở tầng app
// (định nghĩa trong src/lib/tenant.ts) sang tham số SQL tương ứng.
function toSqlPageIds(pageIds: PageScope): string[] | null {
  return pageIds === 'all' ? null : pageIds;
}

// KPI khách hàng: total, tỷ lệ spam, phân bố theo State — tính trong Postgres
// (get_customer_kpis), không kéo hết bảng customer_data về Node.js để group.
export async function getCustomerKpis(pageIds: PageScope) {
  const admin = getSupabaseAdmin();
  const { data: rawData, error } = await admin
    .rpc('get_customer_kpis', { p_page_ids: toSqlPageIds(pageIds) })
    .single();
  if (error) throw error;
  const data = rawData as any;

  const total = Number(data.total ?? 0);
  const spamCount = Number(data.spam_count ?? 0);

  return {
    total,
    spamCount,
    spamRate: total ? spamCount / total : 0,
    stateBreakdown: (data.state_breakdown ?? {}) as Record<string, number>,
  };
}

// Doanh thu + số đơn thật (gộp theo conversation_id + "ID Lọc" trong Postgres,
// xem get_revenue_kpis trong migration 002). ordersNeedingVerification = số dòng
// có "ID Lọc" NULL không gộp an toàn được, hiển thị riêng ở UI để soát lại.
export async function getRevenueKpis(pageIds: PageScope) {
  const admin = getSupabaseAdmin();
  const { data: rawData, error } = await admin
    .rpc('get_revenue_kpis', { p_page_ids: toSqlPageIds(pageIds) })
    .single();
  if (error) throw error;
  const data = rawData as any;

  return {
    totalOrders: Number(data.total_orders ?? 0),
    totalRevenue: Number(data.total_revenue ?? 0),
    ordersNeedingVerification: Number(data.orders_needing_verification ?? 0),
  };
}

// session_count = distinct session_id thật trong Postgres (fb_chats mỗi dòng là
// 1 tin nhắn, không phải 1 hội thoại). order_count dùng lại cùng logic gộp đơn
// ở get_revenue_kpis() để 2 chỗ luôn khớp nhau.
export async function getConversionRate(pageIds: PageScope) {
  const admin = getSupabaseAdmin();
  const { data: rawData, error } = await admin
    .rpc('get_conversion_rate', { p_page_ids: toSqlPageIds(pageIds) })
    .single();
  if (error) throw error;
  const data = rawData as any;

  return {
    sessionCount: Number(data.session_count ?? 0),
    orderCount: Number(data.order_count ?? 0),
    rate: Number(data.rate ?? 0),
  };
}
