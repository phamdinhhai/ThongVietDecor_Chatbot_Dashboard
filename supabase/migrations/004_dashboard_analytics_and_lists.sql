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
  valid_orders as (
    select distinct on (
      case
        when nullif(trim(coalesce(o."ID Lọc", '')), '') is not null then 'idloc:' || trim(o."ID Lọc")
        else 'fallback:' || coalesce(o.conversation_id, '') || '|' || coalesce(normalize_phone(o.phone), '') || '|' ||
             lower(regexp_replace(coalesce(o.address, ''), '\s+', ' ', 'g')) || '|' ||
             normalize_order_text(o."order") || '|' || normalize_vnd_amount(o.billing)::text
      end
    )
      o.conversation_id
    from order_list o
    where (p_page_ids is null or o.page_id = any(p_page_ids))
      and nullif(trim(coalesce(o.phone, '')), '') is not null
      and nullif(trim(coalesce(o.address, '')), '') is not null
      and nullif(trim(coalesce(o."order", '')), '') is not null
      and nullif(trim(coalesce(o.billing, '')), '') is not null
    order by
      case
        when nullif(trim(coalesce(o."ID Lọc", '')), '') is not null then 'idloc:' || trim(o."ID Lọc")
        else 'fallback:' || coalesce(o.conversation_id, '') || '|' || coalesce(normalize_phone(o.phone), '') || '|' ||
             lower(regexp_replace(coalesce(o.address, ''), '\s+', ' ', 'g')) || '|' ||
             normalize_order_text(o."order") || '|' || normalize_vnd_amount(o.billing)::text
      end,
      o.id desc
  ),
  state_agg as (
    select
      case
        when exists (
          select 1 from valid_orders o
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
    select
      o.*,
      normalize_phone(o.phone) as normalized_phone,
      normalize_order_text(o."order") as normalized_order,
      normalize_vnd_amount(o.billing) as normalized_billing,
      lower(regexp_replace(coalesce(o.address, ''), '\s+', ' ', 'g')) as normalized_address,
      case
        when nullif(trim(coalesce(o."ID Lọc", '')), '') is not null then 'idloc:' || trim(o."ID Lọc")
        else 'fallback:' || coalesce(o.conversation_id, '') || '|' || coalesce(normalize_phone(o.phone), '') || '|' ||
             lower(regexp_replace(coalesce(o.address, ''), '\s+', ' ', 'g')) || '|' ||
             normalize_order_text(o."order") || '|' || normalize_vnd_amount(o.billing)::text
      end as canonical_order_key
    from order_list o
    where (p_page_ids is null or o.page_id = any(p_page_ids))
      and nullif(trim(coalesce(o.phone, '')), '') is not null
      and nullif(trim(coalesce(o.address, '')), '') is not null
      and nullif(trim(coalesce(o."order", '')), '') is not null
      and nullif(trim(coalesce(o.billing, '')), '') is not null
  ),
  order_dedup as (
    select distinct on (canonical_order_key) *
    from order_rows
    order by canonical_order_key,
             case when "ID Lọc" is null or trim("ID Lọc") = '' then 1 else 0 end,
             length(coalesce(address, '')) desc,
             id desc
  ),
  lead_by_day as (
    select to_char(date_trunc('day', first_message_at), 'YYYY-MM-DD') as label, count(*) as value
    from (
      select session_id, page_id, min("timestamp") as first_message_at
      from chats
      group by session_id, page_id
    ) first_leads
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
  product_catalog(code, name) as (
    values
      ('TV-K004-VD', 'Kệ gỗ mini đa năng (bản vuông) - Gọn gàng góc nhỏ'),
      ('TV-K006-VD', 'Kệ gỗ thông 5 tầng đa năng - Dòng vuông hiện đại'),
      ('TV-K004-VT', 'Kệ treo quần áo (bản vuông) - Bản mộc cho phòng nhỏ'),
      ('TV-K006-VT2', 'Kệ treo quần áo gỗ thông (2 tầng) - Bản vuông tối giản'),
      ('TV-K006-VT3', 'Kệ treo quần áo gỗ thông (3 tầng) - Bản vuông tinh tế'),
      ('TV-K004-VTD', 'Combo kệ treo & giá đồ đơn (bản vuông) - Tiết kiệm diện tích'),
      ('TV-K006-VTD2', 'Kệ treo tích hợp giá đồ (2 tầng) - Bản vuông đa năng'),
      ('TV-K006-VTD3', 'Kệ treo tích hợp giá đồ (3 tầng) - Bản vuông đa năng'),
      ('TV-K004-VF', 'Hệ kệ 3 ngăn đa năng - Bản vuông vững chãi'),
      ('TV-K006-VF2', 'Hệ kệ 3 ngăn đa năng - Bản vuông vững chãi'),
      ('TV-K006-VF3', 'Hệ kệ 3 ngăn đa năng - Giải pháp không gian lớn'),
      ('TV-K003-CD', 'Kệ gỗ mini đa năng (bản chéo) - Gọn gàng góc nhỏ'),
      ('TV-K005-CD', 'Kệ gỗ thông 5 tầng - Bản chéo phong cách Scandinavian'),
      ('TV-K003-CT', 'Kệ gỗ thông treo đơn - Bản Chéo Scandinavian'),
      ('TV-K005-CT2', 'Kệ gỗ thông treo đơn (2 tầng) - Bản Chéo Scandinavian'),
      ('TV-K005-CT3', 'Kệ gỗ thông treo đơn (3 tầng) - Bản Chéo Scandinavian'),
      ('TV-K003-CTD', 'Combo kệ treo & giá đồ đơn (bản chéo) - Tiết kiệm diện tích'),
      ('TV-K005-CTD2', 'Kệ treo tích hợp giá đồ (2 tầng) - Bản chéo đa năng'),
      ('TV-K005-CTD3', 'Kệ treo tích hợp giá đồ (3 tầng) - Bản chéo đa năng'),
      ('TV-K003-CF', 'Hệ kệ 3 ngăn đa năng - Scandinavian phóng khoáng'),
      ('TV-K005-CF2', 'Hệ kệ 3 ngăn đa năng - Scandinavian phóng khoáng'),
      ('TV-K005-CF3', 'Hệ kệ 3 ngăn đa năng - Scandinavian phóng khoáng'),
      ('TV-K001', 'Kệ treo quần áo đa năng Model 01 - Gỗ thông mộc'),
      ('TV-K002', 'Kệ treo quần áo đa năng Model 02 - Tiện ích tối đa'),
      ('TV-K010', 'Kệ treo quần áo chữ A kinh điển - Gỗ thông nguyên bản'),
      ('TV-K011', 'Cây treo đồ đứng Minimalist - Gỗ thông sấy'),
      ('TV-K012-60', 'Kệ giày gỗ thông tự nhiên (Size 60cm)'),
      ('TV-K012-80', 'Kệ giày gỗ thông tự nhiên (Size 80cm)'),
      ('TV-K013', 'Táp đầu giường gỗ thông - Nhỏ xinh và ấm áp'),
      ('TV-D002', 'Tủ Kệ Decor Đa Năng "Hòa Hợp" - Điểm Nhấn Bắc Âu Sang Trọng'),
      ('TV-D003', 'Kệ decor "TĨNH" - Khoảng lặng cho không gian sống'),
      ('TV-D005', 'Tủ kệ decor đa năng - Kết hợp ngăn kéo tiện dụng'),
      ('TV-D017', 'Tủ kệ decor đa năng (5 ngăn)'),
      ('TV-K007', 'Kệ gỗ trang trí hình thang 3 Tầng - Nét mộc cho không gian hiện đại'),
      ('TV-D001-1', 'Kệ gỗ decor "Sánh Đôi" - Nhỏ xinh và tiện dụng'),
      ('TV-D001-2', 'Kệ ngăn đa năng "Cân Bằng" - Nét mộc cho phòng khách'),
      ('TV-D004', 'Kệ gỗ để bàn 4 ô đa năng - Thiết kế chữ S độc đáo'),
      ('TV-D006', 'Kệ decor Xương Rồng (Bản nhỏ) - Điểm nhấn xanh cho ngôi nhà'),
      ('TV-D007', 'Kệ decor Xương Rồng (Bản lớn) - Điểm nhấn xanh cho ngôi nhà'),
      ('TV-D008', 'Bàn Console gỗ thông'),
      ('TV-D009', 'Bàn Console gỗ thông (Bản basic / Chữ V tinh tế)'),
      ('TV-D010', 'Bảng gỗ Pegboard treo tường - Sáng tạo không giới hạn'),
      ('TV-D018', 'Giá sách Xương Cá - Nghệ thuật lưu trữ tri thức'),
      ('TV-D013', 'Kệ mini để bàn (3 tầng) - Gọn gàng cảm hứng'),
      ('TV-D014', 'Kệ mini để bàn (4 tầng) - Gọn gàng cảm hứng'),
      ('TV-K008', 'Thang gỗ treo khăn decor (Bản chéo) - Nét mộc cho phòng tắm/ngủ'),
      ('TV-K009', 'Thang gỗ treo khăn decor (Bản vuông) - Nét mộc cho phòng tắm/ngủ'),
      ('TV-D011', 'Kệ gỗ mini để bàn - Trục tròn thanh thoát'),
      ('TV-D012', 'Kệ bục tròn 3 tầng - Trưng bày decor xinh xắn'),
      ('TV-D015', 'Kệ sách mini - Kệ để bàn gỗ thông nguyên bản'),
      ('TV-D016', 'Kệ mini trưng bày đa năng - Nét mộc bàn làm việc'),
      ('TV-D021', 'Kệ trang trí, decor đa năng')
  ),
  product_matches as (
    select
      upper(m[1]) as code,
      coalesce(nullif(m[2], '')::int, 1) as quantity
    from order_dedup o
    cross join lateral regexp_matches(
      coalesce(o."order", ''),
      '(TV-[A-Z0-9]+(?:-[A-Z0-9]+)*)(?:\s*[xX×]\s*([0-9]+))?',
      'g'
    ) as m
  ),
  top_products as (
    select
      pc.code as label,
      sum(pm.quantity)::bigint as value
    from product_matches pm
    join product_catalog pc on pc.code = pm.code
    group by pc.code, pc.name
    order by value desc, pc.code asc
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
    'chatByDay', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'value', value)) from lead_by_day), '[]'::jsonb),
    'chatByHour', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'value', value)) from chat_by_hour), '[]'::jsonb),
    'chatByWeekday', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'value', value)) from chat_by_weekday), '[]'::jsonb),
    'topProducts', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'value', value)) from top_products), '[]'::jsonb),
    'quality', (select to_jsonb(quality) from quality)
  );
