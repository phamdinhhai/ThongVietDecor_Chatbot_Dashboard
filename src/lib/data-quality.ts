// Các hàm chuẩn hóa & kiểm tra chất lượng dữ liệu — dùng chung cho KPI queries
// và trang Data Quality. Mọi rule ở đây được rút ra từ dữ liệu mẫu THẬT (không phải
// giả định lý thuyết) — xem README mục "Cơ sở của các rule chuẩn hóa" để đối chiếu.

// ---------- BILLING ----------
// Dữ liệu thật có 2 format lẫn nhau: "1.407.000đ" và "589000" (số thuần).
// Chuẩn hóa: bỏ mọi ký tự không phải số.
export function normalizeBilling(raw: string | null): number {
  if (!raw) return 0;
  const digitsOnly = raw.replace(/[^\d]/g, '');
  return digitsOnly ? parseInt(digitsOnly, 10) : 0;
}

export function isBillingFormatSuspicious(raw: string | null): boolean {
  if (!raw) return true;
  // Sau khi bỏ ký tự định dạng phổ biến (., đ, khoảng trắng), phần còn lại phải toàn số.
  const cleaned = raw.replace(/[.\s]|đ/gi, '');
  return !/^\d+$/.test(cleaned) || normalizeBilling(raw) === 0;
}

// ---------- PHONE ----------
// Dữ liệu thật: 21/22 dòng đúng "0" + 9 số. 1 dòng lỗi dạng "0947.553.005" (có dấu chấm).
export function normalizePhone(raw: string | null): string | null {
  if (!raw) return null;
  return raw.replace(/[^\d]/g, '');
}

export function isPhoneValid(raw: string | null): boolean {
  const normalized = normalizePhone(raw);
  return !!normalized && /^0\d{9}$/.test(normalized);
}

// ---------- KHÁCH HÀNG TRÙNG LẶP ----------
// Dữ liệu thật: nhóm theo (Customer id, Page id) → 100/412 dòng là trùng lặp HOÀN TOÀN
// (mọi cột giống hệt, chỉ khác id tăng dần) — 47 nhóm bị trùng, phần lớn do n8n
// webhook ghi lại nhiều lần cho cùng 1 khách.
export type CustomerRow = {
  id: number;
  'Customer id': number | string;
  'Page id': number | string;
  [key: string]: any;
};

export type DuplicateGroup = {
  customerId: string;
  pageId: string;
  rowIds: number[];
  keptRowId: number; // dòng được giữ lại làm bản ghi chính thức (id nhỏ nhất = dòng gốc)
};

export function findDuplicateCustomers(rows: CustomerRow[]): {
  uniqueCount: number;
  duplicateGroups: DuplicateGroup[];
  duplicateRowCount: number;
} {
  const groups = new Map<string, number[]>();

  for (const r of rows) {
    const key = `${r['Customer id']}|${r['Page id']}`;
    const arr = groups.get(key) ?? [];
    arr.push(r.id);
    groups.set(key, arr);
  }

  const duplicateGroups: DuplicateGroup[] = [];
  let duplicateRowCount = 0;

  for (const [key, rowIds] of groups) {
    if (rowIds.length > 1) {
      const [customerId, pageId] = key.split('|');
      duplicateGroups.push({
        customerId,
        pageId,
        rowIds: rowIds.sort((a, b) => a - b),
        keptRowId: Math.min(...rowIds),
      });
      duplicateRowCount += rowIds.length - 1;
    }
  }

  return { uniqueCount: groups.size, duplicateGroups, duplicateRowCount };
}

// ---------- ĐƠN HÀNG: NHÓM THEO conversation_id + "ID Lọc" ----------
// Dữ liệu thật: 1 đơn có thể có NHIỀU dòng (nhiều sản phẩm) cùng conversation_id + ID Lọc.
// Dòng thiếu "ID Lọc" (NULL) không gộp được an toàn — tương quan với dữ liệu bị trùng
// do webhook retrigger — tính riêng và đánh dấu "cần xác minh".
export type OrderRow = {
  id: number;
  conversation_id: string;
  'ID Lọc': string | null;
  billing: string | null;
  phone?: string | null;
  [key: string]: any;
};

export function groupOrders(rows: OrderRow[]) {
  const confirmedGroups = new Map<string, number[]>();
  const unverifiedRows: OrderRow[] = [];

  for (const r of rows) {
    const idLoc = r['ID Lọc'];
    if (idLoc) {
      const key = `${r.conversation_id}|${idLoc}`;
      const arr = confirmedGroups.get(key) ?? [];
      arr.push(r.id);
      confirmedGroups.set(key, arr);
    } else {
      unverifiedRows.push(r);
    }
  }

  return {
    confirmedOrderCount: confirmedGroups.size,
    unverifiedRows,
    totalOrders: confirmedGroups.size + unverifiedRows.length,
  };
}

// ---------- TỔNG HỢP DATA QUALITY REPORT (dùng cho trang Data Quality) ----------
export function buildDataQualityReport(customerRows: CustomerRow[], orderRows: OrderRow[]) {
  const customerDup = findDuplicateCustomers(customerRows);
  const orderGroups = groupOrders(orderRows);

  const phoneIssues = orderRows.filter((r) => !isPhoneValid(r.phone ?? null));
  const billingIssues = orderRows.filter((r) => isBillingFormatSuspicious(r.billing));

  return {
    customer: {
      totalRows: customerRows.length,
      uniqueCount: customerDup.uniqueCount,
      duplicateRowCount: customerDup.duplicateRowCount,
      duplicateGroupCount: customerDup.duplicateGroups.length,
    },
    order: {
      totalRows: orderRows.length,
      confirmedOrders: orderGroups.confirmedOrderCount,
      unverifiedRowCount: orderGroups.unverifiedRows.length,
      totalOrders: orderGroups.totalOrders,
      phoneFormatIssueCount: phoneIssues.length,
      billingFormatIssueCount: billingIssues.length,
    },
  };
}
