'use client';

import type { ClearingEvent } from '@vasthost/shared-types';
import { Badge, Button, DataState } from '@vasthost/ui';
import Link from 'next/link';
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
import { LiveIndicator } from '@/components/live-indicator';
import { MarketListings } from '@/components/market-listings';
import { MarketOverviewTable } from '@/components/market-overview-table';
import { MarketSummary } from '@/components/market-summary';
import { PageHeader } from '@/components/page-header';
import { PriceDemandScatter } from '@/components/price-demand-scatter';
import { SizeLadder } from '@/components/size-ladder';
import { SortHeader, useSort } from '@/components/sort-header';
import { UtilizationBar, demandLabel } from '@/components/utilization';
import { Widget } from '@/components/widget';
import { dph, num, pct, relativeTime } from '@/lib/format';
import {
  useClearingEvents,
  useDistribution,
  useDistributionHistory,
  useMachines,
} from '@/lib/hooks';
import { MARKET_SOURCE_COLORS } from '@/lib/market-source';
import { useAutoSelectOwnedClass, useOwnedFleet } from '@/lib/owned';
import { useClassStore } from '@/lib/store';

const AXIS = { stroke: 'hsl(218 10% 58%)', fontSize: 11 };
const GRID = 'hsl(222 12% 20%)';
// Supply series is colored by market source; only Vast renders today (Part 4).
const SUPPLY_COLOR = MARKET_SOURCE_COLORS.vast;

const confidenceVariant = (c: string) =>
  c === 'HIGH' ? 'success' : c === 'LOW' ? 'muted' : 'warning';

type Cls = { gpu_name: string; num_gpus: number };
export type MarketHubMode = 'guest' | 'app';

// One Market Intelligence hub, rendered in two modes (Part 8): guest (public
// homepage, with a sign-up CTA) and app (signed-in, with the user's own rigs
// overlaid). The leaderboard / scatter / deep-dive / confirmed-rentals feed are
// identical between the two — only the overlays and CTA differ.
export function MarketHub({ mode }: { mode: MarketHubMode }) {
  const isApp = mode === 'app';
  // Signed-in users with a fleet land on their own rig; everyone else starts with
  // nothing selected and picks from the board.
  useAutoSelectOwnedClass(isApp);
  const cls = useClassStore((s) => s.selected);
  const owned = useOwnedFleet(isApp);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Market Intelligence"
        description="Live supply, demand, and pricing across the GPU market — what rents, for how much, and how fast. Prices are the per-GPU/hour asking price hosts set."
        actions={<LiveIndicator />}
      />

      <MarketSummary />

      {mode === 'guest' ? <GuestCta /> : null}

      <MarketOverviewTable owned={owned.gpus} />

      <PriceDemandScatter owned={owned.gpus} />

      {cls ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
            <h2 className="text-sm font-semibold text-fg">
              Deep dive — <span className="text-accent">{cls.gpu_name}</span>
              {isApp && owned.gpus.has(cls.gpu_name) ? (
                <Badge variant="accent" className="ml-2">
                  you host this
                </Badge>
              ) : null}
            </h2>
            <ClassSelector />
          </div>

          {isApp ? <RigOverlayNote cls={cls} /> : null}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <PriceDistributionWidget cls={cls} mode={mode} />
            </div>
            <SelectedStatsCard cls={cls} />
          </div>

          <SizeLadder cls={cls} />

          <MarketListings cls={cls} />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SupplyDemandWidget cls={cls} />
            <ClearingEventsTable cls={cls} mode={mode} />
          </div>
        </>
      ) : (
        <DeepDivePlaceholder isApp={isApp} hasFleet={owned.hasAny} />
      )}
    </div>
  );
}

// Shown when nothing is selected (no default GPU): prompts the user to pick a
// card from the leaderboard or scatter to open the deep-dive.
function DeepDivePlaceholder({ isApp, hasFleet }: { isApp: boolean; hasFleet: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-border bg-bg/30 px-4 py-10 text-center">
      <div className="text-sm font-medium text-fg">Pick a GPU to drill in</div>
      <div className="max-w-md text-xs text-muted">
        Click any row in the leaderboard or a dot in the scatter above to open its price
        distribution, config sizes, and live per-server listings.
        {isApp && !hasFleet
          ? ' Connect a Vast key or add a simulated rig in Settings to land on your own market by default.'
          : ''}
      </div>
    </div>
  );
}

