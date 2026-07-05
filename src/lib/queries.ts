import { getSupabaseAdmin } from './supabase-admin';

type PageScope = string[] | 'all';

function toSqlPageIds(pageIds: PageScope): string[] | null {
  return pageIds === 'all' ? null : pageIds;
}

// ── KPI Cards ──────────────────────────────────────────────────────────────

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
    ordersCollapsedAsRevision: Number(data.orders_collapsed_as_revision ?? 0),
    duplicateRowsRemoved: Number(data.duplicate_rows_removed ?? 0),
  };
}

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

// ── Analytics ──────────────────────────────────────────────────────────────

export type ChartPoint = { label: string; value: number };

export type AnalyticsData = {
  chatByDay: ChartPoint[];
  chatByHour: ChartPoint[];
  chatByWeekday: ChartPoint[];
  topProducts: ChartPoint[];
  quality: {
    zeroBillingCount: number;
    missingIdLocCount: number;
    missingPhoneCount: number;
  };
};

export async function getDashboardAnalytics(pageIds: PageScope): Promise<AnalyticsData> {
  const admin = getSupabaseAdmin();
  const { data: rawData, error } = await admin
    .rpc('get_dashboard_analytics', { p_page_ids: toSqlPageIds(pageIds) })
    .single();
  if (error) throw error;
  const data = rawData as any;

  const parsePoints = (arr: any[]): ChartPoint[] =>
    (arr ?? []).map((r: any) => ({ label: String(r.label), value: Number(r.value) }));

  const q = data.quality ?? {};
  return {
    chatByDay: parsePoints(data.chatByDay),
    chatByHour: parsePoints(data.chatByHour),
    chatByWeekday: parsePoints(data.chatByWeekday),
    topProducts: parsePoints(data.topProducts),
    quality: {
      zeroBillingCount: Number(q.zero_billing_count ?? 0),
      missingIdLocCount: Number(q.missing_id_loc_count ?? 0),
      missingPhoneCount: Number(q.missing_phone_count ?? 0),
    },
  };
}
