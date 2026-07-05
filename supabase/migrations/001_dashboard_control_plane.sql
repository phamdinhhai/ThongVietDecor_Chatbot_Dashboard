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
-- INDEX cho 3 bảng trọng tâm — cả 3 đã CÓ SẴN cột page_id/"Page id" thật
-- (đã xác nhận qua dữ liệu mẫu thật), không cần tách/tính lại từ chuỗi.
-- ============================================================

create index if not exists idx_customer_data_page_id on customer_data("Page id");
create index if not exists idx_order_list_page_id on order_list(page_id);
create index if not exists idx_page_tokens_page_id on page_tokens(page_id);

-- Dùng cho dedup khách hàng (xem lib/data-quality.ts): 1 khách = 1 cặp (Customer id, Page id).
create index if not exists idx_customer_data_dedupe_key on customer_data("Customer id", "Page id");


-- ============================================================
-- PHẦN TÙY CHỌN (chưa có dữ liệu mẫu thật để xác nhận) — chỉ chạy nếu bạn
-- xác nhận fb_chats / image_store / workflow_query CHƯA có cột page_id sẵn
-- và giá trị session_id/sessionID có dạng "{end_user_id}_{page_id}".
-- Hiện KHÔNG dùng trong queries.ts vì ngoài phạm vi ưu tiên (customer/order/page_tokens).
-- ============================================================

-- alter table fb_chats add column if not exists page_id text
--   generated always as (
--     split_part(session_id, '_', array_length(string_to_array(session_id, '_'), 1))
--   ) stored;
-- create index if not exists idx_fb_chats_page_id on fb_chats(page_id);


-- ============================================================
-- Ví dụ khai báo tenant (xoá / sửa theo thực tế của bạn)
-- ============================================================
-- insert into dashboard_tenants (name, slug) values ('Hộp Carton HT', 'hop-carton-ht');
-- insert into dashboard_tenant_pages (tenant_id, page_id)
--   select id, 'PAGE_ID_THUC_TE' from dashboard_tenants where slug = 'hop-carton-ht';