$$;

-- Keep overview KPIs aligned with the order list RPC.
-- PostgreSQL requires DROP before changing dependency/definition shape from older migrations.
drop function if exists get_revenue_kpis(text[]) cascade;

create function get_revenue_kpis(p_page_ids text[])
returns table (
  total_orders bigint,
  total_revenue bigint,
  orders_needing_verification bigint,
  orders_collapsed_as_revision bigint,
  duplicate_rows_removed bigint
)
language sql
stable
as $$
  with filtered as (
    select
      o.*,
      normalize_phone(o.phone) as normalized_phone,
      normalize_order_text(o."order") as normalized_order,
      normalize_vnd_amount(o.billing) as normalized_billing,
      lower(regexp_replace(coalesce(o.address, ''), '\s+', ' ', 'g')) as normalized_address,
      case
        when nullif(trim(coalesce(o."ID Lọc", '')), '') is not null then 'idloc:' || trim(o."ID Lọc")
        else 'fallback:' || coalesce(o.conversation_id, '') || '|' || coalesce(normalize_phone(o.phone), '') || '|' ||
             lower(regexp_replace(coalesce(o.address, ''), '\s+', ' ', 'g')) || '|' ||
             normalize_order_text(o."order") || '|' || normalize_vnd_amount(o.billing)::text
      end as canonical_order_key
    from order_list o
    where (p_page_ids is null or o.page_id = any(p_page_ids))
      and nullif(trim(coalesce(o.phone, '')), '') is not null
      and nullif(trim(coalesce(o.address, '')), '') is not null
      and nullif(trim(coalesce(o."order", '')), '') is not null
      and nullif(trim(coalesce(o.billing, '')), '') is not null
  ),
  ranked as (
    select
      f.*,
      row_number() over (
        partition by canonical_order_key
        order by case when "ID Lọc" is null or trim("ID Lọc") = '' then 1 else 0 end,
                 length(coalesce(address, '')) desc,
                 id desc
      ) as dup_rank
    from filtered f
  ),
  canonical_orders as (
    select * from ranked where dup_rank = 1
  )
  select
    (select count(*) from canonical_orders) as total_orders,
    (select coalesce(sum(normalized_billing), 0) from canonical_orders) as total_revenue,
    (select count(*) from canonical_orders where "ID Lọc" is null or trim("ID Lọc") = '') as orders_needing_verification,
    0::bigint as orders_collapsed_as_revision,
    ((select count(*) from filtered) - (select count(*) from canonical_orders)) as duplicate_rows_removed;
