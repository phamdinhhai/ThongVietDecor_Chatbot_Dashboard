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
    <article className="group relative min-h-[132px] overflow-hidden rounded-[1.35rem] border border-white/70 bg-white/90 p-4 shadow-[0_14px_38px_-28px_rgba(15,23,42,0.45)] ring-1 ring-surface-200/70 backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_50px_-30px_rgba(15,23,42,0.55)] sm:p-5">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-400 via-sky-400 to-emerald-400 opacity-70" />
      <div className="flex h-full flex-col justify-between gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-surface-500">{label}</p>
            <p className="mt-2 whitespace-nowrap text-[clamp(1.28rem,1.85vw,1.85rem)] font-black leading-[1.05] tracking-tight text-surface-950" title={value}>
              {value}
            </p>
          </div>
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ring-1 shadow-sm transition-transform duration-300 group-hover:scale-105 ${toneClasses[tone]}`}>
            {icon}
          </div>
        </div>

        {hint && (
          <p className="line-clamp-2 text-[0.78rem] leading-5 text-surface-500" title={hint}>
            {hint}
          </p>
        )}
      </div>
    </article>
  );
}