function GuestCta() {
  return (
    <div className="flex flex-col items-start justify-between gap-3 rounded-lg border border-accent/30 bg-accent/10 px-4 py-3 sm:flex-row sm:items-center">
      <div>
        <div className="text-sm font-semibold text-fg">See where your rig ranks</div>
        <div className="text-xs text-muted">
          Connect your Vast key to overlay your own machines on this market, track earnings, and get
          pricing intelligence — free.
        </div>
      </div>
      <Link href="/signup">
        <Button>Sign up free</Button>
      </Link>
    </div>
  );
}

// App mode only: shows how the user's own machine on the selected GPU is priced
// relative to the live market (the "your rig overlay").
function useYourPrice(cls: Cls, mode: MarketHubMode): number | null {
  const machines = useMachines(mode === 'app');
  if (mode !== 'app') return null;
  const m = (machines.data ?? []).find(
    (x) => x.gpu_name === cls.gpu_name && x.current_price_gpu != null,
  );
  return m?.current_price_gpu ?? null;
}

function RigOverlayNote({ cls }: { cls: Cls }) {
  const yourPrice = useYourPrice(cls, 'app');
  const dist = useDistribution(cls.gpu_name, cls.num_gpus);
  if (yourPrice == null) {
    return (
      <p className="text-xs text-muted">
        No machine of yours on {cls.gpu_name} — connect a key in Settings, or pick a GPU you host to
        see your position.
      </p>
    );
  }
  const d = dist.data;
  let percentile: number | null = null;
  if (d) {
    const pts = [d.p10_price, d.p25_price, d.p50_price, d.p75_price, d.p90_price].filter(
      (v): v is number => v != null,
    );
    const below = pts.filter((v) => v < yourPrice).length;
    percentile = pts.length ? Math.round((below / pts.length) * 100) : null;
  }
  return (
    <div className="flex items-center gap-2 rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-xs">
      <Badge variant="accent">your rig</Badge>
      <span className="text-fg">
        Your {cls.gpu_name} is priced at {dph(yourPrice)}
        {percentile != null ? ` — the ${percentile}th percentile of the market.` : '.'}
      </span>
    </div>
  );
}

