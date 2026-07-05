-- ============================================================
-- Analytics + normalized dashboard data RPCs
-- Read-only for business data: creates indexes/functions only.
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

create or replace function normalize_order_text(p_text text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g'), '\s*,\s*', ',', 'g'));
$$;

-- Dedup customer KPI by actual customer/session, not raw rows.
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
    select distinct on (session_id, page_id, "timestamp", coalesce(message, ''))
      session_id, page_id, "timestamp", message
    from fb_chats
    where p_page_ids is null or page_id = any(p_page_ids)
    order by session_id, page_id, "timestamp", coalesce(message, ''), id
  ),
  order_rows as (
    select *
    from order_list
    where p_page_ids is null or page_id = any(p_page_ids)
  ),
  order_dedup as (
    select distinct on (
      conversation_id,
      normalize_phone(phone),
      normalize_order_text("order"),
      normalize_vnd_amount(billing)
    )
      *
    from order_rows
    order by conversation_id, normalize_phone(phone), normalize_order_text("order"), normalize_vnd_amount(billing),
             case when "ID Lọc" is null or trim("ID Lọc") = '' then 1 else 0 end,
             id desc
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
    from order_dedup o
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
      ((select count(*) from order_rows) - (select count(*) from order_dedup)) as duplicate_order_rows_removed,
      ((select count(*) from fb_chats where p_page_ids is null or page_id = any(p_page_ids)) - (select count(*) from chats)) as duplicate_chat_rows_removed
    from order_dedup
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
  display_id bigint,
  source_id bigint,
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
      c.id as source_id,
      c."Customer Label" as session_id,
      c."Tên" as name,
      c."Page id" as page_id
    from customer_data c
    where p_page_ids is null or c."Page id" = any(p_page_ids)
    order by c."Customer id", c."Page id", c.id desc
  ),
  chat_dedup as (
    select distinct on (session_id, page_id, "timestamp", coalesce(message, ''))
      session_id, page_id, "timestamp", message
    from fb_chats
    order by session_id, page_id, "timestamp", coalesce(message, ''), id
  ),
  order_dedup as (
    select distinct on (conversation_id, normalize_phone(phone), normalize_order_text("order"), normalize_vnd_amount(billing))
      conversation_id, phone, id
    from order_list
    order by conversation_id, normalize_phone(phone), normalize_order_text("order"), normalize_vnd_amount(billing),
             case when "ID Lọc" is null or trim("ID Lọc") = '' then 1 else 0 end,
             id desc
  ),
  enriched as (
    select
      d.source_id,
      d.session_id,
      d.name,
      normalize_phone((array_agg(o.phone order by o.id desc) filter (where normalize_phone(o.phone) is not null))[1]) as phone,
      coalesce(pt.name, d.page_id) as page,
      case when count(o.*) > 0 then 'Đã mua hàng' else 'Chưa mua hàng' end as status,
      min(f."timestamp") as first_message,
      max(f."timestamp") as last_message
    from dedup d
    left join order_dedup o on o.conversation_id = d.session_id
    left join chat_dedup f on f.session_id = d.session_id
    left join page_tokens pt on pt.page_id = d.page_id
    group by d.source_id, d.session_id, d.name, pt.name, d.page_id
  ),
  searched as (
    select * from enriched
    where coalesce(p_search, '') = ''
       or name ilike '%' || p_search || '%'
       or session_id ilike '%' || p_search || '%'
       or phone ilike '%' || p_search || '%'
       or page ilike '%' || p_search || '%'
  ),
  numbered as (
    select row_number() over (order by last_message desc nulls last, source_id desc) as display_id, *
    from searched
  )
  select count(*) over() as row_count,
         display_id, source_id, session_id, name, phone, page, status, first_message, last_message
  from numbered
  order by display_id
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
  display_id bigint,
  source_id bigint,
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
      normalize_phone(o.phone) as normalized_phone,
      normalize_order_text(o."order") as normalized_order,
      normalize_vnd_amount(o.billing) as normalized_billing
    from order_list o
    where p_page_ids is null or o.page_id = any(p_page_ids)
  ),
  ranked as (
    select
      f.*,
      row_number() over (
        partition by conversation_id, normalized_phone, normalized_order, normalized_billing
        order by case when "ID Lọc" is null or trim("ID Lọc") = '' then 1 else 0 end,
                 length(coalesce(address, '')) desc,
                 id desc
      ) as dup_rank,
      count(*) over (partition by conversation_id, normalized_phone, normalized_order, normalized_billing) as duplicate_count
    from filtered f
  ),
  deduped as (
    select * from ranked where dup_rank = 1
  ),
  enriched as (
    select
      id as source_id,
      conversation_id || '::' || coalesce(normalized_phone, '') || '::' || normalized_order || '::' || normalized_billing::text as order_key,
      name,
      normalized_phone as phone,
      address,
      "order" as products,
      billing,
      normalized_billing as billing_amount,
      notice,
      conversation_id,
      coalesce(pt.name, page_id) as page,
      duplicate_count as merged_rows,
      id as max_id
    from deduped d
    left join page_tokens pt on pt.page_id = d.page_id
  ),
  searched as (
    select * from enriched
    where coalesce(p_search, '') = ''
       or name ilike '%' || p_search || '%'
       or phone ilike '%' || p_search || '%'
       or products ilike '%' || p_search || '%'
       or page ilike '%' || p_search || '%'
  ),
  numbered as (
    select row_number() over (order by max_id desc) as display_id, *
    from searched
  )
  select count(*) over() as row_count,
         display_id, source_id, order_key, name, phone, address, products, billing, billing_amount,
         notice, conversation_id, page, merged_rows
  from numbered
  order by display_id
  offset greatest(p_offset, 0)
  limit least(greatest(p_limit, 1), 100);
$$;