$$;

create or replace function get_conversion_rate(p_page_ids text[])
returns table (
  session_count bigint,
  order_count bigint,
  rate numeric
)
language sql
stable
as $$
  select
    s.session_count,
    r.total_orders as order_count,
    case when s.session_count > 0
      then round(r.total_orders::numeric / s.session_count, 4)
      else 0
    end as rate
  from
    (
      select count(distinct session_id) as session_count
      from fb_chats
      where p_page_ids is null or page_id = any(p_page_ids)
    ) s,
    (select total_orders from get_revenue_kpis(p_page_ids)) r;
$$;

drop function if exists get_customer_list_v2(text[], text, integer, integer);

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
    select distinct on (
      case
        when nullif(trim(coalesce("ID Lọc", '')), '') is not null then 'idloc:' || trim("ID Lọc")
        else 'fallback:' || coalesce(conversation_id, '') || '|' || coalesce(normalize_phone(phone), '') || '|' ||
             lower(regexp_replace(coalesce(address, ''), '\s+', ' ', 'g')) || '|' ||
             normalize_order_text("order") || '|' || normalize_vnd_amount(billing)::text
      end
    )
      conversation_id, phone, id
    from order_list
    where (p_page_ids is null or page_id = any(p_page_ids))
      and nullif(trim(coalesce(phone, '')), '') is not null
      and nullif(trim(coalesce(address, '')), '') is not null
      and nullif(trim(coalesce("order", '')), '') is not null
      and nullif(trim(coalesce(billing, '')), '') is not null
    order by
      case
        when nullif(trim(coalesce("ID Lọc", '')), '') is not null then 'idloc:' || trim("ID Lọc")
        else 'fallback:' || coalesce(conversation_id, '') || '|' || coalesce(normalize_phone(phone), '') || '|' ||
             lower(regexp_replace(coalesce(address, ''), '\s+', ' ', 'g')) || '|' ||
             normalize_order_text("order") || '|' || normalize_vnd_amount(billing)::text
      end,
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

