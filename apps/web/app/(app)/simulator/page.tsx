'use client';

import type { SimulatedHost } from '@vasthost/shared-types';
import { Badge, Button, Card, CardContent, DataState, Input, Label } from '@vasthost/ui';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/page-header';
import { Widget } from '@/components/widget';
import { breakEvenFloor } from '@/lib/calc';
import { dph, num, pct, relativeTime, usd } from '@/lib/format';
import {
  useDeleteSimulatedHost,
  useSaveSimulatedHost,
  useSimulatedHostMarket,
  useSimulatedHosts,
} from '@/lib/hooks';

type Draft = {
  name: string;
  gpu_name: string;
  num_gpus: number;
  gpu_ram_mb: number;
  gpu_max_power_w: number;
  verified: string;
  reliability: number;
  geolocation: string;
  kwh_rate: number;
  vast_service_fee_pct: number;
};

const EMPTY: Draft = {
  name: 'New simulated host',
  gpu_name: 'RTX 4090',
  num_gpus: 1,
  gpu_ram_mb: 24576,
  gpu_max_power_w: 450,
  verified: 'unverified',
  reliability: 0.95,
  geolocation: '',
  kwh_rate: 0.12,
  vast_service_fee_pct: 0.2,
};

export default function SimulatorPage() {
  const hosts = useSimulatedHosts();
  const save = useSaveSimulatedHost();
  const del = useDeleteSimulatedHost();
  const [draft, setDraft] = useState<Draft>(EMPTY);

  const floor = breakEvenFloor(draft.gpu_max_power_w, draft.kwh_rate, draft.vast_service_fee_pct);

  const set =
    <K extends keyof Draft>(key: K) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      const numeric = typeof EMPTY[key] === 'number';
      setDraft((d) => ({ ...d, [key]: numeric ? Number(raw) : raw }) as Draft);
    };

  const submit = () => {
    save.mutate(
      { ...draft, geolocation: draft.geolocation || null },
      {
        onSuccess: () => {
          toast.success('Simulated host saved');
          setDraft(EMPTY);
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Save failed'),
      },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Simulator"
        description="Define synthetic host configs for sandbox testing. Config only in Phase 0 — no pricing actions yet."
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Widget title="New Config">
          <div className="grid grid-cols-2 gap-3 pt-1">
            <Field label="Name"><Input value={draft.name} onChange={set('name')} /></Field>
            <Field label="GPU name"><Input value={draft.gpu_name} onChange={set('gpu_name')} /></Field>
            <Field label="GPU count">
              <Input type="number" value={draft.num_gpus} onChange={set('num_gpus')} />
            </Field>
            <Field label="VRAM (MB)">
              <Input type="number" value={draft.gpu_ram_mb} onChange={set('gpu_ram_mb')} />
            </Field>
            <Field label="Power (W/GPU)">
              <Input type="number" value={draft.gpu_max_power_w} onChange={set('gpu_max_power_w')} />
            </Field>
            <Field label="Region"><Input value={draft.geolocation} onChange={set('geolocation')} placeholder="US" /></Field>
            <Field label="Verified"><Input value={draft.verified} onChange={set('verified')} /></Field>
            <Field label="Reliability (0–1)">
              <Input type="number" step="0.01" value={draft.reliability} onChange={set('reliability')} />
            </Field>
            <Field label="$/kWh">
              <Input type="number" step="0.01" value={draft.kwh_rate} onChange={set('kwh_rate')} />
            </Field>
            <Field label="Service fee (0–1)">
              <Input
                type="number"
                step="0.01"
                value={draft.vast_service_fee_pct}
                onChange={set('vast_service_fee_pct')}
              />
            </Field>
          </div>

          <div className="mt-4 flex items-center justify-between rounded-md border border-border bg-bg/40 p-3">
            <div>
              <div className="text-[10px] uppercase text-muted">Break-even floor</div>
              <div className="text-lg font-semibold tabular-nums text-fg">{dph(floor)}</div>
              <div className="text-[11px] text-muted">min $/GPU-hr to cover power after fees</div>
            </div>
            <Button onClick={submit} disabled={save.isPending}>
              Save config
            </Button>
          </div>
        </Widget>

        <Widget title="Saved Configs">
          <DataState
            isLoading={hosts.isLoading}
            isError={hosts.isError}
            error={hosts.error}
            data={hosts.data}
            onRetry={hosts.refetch}
            isEmpty={(d) => d.length === 0}
            emptyMessage="No simulated hosts yet — create one on the left."
          >
            {(rows) => (
              <div className="flex flex-col gap-2 pt-1">
                {rows.map((h: SimulatedHost) => (
                  <Card key={h.id} className="border-border/70">
                    <CardContent className="flex items-center justify-between gap-3 p-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-fg">{h.name ?? h.gpu_name}</span>
                          <Badge variant="muted">{h.verified}</Badge>
                        </div>
                        <div className="text-xs text-muted">
                          {h.gpu_name} ×{h.num_gpus} · {h.gpu_max_power_w ?? '?'}W · ${h.kwh_rate}/kWh
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-[10px] uppercase text-muted">Break-even</div>
                          <div className="text-sm font-semibold tabular-nums text-fg">
                            {dph(h.break_even_floor)}
                          </div>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Delete config"
                          onClick={() =>
                            del.mutate(h.id, {
                              onSuccess: () => toast.success('Deleted'),
                            })
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                    <SimMarketPanel host={h} />
                  </Card>
                ))}
              </div>
            )}
          </DataState>
        </Widget>
      </div>
    </div>
  );
}

function SimMarketPanel({ host }: { host: SimulatedHost }) {
  const ctx = useSimulatedHostMarket(host.id);

  if (ctx.isLoading) {
    return (
      <div className="border-t border-border px-3 py-2 text-xs text-muted">
        Loading live market…
      </div>
    );
  }
  if (ctx.isError || !ctx.data) {
    return (
      <div className="border-t border-border px-3 py-2 text-xs text-red-400">
        Couldn’t load market context.
      </div>
    );
  }

  const d = ctx.data;
  if (!d.has_market_data) {
    return (
      <div className="border-t border-border px-3 py-2 text-xs text-muted">
        No market data for {d.gpu_name} yet — the Observer needs to aggregate a distribution
        (every 15 min). Add it under Settings → Watched Classes.
      </div>
    );
  }

  const p50 = d.projections.find((p) => p.label === 'p50');

  return (
    <div className="flex flex-col gap-3 border-t border-border bg-bg/30 px-3 py-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted">
          Live market · {d.gpu_name} ×{d.market_bucket_num_gpus}
          {d.market_bucket_num_gpus !== d.num_gpus ? ' (per-GPU)' : ''}
        </span>
        <span className="text-[10px] text-muted">
          updated {relativeTime(d.market_computed_at)}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center">
        {(
          [
            ['p25', d.p25_price],
            ['p50', d.p50_price],
            ['p75', d.p75_price],
          ] as const
        ).map(([label, val]) => (
          <div key={label} className="rounded-md border border-border bg-surface/60 py-1.5">
            <div className="text-[10px] uppercase text-muted">{label}</div>
            <div className="text-xs font-semibold tabular-nums text-fg">{dph(val)}</div>
          </div>
        ))}
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 py-1.5">
          <div className="text-[10px] uppercase text-muted">break-even</div>
          <div className="text-xs font-semibold tabular-nums text-emerald-400">
            {dph(d.break_even_floor)}
          </div>
        </div>
      </div>

      <p className="text-[11px] text-muted">
        Break-even sits at the{' '}
        <span className="font-medium text-fg">
          {d.break_even_percentile != null ? `${d.break_even_percentile.toFixed(0)}th` : '—'}
        </span>{' '}
        percentile of the market{d.supply_count != null ? ` (${num(d.supply_count)} offers` : ''}
        {d.utilization_pct != null ? `, ${pct(d.utilization_pct)} utilized)` : d.supply_count != null ? ')' : ''}.
      </p>

      {p50 ? (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase text-muted">
                <th className="px-1 py-1 text-left font-medium">Projected net @ p50</th>
                <th className="px-1 py-1 text-right font-medium">100%</th>
                <th className="px-1 py-1 text-right font-medium">70%</th>
                <th className="px-1 py-1 text-right font-medium">50%</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-1 py-1 text-muted">
                  {dph(p50.price_gpu)} × {d.num_gpus} GPU, after {pct(host.vast_service_fee_pct * 100, 0)} fee
                </td>
                <td className="px-1 py-1 text-right font-semibold tabular-nums text-fg">
                  {usd(p50.net_monthly_100, 0)}/mo
                </td>
                <td className="px-1 py-1 text-right tabular-nums text-muted">
                  {usd(p50.net_monthly_70, 0)}/mo
                </td>
                <td className="px-1 py-1 text-right tabular-nums text-muted">
                  {usd(p50.net_monthly_50, 0)}/mo
                </td>
              </tr>
              <tr className="text-[11px] text-muted">
                <td className="px-1 pt-0.5">net/hr {usd(p50.net_per_hr)} (power {usd(p50.power_per_hr)}/hr)</td>
                <td colSpan={3} />
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
