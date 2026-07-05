-- ============================================================
-- CONTROL PLANE: quản lý đơn vị kinh doanh (tenant) + phân quyền
-- Chạy trong CÙNG 1 Supabase project với dữ liệu chatbot hiện có.
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists dashboard_tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Một page_id chỉ gắn với đúng 1 tenant. Admin (bạn) khai báo pageID cho tenant
-- TRƯỚC KHI cấp tài khoản dashboard cho đơn vị đó dùng.
create table if not exists dashboard_tenant_pages (
  tenant_id uuid not null references dashboard_tenants(id) on delete cascade,
  page_id text not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, page_id)
);
create unique index if not exists dashboard_tenant_pages_page_id_uniq
  on dashboard_tenant_pages(page_id);

-- Gắn với auth.users của Supabase Auth (dùng chung 1 project).
create table if not exists dashboard_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null check (role in ('super_admin','tenant_admin','tenant_viewer')),
  tenant_id uuid references dashboard_tenants(id),
  created_at timestamptz not null default now()
);

alter table dashboard_tenants enable row level security;
alter table dashboard_tenant_pages enable row level security;
alter table dashboard_users enable row level security;
-- Không tạo policy nào ở đây (deny-all) vì app luôn dùng service_role_key ở server,
-- bỏ qua RLS. Bảng control-plane không bao giờ được đọc trực tiếp từ browser bằng anon key.


-- ============================================================
-- CỘT page_id TÍNH SẴN cho các bảng chỉ có session_id / conversation_id
-- dạng "{end_user_id}_{page_id}". page_id = phần SAU dấu "_" cuối cùng.
--
-- ⚠️ XÁC NHẬN TRƯỚC KHI CHẠY TRÊN PRODUCTION:
--   - Kiểm tra vài dòng thật để chắc mỗi giá trị có ít nhất 1 dấu "_"
--   - Kiểm tra order_list.conversation_id có cùng format với fb_chats.session_id
--     (giả định hiện tại: có, vì trước đây đã join 2 cột này để dedup đơn hàng)
-- ============================================================

alter table fb_chats add column if not exists page_id text
  generated always as (
    split_part(session_id, '_', array_length(string_to_array(session_id, '_'), 1))
  ) stored;
create index if not exists idx_fb_chats_page_id on fb_chats(page_id);

alter table image_store add column if not exists page_id text
  generated always as (
    split_part("sessionID", '_', array_length(string_to_array("sessionID", '_'), 1))
  ) stored;
create index if not exists idx_image_store_page_id on image_store(page_id);

alter table workflow_query add column if not exists page_id text
  generated always as (
    split_part(session_id, '_', array_length(string_to_array(session_id, '_'), 1))
  ) stored;
create index if not exists idx_workflow_query_page_id on workflow_query(page_id);

alter table order_list add column if not exists page_id text
  generated always as (
    split_part(conversation_id, '_', array_length(string_to_array(conversation_id, '_'), 1))
  ) stored;
create index if not exists idx_order_list_page_id on order_list(page_id);

-- customer_data đã có cột "Page id" sẵn, chỉ cần index.
create index if not exists idx_customer_data_page_id on customer_data("Page id");


-- ============================================================
-- Ví dụ khai báo tenant (xoá / sửa theo thực tế của bạn)
-- ============================================================
-- insert into dashboard_tenants (name, slug) values ('Hộp Carton HT', 'hop-carton-ht');
-- insert into dashboard_tenant_pages (tenant_id, page_id)
--   select id, 'PAGE_ID_THUC_TE' from dashboard_tenants where slug = 'hop-carton-ht';
