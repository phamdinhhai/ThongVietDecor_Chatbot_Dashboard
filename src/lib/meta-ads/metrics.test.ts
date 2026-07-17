import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeAdditiveInsight, normalizeReportingSnapshot, type MetaInsightRow } from './metrics.ts';

const base: MetaInsightRow = {
  account_id: '123', campaign_id: 'c1', adset_id: 's1', ad_id: 'a1',
  date_start: '2026-07-16', date_stop: '2026-07-16',
  spend: '100.5', impressions: '1000', clicks: '40', inline_link_clicks: '12',
};

test('keeps all clicks and inline link clicks separate', () => {
  const result = normalizeAdditiveInsight(base, 'VND', 'account_default', { label: null, actionTypes: [] });
  assert.equal(result.clicks, 40);
  assert.equal(result.inline_link_clicks, 12);
  assert.equal(result.primary_results, null);
});

test('does not add overlapping messaging funnel events', () => {
  const row: MetaInsightRow = { ...base, actions: [
    { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '7' },
    { action_type: 'onsite_conversion.messaging_first_reply', value: '5' },
    { action_type: 'onsite_conversion.total_messaging_connection', value: '9' },
  ] };
  const result = normalizeAdditiveInsight(row, 'VND', 'account_default', { label: 'Hội thoại bắt đầu', actionTypes: ['onsite_conversion.messaging_conversation_started_7d'] });
  assert.equal(result.messaging_conversations_started, 7);
  assert.equal(result.messaging_first_replies, 5);
  assert.equal(result.messaging_total_connections, 9);
  assert.equal(result.primary_results, 7);
});

test('selects omni_purchase without adding overlapping purchase aliases', () => {
  const aliases = [
    { action_type: 'purchase', value: '3' },
    { action_type: 'offsite_conversion.fb_pixel_purchase', value: '3' },
    { action_type: 'omni_purchase', value: '4' },
  ];
  const result = normalizeAdditiveInsight({ ...base, actions: aliases, action_values: aliases.map((item) => ({ ...item, value: String(Number(item.value) * 100) })) }, 'USD', 'account_default', { label: null, actionTypes: [] });
  assert.equal(result.purchases, 4);
  assert.equal(result.purchase_value, 400);
});

test('distinguishes missing snapshot metrics from measured zero', () => {
  const missing = normalizeReportingSnapshot(base, 'campaign', '2026-07-01', '2026-07-16', 'account_default');
  const zero = normalizeReportingSnapshot({ ...base, reach: '0', frequency: '0' }, 'campaign', '2026-07-01', '2026-07-16', 'account_default');
  assert.equal(missing.reach, null);
  assert.equal(missing.frequency, null);
  assert.equal(zero.reach, 0);
  assert.equal(zero.frequency, 0);
});

test('rejects an ad-level additive row without ad_id', () => {
  assert.throws(() => normalizeAdditiveInsight({ ...base, ad_id: undefined }, 'VND', 'account_default', { label: null, actionTypes: [] }), /missing ad_id/);
});
