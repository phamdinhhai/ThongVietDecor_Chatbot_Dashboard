-- ============================================================
-- Meta Ads reporting: tenant-scoped dimensions, additive daily facts,
-- exact-range reporting snapshots, sync audit and reporting RPC.
-- All reads/writes are server-side through the service role (deny-all RLS).
-- Idempotent DDL + CREATE OR REPLACE RPC allow rerun after a partial failure.
-- ============================================================

create table if not exists meta_ad_accounts (
  ad_account_id text primary key check (ad_account_id !~ '^act_'),
  tenant_id uuid not null references dashboard_tenants(id) on delete restrict,
  name text not null,
  business_id text,
  ownership_type text check (ownership_type in ('owned', 'client')),
  account_status integer,
  currency text not null,
  timezone_name text,
  primary_result_label text,
  primary_result_action_types text[] not null default array[]::text[],
  attribution_key text not null default 'account_default',
  active boolean not null default true,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists meta_ad_accounts_tenant_account_idx
  on meta_ad_accounts(tenant_id, ad_account_id);

create table if not exists meta_campaigns (
  campaign_id text primary key,
  ad_account_id text not null references meta_ad_accounts(ad_account_id) on delete restrict,
  name text not null,
  objective text,
  status text,
  effective_status text,
  daily_budget numeric(20,4),
  lifetime_budget numeric(20,4),
  start_time timestamptz,
  stop_time timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists meta_ad_sets (
  ad_set_id text primary key,
  campaign_id text references meta_campaigns(campaign_id) on delete restrict,
  ad_account_id text not null references meta_ad_accounts(ad_account_id) on delete restrict,
  name text not null,
  status text,
  effective_status text,
  daily_budget numeric(20,4),
  lifetime_budget numeric(20,4),
  optimization_goal text,
  billing_event text,
  updated_at timestamptz not null default now()
);

create table if not exists meta_ads (
  ad_id text primary key,
  ad_set_id text references meta_ad_sets(ad_set_id) on delete restrict,
  campaign_id text references meta_campaigns(campaign_id) on delete restrict,
  ad_account_id text not null references meta_ad_accounts(ad_account_id) on delete restrict,
  name text not null,
  status text,
  effective_status text,
  creative_id text,
  updated_at timestamptz not null default now()
);

-- Only additive metrics are aggregated from this table.
create table if not exists meta_ads_insights_daily (
  ad_account_id text not null references meta_ad_accounts(ad_account_id) on delete restrict,
  insight_date date not null,
  ad_id text not null,
  ad_name text,
  ad_set_id text,
  ad_set_name text,
  campaign_id text,
  campaign_name text,
  attribution_key text not null,
  currency text not null,
  spend numeric(20,4) not null default 0,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  inline_link_clicks numeric(20,4) not null default 0,
  landing_page_views numeric(20,4) not null default 0,
  messaging_conversations_started numeric(20,4) not null default 0,
  messaging_first_replies numeric(20,4) not null default 0,
  messaging_total_connections numeric(20,4) not null default 0,
  leads numeric(20,4) not null default 0,
  purchases numeric(20,4) not null default 0,
  purchase_value numeric(20,4) not null default 0,
  primary_results numeric(20,4),
  raw_actions jsonb not null default '[]'::jsonb,
  raw_action_values jsonb not null default '[]'::jsonb,
  synced_at timestamptz not null default now(),
  primary key (ad_account_id, ad_id, insight_date, attribution_key)
);

create index if not exists meta_ads_insights_account_date_idx on meta_ads_insights_daily(ad_account_id, insight_date);
create index if not exists meta_ads_insights_campaign_date_idx on meta_ads_insights_daily(campaign_id, insight_date);
create index if not exists meta_ads_insights_adset_date_idx on meta_ads_insights_daily(ad_set_id, insight_date);

-- Reach/frequency are non-additive across entities and dates. A snapshot is
-- valid only for the exact requested level and exact date range.
create table if not exists meta_ads_reporting_snapshots (
  ad_account_id text not null references meta_ad_accounts(ad_account_id) on delete restrict,
  reporting_level text not null check (reporting_level in ('account', 'campaign', 'adset', 'ad')),
  entity_id text not null,
  date_from date not null,
  date_to date not null check (date_to >= date_from),
  attribution_key text not null,
  reach bigint,
  frequency numeric(20,8),
  synced_at timestamptz not null default now(),
  primary key (ad_account_id, reporting_level, entity_id, date_from, date_to, attribution_key)
);

create index if not exists meta_ads_snapshots_lookup_idx
  on meta_ads_reporting_snapshots(ad_account_id, reporting_level, date_from, date_to, attribution_key);

create table if not exists meta_ads_sync_runs (
  id uuid primary key default gen_random_uuid(),
  ad_account_id text references meta_ad_accounts(ad_account_id) on delete restrict,
  date_from date not null,
  date_to date not null check (date_to >= date_from),
  mode text not null default 'synchronous' check (mode in ('synchronous', 'asynchronous')),
  report_run_id text,
  status text not null check (status in ('running', 'success', 'partial', 'failed')),
  rows_synced integer not null default 0,
  snapshots_synced integer not null default 0,
  error_code text,
  error_message text,
  meta_trace_id text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table meta_ad_accounts enable row level security;
alter table meta_campaigns enable row level security;
alter table meta_ad_sets enable row level security;
alter table meta_ads enable row level security;
alter table meta_ads_insights_daily enable row level security;
alter table meta_ads_reporting_snapshots enable row level security;
alter table meta_ads_sync_runs enable row level security;

create or replace function get_meta_ads_report(
  p_account_ids text[], p_date_from date, p_date_to date,
  p_level text default 'campaign', p_search text default '',
  p_limit int default 100, p_offset int default 0
) returns jsonb language plpgsql stable as $$
declare result jsonb;
begin
  if p_level not in ('campaign', 'adset', 'ad') then raise exception 'unsupported_report_level'; end if;
  if p_date_to < p_date_from then raise exception 'invalid_date_range'; end if;

  with scoped as (
    select i.* from meta_ads_insights_daily i
    where i.ad_account_id = any(coalesce(p_account_ids, array[]::text[]))
      and i.insight_date between p_date_from and p_date_to
  ), totals as (
    select coalesce(sum(spend),0) as spend, coalesce(sum(impressions),0) as impressions,
      coalesce(sum(clicks),0) as clicks, coalesce(sum(inline_link_clicks),0) as inline_link_clicks,
      coalesce(sum(landing_page_views),0) as landing_page_views,
      coalesce(sum(messaging_conversations_started),0) as messaging_conversations_started,
      coalesce(sum(messaging_first_replies),0) as messaging_first_replies,
      coalesce(sum(messaging_total_connections),0) as messaging_total_connections,
      coalesce(sum(leads),0) as leads, coalesce(sum(purchases),0) as purchases,
      coalesce(sum(purchase_value),0) as purchase_value,
      case when count(*) > 0 and bool_and(primary_results is not null)
        then sum(primary_results) end as primary_results
    from scoped
  ), account_snapshot as (
    select case when cardinality(p_account_ids) = 1 then max(reach) end as reach,
      case when cardinality(p_account_ids) = 1 then max(frequency) end as frequency
    from meta_ads_reporting_snapshots
    where ad_account_id = any(coalesce(p_account_ids, array[]::text[]))
      and reporting_level='account' and date_from=p_date_from and date_to=p_date_to
      and attribution_key=(select min(attribution_key) from scoped)
  ), timeseries as (
    select insight_date as insight_day, sum(spend) as spend,
      sum(primary_results) as primary_results,
      sum(impressions) as impressions, sum(clicks) as clicks
    from scoped group by insight_date order by insight_date
  ), grouped as (
    select case p_level when 'campaign' then campaign_id when 'adset' then ad_set_id else ad_id end as entity_id,
      case p_level when 'campaign' then campaign_name when 'adset' then ad_set_name else ad_name end as entity_name,
      min(ad_account_id) as ad_account_id, sum(spend) as spend, sum(impressions) as impressions,
      sum(clicks) as clicks, sum(inline_link_clicks) as inline_link_clicks,
      sum(primary_results) as primary_results, sum(leads) as leads,
      sum(messaging_conversations_started) as messaging_conversations_started,
      sum(purchases) as purchases, sum(purchase_value) as purchase_value
    from scoped group by 1,2
  ), grouped_with_delivery as (
    select g.*, case p_level when 'campaign' then c.effective_status when 'adset' then s.effective_status else a.effective_status end effective_status
    from grouped g
    left join meta_campaigns c on p_level='campaign' and c.campaign_id=g.entity_id
    left join meta_ad_sets s on p_level='adset' and s.ad_set_id=g.entity_id
    left join meta_ads a on p_level='ad' and a.ad_id=g.entity_id
  ), with_snapshots as (
    select g.*, snap.reach, snap.frequency
    from grouped_with_delivery g
    left join meta_ads_reporting_snapshots snap on snap.ad_account_id=g.ad_account_id
      and snap.reporting_level=p_level and snap.entity_id=g.entity_id
      and snap.date_from=p_date_from and snap.date_to=p_date_to
      and snap.attribution_key=(select min(attribution_key) from scoped)
  ), searched as (
    select * from with_snapshots where entity_id is not null and
      (coalesce(p_search,'')='' or entity_name ilike '%'||p_search||'%' or entity_id ilike '%'||p_search||'%')
  ), rows_page as (
    select *, count(*) over() row_count from searched
    order by spend desc, entity_name offset greatest(p_offset,0) limit least(greatest(p_limit,1),200)
  )
  select jsonb_build_object(
    'summary', jsonb_build_object('spend',t.spend,'impressions',t.impressions,'reach',s.reach,
      'frequency',s.frequency,'clicks',t.clicks,'inlineLinkClicks',t.inline_link_clicks,
      'landingPageViews',t.landing_page_views,'primaryResults',t.primary_results,
      'messagingConversationsStarted',t.messaging_conversations_started,
      'messagingFirstReplies',t.messaging_first_replies,'messagingTotalConnections',t.messaging_total_connections,
      'leads',t.leads,'purchases',t.purchases,'purchaseValue',t.purchase_value,
      'ctr',case when t.impressions>0 then t.clicks::numeric/t.impressions end,
      'inlineLinkCtr',case when t.impressions>0 then t.inline_link_clicks/t.impressions end,
      'cpc',case when t.clicks>0 then t.spend/t.clicks end,
      'costPerInlineLinkClick',case when t.inline_link_clicks>0 then t.spend/t.inline_link_clicks end,
      'cpm',case when t.impressions>0 then t.spend*1000/t.impressions end,
      'costPerResult',case when t.primary_results>0 then t.spend/t.primary_results end,
      'roas',case when t.spend>0 then t.purchase_value/t.spend end),
    'timeseries',coalesce((select jsonb_agg(jsonb_build_object('date',insight_day,'spend',spend,
      'primaryResults',primary_results,'impressions',impressions,'clicks',clicks) order by insight_day) from timeseries),'[]'::jsonb),
    'rows',coalesce((select jsonb_agg(to_jsonb(r)-'row_count') from rows_page r),'[]'::jsonb),
    'totalRows',coalesce((select max(row_count) from rows_page),0),
    'freshness',(select max(synced_at) from scoped)
  ) into result from totals t cross join account_snapshot s;
  return coalesce(result,jsonb_build_object('summary','{}'::jsonb,'timeseries','[]'::jsonb,'rows','[]'::jsonb,'totalRows',0));
end; $$;
