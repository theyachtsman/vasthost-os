'use client';

import type { MarketOverviewRow } from '@vasthost/shared-types';
import { Card, CardContent, DataState } from '@vasthost/ui';
import { Activity, Boxes, Flame, Snowflake, TrendingUp, Zap } from 'lucide-react';

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
        const withUtil = rows.filter((r) => r.demand_score != null && (r.supply_count ?? 0) > 0);
        const totalSupply = rows.reduce((a, r) => a + (r.supply_count ?? 0), 0);
        const totalRented = rows.reduce((a, r) => a + (r.rented_count ?? 0), 0);
        const totalRentals = rows.reduce((a, r) => a + r.rentals_24h, 0);
        const marketUtil = totalSupply ? (100 * totalRented) / totalSupply : null;
        // Hottest/coldest by liquidity-weighted demand, not raw utilization, so a
        // thin 100%-rented class doesn't masquerade as the hottest card.
        const hottest = [...withUtil].sort(
          (a, b) => (b.demand_score ?? 0) - (a.demand_score ?? 0),
        )[0];
        const coldest = [...withUtil].sort(
          (a, b) => (a.demand_score ?? 0) - (b.demand_score ?? 0),
        )[0];
        const bestValue = rows
          .filter((r) => r.dlperf_per_dphtotal != null)
          .sort((a, b) => (b.dlperf_per_dphtotal ?? 0) - (a.dlperf_per_dphtotal ?? 0))[0];

        return (
          <Card>
            <CardContent className="grid grid-cols-2 gap-4 py-4 md:grid-cols-4 xl:grid-cols-7">
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
              <Metric
                icon={Zap}
                label="Best value"
                value={bestValue?.gpu_name ?? '—'}
                sub={
                  bestValue?.dlperf_per_dphtotal != null
                    ? `${bestValue.dlperf_per_dphtotal.toFixed(0)} perf/$`
                    : ''
                }
                valueClass="text-accent"
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
