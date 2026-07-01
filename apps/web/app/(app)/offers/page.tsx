'use client';

import type { BulkApplyResult, DefjobConfig, SimulatedHost } from '@vasthost/shared-types';
import { Badge, Button, DataState, Input, Label, SkeletonRows } from '@vasthost/ui';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/page-header';
import { Widget } from '@/components/widget';
import { dph } from '@/lib/format';
import {
  type DefjobInput,
  useBulkApplyPrice,
  useBulkApplySimulatedPrice,
  useMachines,
  usePricingRecommendations,
  useProviderKeys,
  useRemoveDefjob,
  useRemoveSimulatedDefjob,
  useSetDefjob,
  useSetSimulatedDefjob,
  useSimulatedHosts,
  useSimulatedHostsPricingRecommendations,
} from '@/lib/hooks';

// One normalized row shape so the table/selection/submit logic is identical
// for real machines and simulated rigs — only how the rows are sourced differs.
type OfferRow = {
  id: string;
  label: string;
  currentPrice: number | null;
  recommendedPrice: number | null;
  demandLabel: string | null;
  hasMarketData: boolean;
  isRented: boolean;
  lockedPrice: number | null;
  simulated: boolean;
};

export default function OffersPage() {
  const keys = useProviderKeys();
  const machines = useMachines();
  const simHosts = useSimulatedHosts();
  const connected = (keys.data ?? []).some((k) => k.provider === 'vast' && k.is_active);

  if (!keys.isLoading && !connected) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Offer Management"
          description="Bulk-apply recommended prices and configure backfill jobs across your fleet."
        />
        <Widget title="Bulk price ops">
          <p className="py-6 text-sm text-muted">
            Connect your Vast key in{' '}
            <Link href="/settings" className="text-accent hover:underline">
              Settings
            </Link>{' '}
            (with the <span className="text-fg">machine write / pricing</span> scope) to bulk-apply
            prices and configure backfill jobs.
          </p>
        </Widget>
      </div>
    );
  }

  // No real machines but simulated rigs exist → sandbox this surface, same
  // fallback pattern as Earnings/Fleet/Pricing.
  const noRealMachines = !machines.isLoading && (machines.data?.length ?? 0) === 0;
  const sims = simHosts.data ?? [];
  if (noRealMachines && sims.length > 0) {
    return <SimulatedBulkPriceOps hosts={sims} />;
  }

  return <BulkPriceOps />;
}

function BulkPriceOps() {
  const recos = usePricingRecommendations();
  const apply = useBulkApplyPrice();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastResult, setLastResult] = useState<BulkApplyResult | null>(null);

  const rows: OfferRow[] = (recos.data ?? []).map((r) => ({
    id: r.machine_id,
    label: `${r.gpu_name ?? 'GPU'} ×${r.num_gpus ?? '?'} · machine ${r.vast_machine_id}`,
    currentPrice: r.current_price_gpu,
    recommendedPrice: r.recommended_price_gpu,
    demandLabel: r.demand_label,
    hasMarketData: r.has_market_data,
    isRented: r.is_rented,
    lockedPrice: r.locked_price_gpu,
    simulated: false,
  }));

  const submit = (ids: string[]) =>
    apply.mutate(ids, {
      onSuccess: (result) => {
        setLastResult(result);
        setSelected(new Set());
        toastResult(result);
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Bulk apply failed'),
    });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Offer Management"
        description="Apply each machine's recommended price in one pass, and configure backfill jobs so idle GPU time still earns something."
      />
      <Widget title="Bulk price ops">
        <DataState
          isLoading={recos.isLoading}
          isError={recos.isError}
          error={recos.error}
          data={rows}
          onRetry={recos.refetch}
          isEmpty={(d) => d.length === 0}
          emptyMessage="No machines on your account yet — they appear here once your fleet syncs."
        >
          {(list) => (
            <OfferTable
              rows={list}
              selected={selected}
              onSelectedChange={setSelected}
              pending={apply.isPending}
              onSubmit={submit}
            />
          )}
        </DataState>
      </Widget>
      {lastResult ? <BulkResultPanel result={lastResult} /> : null}
      <DefjobPanel />
    </div>
  );
}

