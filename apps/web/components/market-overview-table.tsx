'use client';

import type { MarketOverviewRow } from '@vasthost/shared-types';
import { Badge, DataState } from '@vasthost/ui';
import { useMemo, useState } from 'react';

import { SortHeader, useSort } from '@/components/sort-header';
import { UtilizationBar, demandLabel } from '@/components/utilization';
import { Widget } from '@/components/widget';
import { dph, hostTake, num, pct } from '@/lib/format';
import { useMarketOverview } from '@/lib/hooks';
import { useClassStore } from '@/lib/store';

type Key = 'gpu' | 'price' | 'spread' | 'demand' | 'util' | 'value' | 'supply' | 'rentals' | 'dwell';

// demand_score arrives as a 0..1 fraction; render it on the same 0..100 scale the
// utilization bar/label already understand (Hot/Warm/Soft/Cold).
const demandPct = (r: MarketOverviewRow) => (r.demand_score ?? 0) * 100;

export function MarketOverviewTable({
  owned,
  feePct,
}: {
  owned?: Set<string>;
  feePct?: number | null;
}) {
  const overview = useMarketOverview();
  const setSelected = useClassStore((s) => s.setSelected);
  const selected = useClassStore((s) => s.selected);
  const [filter, setFilter] = useState('');

  const { state, sort } = useSort<MarketOverviewRow, Key>('demand', 'desc', {
    gpu: (r) => r.gpu_name,
    price: (r) => r.p50_price,
    spread: (r) => (r.p90_price ?? 0) - (r.p10_price ?? 0),
    demand: (r) => r.demand_score,
    util: (r) => r.utilization_pct,
    value: (r) => r.dlperf_per_dphtotal,
    supply: (r) => r.supply_count,
    rentals: (r) => r.rentals_24h,
    dwell: (r) => r.median_dwell_minutes,
  });

  const rows = useMemo(() => {
    let r = overview.data ?? [];
    if (filter.trim()) {
      const q = filter.toLowerCase();
      r = r.filter((x) => x.gpu_name.toLowerCase().includes(q));
    }
    return sort(r);
  }, [overview.data, filter, sort]);

  return (
    <Widget
      title="Market Overview — every GPU, per-GPU pricing"
      action={
        <input
          aria-label="Filter GPUs"
          placeholder="Filter GPU…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-8 w-36 rounded-md border border-border bg-bg px-2 text-xs text-fg placeholder:text-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
      }
    >
      <DataState
        isLoading={overview.isLoading}
        isError={overview.isError}
        error={overview.error}
        data={rows}
        onRetry={overview.refetch}
        isEmpty={(d) => d.length === 0}
        emptyMessage="No market distributions yet — the Observer aggregates every 15 minutes."
      >
        {(data) => (
          <div className="-mx-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase">
                  <SortHeader label="GPU" sortKey="gpu" state={state} />
                  <SortHeader label="Median $/GPU·hr" sortKey="price" state={state} align="right" />
                  <SortHeader label="p10–p90" sortKey="spread" state={state} align="right" />
                  <SortHeader label="Demand" sortKey="demand" state={state} />
                  <SortHeader label="Util (raw)" sortKey="util" state={state} align="right" />
                  <SortHeader label="Perf/$" sortKey="value" state={state} align="right" />
                  <SortHeader label="Rented/Total" sortKey="supply" state={state} align="right" />
                  <SortHeader label="Rentals 24h" sortKey="rentals" state={state} align="right" />
                  <SortHeader label="Med. dwell" sortKey="dwell" state={state} align="right" />
                </tr>
              </thead>
              <tbody>
                {data.map((r) => {
                  const d = demandLabel(demandPct(r));
                  const active = r.gpu_name === selected?.gpu_name;
                  const mine = owned?.has(r.gpu_name) ?? false;
                  return (
                    <tr
                      key={r.gpu_name}
                      onClick={() =>
                        setSelected({ gpu_name: r.gpu_name, num_gpus: 1, geolocation: null })
                      }
                      className={
                        'cursor-pointer border-b border-border/50 hover:bg-border/20 ' +
                        (mine ? 'bg-accent/10 ring-1 ring-inset ring-accent/30 ' : '') +
                        (active && !mine ? 'bg-accent/10' : '')
                      }
                    >
                      <td className="px-4 py-2 font-medium text-fg">
                        <span className="flex items-center gap-2">
                          {r.gpu_name}
                          {mine ? <Badge variant="accent">your fleet</Badge> : null}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-fg">
                        {dph(r.p50_price)}
                        <div className="text-[10px] text-emerald-400/80">
                          {dph(hostTake(r.p50_price, feePct ?? null))} net
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted">
                        {dph(r.p10_price)}–{dph(r.p90_price)}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <UtilizationBar pct={demandPct(r)} showLabel={false} className="w-28" />
                          <span className={'w-10 text-[11px] ' + d.cls}>{d.label}</span>
                        </div>
                      </td>
                      <td
                        className="px-4 py-2 text-right tabular-nums text-muted"
                        title="Raw utilization (rented ÷ total). Demand weights this by liquidity so a thin 100% doesn't read as hot."
                      >
                        {pct(r.utilization_pct, 0)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-fg">
                        {r.dlperf_per_dphtotal != null ? r.dlperf_per_dphtotal.toFixed(0) : '—'}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted">
                        {num(r.rented_count)}/{num(r.supply_count)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {r.rentals_24h > 0 ? (
                          <span className="text-fg">{num(r.rentals_24h)}</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted">
                        {r.median_dwell_minutes != null
                          ? `${Math.round(r.median_dwell_minutes)}m`
                          : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-2 text-[11px] text-muted">
              <span>
                {data.length} GPU classes · ranked by liquidity-weighted demand (a thin 100%-rented
                class will not top the board) · click a row to drill in
              </span>
              <span className="flex items-center gap-2">
                {owned && owned.size > 0 ? <Badge variant="accent">your fleet</Badge> : null}
                <Badge variant="success">Hot</Badge>
                <Badge variant="warning">Warm</Badge>
                <Badge variant="muted">Soft/Cold</Badge>
              </span>
            </div>
          </div>
        )}
      </DataState>
    </Widget>
  );
}
