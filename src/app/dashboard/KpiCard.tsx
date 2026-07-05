import type { ReactNode } from 'react';

type KpiCardProps = {
  label: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
  gradient?: string;
  trend?: { value: string; positive: boolean };
};

export function KpiCard({ label, value, hint, icon, gradient, trend }: KpiCardProps) {
  return (
    <div className="kpi-card card-hover animate-fade-in">
      {/* Background gradient */}
      {gradient && (
        <div
          className="kpi-card-gradient rounded-2xl"
          style={{ background: gradient }}
        />
      )}

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-surface-500">{label}</p>
          <p className="truncate text-2xl font-bold text-surface-900 animate-count-up">{value}</p>
          {hint && <p className="mt-1 truncate text-xs text-surface-400">{hint}</p>}
          {trend && (
            <p className={`mt-1.5 text-xs font-medium ${trend.positive ? 'text-emerald-600' : 'text-rose-500'}`}>
              {trend.positive ? '▲' : '▼'} {trend.value}
            </p>
          )}
        </div>
        {icon && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-50 text-surface-400">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