function SimulatedBulkPriceOps({ hosts }: { hosts: SimulatedHost[] }) {
  const results = useSimulatedHostsPricingRecommendations(hosts);
  const apply = useBulkApplySimulatedPrice();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastResult, setLastResult] = useState<BulkApplyResult | null>(null);
  const isLoading = results.length > 0 && results.every((r) => r.isLoading);

  const rows: OfferRow[] = hosts.map((h, i) => {
    const reco = results[i]?.data;
    return {
      id: h.id,
      label: `${h.gpu_name ?? 'GPU'} ×${h.num_gpus ?? '?'} · ${h.name ?? 'sim rig'}`,
      currentPrice: reco?.current_price_gpu ?? h.current_price_gpu,
      recommendedPrice: reco?.recommended_price_gpu ?? null,
      demandLabel: reco?.demand_label ?? null,
      hasMarketData: reco?.has_market_data ?? false,
      isRented: reco?.is_rented ?? h.is_rented,
      lockedPrice: reco?.locked_price_gpu ?? h.locked_price_gpu,
      simulated: true,
    };
  });

  const submit = (ids: string[]) =>
    apply.mutate(ids, {
      onSuccess: (result) => {
        setLastResult(result);
        setSelected(new Set());
        toastResult(result);
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Bulk apply failed'),
    });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Offer Management"
        description="Apply each machine's recommended price in one pass, and configure backfill jobs so idle GPU time still earns something."
      />
      <div className="rounded-md border border-accent/30 bg-accent/5 px-4 py-2 text-xs text-muted">
        No real machines connected — showing bulk ops for your{' '}
        <span className="text-accent">simulated rigs</span> so you can test this feature before
        hosting. Applying here only updates the sandbox rigs&rsquo; prices — nothing is written to
        Vast.
      </div>
      <Widget title="Bulk price ops — sandbox">
        {isLoading ? (
          <SkeletonRows rows={4} />
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            No simulated rigs yet — create one in Simulator.
          </p>
        ) : (
          <OfferTable
            rows={rows}
            selected={selected}
            onSelectedChange={setSelected}
            pending={apply.isPending}
            onSubmit={submit}
          />
        )}
      </Widget>
      {lastResult ? <BulkResultPanel result={lastResult} /> : null}
      <SimulatedDefjobPanel hosts={hosts} />
    </div>
  );
}

function toastResult(result: BulkApplyResult) {
  const parts = [`${result.applied} applied`];
  if (result.skipped) parts.push(`${result.skipped} skipped`);
  if (result.failed) parts.push(`${result.failed} failed`);
  if (result.applied > 0) toast.success(parts.join(', '));
  else toast.error(parts.join(', '));
}

