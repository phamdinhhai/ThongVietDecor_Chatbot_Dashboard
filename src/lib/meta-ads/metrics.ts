export const ADDITIVE_INSIGHT_FIELDS = [
  'account_id', 'account_name', 'campaign_id', 'campaign_name', 'adset_id', 'adset_name',
  'ad_id', 'ad_name', 'date_start', 'date_stop', 'spend', 'impressions', 'clicks',
  'inline_link_clicks', 'actions', 'action_values',
].join(',');

export const SNAPSHOT_INSIGHT_FIELDS = [
  'account_id', 'campaign_id', 'adset_id', 'ad_id', 'date_start', 'date_stop', 'reach', 'frequency',
].join(',');

export type MetaAction = { action_type: string; value: string };
export type PrimaryResultConfig = { label: string | null; actionTypes: string[] };
export type ReportingLevel = 'account' | 'campaign' | 'adset' | 'ad';

export type MetaInsightRow = {
  account_id: string;
  account_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  date_start: string;
  date_stop?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  frequency?: string;
  clicks?: string;
  inline_link_clicks?: string;
  actions?: MetaAction[];
  action_values?: MetaAction[];
};

const ACTION = {
  landingPageView: 'landing_page_view',
  messagingStarted: 'onsite_conversion.messaging_conversation_started_7d',
  messagingFirstReply: 'onsite_conversion.messaging_first_reply',
  messagingTotalConnection: 'onsite_conversion.total_messaging_connection',
} as const;

const LEAD_ACTIONS = ['lead', 'onsite_conversion.lead_grouped'] as const;
const PURCHASE_PRECEDENCE = ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase'] as const;

function finiteNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function actionValue(actions: MetaAction[] | undefined, type: string): number {
  return (actions ?? []).filter((item) => item.action_type === type)
    .reduce((sum, item) => sum + finiteNumber(item.value), 0);
}

function approvedActionTotal(actions: MetaAction[] | undefined, types: readonly string[]): number {
  const approved = new Set(types);
  return (actions ?? []).filter((item) => approved.has(item.action_type))
    .reduce((sum, item) => sum + finiteNumber(item.value), 0);
}

// Meta may return aggregate and channel-specific purchase aliases together.
// Use the highest-priority present alias instead of adding overlapping aliases.
function canonicalPurchase(actions: MetaAction[] | undefined): number {
  const available = new Set((actions ?? []).map((item) => item.action_type));
  const canonicalType = PURCHASE_PRECEDENCE.find((type) => available.has(type));
  return canonicalType ? actionValue(actions, canonicalType) : 0;
}

export function normalizeAdditiveInsight(
  row: MetaInsightRow,
  currency: string,
  attributionKey: string,
  resultConfig: PrimaryResultConfig,
) {
  if (!row.ad_id) throw new Error('Meta ad-level insight is missing ad_id');
  const primaryResults = resultConfig.actionTypes.length > 0
    ? approvedActionTotal(row.actions, resultConfig.actionTypes)
    : null;

  return {
    ad_account_id: row.account_id,
    insight_date: row.date_start,
    ad_id: row.ad_id,
    ad_name: row.ad_name ?? null,
    ad_set_id: row.adset_id ?? null,
    ad_set_name: row.adset_name ?? null,
    campaign_id: row.campaign_id ?? null,
    campaign_name: row.campaign_name ?? null,
    attribution_key: attributionKey,
    currency,
    spend: finiteNumber(row.spend),
    impressions: finiteNumber(row.impressions),
    clicks: finiteNumber(row.clicks),
    inline_link_clicks: finiteNumber(row.inline_link_clicks),
    landing_page_views: actionValue(row.actions, ACTION.landingPageView),
    messaging_conversations_started: actionValue(row.actions, ACTION.messagingStarted),
    messaging_first_replies: actionValue(row.actions, ACTION.messagingFirstReply),
    messaging_total_connections: actionValue(row.actions, ACTION.messagingTotalConnection),
    leads: approvedActionTotal(row.actions, LEAD_ACTIONS),
    purchases: canonicalPurchase(row.actions),
    purchase_value: canonicalPurchase(row.action_values),
    primary_results: primaryResults,
    raw_actions: row.actions ?? [],
    raw_action_values: row.action_values ?? [],
    synced_at: new Date().toISOString(),
  };
}

export function normalizeReportingSnapshot(
  row: MetaInsightRow,
  level: ReportingLevel,
  dateFrom: string,
  dateTo: string,
  attributionKey: string,
) {
  const entityId = level === 'account' ? row.account_id
    : level === 'campaign' ? row.campaign_id
      : level === 'adset' ? row.adset_id : row.ad_id;
  if (!entityId) throw new Error(`Meta ${level}-level insight is missing entity id`);

  return {
    ad_account_id: row.account_id,
    reporting_level: level,
    entity_id: entityId,
    date_from: dateFrom,
    date_to: dateTo,
    attribution_key: attributionKey,
    reach: optionalNumber(row.reach),
    frequency: optionalNumber(row.frequency),
    synced_at: new Date().toISOString(),
  };
}
