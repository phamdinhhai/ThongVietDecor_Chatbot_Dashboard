import 'server-only';

import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { fetchAllPages, fetchMetaObject, MetaApiError } from './client';
import {
  ADDITIVE_INSIGHT_FIELDS,
  SNAPSHOT_INSIGHT_FIELDS,
  type MetaInsightRow,
  type PrimaryResultConfig,
  type ReportingLevel,
  normalizeAdditiveInsight,
  normalizeReportingSnapshot,
} from './metrics';

type AccountMeta = {
  id: string; name: string; currency?: string; timezone_name?: string; account_status?: number;
};
type CreativeRef = { id?: string };
type MetaDimension = {
  id: string; name: string; status?: string; effective_status?: string; objective?: string;
  campaign_id?: string; adset_id?: string; daily_budget?: string; lifetime_budget?: string;
  start_time?: string; stop_time?: string; optimization_goal?: string; billing_event?: string;
  creative?: CreativeRef;
};
type RegisteredAccount = {
  ad_account_id: string; currency: string; attribution_key: string;
  primary_result_label: string | null; primary_result_action_types: string[] | null;
};

export class MetaAccountDiscoveryError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'MetaAccountDiscoveryError';
  }
}

export type SyncResult = {
  accountId: string; rows: number; snapshots: number; status: 'success' | 'partial' | 'failed';
  errorCode?: string; error?: string;
};

const REPORTING_LEVELS: ReportingLevel[] = ['account', 'campaign', 'adset', 'ad'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function assertDateRange(dateFrom: string, dateTo: string): void {
  if (!DATE_RE.test(dateFrom) || !DATE_RE.test(dateTo) || dateFrom > dateTo) {
    throw new Error('Invalid Meta Ads sync date range');
  }
}

async function checked(operation: PromiseLike<{ error: unknown }>, context: string): Promise<void> {
  const { error } = await operation;
  if (error) throw new Error(`${context}: ${error instanceof Error ? error.message : String(error)}`);
}

async function upsertChunks(table: string, rows: Record<string, unknown>[]): Promise<void> {
  const admin = getSupabaseAdmin();
  for (let start = 0; start < rows.length; start += 500) {
    await checked(admin.from(table).upsert(rows.slice(start, start + 500)), `Upsert ${table}`);
  }
}

async function getRegisteredAccount(accountId: string): Promise<RegisteredAccount> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from('meta_ad_accounts')
    .select('ad_account_id,currency,attribution_key,primary_result_label,primary_result_action_types')
    .eq('ad_account_id', accountId).eq('active', true).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Meta ad account is not registered or is disabled');
  return data as RegisteredAccount;
}

export async function discoverAndRegisterMetaAdAccounts(): Promise<string[]> {
  const admin = getSupabaseAdmin();
  const { data: tenants, error: tenantError } = await admin.from('dashboard_tenants')
    .select('id').order('created_at', { ascending: true }).limit(2);
  if (tenantError) throw new MetaAccountDiscoveryError('Unable to resolve dashboard tenant', 'TENANT_LOOKUP_FAILED');
  if ((tenants?.length ?? 0) !== 1) {
    throw new MetaAccountDiscoveryError(
      'Automatic Meta account discovery requires exactly one dashboard tenant',
      'AUTO_DISCOVERY_REQUIRES_SINGLE_TENANT',
    );
  }

  const accounts = await fetchAllPages<AccountMeta>('me/adaccounts', {
    fields: 'id,name,currency,timezone_name,account_status',
  });
  const normalized = accounts.map((account) => ({
    ...account,
    id: account.id.replace(/^act_/, ''),
  }));
  for (const account of normalized) {
    if (!/^\d+$/.test(account.id) || !account.name || !account.currency) {
      throw new MetaAccountDiscoveryError('Meta returned incomplete ad account metadata', 'INVALID_DISCOVERED_ACCOUNT');
    }
  }
  if (normalized.length === 0) return [];

  const now = new Date().toISOString();
  const { error: upsertError } = await admin.from('meta_ad_accounts').upsert(
    normalized.map((account) => ({
      ad_account_id: account.id,
      tenant_id: tenants![0].id,
      name: account.name,
      currency: account.currency,
      timezone_name: account.timezone_name ?? null,
      account_status: account.account_status ?? null,
      active: true,
      updated_at: now,
    })),
    { onConflict: 'ad_account_id' },
  );
  if (upsertError) throw new MetaAccountDiscoveryError('Unable to register discovered Meta accounts', 'ACCOUNT_REGISTRATION_FAILED');
  return normalized.map((account) => account.id);
}

