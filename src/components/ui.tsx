import type { ReactNode } from 'react';
import { AskAnfi } from '@/components/assistant/ask-anfi';
import { cn } from '@/lib/utils';

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode; id?: string; 'data-anfi'?: string }) {
  return <div {...rest} className={cn('rounded-2xl border border-line bg-paper/90 shadow-[0_1px_2px_rgba(43,38,32,0.04),0_8px_24px_-12px_rgba(43,38,32,0.12)]', className)}>{children}</div>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {actions}
        <AskAnfi />
      </div>
    </div>
  );
}

const BUTTON = {
  primary: 'bg-brand font-semibold text-ink hover:bg-brand/90',
  gold: 'bg-brand font-medium text-ink hover:bg-brand/90',
  ghost: 'border border-line bg-paper hover:bg-sand/60',
  danger: 'border border-terra/40 bg-terra-soft text-terra hover:bg-terra-soft/70',
};

export function buttonClass(variant: keyof typeof BUTTON = 'primary', size: 'sm' | 'md' = 'md') {
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4',
    size === 'sm' ? 'h-8 px-3 text-xs' : 'h-10 px-4 text-sm',
    BUTTON[variant],
  );
}

const TONES = {
  neutral: 'bg-sand text-ink/80',
  gold: 'bg-brand-soft text-brand-ink',
  sage: 'bg-sage-soft text-[#2f6b4f]',
  terra: 'bg-terra-soft text-terra-ink',
  violet: 'bg-violet-soft text-[#5a3fa0]',
};
export type Tone = keyof typeof TONES;

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', TONES[tone], className)}>{children}</span>;
}

export function Dot({ tone, pulse }: { tone: 'sage' | 'gold' | 'terra' | 'muted' | 'violet'; pulse?: boolean }) {
  const color = { sage: 'bg-sage', gold: 'bg-brand', terra: 'bg-terra', muted: 'bg-muted/40', violet: 'bg-violet' }[tone];
  return <span className={cn('inline-block size-2 rounded-full', color, pulse && 'animate-pulse-dot')} />;
}

export function StatTile({ label, value, delta, icon, hint }: { label: string; value: string; delta?: { text: string; up: boolean } | null; icon?: ReactNode; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between text-xs text-muted">
        <span>{label}</span>
        <span className="text-brand">{icon}</span>
      </div>
      <div className="mt-3 font-display text-3xl font-semibold tracking-tight">{value}</div>
      {delta ? (
        <div className={cn('mt-2 text-xs', delta.up ? 'text-sage' : 'text-terra')}>
          {delta.up ? '↗' : '↘'} {delta.text}
        </div>
      ) : hint ? (
        <div className="mt-2 text-xs text-muted">{hint}</div>
      ) : null}
    </Card>
  );
}

/** Small bar chart (SVG), no chart library. */
export function Bars({ values, color = '#1dbf8e', height = 64, labels }: { values: number[]; color?: string; height?: number; labels?: string[] }) {
  const max = Math.max(...values, 1e-9);
  const w = 100 / Math.max(values.length, 1);
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="h-16 w-full" role="img" aria-label={labels?.map((l, i) => `${l}: ${values[i]}`).join(', ')}>
      {values.map((v, i) => {
        const h = Math.max((v / max) * (height - 4), v > 0 ? 3 : 1);
        return <rect key={i} x={i * w + w * 0.08} y={height - h} width={w * 0.84} height={h} rx={1.5} fill={color} opacity={v > 0 ? 0.85 : 0.18} />;
      })}
    </svg>
  );
}

export function Sparkline({ values, color = '#0f9d74' }: { values: number[]; color?: string }) {
  if (values.length < 2) return <div className="h-10" />;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${38 - (v / max) * 34}`).join(' ');
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-10 w-28">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-2 text-sm text-muted">{children}</div>}
    </div>
  );
}

export const inputClass = 'w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20';

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}
