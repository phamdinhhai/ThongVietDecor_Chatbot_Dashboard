-- ============================================================
-- Analytics + normalized dashboard data RPCs
-- ============================================================

create index if not exists idx_customer_data_customer_page
  on customer_data("Customer id", "Page id");

create index if not exists idx_fb_chats_session_page_ts
  on fb_chats(session_id, page_id, "timestamp");

create index if not exists idx_order_list_conv_page
  on order_list(conversation_id, page_id);

create or replace function normalize_vnd_amount(p_text text)
returns bigint
language sql
immutable
as $$
  select coalesce(nullif(regexp_replace(coalesce(p_text, ''), '[^0-9]', '', 'g'), '')::bigint, 0);
$$;

create or replace function normalize_phone(p_text text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(coalesce(p_text, ''), '[^0-9+]', '', 'g'), '');
$$;

create or replace function get_customer_kpis(p_page_ids text[])
returns table (
  total bigint,
  spam_count bigint,
  state_breakdown jsonb
)
language sql
stable
as $$
  with filtered as (
    select distinct on ("Customer id", "Page id")
      "Customer id" as customer_id,
      "Page id" as page_id,
      "State" as state,
      spam_mark
    from customer_data
    where p_page_ids is null or "Page id" = any(p_page_ids)
    order by "Customer id", "Page id", id desc
  ),
  state_agg as (
    select
      case
        when exists (
          select 1 from order_list o
          where o.conversation_id = filtered.customer_id || '_' || filtered.page_id
        ) then 'Đã mua hàng'
        else 'Chưa mua hàng'
      end as state_key,
      count(*) as cnt
    from filtered
    group by state_key
  )
  select
    (select count(*) from filtered) as total,
    (select count(*) from filtered where spam_mark is not null and spam_mark <> '') as spam_count,
    (select coalesce(jsonb_object_agg(state_key, cnt), '{}'::jsonb) from state_agg) as state_breakdown;
$$;

create or replace function get_dashboard_analytics(p_page_ids text[])
returns jsonb
language sql
stable
as $$
  with chats as (
    select *
    from fb_chats
    where p_page_ids is null or page_id = any(p_page_ids)
  ),
  orders as (
    select *
    from order_list
    where p_page_ids is null or page_id = any(p_page_ids)
  ),
  chat_by_day as (
    select to_char(date_trunc('day', "timestamp"), 'YYYY-MM-DD') as label, count(*) as value
    from chats
    group by 1
    order by 1
  ),
  chat_by_hour as (
    select lpad(extract(hour from "timestamp")::int::text, 2, '0') || ':00' as label, count(*) as value
    from chats
    group by 1
    order by 1
  ),
  chat_by_weekday as (
    select
      extract(isodow from "timestamp")::int as dow,
      case extract(isodow from "timestamp")::int
        when 1 then 'T2' when 2 then 'T3' when 3 then 'T4' when 4 then 'T5'
        when 5 then 'T6' when 6 then 'T7' else 'CN'
      end as label,
      count(*) as value
    from chats
    group by 1, 2
    order by 1
  ),
  product_tokens as (
    select nullif(trim(tok), '') as product
    from orders o
    left join lateral unnest(string_to_array(coalesce(o."order", ''), ',')) tok on true
  ),
  top_products as (
    select product as label, count(*) as value
    from product_tokens
    where product is not null
    group by product
    order by value desc, label asc
    limit 8
  ),
  quality as (
    select
      count(*) filter (where normalize_vnd_amount(billing) = 0) as zero_billing_count,
      count(*) filter (where "ID Lọc" is null or trim("ID Lọc") = '') as missing_id_loc_count,
      count(*) filter (where normalize_phone(phone) is null) as missing_phone_count
    from orders
  )
  select jsonb_build_object(
    'chatByDay', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'value', value)) from chat_by_day), '[]'::jsonb),
    'chatByHour', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'value', value)) from chat_by_hour), '[]'::jsonb),
    'chatByWeekday', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'value', value)) from chat_by_weekday), '[]'::jsonb),
    'topProducts', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'value', value)) from top_products), '[]'::jsonb),
    'quality', (select to_jsonb(quality) from quality)
  );
$$;