function SelectedStatsCard({ cls }: { cls: Cls }) {
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
                Median ask {dph(d.p50_price)}
                {d.dlperf_per_dphtotal != null
                  ? ` · ${d.dlperf_per_dphtotal.toFixed(0)} perf/$`
                  : ''}{' '}
                · {dl.label.toLowerCase()} markets clear faster and support firmer pricing.
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

function PriceDistributionWidget({ cls, mode }: { cls: Cls; mode: MarketHubMode }) {
  const dist = useDistribution(cls.gpu_name, cls.num_gpus);
  const yourPrice = useYourPrice(cls, mode);
  return (
    <Widget
      title="Price Distribution"
      action={
        dist.data ? (
          <span className="flex items-center gap-2 text-[10px] text-muted">
            {dist.data.price_basis === 'last-rented' ? (
              <Badge variant="muted">last rented</Badge>
            ) : null}
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
            {/* Signed-in: overlay the user's own price marker on the bar. */}
            <DistributionBar dist={d} yourPrice={yourPrice} />
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

function SupplyDemandWidget({ cls }: { cls: Cls }) {
  const history = useDistributionHistory(cls.gpu_name, cls.num_gpus, 96);
  return (
    <Widget
      title="Supply · Demand · Price over time"
      action={
        <div className="flex items-center gap-3 text-[10px] text-muted">
          <Legend color={SUPPLY_COLOR} label="Supply" />
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
          const tooltipStyle = {
            background: 'hsl(222 16% 10%)',
            border: '1px solid hsl(222 12% 20%)',
            borderRadius: 8,
            fontSize: 12,
          };
          return (
            <div className="flex flex-col gap-1 pt-2">
              {/* Supply (left, counts) + Utilization (right, 0–100%). Util used to
                  share the supply axis and rendered flat against the bottom — it
                  now has its own % scale so demand is actually visible. */}
              <div className="h-40">
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
                      yAxisId="util"
                      orientation="right"
                      domain={[0, 100]}
                      {...AXIS}
                      tickLine={false}
                      axisLine={false}
                      width={40}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Area
                      yAxisId="left"
                      type="monotone"
                      dataKey="supply"
                      name="Supply"
                      stroke="hsl(243 75% 65%)"
                      fill="url(#supply)"
                      strokeWidth={2}
                    />
                    <Line
                      yAxisId="util"
                      type="monotone"
                      dataKey="util"
                      name="Util %"
                      stroke="hsl(160 70% 45%)"
                      dot={false}
                      strokeWidth={1.5}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              {/* Median price over time, on its own $ scale so trends are legible. */}
              <div className="h-20">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data} margin={{ top: 2, right: 44, left: -16, bottom: 0 }}>
                    <CartesianGrid stroke={GRID} strokeDasharray="2 4" vertical={false} />
                    <XAxis dataKey="t" {...AXIS} tickLine={false} minTickGap={32} hide />
                    <YAxis
                      {...AXIS}
                      tickLine={false}
                      axisLine={false}
                      width={36}
                      domain={['auto', 'auto']}
                      tickFormatter={(v) => `$${v}`}
                    />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Line
                      type="monotone"
                      dataKey="price"
                      name="Median $"
                      stroke="hsl(43 90% 55%)"
                      dot={false}
                      strokeWidth={1.5}
                      connectNulls
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          );
        }}
      </DataState>
    </Widget>
  );
}

type EventSortKey = 'gpu' | 'region' | 'price' | 'dwell' | 'confidence' | 'when';
const CONFIDENCE_RANK = { LOW: 0, MEDIUM: 1, HIGH: 2 } as const;

function ClearingEventsTable({ cls, mode }: { cls: Cls; mode: MarketHubMode }) {
  const events = useClearingEvents(cls.gpu_name, cls.num_gpus, 50);
  const [confidence, setConfidence] = useState<'ALL' | 'HIGH' | 'MEDIUM' | 'LOW'>('ALL');
  const [region, setRegion] = useState<string>('ALL');

  // Signed-in: highlight rentals in regions the user hosts in (their "own
  // relevant entries" surfaced in the feed).
  const machines = useMachines(mode === 'app');
  const yourRegions = useMemo(() => {
    const s = new Set<string>();
    (machines.data ?? []).forEach((m) => {
      if (m.gpu_name === cls.gpu_name && m.geolocation) s.add(m.geolocation);
    });
    return s;
  }, [machines.data, cls.gpu_name]);

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
                {rows.map((e) => {
                  const mine = mode === 'app' && e.geolocation != null && yourRegions.has(e.geolocation);
                  return (
                    <tr
                      key={e.id}
                      className={
                        'border-b border-border/50 hover:bg-border/20 ' +
                        (mine ? 'bg-accent/10' : '')
                      }
                    >
                      <td className="px-4 py-2 text-fg">
                        {e.gpu_name} ×{e.num_gpus}
                        {mine ? <Badge variant="accent" className="ml-2">your region</Badge> : null}
                      </td>
                      <td className="px-4 py-2 text-muted">{e.geolocation ?? '—'}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-fg">
                        {dph(e.last_price_gpu)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted">
                        {e.dwell_minutes != null ? `${e.dwell_minutes}m` : '—'}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          title={
                            e.confidence_reason ??
                            'Signal strength of this confirmed rental (how established the listing was).'
                          }
                          className="cursor-help"
                        >
                          <Badge variant={confidenceVariant(e.confidence)}>{e.confidence}</Badge>
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right text-muted">
                        {relativeTime(e.detected_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex flex-col gap-1 px-4 pt-2 text-[11px] text-muted">
              <span>
                {rows.length} event{rows.length === 1 ? '' : 's'} shown
              </span>
              <span>
                Every row is a <span className="text-fg">confirmed</span> rental (an offer we saw
                available is now rented — sampling can miss events but never invent them).{' '}
                <span className="text-emerald-400">HIGH</span> = established listing (seen ≥3 polls) +
                verified host · <span className="text-amber-400">MEDIUM</span> = established or
                verified · <span className="text-muted">LOW</span> = thin evidence (first/second
                sighting, unverified). Hover a badge for the specifics.
              </span>
            </div>
          </div>
        )}
      </DataState>
    </Widget>
  );
}
