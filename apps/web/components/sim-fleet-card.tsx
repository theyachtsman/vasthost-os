'use client';

import type { SimulatedHost } from '@vasthost/shared-types';
import { Badge, Card, CardContent, Stat } from '@vasthost/ui';

import { dph, gb, relativeTime, usd } from '@/lib/format';
import { useSimulatedHostMarket } from '@/lib/hooks';

// A Fleet-styled card backed by a simulated rig instead of a real machine.
// Used as a stand-in on the Fleet surfaces when no real machines are connected.
export function SimFleetCard({ host }: { host: SimulatedHost }) {
  const ctx = useSimulatedHostMarket(host.id);
  const market = ctx.data;
  const p50 = market?.p50_price ?? null;
  const breakEven = market?.break_even_floor ?? host.break_even_floor;
  const p50Proj = market?.projections.find((p) => p.label === 'p50');
  const delta =
    host.current_price_gpu != null && p50 != null ? host.current_price_gpu - p50 : null;

  return (
    <Card className="border-accent/30">
      <CardContent className="flex flex-col gap-3 pt-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-fg">{host.gpu_name ?? 'Unknown GPU'}</span>
              <span className="text-xs text-muted">×{host.num_gpus ?? '?'}</span>
            </div>
            <div className="text-xs text-muted">
              {gb(host.gpu_ram_mb)} · {host.geolocation ?? 'any region'}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {host.autopilot_enabled ? <Badge variant="accent">AUTOPILOT</Badge> : null}
            <Badge variant="accent">SIMULATED</Badge>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Stat
            label="Asking price"
            value={dph(host.current_price_gpu)}
            sub={
              host.current_price_gpu == null ? (
                'not set — see Pricing Control'
              ) : delta != null ? (
                <span className={delta >= 0 ? 'text-emerald-400' : 'text-amber-400'}>
                  {delta >= 0 ? '+' : ''}
                  {dph(delta)} vs p50
                </span>
              ) : (
                'no market ref'
              )
            }
          />
          <Stat
            label="Break-even"
            value={dph(breakEven)}
            sub={
              market?.break_even_percentile != null
                ? `${market.break_even_percentile.toFixed(0)}th pctile of market`
                : 'power floor'
            }
          />
        </div>

        <div className="grid grid-cols-4 gap-2 border-t border-border pt-2 text-xs">
          <div>
            <div className="text-[10px] uppercase text-muted">Market p50</div>
            <div className="tabular-nums text-fg">{dph(p50)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-muted">Reliability</div>
            <div className="tabular-nums text-fg">{(host.reliability * 100).toFixed(1)}%</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-muted">Power</div>
            <div className="tabular-nums text-fg">{host.gpu_max_power_w ?? '?'}W/GPU</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-muted">$/kWh</div>
            <div className="tabular-nums text-fg">{host.kwh_rate ?? '—'}</div>
          </div>
        </div>

        {p50Proj ? (
          <div className="flex items-center justify-between rounded-md border border-border bg-bg/40 px-3 py-2 text-xs">
            <span className="text-muted">Projected net @ p50</span>
            <span className="font-semibold tabular-nums text-fg">
              {usd(p50Proj.net_monthly_100, 0)}/mo
              <span className="ml-1 font-normal text-muted">@100%</span>
            </span>
          </div>
        ) : null}

        <div className="flex items-center justify-between text-[10px] text-muted">
          <span>{host.verified}</span>
          <span>
            {market?.market_computed_at
              ? `market ${relativeTime(market.market_computed_at)}`
              : 'awaiting market data'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// Aggregate stats for the Dashboard Fleet Overview when showing simulated rigs.
export function simFleetSummary(hosts: SimulatedHost[]) {
  const totalGpus = hosts.reduce((acc, h) => acc + (h.num_gpus ?? 0), 0);
  return { rigs: hosts.length, totalGpus };
}
