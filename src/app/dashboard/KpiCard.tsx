import type { ReactNode } from 'react';

type KpiCardProps = {
  label: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
  gradient?: string;
  trend?: { value: string; positive: boolean };
  valueClassName?: string;
};

export function KpiCard({ label, value, hint, icon, gradient, trend, valueClassName }: KpiCardProps) {
  return (
    <div className="kpi-card card-hover animate-fade-in min-h-[132px]">
      {gradient && (
        <div
          className="kpi-card-gradient rounded-2xl"
          style={{ background: gradient }}
        />
      )}

      <div className="relative flex h-full items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-surface-500">{label}</p>
          <p
            className={`animate-count-up leading-tight text-surface-900 ${
              valueClassName ?? 'truncate text-2xl font-bold'
            }`}
            title={value}
          >
            {value}
          </p>
          {hint && <p className="mt-1.5 line-clamp-2 text-xs leading-snug text-surface-400">{hint}</p>}
          {trend && (
            <p className={`mt-1.5 text-xs font-medium ${trend.positive ? 'text-emerald-600' : 'text-rose-500'}`}>
              {trend.positive ? '▲' : '▼'} {trend.value}
            </p>
          )}
        </div>
        {icon && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-50 text-surface-500 ring-1 ring-surface-100">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
