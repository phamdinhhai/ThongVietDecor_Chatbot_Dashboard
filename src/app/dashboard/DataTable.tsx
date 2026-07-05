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
    <div className="card overflow-hidden animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-200 bg-white p-4">
        <div className="relative w-full max-w-md">
          <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            id={`search-${endpoint.replace(/[^a-z0-9]/gi, '-')}`}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-xl border border-surface-200 bg-surface-50 py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-brand-400 focus:bg-white focus:ring-4 focus:ring-brand-100"
          />
        </div>
        <span className="text-xs text-surface-400">
          {errorMsg
            ? errorMsg
            : total > 0
              ? `${from}-${to} / ${total.toLocaleString('vi-VN')}`
              : loading
                ? 'Đang tải...'
                : '0 kết quả'}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="sticky top-0 z-10 bg-surface-50">
            <tr className="border-b border-surface-200">
              {columns.map((c) => (
                <th key={c.key} className="data-table-th">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            {loading && rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-surface-400">
                  Đang tải dữ liệu...
                </td>
              </tr>
            )}
            {rows.length === 0 && !loading && !errorMsg && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-surface-400">
                  Không có dữ liệu.
                </td>
              </tr>
            )}
            {rows.map((row, i) => (
              <tr key={i} className="transition-colors hover:bg-brand-50/40">
                {columns.map((c) => (
                  <td key={c.key} className="data-table-td" title={String(row[c.key] ?? '')}>
                    {c.render ? c.render(row) : (row[c.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-surface-200 bg-surface-50 px-4 py-3">
        <span className="text-xs text-surface-400">Trang {page + 1}</span>
        <div className="flex gap-2">
          <button
            id={`prev-${endpoint.replace(/[^a-z0-9]/gi, '-')}`}
            disabled={page === 0 || loading}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="rounded-lg border border-surface-200 bg-white px-3 py-1.5 text-xs font-medium text-surface-600 transition-colors hover:border-brand-300 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Trước
          </button>
          <button
            id={`next-${endpoint.replace(/[^a-z0-9]/gi, '-')}`}
            disabled={to >= total || loading}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-surface-200 bg-white px-3 py-1.5 text-xs font-medium text-surface-600 transition-colors hover:border-brand-300 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Sau
          </button>
        </div>
      </div>
    </div>
  );
}
