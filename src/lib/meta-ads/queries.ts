import 'server-only';

import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type { UserContext } from '@/lib/tenant';

export type AdsReportLevel = 'campaign' | 'adset' | 'ad';
export type AllowedAdAccount = {
  ad_account_id: string; name: string; currency: string; timezone_name: string | null;
  last_synced_at: string | null; primary_result_label: string | null;
};
export type AdsSummary = {
  spend: number; impressions: number; reach: number | null; frequency: number | null;
  clicks: number; inlineLinkClicks: number; landingPageViews: number;
  primaryResults: number | null; messagingConversationsStarted: number;
  messagingFirstReplies: number; messagingTotalConnections: number;
  leads: number; purchases: number; purchaseValue: number;
  ctr: number | null; inlineLinkCtr: number | null; cpc: number | null;
  costPerInlineLinkClick: number | null; cpm: number | null;
  costPerResult: number | null; roas: number | null;
};
export type AdsTimePoint = {
  date: string; spend: number; primaryResults: number | null; impressions: number; clicks: number;
};
export type AdsReportRow = {
  entity_id: string; entity_name: string; ad_account_id: string; effective_status: string | null;
  spend: number; impressions: number; reach: number | null; frequency: number | null;
  clicks: number; inline_link_clicks: number; primary_results: number | null;
  leads: number; messaging_conversations_started: number; purchases: number; purchase_value: number;
};
export type AdsReport = {
  summary: AdsSummary; timeseries: AdsTimePoint[]; rows: AdsReportRow[]; totalRows: number;
  freshness: string | null;
};

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {};
}

function finite(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableFinite(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function getAllowedAdAccounts(ctx: UserContext): Promise<AllowedAdAccount[]> {
  const admin = getSupabaseAdmin();
  let query = admin.from('meta_ad_accounts')
    .select('ad_account_id,name,currency,timezone_name,last_synced_at,primary_result_label').eq('active', true);
  if (ctx.role !== 'super_admin') {
    if (!ctx.tenantId) return [];
    query = query.eq('tenant_id', ctx.tenantId);
  }
  const { data, error } = await query.order('name');
  if (error) throw error;
  return (data ?? []) as AllowedAdAccount[];
}

export async function getAdsReport(
  accountIds: string[], dateFrom: string, dateTo: string, level: AdsReportLevel,
  search = '', limit = 100, offset = 0,
): Promise<AdsReport> {
  if (accountIds.length === 0) return emptyReport();
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc('get_meta_ads_report', {
    p_account_ids: accountIds, p_date_from: dateFrom, p_date_to: dateTo, p_level: level,
    p_search: search, p_limit: limit, p_offset: offset,
  });
  if (error) throw error;

  const raw = record(data);
  const summary = record(raw.summary);
  const timeseries = Array.isArray(raw.timeseries) ? raw.timeseries : [];
  const rows = Array.isArray(raw.rows) ? raw.rows : [];
  return {
    summary: {
      spend: finite(summary.spend), impressions: finite(summary.impressions),
      reach: nullableFinite(summary.reach), frequency: nullableFinite(summary.frequency),
      clicks: finite(summary.clicks), inlineLinkClicks: finite(summary.inlineLinkClicks),
      landingPageViews: finite(summary.landingPageViews), primaryResults: nullableFinite(summary.primaryResults),
      messagingConversationsStarted: finite(summary.messagingConversationsStarted),
      messagingFirstReplies: finite(summary.messagingFirstReplies),
      messagingTotalConnections: finite(summary.messagingTotalConnections),
      leads: finite(summary.leads), purchases: finite(summary.purchases), purchaseValue: finite(summary.purchaseValue),
      ctr: nullableFinite(summary.ctr), inlineLinkCtr: nullableFinite(summary.inlineLinkCtr),
      cpc: nullableFinite(summary.cpc), costPerInlineLinkClick: nullableFinite(summary.costPerInlineLinkClick),
      cpm: nullableFinite(summary.cpm), costPerResult: nullableFinite(summary.costPerResult), roas: nullableFinite(summary.roas),
    },
    timeseries: timeseries.map((value) => {
      const row = record(value);
      return { date: String(row.date ?? ''), spend: finite(row.spend), primaryResults: nullableFinite(row.primaryResults), impressions: finite(row.impressions), clicks: finite(row.clicks) };
    }),
    rows: rows.map((value) => {
      const row = record(value);
      return {
        entity_id: String(row.entity_id ?? ''), entity_name: String(row.entity_name ?? ''),
        ad_account_id: String(row.ad_account_id ?? ''), effective_status: row.effective_status ? String(row.effective_status) : null,
        spend: finite(row.spend), impressions: finite(row.impressions), reach: nullableFinite(row.reach),
        frequency: nullableFinite(row.frequency), clicks: finite(row.clicks), inline_link_clicks: finite(row.inline_link_clicks),
        primary_results: nullableFinite(row.primary_results), leads: finite(row.leads),
        messaging_conversations_started: finite(row.messaging_conversations_started),
        purchases: finite(row.purchases), purchase_value: finite(row.purchase_value),
      };
    }),
    totalRows: finite(raw.totalRows), freshness: raw.freshness ? String(raw.freshness) : null,
  };
}

export function emptyReport(): AdsReport {
  return {
    summary: {
      spend: 0, impressions: 0, reach: null, frequency: null, clicks: 0, inlineLinkClicks: 0,
      landingPageViews: 0, primaryResults: null, messagingConversationsStarted: 0,
      messagingFirstReplies: 0, messagingTotalConnections: 0, leads: 0, purchases: 0, purchaseValue: 0,
      ctr: null, inlineLinkCtr: null, cpc: null, costPerInlineLinkClick: null, cpm: null, costPerResult: null, roas: null,
    },
    timeseries: [], rows: [], totalRows: 0, freshness: null,
  };
}
