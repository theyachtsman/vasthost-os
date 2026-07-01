'use client';

import type { BulkApplyResult, SimulatedHost } from '@vasthost/shared-types';
import { Badge, Button, DataState, SkeletonRows } from '@vasthost/ui';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/page-header';
import { Widget } from '@/components/widget';
import { dph } from '@/lib/format';
import {
  useBulkApplyPrice,
  useBulkApplySimulatedPrice,
  useMachines,
  usePricingRecommendations,
  useProviderKeys,
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
          description="Bulk-apply recommended prices across your fleet in one pass."
        />
        <Widget title="Bulk price ops">
          <p className="py-6 text-sm text-muted">
            Connect your Vast key in{' '}
            <Link href="/settings" className="text-accent hover:underline">
              Settings
            </Link>{' '}
            (with the <span className="text-fg">machine write / pricing</span> scope) to bulk-apply
            prices.
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
        description="Apply each machine's recommended price in one pass — same safety rails as Pricing Control (break-even floor, rental lock), just batched."
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
        description="Apply each machine's recommended price in one pass — same safety rails as Pricing Control (break-even floor, rental lock), just batched."
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
