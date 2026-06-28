'use client';

import type { ClearingEvent } from '@vasthost/shared-types';
import { Badge, DataState } from '@vasthost/ui';
import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { ClassSelector } from '@/components/class-selector';
import { DistributionBar } from '@/components/distribution-bar';
import { MarketOverviewTable } from '@/components/market-overview-table';
import { MarketSummary } from '@/components/market-summary';
import { PageHeader } from '@/components/page-header';
import { PriceDemandScatter } from '@/components/price-demand-scatter';
import { SizeLadder } from '@/components/size-ladder';
import { SortHeader, useSort } from '@/components/sort-header';
import { UtilizationBar, demandLabel } from '@/components/utilization';
import { Widget } from '@/components/widget';
import { dph, num, pct, relativeTime } from '@/lib/format';
import { useClearingEvents, useDistribution, useDistributionHistory } from '@/lib/hooks';
import { useClassStore } from '@/lib/store';

const AXIS = { stroke: 'hsl(218 10% 58%)', fontSize: 11 };
const GRID = 'hsl(222 12% 20%)';

const confidenceVariant = (c: string) =>
  c === 'HIGH' ? 'success' : c === 'LOW' ? 'muted' : 'warning';

export default function MarketPage() {
  const cls = useClassStore((s) => s.selected);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Market Intelligence"
        description="Live supply, demand, and pricing across the Vast GPU market — what rents, for how much, and how fast. All prices are per-GPU/hour."
      />

      {/* State of the market */}
      <MarketSummary />

      {/* Hero: the whole market at a glance */}
      <MarketOverviewTable />

      {/* Educational: where each GPU sits on price vs demand */}
      <PriceDemandScatter />

      {/* Selected GPU deep-dive */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
        <h2 className="text-sm font-semibold text-fg">
          Deep dive — <span className="text-accent">{cls.gpu_name}</span>
        </h2>
        <ClassSelector />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PriceDistributionWidget cls={cls} />
        </div>
        <SelectedStatsCard cls={cls} />
      </div>

      <SizeLadder />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SupplyDemandWidget cls={cls} />
        <ClearingEventsTable cls={cls} />
      </div>
    </div>
  );
}

function SelectedStatsCard({ cls }: { cls: { gpu_name: string; num_gpus: number } }) {
  const dist = useDistribution(cls.gpu_name, cls.num_gpus);
  const events = useClearingEvents(cls.gpu_name, cls.num_gpus, 500);

  const now = Date.now();
  const rentals24h = (events.data ?? []).filter(
    (e) => now - new Date(e.detected_at).getTime() < 24 * 3.6e6,
  );
  const dwells = rentals24h
    .map((e) => e.dwell_minutes)
    .filter((d): d is number => d != null)
    .sort((a, b) => a - b);
  const medianDwell = dwells.length ? dwells[Math.floor(dwells.length / 2)] : null;

  return (
    <Widget title={`Demand — ${cls.gpu_name} ×${cls.num_gpus}`}>
      <DataState
        isLoading={dist.isLoading}
        isError={dist.isError}
        error={dist.error}
        data={dist.data}
        onRetry={dist.refetch}
        emptyMessage="No distribution for this size yet."
      >
        {(d) => {
          const dl = demandLabel(d.utilization_pct);
          const total = d.supply_count ?? 0;
          const rented = d.rented_count ?? 0;
          return (
            <div className="flex flex-col gap-4">
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-[11px] uppercase text-muted">Utilization</div>
                  <div className={'text-3xl font-semibold tabular-nums ' + dl.cls}>
                    {pct(d.utilization_pct, 0)}
                  </div>
                </div>
                <span className={'mb-1 text-sm font-medium ' + dl.cls}>{dl.label} demand</span>
              </div>
              <UtilizationBar pct={d.utilization_pct} showLabel={false} />

              <div className="grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm">
                <Stat2 label="Available" value={num(total - rented)} />
                <Stat2 label="Rented" value={num(rented)} />
                <Stat2 label="Rentals (24h)" value={num(rentals24h.length)} />
                <Stat2
                  label="Median dwell"
                  value={medianDwell != null ? `${Math.round(medianDwell)}m` : '—'}
                  hint="time listed before renting"
                />
              </div>
              <p className="text-[11px] text-muted">
                Median ask {dph(d.p50_price)} · {dl.label.toLowerCase()} markets clear faster and
                support firmer pricing.
              </p>
            </div>
          );
        }}
      </DataState>
    </Widget>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="h-1.5 w-3 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function Stat2({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-muted">{label}</span>
      <span className="tabular-nums text-fg">{value}</span>
      {hint ? <span className="text-[10px] text-muted/70">{hint}</span> : null}
    </div>
  );
}

