'use client';

import type { SimulatedHost } from '@vasthost/shared-types';
import { Badge, Button, DataState, Input, SkeletonRows, Stat } from '@vasthost/ui';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { PageHeader } from '@/components/page-header';
import { Widget } from '@/components/widget';
import { shortDate, usd } from '@/lib/format';
import {
  useEarningsDaily,
  useEarningsSummary,
  useMachines,
  useSaveSimulatedHost,
  useSetCostConfig,
  useSimulatedHostMarket,
  useSimulatedHosts,
  useSimulatedHostsMarket,
} from '@/lib/hooks';

const AXIS = { stroke: 'hsl(218 10% 58%)', fontSize: 11 };
const GRID = 'hsl(222 12% 20%)';

export default function EarningsPage() {
  const machines = useMachines();
  const simHosts = useSimulatedHosts();

  // No real machines but simulated rigs exist → sandbox this surface with
  // market-projected numbers instead of the (empty) real earnings feed, same
  // fallback pattern as Fleet and Dashboard.
  const noRealMachines = !machines.isLoading && (machines.data?.length ?? 0) === 0;
  const sims = simHosts.data ?? [];
  if (noRealMachines && sims.length > 0) {
    return <SimulatedEarningsPage hosts={sims} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Earnings & Financials"
        description="What you actually made — after fees and power."
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <EarningsChart />
        </div>
        <AccountBalanceWidget />
      </div>
      <PerMachineTable />
    </div>
  );
}

