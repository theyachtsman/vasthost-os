'use client';

import type { SimulatedHost } from '@vasthost/shared-types';
import { Badge, Button, Card, CardContent, DataState, Input, Label } from '@vasthost/ui';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/page-header';
import { Widget } from '@/components/widget';
import { breakEvenFloor } from '@/lib/calc';
import { dph } from '@/lib/format';
import {
  useDeleteSimulatedHost,
  useSaveSimulatedHost,
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
