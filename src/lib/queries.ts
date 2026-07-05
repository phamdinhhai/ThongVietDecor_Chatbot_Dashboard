import { getSupabaseAdmin } from './supabase-admin';
import {
  normalizeBilling,
  findDuplicateCustomers,
  groupOrders,
  type CustomerRow,
  type OrderRow,
} from './data-quality';

type PageScope = string[] | 'all';

// Áp filter page_id lên 1 query. column mặc định là "page_id" (đúng với order_list,
// page_tokens). customer_data dùng tên cột khác ("Page id") nên truyền riêng.
function applyPageFilter(query: any, pageIds: PageScope, column = 'page_id') {
  if (pageIds === 'all') return query;
  if (pageIds.length === 0) return query.eq(column, '__none__'); // tenant chưa gán page nào -> rỗng
  return query.in(column, pageIds);
}

// ---------- KHÁCH HÀNG ----------
// Dữ liệu thật: nhóm theo (Customer id, Page id) có 100/412 dòng trùng lặp hoàn toàn.
// "Tổng khách hàng" phải tính theo số nhóm unique, không phải số dòng thô.
export async function getCustomerKpis(pageIds: PageScope) {
  const admin = getSupabaseAdmin();
  let q = admin
    .from('customer_data')
    .select('id, State, spam_mark, "Customer id", "Page id"');
  q = applyPageFilter(q, pageIds, 'Page id');

  const { data, error } = await q;
  if (error) throw error;

  const rows = (data ?? []) as CustomerRow[];
  const { uniqueCount, duplicateGroups } = findDuplicateCustomers(rows);

  // spam_mark là 1 CON SỐ ĐẾM (quan sát thấy giá trị 1-27), không phải cờ boolean —
  // chưa có ngưỡng nghiệp vụ nào xác định "bao nhiêu thì tính là spam", nên KHÔNG suy ra
  // tỷ lệ % spam ở đây để tránh gây hiểu lầm. Chỉ hiển thị số liệu thô + trung bình,
  // bạn cung cấp ngưỡng cụ thể (nếu có) để bổ sung "tỷ lệ spam" chính xác sau.
  const spamValues = rows.map((r) => r.spam_mark).filter((v) => v != null) as number[];
  const avgSpamMark = spamValues.length
    ? spamValues.reduce((a, b) => a + b, 0) / spamValues.length
    : 0;

  const stateBreakdown = groupBy(rows, 'State');

  return {
    totalRows: rows.length,
    uniqueCount,
    duplicateRowCount: rows.length - uniqueCount,
    duplicateGroupCount: duplicateGroups.length,
    avgSpamMark,
    stateBreakdown,
  };
}

// ---------- ĐƠN HÀNG / DOANH THU ----------
// Một đơn hàng thật có thể chiếm NHIỀU dòng (nhiều sản phẩm), nhận biết qua cùng
// conversation_id + cùng "ID Lọc". Dòng thiếu "ID Lọc" không gộp an toàn -> tính riêng,
// đánh dấu "cần xác minh". Xem lib/data-quality.ts để biết cơ sở của rule này.
async function getOrderRows(pageIds: PageScope): Promise<OrderRow[]> {
  const admin = getSupabaseAdmin();
  let q = admin
    .from('order_list')
    .select('id, billing, conversation_id, "ID Lọc", phone, page_id');
  q = applyPageFilter(q, pageIds);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as OrderRow[];
}

export async function getRevenueKpis(pageIds: PageScope) {
  const rows = await getOrderRows(pageIds);
  const totalRevenue = rows.reduce((sum, r) => sum + normalizeBilling(r.billing), 0);
  const { confirmedOrderCount, unverifiedRows, totalOrders } = groupOrders(rows);

  return {
    totalRevenue,
    totalOrders,
    confirmedOrders: confirmedOrderCount,
    unverifiedRowCount: unverifiedRows.length,
  };
}

// ---------- DATA QUALITY REPORT ----------
// Dùng cho phần "Chất lượng dữ liệu" trên dashboard — tổng hợp trùng lặp + lỗi định dạng.
export async function getDataQualityReport(pageIds: PageScope) {
  const admin = getSupabaseAdmin();

  let custQ = admin
    .from('customer_data')
    .select('id, "Customer id", "Page id"');
  custQ = applyPageFilter(custQ, pageIds, 'Page id');
  const { data: custData, error: custErr } = await custQ;
  if (custErr) throw custErr;

  const orderRows = await getOrderRows(pageIds);
  const customerRows = (custData ?? []) as CustomerRow[];

  const { duplicateGroups, duplicateRowCount, uniqueCount } = findDuplicateCustomers(customerRows);
  const { unverifiedRows } = groupOrders(orderRows);

  const phoneIssues = orderRows.filter((r) => !isValidPhoneQuick(r.phone ?? null));
  const billingIssues = orderRows.filter((r) => normalizeBilling(r.billing) === 0);

  return {
    customer: {
      totalRows: customerRows.length,
      uniqueCount,
      duplicateRowCount,
      duplicateGroupCount: duplicateGroups.length,
      sampleDuplicates: duplicateGroups.slice(0, 5), // vài ví dụ để kiểm tra nhanh
    },
    order: {
      totalRows: orderRows.length,
      unverifiedRowCount: unverifiedRows.length,
      phoneFormatIssueCount: phoneIssues.length,
      billingFormatIssueCount: billingIssues.length,
    },
  };
}

function isValidPhoneQuick(raw: string | null): boolean {
  if (!raw) return false;
  return /^0\d{9}$/.test(raw.replace(/[^\d]/g, ''));
}

// ---------- PAGE DIRECTORY ----------
// page_tokens chứa access token Facebook THẬT (bí mật) — tuyệt đối không select cột `token`
// ở bất kỳ đâu trong app. Chỉ dùng page_id/name để hiển thị tên trang cho admin.
export async function getPageDirectory() {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from('page_tokens').select('page_id, platform, name');
  if (error) throw error;
  return data ?? [];
}

function groupBy<T extends Record<string, any>>(rows: T[], key: keyof T) {
  return rows.reduce((acc, row) => {
    const k = String(row[key] ?? 'unknown');
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}
