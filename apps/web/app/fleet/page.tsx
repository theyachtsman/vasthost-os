'use client';

import type { Machine } from '@vasthost/shared-types';
import { Badge, Card, CardContent, DataState, Stat } from '@vasthost/ui';
import { useState } from 'react';

import { PageHeader } from '@/components/page-header';
import { ReliabilityTrend } from '@/components/reliability-trend';
import { Widget } from '@/components/widget';
import { dph, gb, num, relativeTime, untilTime } from '@/lib/format';
import { useAccountStatus, useDistribution, useMachine, useMachines } from '@/lib/hooks';

function statusOf(m: Machine): { label: string; variant: 'success' | 'warning' | 'muted' | 'danger' } {
  if (m.is_listed && !m.is_rentable) return { label: 'RENTED', variant: 'success' };
  if (m.is_rentable) return { label: 'IDLE', variant: 'warning' };
  if (m.is_listed === false) return { label: 'UNLISTED', variant: 'muted' };
  return { label: 'OFFLINE', variant: 'danger' };
}

export default function FleetPage() {
  const machines = useMachines();
  const account = useAccountStatus();
  const [openId, setOpenId] = useState<string | null>(null);

  const connected = account.data?.connected;
  const emptyMessage = connected
    ? `No host machines found on ${account.data?.email ?? 'this account'}. This Vast account has no listed machines yet — once you host (and the key has the machine_read permission), they appear here automatically.`
    : 'Connect your Vast key in Settings to sync your fleet.';

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Fleet Health" description="Per-machine status, pricing, and reliability." />
      <DataState
        isLoading={machines.isLoading}
        isError={machines.isError}
        error={machines.error}
        data={machines.data}
        onRetry={machines.refetch}
        isEmpty={(d) => d.length === 0}
        emptyMessage={emptyMessage}
        skeleton={
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Card key={i} className="h-44 animate-pulse" />
            ))}
          </div>
        }
      >
        {(rows) => (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((m) => (
              <MachineCard
                key={m.id}
                machine={m}
                open={openId === m.id}
                onToggle={() => setOpenId(openId === m.id ? null : m.id)}
              />
            ))}
          </div>
        )}
      </DataState>
    </div>
  );
}

function MachineCard({
  machine,
  open,
  onToggle,
}: {
  machine: Machine;
  open: boolean;
  onToggle: () => void;
}) {
  const status = statusOf(machine);
  const dist = useDistribution(machine.gpu_name ?? '', machine.num_gpus ?? 1);
  const p50 = dist.data?.p50_price ?? null;
  const delta =
    machine.current_price_gpu != null && p50 != null ? machine.current_price_gpu - p50 : null;
  const expiry = untilTime(machine.offer_end_date);

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-fg">{machine.gpu_name ?? 'Unknown GPU'}</span>
              <span className="text-xs text-muted">×{machine.num_gpus ?? '?'}</span>
            </div>
            <div className="text-xs text-muted">
              {gb(machine.gpu_ram_mb)} · #{machine.machine_id}
            </div>
          </div>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Stat
            label="Asking price"
            value={dph(machine.current_price_gpu)}
            sub={
              delta != null ? (
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
            label="Reliability"
            value={machine.reliability != null ? `${(machine.reliability * 100).toFixed(1)}%` : '—'}
          />
        </div>

        <div className="flex items-center justify-between border-t border-border pt-2 text-xs">
          <span className={expiry.soon ? 'text-amber-400' : 'text-muted'}>
            Offer ends in {expiry.label}
          </span>
          <button onClick={onToggle} className="text-accent hover:underline">
            {open ? 'Hide' : 'Details'}
          </button>
        </div>

        {open ? <MachineDetail id={machine.id} /> : null}
      </CardContent>
    </Card>
  );
}

function MachineDetail({ id }: { id: string }) {
  const detail = useMachine(id);
  return (
    <div className="mt-1 border-t border-border pt-3">
      <DataState
        isLoading={detail.isLoading}
        isError={detail.isError}
        error={detail.error}
        data={detail.data}
        onRetry={detail.refetch}
      >
        {(d) => {
          const active = d.contracts.find((c) => c.status === 'active');
          return (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">Reliability trend</span>
                <ReliabilityTrend history={d.reliability_history} />
              </div>
              {active ? (
                <div className="rounded-md border border-border bg-bg/40 p-2 text-xs">
                  <div className="mb-1 font-medium text-fg">Active contract</div>
                  <div className="flex justify-between text-muted">
                    <span>{active.rental_type ?? 'on-demand'}</span>
                    <span>{active.num_gpus_rented ?? '?'} GPU</span>
                    <span className="tabular-nums">{dph(active.locked_price_gpu)} locked</span>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-muted">No active contract.</div>
              )}
              <UtilizationTimeline contracts={d.contracts} />
            </div>
          );
        }}
      </DataState>
    </div>
  );
}

function UtilizationTimeline({
  contracts,
}: {
  contracts: { rented_at: string | null; ended_at: string | null; status: string | null }[];
}) {
  const now = Date.now();
  const start = now - 7 * 86400000;
  const span = now - start;
  const segs = contracts
    .filter((c) => c.rented_at)
    .map((c) => {
      const s = Math.max(new Date(c.rented_at!).getTime(), start);
      const e = c.ended_at ? new Date(c.ended_at).getTime() : now;
      return { left: ((s - start) / span) * 100, width: (Math.max(0, e - s) / span) * 100 };
    })
    .filter((s) => s.width > 0);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[10px] uppercase text-muted">
        <span>Utilization · 7d</span>
        <span>{num(segs.length)} rental{segs.length === 1 ? '' : 's'}</span>
      </div>
      <div className="relative h-3 w-full overflow-hidden rounded-sm bg-border/40">
        {segs.map((s, i) => (
          <div
            key={i}
            className="absolute top-0 h-full bg-accent/70"
            style={{ left: `${s.left}%`, width: `${Math.max(1, s.width)}%` }}
          />
        ))}
      </div>
    </div>
  );
}
