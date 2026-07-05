-- ============================================================
-- Sửa get_revenue_kpis(): xử lý 2 case mới phát hiện từ dữ liệu thật
-- (bảng order_list, dòng 6-9 trong ảnh người dùng gửi):
--
-- 1) ĐƠN CỘNG DỒN: khách chốt đơn 1 món, sau đó thêm món thứ 2 -> hệ thống ghi
--    dòng MỚI với "order" liệt kê LẠI toàn bộ (món cũ + món mới) thay vì update
--    dòng cũ. Nếu dòng cũ và dòng mới có "ID Lọc" khác nhau (không nằm cùng nhóm
--    ở logic hiện tại) -> bị đếm thành 2 đơn, cộng cả 2 khoản tiền -> sai.
--    Fix: trong CÙNG conversation_id, nếu tập mã sản phẩm (tách từ "order" theo
--    dấu phẩy) của nhóm B chứa TOÀN BỘ mã của nhóm A (và B có nhiều mã hơn, B có
--    id lớn hơn -> xảy ra sau) thì A bị coi là bản cũ, loại khỏi tổng đơn/doanh
--    thu, chỉ tính B.
--
-- 2) DÒNG TRÙNG Y HỆT trong cùng 1 nhóm đơn (cùng conversation_id + "ID Lọc",
--    cùng "order" + billing sau khi chuẩn hoá khoảng trắng/hoa-thường) — nghi do
--    webhook n8n gửi lại (retrigger). Trước đây sum(revenue) theo nhóm sẽ cộng
--    trùng các dòng này. Fix: dedup theo key trên trước khi group, giữ dòng id
--    nhỏ nhất.
--
-- LƯU Ý (đã cân nhắc để không gây regression): điều kiện "chứa toàn bộ mã sản
-- phẩm" + "cùng conversation_id" + "id lớn hơn" chỉ khớp khi có bằng chứng cộng
-- dồn thật; 2 đơn có nội dung sản phẩm hoàn toàn khác nhau (kể cả cùng khách,
-- cùng hội thoại) sẽ KHÔNG bị gộp nhầm.
-- ============================================================

-- Postgres không cho CREATE OR REPLACE khi đổi kiểu trả về (thêm cột output mới)
-- -> phải DROP trước. CASCADE vì get_conversion_rate() gọi lại hàm này.
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
      id,
      conversation_id,
      "ID Lọc" as id_loc,
      "order" as order_text,
      billing,
      coalesce(
        nullif(regexp_replace(coalesce(billing, ''), '[^0-9]', '', 'g'), '')::bigint,
        0
      ) as revenue
    from order_list
    where p_page_ids is null or page_id = any(p_page_ids)
  ),
  -- (2) Loại dòng trùng y hệt trong cùng 1 nhóm đơn, giữ id nhỏ nhất.
  dedup_key as (
    select
      f.*,
      row_number() over (
        partition by
          conversation_id, id_loc,
          lower(regexp_replace(coalesce(order_text, ''), '\s+', ' ', 'g')),
          lower(regexp_replace(coalesce(billing, ''), '\s+', ' ', 'g'))
        order by id
      ) as dup_rank
    from filtered f
  ),
  deduped as (
    select * from dedup_key where dup_rank = 1
  ),
  -- Tính revenue theo nhóm RIÊNG, không join với unnest() bên dưới — join với unnest sẽ
  -- "nổ hàng" theo số token (1 dòng order có 2 mã sản phẩm -> 2 dòng sau join), nếu sum(revenue)
  -- chung với join đó sẽ bị NHÂN ĐÔI theo số token. Đây là bug thực tế phát hiện khi test cục bộ
  -- (958.000 bị tính thành 1.916.000 cho đơn có 2 mã sản phẩm).
  group_revenue as (
    select
      case
        when id_loc is not null then conversation_id || '::' || id_loc
        else '__unverified_' || id::text
      end as order_key,
      conversation_id,
      id_loc,
      max(id) as max_id,
      sum(revenue) as group_revenue
    from deduped
    group by order_key, conversation_id, id_loc
  ),
  group_tokens as (
    select
      case
        when id_loc is not null then conversation_id || '::' || id_loc
        else '__unverified_' || id::text
      end as order_key,
      array_agg(distinct nullif(lower(trim(both ' ' from tok)), '')) filter (
        where nullif(lower(trim(both ' ' from tok)), '') is not null
      ) as order_tokens
    from deduped
    left join lateral unnest(string_to_array(coalesce(order_text, ''), ',')) as tok on true
    group by order_key
  ),
  groups as (
    select gr.*, gt.order_tokens
    from group_revenue gr
    join group_tokens gt using (order_key)
  ),
  -- (1) Nhóm A bị "chứa" trong nhóm B cùng hội thoại -> A là bản cũ, loại A.
  superseded as (
    select distinct a.order_key
    from groups a
    join groups b
      on a.conversation_id = b.conversation_id
     and a.order_key <> b.order_key
     and a.order_tokens is not null and b.order_tokens is not null
     and b.order_tokens @> a.order_tokens
     and cardinality(b.order_tokens) > cardinality(a.order_tokens)
     and b.max_id > a.max_id
  ),
  final_groups as (
    select * from groups where order_key not in (select order_key from superseded)
  )
  select
    (select count(*) from final_groups) as total_orders,
    (select coalesce(sum(group_revenue), 0) from final_groups) as total_revenue,
    (select count(*) from final_groups where id_loc is null) as orders_needing_verification,
    (select count(*) from superseded) as orders_collapsed_as_revision,
    (select count(*) from dedup_key where dup_rank > 1) as duplicate_rows_removed;
$$;

-- Re-declare để chắc chắn get_conversion_rate() vẫn trỏ đúng bản get_revenue_kpis() mới
-- (Postgres không tự track dependency giữa 2 hàm LANGUAGE SQL qua lời gọi trong body).
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
