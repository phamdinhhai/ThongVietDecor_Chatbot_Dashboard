# Chatbot Dashboard — v1

Dashboard đa khách hàng cho dữ liệu chatbot trên Supabase. Mỗi đơn vị kinh doanh (tenant)
được gán 1 hoặc nhiều `page_id`; admin (Losa247) khai báo mapping này trước khi cấp tài khoản.

## Kiến trúc

- 1 Supabase project duy nhất (đúng như hiện tại bạn đang dùng), không tách project riêng theo tenant.
- Phân quyền theo `page_id`: mỗi dòng dữ liệu đã có sẵn hoặc được tính sẵn cột `page_id`
  (xem `supabase/migrations/001_dashboard_control_plane.sql`).
- `dashboard_users.role`: `super_admin` (xem tất cả) | `tenant_admin` / `tenant_viewer` (chỉ xem
  page_id thuộc tenant của mình).
- Next.js App Router, deploy Vercel. Server dùng `service_role_key`, không bao giờ lộ ra browser.
- Auto-refresh 60s ở client (`DashboardClient.tsx`) + cache ISR 60s ở server. Đổi `REFRESH_MS`
  trong `src/app/dashboard/DashboardClient.tsx` nếu muốn nhanh/chậm hơn (bạn chọn khoảng 30s-5p).
- **KPI tính bằng Postgres RPC function, không kéo hết bảng về Node.js rồi group bằng JS.**
  `src/lib/queries.ts` chỉ gọi `supabase.rpc(...)`; toàn bộ `GROUP BY`/`COUNT(DISTINCT ...)` chạy
  trong Postgres (`supabase/migrations/002_kpi_rpc_functions.sql`). Đã test bằng Postgres local với
  dữ liệu mẫu mô phỏng đúng ca thật (đơn nhiều sản phẩm + dòng `ID Lọc` NULL) — kết quả khớp tay.
  Lý do đổi: cách cũ (fetch toàn bộ `order_list`/`fb_chats` mỗi 60s rồi tính trong JS) sẽ chậm dần
  và tốn băng thông khi 2 bảng này lớn lên; đẩy xuống DB thì mỗi lần refresh chỉ trả về vài con số.
- **3 tab trên dashboard** (`DashboardTabs.tsx`): Tổng quan (KPI, như trên) | Khách hàng | Đơn hàng.
  2 tab sau là bảng dữ liệu thô có tìm kiếm (debounce 300ms) + phân trang 25 dòng/trang, gọi
  `/api/table/customers` và `/api/table/orders` (lọc theo `page_id` giống hệt logic KPI).
  Cột hiển thị đã lược bớt các cột nội bộ không cần cho người dùng cuối (id, `Customer id`,
  `event_mark`, `spam_check`, `spam_mark_root`, `thread_id`, `n_spam_time` bên `customer_data`;
  `id` nội bộ bên `order_list`). Cột `Page` chỉ hiện với `super_admin`. Muốn đổi cột hiển thị, sửa
  `CUSTOMER_BASE_COLUMNS`/`ORDER_BASE_COLUMNS` trong `DashboardTabs.tsx`.

## Setup

```bash
npm install
cp .env.example .env.local   # điền URL + key thật từ Supabase
```

Chạy migration control-plane trong Supabase SQL Editor (theo đúng thứ tự):
```
supabase/migrations/001_dashboard_control_plane.sql
supabase/migrations/002_kpi_rpc_functions.sql
supabase/migrations/003_fix_cumulative_and_duplicate_orders.sql
```

Tạo tenant + gán page_id (ví dụ, chạy trong SQL Editor hoặc Table Editor):
```sql
insert into dashboard_tenants (name, slug) values ('Hộp Carton HT', 'hop-carton-ht');
insert into dashboard_tenant_pages (tenant_id, page_id)
  select id, 'PAGE_ID_THUC_TE_CUA_HOP_CARTON_HT' from dashboard_tenants where slug = 'hop-carton-ht';
```

Tạo user đăng nhập: vào Supabase Dashboard > Authentication > Users > Add user, sau đó insert
vào `dashboard_users`:
```sql
insert into dashboard_users (id, email, role, tenant_id)
values ('<uuid từ auth.users>', 'owner@hopcartonht.vn', 'tenant_admin',
        (select id from dashboard_tenants where slug = 'hop-carton-ht'));
```

Chạy local:
```bash
npm run dev
```

## Deploy lên Vercel

1. Push repo này lên GitHub.
2. Import vào Vercel, thêm 4 biến môi trường trong `.env.example` vào Vercel Project Settings > Environment Variables.
3. Deploy — Next.js App Router chạy trực tiếp trên Vercel không cần cấu hình thêm.

## ✅ Đã xác nhận từ dữ liệu thật

