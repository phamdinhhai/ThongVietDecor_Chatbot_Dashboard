-- ============================================================
-- TỐI ƯU KPI: chuyển tính toán (group by, count distinct) xuống Postgres
-- thay vì kéo hết rows về Node.js rồi group/dedup bằng JS như v1.
--
-- Quy ước tham số p_page_ids:
--   NULL      -> không lọc (super_admin, xem toàn bộ)
--   ARRAY[]   -> không match gì (tenant chưa được gán page_id nào)
--   ARRAY[..] -> lọc đúng danh sách page_id được phép xem
--
-- App luôn gọi các hàm này bằng service_role_key (bỏ qua RLS), nên không cần
-- GRANT/RLS riêng cho anon/authenticated ở đây.
-- ============================================================

-- Index hỗ trợ group theo (conversation_id, "ID Lọc") khi đếm đơn hàng thật.
create index if not exists idx_order_list_conv_idloc
  on order_list(conversation_id, "ID Lọc");


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
    select "State" as state, spam_mark
    from customer_data
    where p_page_ids is null or "Page id" = any(p_page_ids)
  ),
  state_agg as (
    select coalesce(state::text, 'unknown') as state_key, count(*) as cnt
    from filtered
    group by state_key
  )
  select
    (select count(*) from filtered) as total,
    (select count(*) from filtered where spam_mark is not null and spam_mark <> '') as spam_count,
    (select coalesce(jsonb_object_agg(state_key, cnt), '{}'::jsonb) from state_agg) as state_breakdown;
$$;


-- order_list: mỗi DÒNG là 1 sản phẩm, không phải 1 đơn. Đơn thật = nhóm theo
-- (conversation_id, "ID Lọc"). Dòng "ID Lọc" NULL không gộp an toàn được (nghi
-- webhook n8n retrigger) -> mỗi dòng NULL tính là 1 đơn riêng, đánh dấu cần xác minh.
create or replace function get_revenue_kpis(p_page_ids text[])
returns table (
  total_orders bigint,
  total_revenue bigint,
  orders_needing_verification bigint
)
language sql
stable
as $$
  with filtered as (
    select
      id,
      conversation_id,
      "ID Lọc" as id_loc,
      coalesce(
        nullif(regexp_replace(coalesce(billing, ''), '[^0-9]', '', 'g'), '')::bigint,
        0
      ) as revenue
    from order_list
    where p_page_ids is null or page_id = any(p_page_ids)
  ),
  distinct_orders as (
    select distinct
      case
        when id_loc is not null then conversation_id || '::' || id_loc
        else '__unverified_' || id::text
      end as order_key,
      id_loc
    from filtered
  )
  select
    (select count(*) from distinct_orders) as total_orders,
    (select coalesce(sum(revenue), 0) from filtered) as total_revenue,
    (select count(*) from distinct_orders where id_loc is null) as orders_needing_verification;
$$;


-- fb_chats: mỗi dòng là 1 TIN NHẮN, phải đếm session_id distinct chứ không phải count(*).
-- order_count dùng lại đúng logic gộp đơn ở get_revenue_kpis() để nhất quán 2 nơi.
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