drop function if exists get_order_list_v2(text[], text, integer, integer);

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
      normalize_vnd_amount(o.billing) as normalized_billing,
      lower(regexp_replace(coalesce(o.address, ''), '\s+', ' ', 'g')) as normalized_address,
      case
        when nullif(trim(coalesce(o."ID Lọc", '')), '') is not null then 'idloc:' || trim(o."ID Lọc")
        else 'fallback:' || coalesce(o.conversation_id, '') || '|' || coalesce(normalize_phone(o.phone), '') || '|' ||
             lower(regexp_replace(coalesce(o.address, ''), '\s+', ' ', 'g')) || '|' ||
             normalize_order_text(o."order") || '|' || normalize_vnd_amount(o.billing)::text
      end as canonical_order_key
    from order_list o
    where (p_page_ids is null or o.page_id = any(p_page_ids))
      and nullif(trim(coalesce(o.phone, '')), '') is not null
      and nullif(trim(coalesce(o.address, '')), '') is not null
      and nullif(trim(coalesce(o."order", '')), '') is not null
      and nullif(trim(coalesce(o.billing, '')), '') is not null
  ),
  ranked as (
    select
      f.*,
      row_number() over (
        partition by canonical_order_key
        order by case when "ID Lọc" is null or trim("ID Lọc") = '' then 1 else 0 end,
                 length(coalesce(address, '')) desc,
                 id desc
      ) as dup_rank,
      count(*) over (partition by canonical_order_key) as duplicate_count
    from filtered f
  ),
  deduped as (
    select * from ranked where dup_rank = 1
  ),
  enriched as (
    select
      d.id as source_id,
      d.canonical_order_key as order_key,
      d.name,
      d.normalized_phone as phone,
      d.address,
      d."order" as products,
      d.billing,
      d.normalized_billing as billing_amount,
      d.notice,
      d.conversation_id,
      coalesce(pt.name, d.page_id) as page,
      d.duplicate_count as merged_rows,
      d.id as max_id
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