function EarningsChart() {
  const daily = useEarningsDaily(30);
  return (
    <Widget title="Earnings — last 30 days">
      <DataState
        isLoading={daily.isLoading}
        isError={daily.isError}
        error={daily.error}
        data={daily.data}
        onRetry={daily.refetch}
        isEmpty={(d) => d.length === 0}
        emptyMessage="No earnings recorded yet — sync runs every 30 minutes."
      >
        {(rows) => {
          const data = rows.map((r) => ({
            d: shortDate(r.earn_date),
            GPU: r.gpu_earn,
            Storage: r.storage_earn,
            Bandwidth: r.bw_earn,
          }));
          return (
            <div className="h-64 pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke={GRID} strokeDasharray="2 4" vertical={false} />
                  <XAxis dataKey="d" {...AXIS} tickLine={false} minTickGap={24} />
                  <YAxis {...AXIS} tickLine={false} axisLine={false} width={40} />
                  <Tooltip
                    cursor={{ fill: 'hsl(222 12% 20% / 0.4)' }}
                    contentStyle={{
                      background: 'hsl(222 16% 10%)',
                      border: '1px solid hsl(222 12% 20%)',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="GPU" stackId="a" fill="hsl(243 75% 65%)" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Storage" stackId="a" fill="hsl(190 70% 50%)" />
                  <Bar dataKey="Bandwidth" stackId="a" fill="hsl(160 60% 45%)" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          );
        }}
      </DataState>
    </Widget>
  );
}

function AccountBalanceWidget() {
  const summary = useEarningsSummary();
  return (
    <Widget title="Account">
      <DataState
        isLoading={summary.isLoading}
        isError={summary.isError}
        error={summary.error}
        data={summary.data}
        onRetry={summary.refetch}
      >
        {(s) => (
          <div className="flex flex-col gap-4">
            <Stat label="Current balance" value={usd(s.balance)} />
            <Stat label="All-time earned" value={usd(s.all_time_total)} />
            <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
              <span className="text-muted">Vast service fee</span>
              <span className="tabular-nums text-fg">{usd(s.service_fee)}</span>
            </div>
          </div>
        )}
      </DataState>
    </Widget>
  );
}

function PerMachineTable() {
  const summary = useEarningsSummary();
  const machines = useMachines();
  const setCost = useSetCostConfig();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const powerByMachine = new Map(
    (machines.data ?? []).map((m) => [m.id, m.gpu_max_power_w]),
  );

  const save = (machineId: string) => {
    const raw = drafts[machineId];
    const kwh = Number(raw);
    if (!raw || Number.isNaN(kwh) || kwh <= 0) {
      toast.error('Enter a valid kWh rate');
      return;
    }
    setCost.mutate(
      { machine_id: machineId, kwh_rate: kwh, gpu_max_power_w: powerByMachine.get(machineId) ?? undefined },
      {
        onSuccess: () => toast.success('Cost config saved — margin recalculated'),
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Save failed'),
      },
    );
  };

  return (
    <Widget title="Per-Machine Earnings (month to date)">
      <DataState
        isLoading={summary.isLoading}
        isError={summary.isError}
        error={summary.error}
        data={summary.data}
        onRetry={summary.refetch}
        isEmpty={(d) => d.per_machine.length === 0}
        emptyMessage="No machines yet — connect your Vast key in Settings."
      >
        {(s) => (
          <div className="-mx-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase text-muted">
                  <th className="px-4 py-2 font-medium">Machine</th>
                  <th className="px-4 py-2 text-right font-medium">GPU</th>
                  <th className="px-4 py-2 text-right font-medium">Storage</th>
                  <th className="px-4 py-2 text-right font-medium">BW</th>
                  <th className="px-4 py-2 text-right font-medium">Total</th>
                  <th className="px-4 py-2 text-right font-medium">Power cost</th>
                  <th className="px-4 py-2 text-right font-medium">Net margin</th>
                  <th className="px-4 py-2 font-medium">$/kWh</th>
                </tr>
              </thead>
              <tbody>
                {s.per_machine.map((m) => {
                  const id = m.machine_id ?? '';
                  return (
                    <tr key={id} className="border-b border-border/50 hover:bg-border/20">
                      <td className="px-4 py-2 text-fg">
                        {m.gpu_name ?? '—'}{' '}
                        <span className="text-muted">#{m.vast_machine_id}</span>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted">
                        {usd(m.gpu_earn)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted">
                        {usd(m.storage_earn)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted">
                        {usd(m.bw_earn)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium text-fg">
                        {usd(m.total_earn)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted">
                        {m.est_power_cost != null ? usd(m.est_power_cost) : '—'}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {m.net_margin != null ? (
                          <Badge variant={m.net_margin >= 0 ? 'success' : 'danger'}>
                            {usd(m.net_margin)}
                          </Badge>
                        ) : (
                          <span className="text-muted">set rate →</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1">
                          <Input
                            className="h-7 w-20"
                            inputMode="decimal"
                            placeholder="0.12"
                            value={drafts[id] ?? ''}
                            onChange={(e) =>
                              setDrafts((d) => ({ ...d, [id]: e.target.value }))
                            }
                          />
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-7"
                            disabled={setCost.isPending}
                            onClick={() => save(id)}
                          >
                            Save
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </DataState>
    </Widget>
  );
}

// ── Simulated sandbox (no real hosts on the connected key yet) ──────────────
// Mirrors the real page's layout (chart + account + per-rig table) but sourced
// from the Simulator's live-market projections instead of EarningsDaily rows,
// since simulated rigs have no rental history to aggregate.

function SimulatedEarningsPage({ hosts }: { hosts: SimulatedHost[] }) {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Earnings & Financials"
        description="What you actually made — after fees and power."
      />
      <div className="rounded-md border border-accent/30 bg-accent/5 px-4 py-2 text-xs text-muted">
        No real machines connected — showing projected earnings for your{' '}
        <span className="text-accent">simulated rigs</span> so you can sandbox this surface and
        get recommendations. These switch to live earnings automatically once your Vast account
        has hosted machines.
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SimulatedEarningsChart hosts={hosts} />
        </div>
        <SimulatedAccountWidget hosts={hosts} />
      </div>
      <SimulatedPerHostTable hosts={hosts} />
    </div>
  );
}

function SimulatedEarningsChart({ hosts }: { hosts: SimulatedHost[] }) {
  const results = useSimulatedHostsMarket(hosts);
  const isLoading = results.length > 0 && results.every((r) => r.isLoading);

  const data = hosts
    .map((h, i) => {
      const p50 = results[i]?.data?.projections.find((p) => p.label === 'p50');
      if (!p50) return null;
      return {
        d: h.name ?? h.gpu_name ?? 'rig',
        Kept: Math.round(p50.kept_per_hr * 730),
        Power: -Math.round(p50.power_per_hr * 730),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r != null);

  return (
    <Widget title="Projected Earnings — simulated fleet (p50, monthly @ 100% util)">
      <DataState
        isLoading={isLoading}
        data={data}
        isEmpty={(d) => d.length === 0}
        emptyMessage="No market data yet for your simulated rigs — the Observer needs to aggregate a distribution for these GPU classes."
      >
        {(rows) => (
          <div className="h-64 pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid stroke={GRID} strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="d" {...AXIS} tickLine={false} minTickGap={24} />
                <YAxis {...AXIS} tickLine={false} axisLine={false} width={40} />
                <Tooltip
                  cursor={{ fill: 'hsl(222 12% 20% / 0.4)' }}
                  contentStyle={{
                    background: 'hsl(222 16% 10%)',
                    border: '1px solid hsl(222 12% 20%)',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="Kept" stackId="a" fill="hsl(243 75% 65%)" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Power" stackId="a" fill="hsl(0 65% 60%)" radius={[0, 0, 2, 2]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </DataState>
    </Widget>
  );
}

function SimulatedAccountWidget({ hosts }: { hosts: SimulatedHost[] }) {
  const results = useSimulatedHostsMarket(hosts);
  const isLoading = results.length > 0 && results.every((r) => r.isLoading);

  let net100 = 0;
  let net70 = 0;
  let haveAny = false;
  for (const r of results) {
    const p50 = r.data?.projections.find((p) => p.label === 'p50');
    if (p50) {
      haveAny = true;
      net100 += p50.net_monthly_100;
      net70 += p50.net_monthly_70;
    }
  }

  return (
    <Widget title="Account">
      <div className="flex flex-col gap-4">
        {isLoading ? (
          <SkeletonRows rows={3} />
        ) : haveAny ? (
          <>
            <Stat
              label="Projected monthly (p50 @ 100%)"
              value={usd(net100, 0)}
              sub="after fee & power"
            />
            <Stat label="Projected monthly (p50 @ 70%)" value={usd(net70, 0)} />
            <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
              <span className="text-muted">Simulated rigs</span>
              <span className="tabular-nums text-fg">{hosts.length}</span>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">
            No market data yet for your simulated rigs — the Observer needs to aggregate a
            distribution for these GPU classes.
          </p>
        )}
        <Badge variant="accent" className="w-fit">
          Simulated
        </Badge>
      </div>
    </Widget>
  );
}

function SimulatedPerHostTable({ hosts }: { hosts: SimulatedHost[] }) {
  const save = useSaveSimulatedHost();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const saveRate = (host: SimulatedHost) => {
    const raw = drafts[host.id];
    const kwh = Number(raw);
    if (!raw || Number.isNaN(kwh) || kwh <= 0) {
      toast.error('Enter a valid kWh rate');
      return;
    }
    // Full-record PUT — the API replaces the whole config, so spread the
    // existing host rather than sending only the changed field.
    save.mutate(
      { ...host, kwh_rate: kwh },
      {
        onSuccess: () => toast.success('Cost config saved — projection recalculated'),
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Save failed'),
      },
    );
  };

  return (
    <Widget title="Per-Rig Projected Earnings (simulated, p50 · monthly @ 100% util)">
      <div className="-mx-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase text-muted">
              <th className="px-4 py-2 font-medium">Rig</th>
              <th className="px-4 py-2 text-right font-medium">Gross</th>
              <th className="px-4 py-2 text-right font-medium">Kept (after fee)</th>
              <th className="px-4 py-2 text-right font-medium">Power cost</th>
              <th className="px-4 py-2 text-right font-medium">Net margin</th>
              <th className="px-4 py-2 font-medium">$/kWh</th>
            </tr>
          </thead>
          <tbody>
            {hosts.map((h) => (
              <SimHostEarningsRow
                key={h.id}
                host={h}
                draft={drafts[h.id] ?? ''}
                onDraftChange={(v) => setDrafts((d) => ({ ...d, [h.id]: v }))}
                onSave={() => saveRate(h)}
                saving={save.isPending}
              />
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted">
        Projections use live market p50 pricing for each rig&rsquo;s GPU class, after the
        platform fee, minus estimated power draw — simulated rigs have no rental history to
        aggregate. Edit $/kWh to see recommendations update, or tune GPU/power/fee assumptions in{' '}
        <Link href="/simulator" className="text-accent hover:underline">
          Simulator
        </Link>
        .
      </p>
    </Widget>
  );
}

function SimHostEarningsRow({
  host,
  draft,
  onDraftChange,
  onSave,
  saving,
}: {
  host: SimulatedHost;
  draft: string;
  onDraftChange: (value: string) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const ctx = useSimulatedHostMarket(host.id);
  const p50 = ctx.data?.projections.find((p) => p.label === 'p50');

  return (
    <tr className="border-b border-border/50 hover:bg-border/20">
      <td className="px-4 py-2 text-fg">
        {host.gpu_name ?? '—'} <span className="text-muted">×{host.num_gpus ?? 1}</span>
      </td>
      <td className="px-4 py-2 text-right tabular-nums text-muted">
        {p50 ? usd(p50.gross_per_hr * 730, 0) : ctx.isLoading ? '…' : '—'}
      </td>
      <td className="px-4 py-2 text-right tabular-nums text-muted">
        {p50 ? usd(p50.kept_per_hr * 730, 0) : ctx.isLoading ? '…' : '—'}
      </td>
      <td className="px-4 py-2 text-right tabular-nums text-muted">
        {p50 ? usd(p50.power_per_hr * 730, 0) : '—'}
      </td>
      <td className="px-4 py-2 text-right tabular-nums">
        {p50 ? (
          <Badge variant={p50.net_monthly_100 >= 0 ? 'success' : 'danger'}>
            {usd(p50.net_monthly_100, 0)}
          </Badge>
        ) : (
          <span className="text-muted">no market data</span>
        )}
      </td>
      <td className="px-4 py-2">
        <div className="flex items-center gap-1">
          <Input
            className="h-7 w-20"
            inputMode="decimal"
            placeholder={host.kwh_rate != null ? String(host.kwh_rate) : '0.12'}
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
          />
          <Button
            size="sm"
            variant="secondary"
            className="h-7"
            disabled={saving}
            onClick={onSave}
          >
            Save
          </Button>
        </div>
      </td>
    </tr>
  );
}