function PriceDistributionWidget({ cls }: { cls: { gpu_name: string; num_gpus: number } }) {
  const dist = useDistribution(cls.gpu_name, cls.num_gpus);
  return (
    <Widget
      title="Price Distribution"
      action={
        dist.data ? (
          <span className="text-[10px] text-muted">
            updated {relativeTime(dist.data.computed_at)}
          </span>
        ) : null
      }
    >
      <DataState
        isLoading={dist.isLoading}
        isError={dist.isError}
        error={dist.error}
        data={dist.data}
        onRetry={dist.refetch}
        emptyMessage={`No distribution computed for ${cls.gpu_name} ×${cls.num_gpus} yet.`}
      >
        {(d) => (
          <div className="flex flex-col gap-4 pt-2">
            <DistributionBar dist={d} />
            <div className="grid grid-cols-5 gap-2 text-center">
              {(
                [
                  ['p10', d.p10_price],
                  ['p25', d.p25_price],
                  ['p50', d.p50_price],
                  ['p75', d.p75_price],
                  ['p90', d.p90_price],
                ] as const
              ).map(([label, val]) => (
                <div key={label} className="rounded-md border border-border bg-bg/40 py-2">
                  <div className="text-[10px] uppercase text-muted">{label}</div>
                  <div className="text-xs font-semibold tabular-nums text-fg">{dph(val)}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between text-xs text-muted">
              <span>Supply: {num(d.supply_count)}</span>
              <span>Rented: {num(d.rented_count)}</span>
              <span>Utilization: {pct(d.utilization_pct)}</span>
            </div>
          </div>
        )}
      </DataState>
    </Widget>
  );
}

function SupplyDemandWidget({ cls }: { cls: { gpu_name: string; num_gpus: number } }) {
  const history = useDistributionHistory(cls.gpu_name, cls.num_gpus, 96);
  return (
    <Widget
      title="Supply · Demand · Price over time"
      action={
        <div className="flex items-center gap-3 text-[10px] text-muted">
          <Legend color="hsl(243 75% 65%)" label="Supply" />
          <Legend color="hsl(160 70% 45%)" label="Util %" />
          <Legend color="hsl(43 90% 55%)" label="Median $" />
        </div>
      }
    >
      <DataState
        isLoading={history.isLoading}
        isError={history.isError}
        error={history.error}
        data={history.data}
        onRetry={history.refetch}
        isEmpty={(d) => d.length === 0}
        emptyMessage="Not enough history yet — distributions aggregate every 15 minutes."
      >
        {(rows) => {
          const data = rows.map((r) => ({
            t: new Date(r.computed_at).toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
            }),
            supply: r.supply_count ?? 0,
            util: r.utilization_pct ?? 0,
            price: r.p50_price ?? null,
          }));
          return (
            <div className="h-56 pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="supply" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(243 75% 65%)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="hsl(243 75% 65%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={GRID} strokeDasharray="2 4" vertical={false} />
                  <XAxis dataKey="t" {...AXIS} tickLine={false} minTickGap={32} />
                  <YAxis yAxisId="left" {...AXIS} tickLine={false} axisLine={false} width={36} />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    {...AXIS}
                    tickLine={false}
                    axisLine={false}
                    width={44}
                    tickFormatter={(v) => `$${v}`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(222 16% 10%)',
                      border: '1px solid hsl(222 12% 20%)',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="supply"
                    stroke="hsl(243 75% 65%)"
                    fill="url(#supply)"
                    strokeWidth={2}
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="util"
                    stroke="hsl(160 70% 45%)"
                    dot={false}
                    strokeWidth={1.5}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="price"
                    stroke="hsl(43 90% 55%)"
                    dot={false}
                    strokeWidth={1.5}
                    connectNulls
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          );
        }}
      </DataState>
    </Widget>
  );
}

type EventSortKey = 'gpu' | 'region' | 'price' | 'dwell' | 'confidence' | 'when';
const CONFIDENCE_RANK = { LOW: 0, MEDIUM: 1, HIGH: 2 } as const;

function ClearingEventsTable({ cls }: { cls: { gpu_name: string; num_gpus: number } }) {
  const events = useClearingEvents(cls.gpu_name, cls.num_gpus, 50);
  const [confidence, setConfidence] = useState<'ALL' | 'HIGH' | 'MEDIUM' | 'LOW'>('ALL');
  const [region, setRegion] = useState<string>('ALL');

  const { state: sortState, sort } = useSort<ClearingEvent, EventSortKey>('when', 'desc', {
    gpu: (e) => e.gpu_name,
    region: (e) => e.geolocation,
    price: (e) => e.last_price_gpu,
    dwell: (e) => e.dwell_minutes,
    confidence: (e) => CONFIDENCE_RANK[e.confidence],
    when: (e) => new Date(e.detected_at).getTime(),
  });

  const regions = useMemo(() => {
    const set = new Set<string>();
    (events.data ?? []).forEach((e) => e.geolocation && set.add(e.geolocation));
    return Array.from(set).sort();
  }, [events.data]);

  const filtered = useMemo(() => {
    let rows = events.data ?? [];
    if (confidence !== 'ALL') rows = rows.filter((e) => e.confidence === confidence);
    if (region !== 'ALL') rows = rows.filter((e) => e.geolocation === region);
    return sort(rows);
  }, [events.data, confidence, region, sort]);

  const selectCls =
    'h-8 rounded-md border border-border bg-bg px-2 text-xs text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';

  return (
    <Widget
      title="Recent Rentals — confirmed, with price & dwell"
      action={
        <div className="flex items-center gap-2">
          <select
            aria-label="Filter by confidence"
            className={selectCls}
            value={confidence}
            onChange={(e) => setConfidence(e.target.value as typeof confidence)}
          >
            <option value="ALL">All confidence</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
          <select
            aria-label="Filter by region"
            className={selectCls}
            value={region}
            onChange={(e) => setRegion(e.target.value)}
          >
            <option value="ALL">All regions</option>
            {regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      }
    >
      <DataState
        isLoading={events.isLoading}
        isError={events.isError}
        error={events.error}
        data={filtered}
        onRetry={events.refetch}
        isEmpty={(d) => d.length === 0}
        emptyMessage={
          (events.data?.length ?? 0) > 0
            ? 'No events match these filters.'
            : 'No confirmed rentals yet — events appear as offers move from available to rented (directly observed, accumulating each poll).'
        }
      >
        {(rows) => (
          <div className="-mx-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase">
                  <SortHeader label="GPU" sortKey="gpu" state={sortState} />
                  <SortHeader label="Region" sortKey="region" state={sortState} />
                  <SortHeader label="Rented at" sortKey="price" state={sortState} align="right" />
                  <SortHeader label="Dwell" sortKey="dwell" state={sortState} align="right" />
                  <SortHeader label="Confidence" sortKey="confidence" state={sortState} />
                  <SortHeader label="When" sortKey="when" state={sortState} align="right" />
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} className="border-b border-border/50 hover:bg-border/20">
                    <td className="px-4 py-2 text-fg">
                      {e.gpu_name} ×{e.num_gpus}
                    </td>
                    <td className="px-4 py-2 text-muted">{e.geolocation ?? '—'}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-fg">
                      {dph(e.last_price_gpu)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted">
                      {e.dwell_minutes != null ? `${e.dwell_minutes}m` : '—'}
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant={confidenceVariant(e.confidence)}>{e.confidence}</Badge>
                    </td>
                    <td className="px-4 py-2 text-right text-muted">
                      {relativeTime(e.detected_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 pt-2 text-[11px] text-muted">
              {rows.length} event{rows.length === 1 ? '' : 's'} shown
            </div>
          </div>
        )}
      </DataState>
    </Widget>
  );
}
