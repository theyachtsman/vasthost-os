'use client';

import { useEffect, useState } from 'react';

import { relativeTime } from '@/lib/format';
import { useMarketMeta } from '@/lib/hooks';

// A visible "this screen is live" signal. The data already refetches on an
// interval; this lets the user *see* that it's current. Pulses green while the
// Observer is polling on cadence, and flips amber/"stale" if the last poll is
// older than ~2 intervals (worker stalled).
export function LiveIndicator({ className }: { className?: string }) {
  const { data } = useMarketMeta();

  // Re-render every 5s so "updated Ns ago" / "next ~Ns" tick without a refetch.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 5_000);
    return () => clearInterval(id);
  }, []);

  const interval = data?.poll_interval_seconds ?? 180;
  const lastMs = data?.last_poll_at ? new Date(data.last_poll_at).getTime() : null;
  const ageS = lastMs != null ? Math.max(0, Math.round((Date.now() - lastMs) / 1000)) : null;
  const stale = ageS != null && ageS > interval * 2;
  const nextS = ageS != null ? Math.max(0, interval - ageS) : null;

  const dot = stale ? 'bg-amber-400' : 'bg-emerald-400';
  const text = stale ? 'text-amber-400' : 'text-emerald-400';

  return (
    <span
      className={
        'inline-flex items-center gap-1.5 rounded-full border border-border bg-bg/60 px-2 py-0.5 text-[11px] ' +
        (className ?? '')
      }
      title={
        lastMs != null
          ? `Auto-updating every ${interval}s · last poll ${relativeTime(data?.last_poll_at)}`
          : 'Awaiting first poll'
      }
    >
      <span className="relative flex h-2 w-2">
        {!stale ? (
          <span
            className={'absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ' + dot}
          />
        ) : null}
        <span className={'relative inline-flex h-2 w-2 rounded-full ' + dot} />
      </span>
      <span className={text}>
        {lastMs == null
          ? 'Connecting…'
          : stale
            ? `Stale · ${relativeTime(data?.last_poll_at)}`
            : `Live · updated ${ageS}s ago${nextS != null ? ` · next ~${nextS}s` : ''}`}
      </span>
    </span>
  );
}
