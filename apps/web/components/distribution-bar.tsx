import type { Distribution } from '@vasthost/shared-types';

import { dph } from '@/lib/format';

// Compact inline p10–p90 box with an optional "your price" marker.
export function DistributionBar({
  dist,
  yourPrice,
}: {
  dist: Distribution;
  yourPrice?: number | null;
}) {
  const lo = dist.p10_price ?? 0;
  const hi = dist.p90_price ?? 0;
  const span = hi - lo || 1;
  const posFor = (v: number | null | undefined) =>
    v == null ? null : Math.max(0, Math.min(100, ((v - lo) / span) * 100));

  const p25 = posFor(dist.p25_price);
  const p50 = posFor(dist.p50_price);
  const p75 = posFor(dist.p75_price);
  const yours = posFor(yourPrice);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative h-7">
        {/* full range track */}
        <div className="absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-border/60" />
        {/* interquartile box */}
        {p25 != null && p75 != null ? (
          <div
            className="absolute top-1/2 h-3 -translate-y-1/2 rounded-sm bg-accent/25"
            style={{ left: `${p25}%`, width: `${Math.max(1, p75 - p25)}%` }}
          />
        ) : null}
        {/* median */}
        {p50 != null ? (
          <div
            className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 bg-accent"
            style={{ left: `${p50}%` }}
            title={`p50 ${dph(dist.p50_price)}`}
          />
        ) : null}
        {/* your price marker */}
        {yours != null ? (
          <div
            className="absolute top-0 flex h-full flex-col items-center"
            style={{ left: `${yours}%` }}
            title={`You: ${dph(yourPrice)}`}
          >
            <div className="h-full w-0.5 bg-emerald-400" />
          </div>
        ) : null}
      </div>
      <div className="flex justify-between text-[10px] tabular-nums text-muted">
        <span>{dph(dist.p10_price)}</span>
        <span>p50 {dph(dist.p50_price)}</span>
        <span>{dph(dist.p90_price)}</span>
      </div>
    </div>
  );
}