function OfferTable({
  rows,
  selected,
  onSelectedChange,
  pending,
  onSubmit,
}: {
  rows: OfferRow[];
  selected: Set<string>;
  onSelectedChange: (s: Set<string>) => void;
  pending: boolean;
  onSubmit: (ids: string[]) => void;
}) {
  const eligible = rows.filter((r) => r.hasMarketData && r.recommendedPrice != null);
  const eligibleIds = new Set(eligible.map((r) => r.id));
  const selectedEligible = [...selected].filter((id) => eligibleIds.has(id));
  const allSelected = eligibleIds.size > 0 && selectedEligible.length === eligibleIds.size;

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedChange(next);
  };

  const toggleAll = () => onSelectedChange(allSelected ? new Set() : new Set(eligibleIds));

  return (
    <div className="flex flex-col gap-3 pt-1">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            className="accent-accent"
            checked={allSelected}
            disabled={eligibleIds.size === 0}
            onChange={toggleAll}
          />
          Select all with a recommendation ({eligibleIds.size})
        </label>
        <Button
          size="sm"
          disabled={selectedEligible.length === 0 || pending}
          onClick={() => onSubmit(selectedEligible)}
        >
          {pending
            ? 'Applying…'
            : `Apply recommended${selectedEligible.length ? ` to ${selectedEligible.length}` : ''}`}
        </Button>
      </div>

      <div className="-mx-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase text-muted">
              <th className="w-8 px-4 py-2" />
              <th className="px-4 py-2 font-medium">Machine / Rig</th>
              <th className="px-4 py-2 text-right font-medium">Current</th>
              <th className="px-4 py-2 text-right font-medium">Recommended</th>
              <th className="px-4 py-2 font-medium">Demand</th>
              <th className="px-4 py-2 font-medium">Rental</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isEligible = eligibleIds.has(r.id);
              return (
                <tr key={r.id} className="border-b border-border/50 hover:bg-border/20">
                  <td className="px-4 py-2">
                    <input
                      type="checkbox"
                      className="accent-accent"
                      checked={selected.has(r.id)}
                      disabled={!isEligible}
                      onChange={() => toggle(r.id)}
                    />
                  </td>
                  <td className="px-4 py-2 text-fg">
                    {r.label}
                    {r.simulated ? (
                      <Badge variant="accent" className="ml-1">
                        SIM
                      </Badge>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted">
                    {dph(r.currentPrice)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium text-accent">
                    {isEligible ? dph(r.recommendedPrice) : '—'}
                  </td>
                  <td className="px-4 py-2 text-muted">
                    {r.demandLabel ?? (isEligible ? '—' : 'no market yet')}
                  </td>
                  <td className="px-4 py-2">
                    {r.isRented ? (
                      <Badge variant="accent">renting @ {dph(r.lockedPrice)}</Badge>
                    ) : (
                      <span className="text-muted">idle</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BulkResultPanel({ result }: { result: BulkApplyResult }) {
  return (
    <Widget title="Last bulk apply">
      <div className="flex flex-col gap-3 pt-1">
        <div className="flex gap-4 text-sm">
          <span className="text-emerald-400">{result.applied} applied</span>
          <span className="text-amber-400">{result.skipped} skipped</span>
          <span className="text-red-400">{result.failed} failed</span>
        </div>
        <div className="flex flex-col gap-1">
          {result.items.map((item) => (
            <div key={item.id} className="flex items-center gap-2 text-[11px]">
              <Badge
                variant={
                  item.status === 'applied'
                    ? 'success'
                    : item.status === 'failed'
                      ? 'danger'
                      : 'muted'
                }
              >
                {item.status.replaceAll('_', ' ')}
              </Badge>
              <span className="text-fg">{item.label}</span>
              {item.status === 'applied' ? (
                <span className="tabular-nums text-muted">
                  {dph(item.old_price_gpu)} → {dph(item.new_price_gpu)}
                </span>
              ) : item.detail ? (
                <span className="text-muted">· {item.detail}</span>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </Widget>
  );
}

// ── Backfill / default job config ────────────────────────────────
// Vast's "default job": a background container that launches automatically
// whenever a machine is idle, at a host-set price — self-renting idle GPU
// time instead of earning nothing. Real writes go through Vast; the
// simulated panel is local-only, same sandbox pattern as everything else here.

function DefjobPanel() {
  const machines = useMachines();
  const setDefjob = useSetDefjob();
  const removeDefjob = useRemoveDefjob();
  const rows = machines.data ?? [];

  return (
    <Widget title="Backfill (default jobs)">
      <DataState
        isLoading={machines.isLoading}
        isError={machines.isError}
        error={machines.error}
        data={rows}
        onRetry={machines.refetch}
        isEmpty={(d) => d.length === 0}
        emptyMessage="No machines on your account yet."
      >
        {(list) => (
          <div className="flex flex-col gap-2 pt-1">
            {list.map((m) => (
              <DefjobRow
                key={m.id}
                label={`${m.gpu_name ?? 'GPU'} ×${m.num_gpus ?? '?'} · machine ${m.machine_id}`}
                defjob={{
                  enabled: m.defjob_enabled,
                  image: m.defjob_image,
                  price_gpu: m.defjob_price_gpu,
                  price_inetu: m.defjob_price_inetu,
                  price_inetd: m.defjob_price_inetd,
                  args: m.defjob_args,
                }}
                saving={setDefjob.isPending}
                removing={removeDefjob.isPending}
                onSave={(payload, opts) => setDefjob.mutate({ machineId: m.id, payload }, opts)}
                onRemove={(opts) => removeDefjob.mutate(m.id, opts)}
              />
            ))}
            <p className="text-[11px] text-muted">
              A default job runs automatically whenever a machine is idle, at the price you set
              here — effectively renting yourself so idle GPU time still earns something instead
              of nothing.
            </p>
          </div>
        )}
      </DataState>
    </Widget>
  );
}

function SimulatedDefjobPanel({ hosts }: { hosts: SimulatedHost[] }) {
  const setDefjob = useSetSimulatedDefjob();
  const removeDefjob = useRemoveSimulatedDefjob();

  if (hosts.length === 0) return null;

  return (
    <Widget title="Backfill (default jobs) — sandbox">
      <div className="flex flex-col gap-2 pt-1">
        {hosts.map((h) => (
          <DefjobRow
            key={h.id}
            label={`${h.gpu_name ?? 'GPU'} ×${h.num_gpus ?? '?'} · ${h.name ?? 'sim rig'}`}
            defjob={{
              enabled: h.defjob_enabled,
              image: h.defjob_image,
              price_gpu: h.defjob_price_gpu,
              price_inetu: h.defjob_price_inetu,
              price_inetd: h.defjob_price_inetd,
              args: h.defjob_args,
            }}
            saving={setDefjob.isPending}
            removing={removeDefjob.isPending}
            onSave={(payload, opts) => setDefjob.mutate({ hostId: h.id, payload }, opts)}
            onRemove={(opts) => removeDefjob.mutate(h.id, opts)}
          />
        ))}
        <p className="text-[11px] text-muted">
          Local only — nothing is written to Vast. Test your backfill config here before hosting.
        </p>
      </div>
    </Widget>
  );
}

type DefjobDraft = {
  image: string;
  price_gpu: string;
  price_inetu: string;
  price_inetd: string;
  args: string;
};

function draftFromDefjob(defjob: DefjobConfig): DefjobDraft {
  return {
    image: defjob.image ?? '',
    price_gpu: defjob.price_gpu != null ? String(defjob.price_gpu) : '',
    price_inetu: defjob.price_inetu != null ? String(defjob.price_inetu) : '0',
    price_inetd: defjob.price_inetd != null ? String(defjob.price_inetd) : '0',
    args: defjob.args ?? '',
  };
}

type MutateOpts = { onSuccess: () => void; onError: (err: unknown) => void };

function DefjobRow({
  label,
  defjob,
  saving,
  removing,
  onSave,
  onRemove,
}: {
  label: string;
  defjob: DefjobConfig;
  saving: boolean;
  removing: boolean;
  onSave: (payload: DefjobInput, opts: MutateOpts) => void;
  onRemove: (opts: MutateOpts) => void;
}) {
  const [draft, setDraft] = useState<DefjobDraft | null>(null);

  const startEdit = () => setDraft(draftFromDefjob(defjob));

  const save = () => {
    if (!draft) return;
    const priceGpu = Number(draft.price_gpu);
    if (!draft.image.trim() || !priceGpu || priceGpu <= 0) {
      toast.error('A Docker image and a $/GPU·hr > 0 are required');
      return;
    }
    onSave(
      {
        image: draft.image.trim(),
        price_gpu: priceGpu,
        price_inetu: Number(draft.price_inetu) || 0,
        price_inetd: Number(draft.price_inetd) || 0,
        args: draft.args.trim() || null,
      },
      {
        onSuccess: () => {
          toast.success('Default job saved');
          setDraft(null);
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Save failed'),
      },
    );
  };

  return (
    <div className="rounded-md border border-border bg-bg/30 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-medium text-fg">{label}</span>
          {defjob.enabled ? (
            <div className="mt-0.5 text-[11px] text-accent">
              Backfill ON — {defjob.image} @ {dph(defjob.price_gpu)}
              {defjob.args ? ` · args: ${defjob.args}` : ''}
            </div>
          ) : (
            <div className="mt-0.5 text-[11px] text-muted">Backfill off — idle time earns nothing</div>
          )}
        </div>
        {draft ? null : (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={startEdit}>
              {defjob.enabled ? 'Edit' : 'Configure'}
            </Button>
            {defjob.enabled ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={removing}
                onClick={() =>
                  onRemove({
                    onSuccess: () => toast.success('Default job removed'),
                    onError: (err) =>
                      toast.error(err instanceof Error ? err.message : 'Remove failed'),
                  })
                }
              >
                Remove
              </Button>
            ) : null}
          </div>
        )}
      </div>

      {draft ? (
        <div className="mt-3 grid grid-cols-2 gap-2 rounded-md border border-accent/30 bg-accent/5 p-3 text-xs">
          <DefjobField label="Docker image">
            <Input
              value={draft.image}
              onChange={(e) => setDraft({ ...draft, image: e.target.value })}
              placeholder="pytorch/pytorch:latest"
            />
          </DefjobField>
          <DefjobField label="$/GPU·hr">
            <Input
              type="number"
              step="0.001"
              value={draft.price_gpu}
              onChange={(e) => setDraft({ ...draft, price_gpu: e.target.value })}
            />
          </DefjobField>
          <DefjobField label="$/GB upload">
            <Input
              type="number"
              step="0.001"
              value={draft.price_inetu}
              onChange={(e) => setDraft({ ...draft, price_inetu: e.target.value })}
            />
          </DefjobField>
          <DefjobField label="$/GB download">
            <Input
              type="number"
              step="0.001"
              value={draft.price_inetd}
              onChange={(e) => setDraft({ ...draft, price_inetd: e.target.value })}
            />
          </DefjobField>
          <div className="col-span-2">
            <DefjobField label="Launch args (optional)">
              <Input
                value={draft.args}
                onChange={(e) => setDraft({ ...draft, args: e.target.value })}
                placeholder="-e KEY=value"
              />
            </DefjobField>
          </div>
          <div className="col-span-2 flex items-center gap-2">
            <Button size="sm" disabled={saving} onClick={save}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DefjobField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