async function fetchSnapshots(
  accountPath: string,
  accountId: string,
  dateFrom: string,
  dateTo: string,
  attributionKey: string,
): Promise<Record<string, unknown>[]> {
  const snapshots: Record<string, unknown>[] = [];
  for (const level of REPORTING_LEVELS) {
    const rows = await fetchAllPages<MetaInsightRow>(`${accountPath}/insights`, {
      fields: SNAPSHOT_INSIGHT_FIELDS,
      level,
      time_range: JSON.stringify({ since: dateFrom, until: dateTo }),
    });
    snapshots.push(...rows.map((row) => normalizeReportingSnapshot(
      { ...row, account_id: row.account_id || accountId }, level, dateFrom, dateTo, attributionKey,
    )));
  }
  return snapshots;
}

export async function syncMetaAdAccount(adAccountId: string, dateFrom: string, dateTo: string): Promise<SyncResult> {
  assertDateRange(dateFrom, dateTo);
  const admin = getSupabaseAdmin();
  const accountId = adAccountId.replace(/^act_/, '');
  if (!/^\d+$/.test(accountId)) throw new Error('Invalid Meta ad account ID');
  const registered = await getRegisteredAccount(accountId);
  const accountPath = `act_${accountId}`;
  const resultConfig: PrimaryResultConfig = {
    label: registered.primary_result_label,
    actionTypes: registered.primary_result_action_types ?? [],
  };

  const { data: run, error: runError } = await admin.from('meta_ads_sync_runs')
    .insert({ ad_account_id: accountId, date_from: dateFrom, date_to: dateTo, mode: 'synchronous', status: 'running' })
    .select('id').single();
  if (runError) throw runError;

  try {
    const account = await fetchMetaObject<AccountMeta>(accountPath, {
      fields: 'id,name,currency,timezone_name,account_status',
    });
    await checked(admin.from('meta_ad_accounts').update({
      name: account.name,
      currency: account.currency || registered.currency,
      timezone_name: account.timezone_name ?? null,
      account_status: account.account_status ?? null,
      updated_at: new Date().toISOString(),
    }).eq('ad_account_id', accountId), 'Update Meta ad account');

    const [campaigns, adSets, ads, insights] = await Promise.all([
      fetchAllPages<MetaDimension>(`${accountPath}/campaigns`, {
        fields: 'id,name,objective,status,effective_status,daily_budget,lifetime_budget,start_time,stop_time',
      }),
      fetchAllPages<MetaDimension>(`${accountPath}/adsets`, {
        fields: 'id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget,optimization_goal,billing_event',
      }),
      fetchAllPages<MetaDimension>(`${accountPath}/ads`, {
        fields: 'id,name,adset_id,campaign_id,status,effective_status,creative',
      }),
      fetchAllPages<MetaInsightRow>(`${accountPath}/insights`, {
        fields: ADDITIVE_INSIGHT_FIELDS,
        level: 'ad',
        time_increment: '1',
        time_range: JSON.stringify({ since: dateFrom, until: dateTo }),
      }),
    ]);

    await upsertChunks('meta_campaigns', campaigns.map((row) => ({
      campaign_id: row.id, ad_account_id: accountId, name: row.name, objective: row.objective ?? null,
      status: row.status ?? null, effective_status: row.effective_status ?? null,
      daily_budget: row.daily_budget ?? null, lifetime_budget: row.lifetime_budget ?? null,
      start_time: row.start_time ?? null, stop_time: row.stop_time ?? null, updated_at: new Date().toISOString(),
    })));
    await upsertChunks('meta_ad_sets', adSets.map((row) => ({
      ad_set_id: row.id, campaign_id: row.campaign_id ?? null, ad_account_id: accountId, name: row.name,
      status: row.status ?? null, effective_status: row.effective_status ?? null,
      daily_budget: row.daily_budget ?? null, lifetime_budget: row.lifetime_budget ?? null,
      optimization_goal: row.optimization_goal ?? null, billing_event: row.billing_event ?? null,
      updated_at: new Date().toISOString(),
    })));
    await upsertChunks('meta_ads', ads.map((row) => ({
      ad_id: row.id, ad_set_id: row.adset_id ?? null, campaign_id: row.campaign_id ?? null,
      ad_account_id: accountId, name: row.name, status: row.status ?? null,
      effective_status: row.effective_status ?? null, creative_id: row.creative?.id ?? null,
      updated_at: new Date().toISOString(),
    })));

    const currency = account.currency || registered.currency;
    const facts = insights.map((row) => normalizeAdditiveInsight(
      row, currency, registered.attribution_key, resultConfig,
    ));
    await upsertChunks('meta_ads_insights_daily', facts);

    let snapshots: Record<string, unknown>[] = [];
    let snapshotError: Error | null = null;
    try {
      snapshots = await fetchSnapshots(accountPath, accountId, dateFrom, dateTo, registered.attribution_key);
      await upsertChunks('meta_ads_reporting_snapshots', snapshots);
    } catch (error) {
      snapshotError = error instanceof Error ? error : new Error('Reporting snapshot sync failed');
    }

    const completedAt = new Date().toISOString();
    const status = snapshotError ? 'partial' : 'success';
    await checked(admin.from('meta_ads_sync_runs').update({
      status, rows_synced: facts.length, snapshots_synced: snapshots.length,
      error_code: snapshotError ? 'SNAPSHOT_SYNC_FAILED' : null,
      error_message: snapshotError?.message.slice(0, 2000) ?? null, completed_at: completedAt,
    }).eq('id', run.id), 'Complete Meta sync run');
    await checked(admin.from('meta_ad_accounts').update({ last_synced_at: completedAt }).eq('ad_account_id', accountId), 'Update sync freshness');
    return {
      accountId, rows: facts.length, snapshots: snapshots.length, status,
      errorCode: snapshotError ? 'SNAPSHOT_SYNC_FAILED' : undefined, error: snapshotError?.message,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown sync error';
    const trace = error instanceof MetaApiError ? error.details?.fbtrace_id : undefined;
    const code = error instanceof MetaApiError ? error.code : 'SYNC_FAILED';
    await admin.from('meta_ads_sync_runs').update({
      status: 'failed', error_code: code, error_message: message.slice(0, 2000),
      meta_trace_id: trace, completed_at: new Date().toISOString(),
    }).eq('id', run.id);
    return { accountId, rows: 0, snapshots: 0, status: 'failed', errorCode: code, error: message };
  }
}

export async function syncAllActiveAccounts(days = 7): Promise<SyncResult[]> {
  const safeDays = Math.min(Math.max(Math.trunc(days), 1), 90);
  const accountIds = await discoverAndRegisterMetaAdAccounts();
  const until = new Date();
  const since = new Date(until);
  since.setUTCDate(since.getUTCDate() - (safeDays - 1));
  const results: SyncResult[] = [];
  for (const accountId of accountIds) {
    results.push(await syncMetaAdAccount(accountId, isoDate(since), isoDate(until)));
  }
  return results;
}
