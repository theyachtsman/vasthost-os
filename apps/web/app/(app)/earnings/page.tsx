'use client';

import { Badge, Button, DataState, Input, Stat } from '@vasthost/ui';
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
  useSetCostConfig,
} from '@/lib/hooks';

const AXIS = { stroke: 'hsl(218 10% 58%)', fontSize: 11 };
const GRID = 'hsl(222 12% 20%)';

export default function EarningsPage() {
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
