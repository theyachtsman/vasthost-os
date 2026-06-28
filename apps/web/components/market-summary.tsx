'use client';

import type { MarketOverviewRow } from '@vasthost/shared-types';
import { Card, CardContent, DataState } from '@vasthost/ui';
import { Activity, Boxes, Flame, Snowflake, TrendingUp } from 'lucide-react';

import { utilColor } from '@/components/utilization';
import { dph, num, pct } from '@/lib/format';
import { useMarketOverview } from '@/lib/hooks';

// "State of the market" strip derived from the overview leaderboard.
export function MarketSummary() {
  const overview = useMarketOverview();
  return (
    <DataState
      isLoading={overview.isLoading}
      isError={overview.isError}
      error={overview.error}
      data={overview.data}
      onRetry={overview.refetch}
      isEmpty={(d) => d.length === 0}
      emptyMessage="No market data yet — the Observer aggregates every 15 minutes."
      skeleton={<Card className="h-20 animate-pulse" />}
    >
      {(rows) => {
        const withUtil = rows.filter((r) => r.utilization_pct != null && (r.supply_count ?? 0) > 0);
        const totalSupply = rows.reduce((a, r) => a + (r.supply_count ?? 0), 0);
        const totalRented = rows.reduce((a, r) => a + (r.rented_count ?? 0), 0);
        const totalRentals = rows.reduce((a, r) => a + r.rentals_24h, 0);
        const marketUtil = totalSupply ? (100 * totalRented) / totalSupply : null;
        const hottest = [...withUtil].sort(
          (a, b) => (b.utilization_pct ?? 0) - (a.utilization_pct ?? 0),
        )[0];
        const coldest = [...withUtil].sort(
          (a, b) => (a.utilization_pct ?? 0) - (b.utilization_pct ?? 0),
        )[0];

        return (
          <Card>
            <CardContent className="grid grid-cols-2 gap-4 py-4 md:grid-cols-3 xl:grid-cols-6">
              <Metric icon={Boxes} label="GPU classes" value={num(rows.length)} />
              <Metric
                icon={Activity}
                label="Market utilization"
                value={pct(marketUtil, 0)}
                valueClass={utilColor(marketUtil)}
              />
              <Metric
                icon={TrendingUp}
                label="Offers (rented/total)"
                value={`${num(totalRented)}/${num(totalSupply)}`}
              />
              <Metric icon={Activity} label="Rentals · 24h" value={num(totalRentals)} />
              <Metric
                icon={Flame}
                label="Hottest"
                value={hottest?.gpu_name ?? '—'}
                sub={hottest ? `${pct(hottest.utilization_pct, 0)} · ${dph(hottest.p50_price)}` : ''}
                valueClass="text-emerald-400"
              />
              <Metric
                icon={Snowflake}
                label="Coldest"
                value={coldest?.gpu_name ?? '—'}
                sub={coldest ? `${pct(coldest.utilization_pct, 0)} · ${dph(coldest.p50_price)}` : ''}
                valueClass="text-muted"
              />
            </CardContent>
          </Card>
        );
      }}
    </DataState>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  sub,
  valueClass,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted">
        <Icon className="h-3 w-3" />
        {label}
      </span>
      <span className={'truncate text-lg font-semibold tabular-nums ' + (valueClass ?? 'text-fg')}>
        {value}
      </span>
      {sub ? <span className="truncate text-[11px] text-muted">{sub}</span> : null}
    </div>
  );
}
