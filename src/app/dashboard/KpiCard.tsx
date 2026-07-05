import type { ReactNode } from 'react';

type KpiCardProps = {
  label: string;
  value: string;
  hint?: string;
  icon: ReactNode;
  tone?: 'brand' | 'emerald' | 'amber' | 'violet' | 'sky' | 'rose';
};

const toneClasses = {
  brand: 'bg-brand-50 text-brand-700 ring-brand-100',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  amber: 'bg-amber-50 text-amber-700 ring-amber-100',
  violet: 'bg-violet-50 text-violet-700 ring-violet-100',
  sky: 'bg-sky-50 text-sky-700 ring-sky-100',
  rose: 'bg-rose-50 text-rose-700 ring-rose-100',
};

export function KpiCard({ label, value, hint, icon, tone = 'brand' }: KpiCardProps) {
  return (
    <article className="card card-hover min-h-[148px] p-5 animate-fade-in">
      <div className="flex h-full flex-col justify-between gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-surface-500">{label}</p>
            <p className="mt-2 break-words text-[clamp(1.35rem,2vw,1.875rem)] font-bold leading-tight text-surface-950" title={value}>
              {value}
            </p>
          </div>
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${toneClasses[tone]}`}>
            {icon}
          </div>
        </div>

        {hint && (
          <p className="text-sm leading-relaxed text-surface-500">
            {hint}
          </p>
        )}
      </div>
    </article>
  );
}
