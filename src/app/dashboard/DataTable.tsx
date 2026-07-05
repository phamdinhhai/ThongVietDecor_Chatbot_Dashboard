'use client';

import { useCallback, useEffect, useState } from 'react';

export type ColumnDef<T> = {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
};

const PAGE_SIZE = 25;

export function DataTable<T extends Record<string, any>>({
  endpoint,
  columns,
  searchPlaceholder,
}: {
  endpoint: string;
  columns: ColumnDef<T>[];
  searchPlaceholder: string;
}) {
  const [rows, setRows] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const load = useCallback(
    async (p: number, q: string) => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE), q });
        const res = await fetch(`${endpoint}?${params.toString()}`, { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok) {
          setErrorMsg(json.error ?? 'Không tải được dữ liệu.');
          setRows([]);
          setTotal(0);
          return;
        }
        setRows(json.rows ?? []);
        setTotal(json.total ?? 0);
      } catch {
        setErrorMsg('Không tải được dữ liệu.');
      } finally {
        setLoading(false);
      }
    },
    [endpoint]
  );

  // Debounce tìm kiếm 300ms, và reset về trang 1 mỗi khi từ khoá đổi.
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(0);
      load(0, search);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    load(page, search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const from = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min(total, (page + 1) * PAGE_SIZE);

  return (
    <div className="rounded-lg border border-neutral-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 p-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full max-w-xs rounded-md border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-neutral-500 sm:w-72"
        />
        <span className="text-xs text-neutral-400">
          {errorMsg
            ? errorMsg
            : total > 0
              ? `${from}-${to} trên ${total.toLocaleString('vi-VN')}`
              : loading
                ? 'Đang tải...'
                : '0 kết quả'}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-xs text-neutral-500">
              {columns.map((c) => (
                <th key={c.key} className="whitespace-nowrap px-4 py-2 font-medium">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && !errorMsg && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-neutral-400">
                  Không có dữ liệu.
                </td>
              </tr>
            )}
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
                {columns.map((c) => (
                  <td key={c.key} className="max-w-xs truncate px-4 py-2 text-neutral-700" title={String(row[c.key] ?? '')}>
                    {c.render ? c.render(row) : (row[c.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-neutral-200 p-3">
        <button
          disabled={page === 0 || loading}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          className="rounded-md border border-neutral-300 px-3 py-1 text-xs disabled:opacity-40"
        >
          Trước
        </button>
        <button
          disabled={to >= total || loading}
          onClick={() => setPage((p) => p + 1)}
          className="rounded-md border border-neutral-300 px-3 py-1 text-xs disabled:opacity-40"
        >
          Sau
        </button>
      </div>
    </div>
  );
}
