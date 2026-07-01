import { cn } from '@vasthost/ui';

// High utilization = strong demand (good for hosts). Color scales warm→hot.
export function utilColor(pct: number | null | undefined): string {
  if (pct == null) return 'text-muted';
  if (pct >= 70) return 'text-emerald-400';
  if (pct >= 45) return 'text-amber-400';
  if (pct >= 20) return 'text-orange-400';
  return 'text-muted';
}

function barColor(pct: number): string {
  if (pct >= 70) return 'bg-emerald-400';
  if (pct >= 45) return 'bg-amber-400';
  if (pct >= 20) return 'bg-orange-400';
  return 'bg-border';
}

export function UtilizationBar({
  pct,
  className,
  showLabel = true,
}: {
  pct: number | null | undefined;
  className?: string;
  showLabel?: boolean;
}) {
  const v = pct ?? 0;
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="h-1.5 w-full min-w-12 overflow-hidden rounded-full bg-border/50">
        <div
          className={cn('h-full rounded-full transition-all', barColor(v))}
          style={{ width: `${Math.max(2, Math.min(100, v))}%` }}
        />
      </div>
      {showLabel ? (
        <span className={cn('w-10 shrink-0 text-right text-xs tabular-nums', utilColor(pct))}>
          {pct == null ? '—' : `${Math.round(v)}%`}
        </span>
      ) : null}
    </div>
  );
}

export function demandLabel(pct: number | null | undefined): { label: string; cls: string } {
  if (pct == null) return { label: 'unknown', cls: 'text-muted' };
  if (pct >= 70) return { label: 'Hot', cls: 'text-emerald-400' };
  if (pct >= 45) return { label: 'Warm', cls: 'text-amber-400' };
  if (pct >= 20) return { label: 'Soft', cls: 'text-orange-400' };
  return { label: 'Cold', cls: 'text-muted' };
}