1. **Format `billing`** — có 2 dạng lẫn nhau (`"1.407.000đ"` và `"589000"`). Logic tách số (giờ
   nằm trong SQL function, `regexp_replace(billing, '[^0-9]', '', 'g')`) xử lý đúng cả hai.
2. **`order_list.conversation_id`** đúng format `{end_user_id}_{page_id}`, khớp `fb_chats.session_id`.
   Tách `page_id` theo dấu `_` cuối trong migration là đúng.
3. **Đếm đơn hàng** — `order_list` mỗi DÒNG là 1 sản phẩm, không phải 1 đơn. `get_revenue_kpis()`
   gộp nhóm theo `(conversation_id, "ID Lọc")` để ra đúng số đơn thật.
4. **Đơn bị cộng dồn khi khách thêm món (migration 003)** — phát hiện từ dữ liệu thật: khách chốt
   1 món, sau đó thêm món thứ 2, hệ thống ghi dòng MỚI liệt kê lại toàn bộ (`"ID Lọc"` khác dòng cũ)
   thay vì update dòng cũ → trước đây bị đếm thành 2 đơn, cộng cả 2 khoản tiền. Giờ: nếu cùng
   `conversation_id`, và mã sản phẩm (tách từ cột `"order"`) của nhóm sau **chứa toàn bộ** mã của
   nhóm trước (+ nhiều hơn, + id lớn hơn) → nhóm trước bị coi là bản cũ, chỉ tính nhóm sau. Số nhóm
   bị gộp kiểu này hiện ở KPI card "Tổng đơn hàng" ("N đã gộp do sửa đơn").
5. **Dòng trùng y hệt trong cùng 1 đơn (migration 003)** — cùng `conversation_id` + `"ID Lọc"` +
   `"order"` + `billing` (nghi webhook n8n gửi lại) → chỉ tính 1 lần, không cộng trùng doanh thu.
   Số dòng bị loại hiện ở KPI card ("N dòng trùng đã loại").
6. **Đã test bằng Postgres local** với dữ liệu mô phỏng đúng các case trên (đơn nhiều sản phẩm,
   đơn cộng dồn, dòng trùng y hệt, đơn không liên quan) — kết quả khớp tay chính xác từng trường hợp.

## ⚠️ Cần bạn xác nhận trước khi lên production

1. **Dòng có `"ID Lọc"` = NULL** — không gộp an toàn được vào nhóm đơn, mỗi dòng NULL hiện được
   tính là 1 "đơn cần xác minh" riêng. Cần bạn xác nhận: có nên gộp các dòng NULL cùng
   `conversation_id` thành 1 đơn hay giữ tách riêng như hiện tại?
2. **Logic "đơn cộng dồn" ở mục 4 trên** dựa trên bằng chứng quan sát được (1 case thật trong dữ
   liệu bạn gửi) — chưa chạy qua toàn bộ lịch sử `order_list` để đếm xem case này xảy ra bao nhiêu
   lần và có case ngoại lệ nào không (vd 2 đơn thật trùng ngẫu nhiên 1 vài mã sản phẩm). Nên chạy
   thử trên Supabase thật rồi đối chiếu số "đã gộp do sửa đơn" với thực tế trước khi tin tưởng
   hoàn toàn con số doanh thu.
3. **Bảng dữ liệu thô (tab Khách hàng/Đơn hàng, `/api/table/*`) dùng filter/search qua PostgREST
   trên cột `"Page id"` (có khoảng trắng) — phần này CHƯA test được trên Supabase thật** (sandbox
   không có mạng tới supabase.co để dựng PostgREST thật, chỉ test được các SQL function ở trên qua
   Postgres thuần). Cú pháp dùng đúng theo tài liệu PostgREST, nhưng bạn nên bấm thử tab "Khách
   hàng" sau khi deploy — nếu lỗi 500, gửi tôi nội dung lỗi (thấy trong Network tab của trình duyệt
   hoặc Vercel Function Logs), tôi sửa ngay.

## Việc chưa làm (phase 2, cố tình chưa làm ở v1)

- Bộ lọc theo khoảng ngày (hiện tại KPI tính trên toàn bộ lịch sử).
- Trang admin để tự khai báo tenant/page_id qua UI (hiện làm bằng SQL trực tiếp).
- Xuất PDF, chỉ mới có xuất CSV (cho `order_list`, xuất nguyên bảng chưa gộp đơn — dùng để đối
  chiếu/audit, không dùng số dòng CSV làm số đơn).
- Dashboard riêng cho `image_store`/`images` (visual search) — chưa nằm trong nhóm ưu tiên
  khách hàng/kinh doanh/doanh thu.
- Sắp xếp cột / lọc nâng cao trong bảng Khách hàng, Đơn hàng — hiện chỉ có tìm kiếm text +
  phân trang, sắp theo id giảm dần (mới nhất trước).