create or replace function get_customer_list_v2(
  p_page_ids text[],
  p_search text default '',
  p_offset int default 0,
  p_limit int default 25
)
returns table (
  row_count bigint,
  id bigint,
  session_id text,
  name text,
  phone text,
  page text,
  status text,
  first_message timestamptz,
  last_message timestamptz
)
language sql
stable
as $$
  with dedup as (
    select distinct on (c."Customer id", c."Page id")
      c.id,
      c."Customer Label" as session_id,
      c."Tên" as name,
      c."Page id" as page_id
    from customer_data c
    where p_page_ids is null or c."Page id" = any(p_page_ids)
    order by c."Customer id", c."Page id", c.id desc
  ),
  enriched as (
    select
      d.id,
      d.session_id,
      d.name,
      normalize_phone((array_agg(o.phone order by o.id desc) filter (where normalize_phone(o.phone) is not null))[1]) as phone,
      coalesce(pt.name, d.page_id) as page,
      case when count(o.*) > 0 then 'Đã mua hàng' else 'Chưa mua hàng' end as status,
      min(f."timestamp") as first_message,
      max(f."timestamp") as last_message
    from dedup d
    left join order_list o on o.conversation_id = d.session_id
    left join fb_chats f on f.session_id = d.session_id
    left join page_tokens pt on pt.page_id = d.page_id
    group by d.id, d.session_id, d.name, pt.name, d.page_id
  ),
  searched as (
    select * from enriched
    where coalesce(p_search, '') = ''
       or name ilike '%' || p_search || '%'
       or session_id ilike '%' || p_search || '%'
       or phone ilike '%' || p_search || '%'
       or page ilike '%' || p_search || '%'
  )
  select count(*) over() as row_count, *
  from searched
  order by last_message desc nulls last, id desc
  offset greatest(p_offset, 0)
  limit least(greatest(p_limit, 1), 100);
$$;

create or replace function get_order_list_v2(
  p_page_ids text[],
  p_search text default '',
  p_offset int default 0,
  p_limit int default 25
)
returns table (
  row_count bigint,
  order_key text,
  name text,
  phone text,
  address text,
  products text,
  billing text,
  billing_amount bigint,
  notice text,
  conversation_id text,
  page text,
  merged_rows bigint
)
language sql
stable
as $$
  with filtered as (
    select
      o.*,
      case when o."ID Lọc" is not null and trim(o."ID Lọc") <> ''
        then o.conversation_id || '::' || o."ID Lọc"
        else '__unverified_' || o.id::text
      end as order_key
    from order_list o
    where p_page_ids is null or o.page_id = any(p_page_ids)
  ),
  grouped as (
    select
      order_key,
      (array_agg(name order by id desc))[1] as name,
      normalize_phone((array_agg(phone order by id desc))[1]) as phone,
      (array_agg(address order by id desc))[1] as address,
      string_agg(distinct "order", ', ') as products,
      (array_agg(billing order by id desc))[1] as billing,
      sum(normalize_vnd_amount(billing)) as billing_amount,
      (array_agg(notice order by id desc))[1] as notice,
      (array_agg(conversation_id order by id desc))[1] as conversation_id,
      (array_agg(page_id order by id desc))[1] as page_id,
      count(*) as merged_rows,
      max(id) as max_id
    from filtered
    group by order_key
  ),
  enriched as (
    select
      g.order_key, g.name, g.phone, g.address, g.products, g.billing, g.billing_amount,
      g.notice, g.conversation_id, coalesce(pt.name, g.page_id) as page, g.merged_rows, g.max_id
    from grouped g
    left join page_tokens pt on pt.page_id = g.page_id
  ),
  searched as (
    select * from enriched
    where coalesce(p_search, '') = ''
       or name ilike '%' || p_search || '%'
       or phone ilike '%' || p_search || '%'
       or products ilike '%' || p_search || '%'
       or page ilike '%' || p_search || '%'
  )
  select count(*) over() as row_count,
         order_key, name, phone, address, products, billing, billing_amount, notice, conversation_id, page, merged_rows
  from searched
  order by max_id desc
  offset greatest(p_offset, 0)
  limit least(greatest(p_limit, 1), 100);
$$;
