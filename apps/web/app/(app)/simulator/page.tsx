'use client';

import type { SimulatedHost } from '@vasthost/shared-types';
import { Badge, Button, Card, CardContent, DataState, Input, Label } from '@vasthost/ui';
import { Pencil, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/page-header';
import { Widget } from '@/components/widget';
import { breakEvenFloor } from '@/lib/calc';
import { dph, num, pct, relativeTime, usd } from '@/lib/format';
import {
  useDeleteSimulatedHost,
  useMarketMeta,
  useRunAutopilotStep,
  useSaveSimulatedHost,
  useSimulatedHostMarket,
  useSimulatedHosts,
  useSimulatedPriceHistory,
} from '@/lib/hooks';

type Draft = {
  id?: string;
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
  // Raw text, not a number — blank means "unset" (distinct from 0).
  current_price_gpu: string;
  autopilot_enabled: boolean;
  min_price_gpu: string;
  max_price_gpu: string;
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
  // Pre-meta placeholder; replaced by the platform default (MARKET_FEE_PCT) once
  // /market/meta loads, unless the user overrides it.
  vast_service_fee_pct: 0.25,
  current_price_gpu: '',
  autopilot_enabled: false,
  min_price_gpu: '',
  max_price_gpu: '',
};

function draftFromHost(host: SimulatedHost): Draft {
  return {
    id: host.id,
    name: host.name ?? '',
    gpu_name: host.gpu_name ?? '',
    num_gpus: host.num_gpus ?? 1,
    gpu_ram_mb: host.gpu_ram_mb ?? 0,
    gpu_max_power_w: host.gpu_max_power_w ?? 0,
    verified: host.verified,
    reliability: host.reliability,
    geolocation: host.geolocation ?? '',
    kwh_rate: host.kwh_rate ?? 0,
    vast_service_fee_pct: host.vast_service_fee_pct,
    current_price_gpu: host.current_price_gpu != null ? String(host.current_price_gpu) : '',
    autopilot_enabled: host.autopilot_enabled,
    min_price_gpu: host.min_price_gpu != null ? String(host.min_price_gpu) : '',
    max_price_gpu: host.max_price_gpu != null ? String(host.max_price_gpu) : '',
  };
}

export default function SimulatorPage() {
  const hosts = useSimulatedHosts();
  const save = useSaveSimulatedHost();
  const del = useDeleteSimulatedHost();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const editing = draft.id != null;

  // Seed the per-rig fee from the platform default (MARKET_FEE_PCT, exposed via
  // /market/meta) so there's a single source of truth — until the user overrides
  // it. Per-rig override stays a feature. Marking feeTouched on edit-load stops
  // this from clobbering a rig's own already-set fee.
  const platformFee = useMarketMeta().data?.fee_pct ?? null;
  const feeTouched = useRef(false);
  useEffect(() => {
    if (platformFee != null && !feeTouched.current) {
      setDraft((d) => ({ ...d, vast_service_fee_pct: platformFee }));
    }
  }, [platformFee]);

  const floor = breakEvenFloor(draft.gpu_max_power_w, draft.kwh_rate, draft.vast_service_fee_pct);

  const set =
    <K extends keyof Draft>(key: K) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (key === 'vast_service_fee_pct') feeTouched.current = true;
      const raw = e.target.value;
      const numeric = typeof EMPTY[key] === 'number';
      setDraft((d) => ({ ...d, [key]: numeric ? Number(raw) : raw }) as Draft);
    };

  const startEdit = (host: SimulatedHost) => {
    feeTouched.current = true;
    setDraft(draftFromHost(host));
  };

  const cancelEdit = () => {
    feeTouched.current = false;
    setDraft(EMPTY);
  };

  const setAutopilotEnabled = (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft((d) => ({ ...d, autopilot_enabled: e.target.checked }));

  const submit = () => {
    const priceRaw = draft.current_price_gpu.trim();
    const minRaw = draft.min_price_gpu.trim();
    const maxRaw = draft.max_price_gpu.trim();
    save.mutate(
      {
        id: draft.id,
        name: draft.name,
        gpu_name: draft.gpu_name,
        num_gpus: draft.num_gpus,
        gpu_ram_mb: draft.gpu_ram_mb,
        gpu_max_power_w: draft.gpu_max_power_w,
        verified: draft.verified,
        reliability: draft.reliability,
        geolocation: draft.geolocation || null,
        kwh_rate: draft.kwh_rate,
        vast_service_fee_pct: draft.vast_service_fee_pct,
        current_price_gpu: priceRaw === '' ? null : Number(priceRaw),
        autopilot_enabled: draft.autopilot_enabled,
        min_price_gpu: minRaw === '' ? null : Number(minRaw),
        max_price_gpu: maxRaw === '' ? null : Number(maxRaw),
      },
      {
        onSuccess: () => {
          toast.success(editing ? 'Simulated host updated' : 'Simulated host saved');
          feeTouched.current = false;
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
        description="Define synthetic host configs for sandbox testing — including the rig's asking price, which Pricing Control can recommend against and update."
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Widget title={editing ? `Edit — ${draft.name || draft.gpu_name || 'rig'}` : 'New Config'}>
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
            <Field label="Est. platform fee (0–1)">
              <Input
                type="number"
                step="0.01"
                value={draft.vast_service_fee_pct}
                onChange={set('vast_service_fee_pct')}
              />
            </Field>
            <Field label="Current price ($/GPU·hr)">
              <Input
                type="number"
                step="0.001"
                placeholder="unset — Pricing Control can set this"
                value={draft.current_price_gpu}
                onChange={set('current_price_gpu')}
              />
            </Field>
          </div>

          <div className="mt-3 rounded-md border border-border bg-bg/40 p-3">
            <label className="flex items-center gap-2 text-sm text-fg">
              <input
                type="checkbox"
                checked={draft.autopilot_enabled}
                onChange={setAutopilotEnabled}
                className="accent-accent"
              />
              Autopilot — bounded auto-repricing
            </label>
            <p className="mt-1 text-[11px] text-muted">
              Every ~15 min, steps the price down when demand is soft/cold or up when it&rsquo;s
              hot (holds on warm/ambiguous signal). Never moves outside the rails below, and
              never below break-even.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Min price ($/GPU·hr)">
                <Input
                  type="number"
                  step="0.001"
                  placeholder="floor = break-even"
                  value={draft.min_price_gpu}
                  onChange={set('min_price_gpu')}
                />
              </Field>
              <Field label="Max price ($/GPU·hr)">
                <Input
                  type="number"
                  step="0.001"
                  placeholder="no ceiling"
                  value={draft.max_price_gpu}
                  onChange={set('max_price_gpu')}
                />
              </Field>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between rounded-md border border-border bg-bg/40 p-3">
            <div>
              <div className="text-[10px] uppercase text-muted">Est. break-even floor</div>
              <div className="text-lg font-semibold tabular-nums text-fg">{dph(floor)}</div>
              <div className="text-[11px] text-muted">
                min $/GPU-hr to cover power, assuming a ~{pct(draft.vast_service_fee_pct * 100, 0)}{' '}
                platform fee (estimate)
              </div>
            </div>
            <div className="flex items-center gap-2">
              {editing ? (
                <Button variant="ghost" onClick={cancelEdit}>
                  Cancel
                </Button>
              ) : null}
              <Button onClick={submit} disabled={save.isPending}>
                {editing ? 'Save changes' : 'Save config'}
              </Button>
            </div>
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
                  <Card
                    key={h.id}
                    className={h.id === draft.id ? 'border-accent/50' : 'border-border/70'}
                  >
                    <CardContent className="flex items-center justify-between gap-3 p-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-fg">{h.name ?? h.gpu_name}</span>
                          <Badge variant="muted">{h.verified}</Badge>
                          {h.autopilot_enabled ? (
                            <Badge variant="accent">AUTOPILOT</Badge>
                          ) : null}
                        </div>
                        <div className="text-xs text-muted">
                          {h.gpu_name} ×{h.num_gpus} · {h.gpu_max_power_w ?? '?'}W · ${h.kwh_rate}/kWh
                          {h.autopilot_enabled ? (
                            <>
                              {' '}
                              · rails {h.min_price_gpu != null ? dph(h.min_price_gpu) : dph(h.break_even_floor)}
                              –{h.max_price_gpu != null ? dph(h.max_price_gpu) : 'no ceiling'}
                            </>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-[10px] uppercase text-muted">Asking price</div>
                          <div className="text-sm font-semibold tabular-nums text-fg">
                            {h.current_price_gpu != null ? dph(h.current_price_gpu) : '—'}
                          </div>
                        </div>
                        <div className="text-right">
                          <div
                            className="text-[10px] uppercase text-muted"
                            title={`Estimate — assumes a ~${pct(h.vast_service_fee_pct * 100, 0)} platform fee`}
                          >
                            Est. break-even
                          </div>
                          <div className="text-sm font-semibold tabular-nums text-fg">
                            {dph(h.break_even_floor)}
                          </div>
                        </div>
                        {h.autopilot_enabled ? <RunAutopilotStepButton host={h} /> : null}
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Edit config"
                          onClick={() => startEdit(h)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Delete config"
                          onClick={() =>
                            del.mutate(h.id, {
                              onSuccess: () => {
                                toast.success('Deleted');
                                if (h.id === draft.id) cancelEdit();
                              },
                            })
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                    <SimMarketPanel host={h} />
                    <AutopilotHistory host={h} />
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
          <div
            className="text-[10px] uppercase text-muted"
            title={`Estimate — assumes a ~${pct(host.vast_service_fee_pct * 100, 0)} platform fee`}
          >
            est. break-even
          </div>
          <div className="text-xs font-semibold tabular-nums text-emerald-400">
            {dph(d.break_even_floor)}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-md border border-accent/30 bg-accent/5 px-2 py-1.5 text-xs">
        <span className="text-muted">Your ask</span>
        <span className="font-semibold tabular-nums text-accent">
          {host.current_price_gpu != null
            ? dph(host.current_price_gpu)
            : 'not set — see Pricing Control'}
        </span>
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
                <th className="px-1 py-1 text-left font-medium">Est. net @ p50</th>
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

function RunAutopilotStepButton({ host }: { host: SimulatedHost }) {
  const run = useRunAutopilotStep();
  return (
    <Button
      size="sm"
      variant="secondary"
      disabled={run.isPending}
      onClick={() =>
        run.mutate(host.id, {
          onSuccess: (result) => {
            if (result.moved) {
              const label = result.reason?.replace('auto_', '').replaceAll('_', ' ') ?? 'moved';
              toast.success(`${label} → ${dph(result.new_price_gpu)}`);
            } else {
              toast('No move — demand is holding (Warm) or already at a rail.');
            }
          },
          onError: (err) =>
            toast.error(err instanceof Error ? err.message : 'Autopilot step failed'),
        })
      }
    >
      {run.isPending ? 'Running…' : 'Run step now'}
    </Button>
  );
}

function AutopilotHistory({ host }: { host: SimulatedHost }) {
  const history = useSimulatedPriceHistory(host.id);
  const rows = (history.data ?? []).slice(0, 5);
  if (rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 border-t border-border bg-bg/20 px-3 py-2">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted">
        Recent price changes
      </span>
      {rows.map((e) => (
        <div key={e.id} className="flex items-center gap-2 text-[11px]">
          <Badge variant={e.reason?.startsWith('auto') ? 'accent' : 'muted'}>
            {e.reason?.replace('auto_', '').replaceAll('_', ' ') ?? 'change'}
          </Badge>
          <span className="tabular-nums text-muted">
            {dph(e.old_price_gpu)} → {dph(e.new_price_gpu)}
          </span>
          <span className="text-muted">· {relativeTime(e.changed_at)}</span>
        </div>
      ))}
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
