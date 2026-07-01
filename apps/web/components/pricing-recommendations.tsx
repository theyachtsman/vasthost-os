'use client';

import type { PricingRecommendation, SimulatedHost } from '@vasthost/shared-types';
import { Badge, Button, DataState } from '@vasthost/ui';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Widget } from '@/components/widget';
import { dph, relativeTime } from '@/lib/format';
import {
  useApplyPrice,
  useApplySimulatedPrice,
  useMachines,
  usePriceHistory,
  usePricingRecommendations,
  useProviderKeys,
  useSimulatedHosts,
  useSimulatedPricingRecommendation,
} from '@/lib/hooks';

const demandColor = (label: string | null): string => {
  switch (label) {
    case 'Hot':
      return 'text-emerald-400';
    case 'Warm':
      return 'text-amber-400';
    case 'Soft':
      return 'text-orange-400';
    default:
      return 'text-muted';
  }
};

export function PricingRecommendations() {
  const recos = usePricingRecommendations();
  const keys = useProviderKeys();
  const machines = useMachines();
  const simHosts = useSimulatedHosts();
  const connected = (keys.data ?? []).some((k) => k.provider === 'vast' && k.is_active);

  // Distinguish "no key" (a setup step) from a real error so we show a CTA.
  if (!keys.isLoading && !connected) {
    return (
      <Widget title="Pricing recommendations">
        <p className="py-6 text-sm text-muted">
          Connect your Vast key in{' '}
          <Link href="/settings" className="text-accent hover:underline">
            Settings
          </Link>{' '}
          (with the <span className="text-fg">machine write / pricing</span> scope) to get
          recommendations and apply prices.
        </p>
      </Widget>
    );
  }

  // No real machines yet but simulated rigs exist → let the user test the
  // recommend+apply loop against a sandbox rig before they host anything for
  // real. Same fallback pattern as Earnings/Fleet/Dashboard.
  const noRealMachines = !machines.isLoading && (machines.data?.length ?? 0) === 0;
  const sims = simHosts.data ?? [];
  if (noRealMachines && sims.length > 0) {
    return <SimulatedPricingRecommendations hosts={sims} />;
  }

  return (
    <Widget title="Pricing recommendations — demand-adaptive, floored at break-even">
      <DataState
        isLoading={recos.isLoading}
        isError={recos.isError}
        error={recos.error}
        data={recos.data}
        onRetry={recos.refetch}
        isEmpty={(d) => d.length === 0}
        emptyMessage="No machines on your account yet — they appear here once your fleet syncs."
      >
        {(rows) => (
          <div className="flex flex-col gap-3 pt-1">
            {rows.map((r) => (
              <RecoCard key={r.machine_id} reco={r} />
            ))}
            <p className="text-[11px] text-muted">
              Recommendations target a market percentile that scales with demand and never dip below
              your estimated break-even (which assumes the platform fee). You confirm every write —
              nothing is applied automatically.
            </p>
          </div>
        )}
      </DataState>
    </Widget>
  );
}

function RecoCard({ reco }: { reco: PricingRecommendation }) {
  const [confirming, setConfirming] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [price, setPrice] = useState<number>(reco.recommended_price_gpu ?? 0);
  const apply = useApplyPrice();

  const belowFloor = reco.break_even_floor != null && price < reco.break_even_floor;
  const canApply =
    reco.has_market_data && reco.recommended_price_gpu != null && !belowFloor && price > 0;
  const unchangedFromReco =
    reco.recommended_price_gpu != null && Math.abs(price - reco.recommended_price_gpu) < 1e-9;

  const startConfirm = () => {
    setPrice(reco.recommended_price_gpu ?? 0);
    setConfirming(true);
  };

  const submit = () => {
    apply.mutate(
      {
        machine_id: reco.machine_id,
        new_price_gpu: price,
        reason: unchangedFromReco ? 'recommend_applied' : 'manual',
      },
      {
        onSuccess: () => {
          toast.success(`Price set to ${dph(price)} on Vast`);
          setConfirming(false);
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : 'Price write failed'),
      },
    );
  };

  return (
    <div className="rounded-lg border border-border bg-bg/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-fg">
              {reco.gpu_name ?? 'GPU'} ×{reco.num_gpus ?? '?'}
            </span>
            <span className="text-[11px] text-muted">machine {reco.vast_machine_id}</span>
            {reco.demand_label ? (
              <span className={'text-[11px] font-medium ' + demandColor(reco.demand_label)}>
                {reco.demand_label}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 max-w-2xl text-[11px] text-muted">{reco.rationale}</p>
          {reco.is_rented ? (
            <p className="mt-0.5 text-[11px] text-accent">
              Renting now at {dph(reco.locked_price_gpu)} (locked) — applying a new price updates
              your asking price immediately but only takes effect for the next rental.
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-[10px] uppercase text-muted">Current</div>
            <div className="tabular-nums text-fg">{dph(reco.current_price_gpu)}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase text-muted">Recommended</div>
            <div className="tabular-nums font-semibold text-accent">
              {dph(reco.recommended_price_gpu)}
              {reco.floored ? <span className="ml-1 text-[10px] text-amber-400">floor</span> : null}
            </div>
          </div>
          {!confirming ? (
            <Button size="sm" disabled={!canApply} onClick={startConfirm}>
              {canApply ? 'Apply' : reco.has_market_data ? '—' : 'No market'}
            </Button>
          ) : null}
        </div>
      </div>

      {reco.has_market_data ? (
        <PercentileBar current={reco.current_percentile} target={reco.target_percentile} />
      ) : null}

      {confirming ? (
        <div className="mt-3 flex flex-col gap-2 rounded-md border border-accent/30 bg-accent/5 p-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-muted">Set price/GPU·hr</span>
            <input
              type="number"
              step="0.001"
              min={0}
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
              className="h-8 w-28 rounded-md border border-border bg-bg px-2 text-sm text-fg tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
            <span className="text-muted">
              {dph(reco.current_price_gpu)} <span className="mx-1">→</span>
              <span className="font-semibold text-fg">{dph(price)}</span>
            </span>
            {reco.break_even_floor != null ? (
              <span className={belowFloor ? 'text-red-400' : 'text-emerald-400'}>
                {belowFloor
                  ? `✗ below break-even ${dph(reco.break_even_floor)}`
                  : `✓ above break-even ${dph(reco.break_even_floor)}`}
              </span>
            ) : (
              <span className="text-amber-400">no power cost set — no safety floor</span>
            )}
          </div>
          <p className="text-[11px] text-muted">
            Writes to Vast with your key. If this machine is currently rented, the active contract
            keeps its locked price — the new price applies to the next rental.
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" disabled={belowFloor || price <= 0 || apply.isPending} onClick={submit}>
              {apply.isPending ? 'Writing…' : 'Confirm write to Vast'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setShowHistory((s) => !s)}
        className="mt-2 text-[11px] text-muted hover:text-fg"
      >
        {showHistory ? 'Hide' : 'Recent price changes'}
      </button>
      {showHistory ? <PriceHistory machineId={reco.machine_id} /> : null}
    </div>
  );
}

function PercentileBar({
  current,
  target,
}: {
  current: number | null;
  target: number | null;
}) {
  return (
    <div className="mt-3">
      <div className="relative h-6">
        <div className="absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-border/60" />
        {target != null ? (
          <Marker pos={target} color="bg-accent" label={`aim p${Math.round(target)}`} />
        ) : null}
        {current != null ? (
          <Marker pos={current} color="bg-emerald-400" label={`you p${Math.round(current)}`} up />
        ) : null}
      </div>
      <div className="flex justify-between text-[10px] text-muted">
        <span>cheaper (p0)</span>
        <span>pricier (p100)</span>
      </div>
    </div>
  );
}

function Marker({
  pos,
  color,
  label,
  up,
}: {
  pos: number;
  color: string;
  label: string;
  up?: boolean;
}) {
  return (
    <div
      className="absolute top-0 flex h-full flex-col items-center"
      style={{ left: `${Math.max(0, Math.min(100, pos))}%` }}
    >
      <div className={'h-full w-0.5 ' + color} />
      <span
        className={
          'absolute whitespace-nowrap text-[9px] text-muted ' + (up ? '-top-3' : '-bottom-3')
        }
      >
        {label}
      </span>
    </div>
  );
}

function PriceHistory({ machineId }: { machineId: string }) {
  const history = usePriceHistory(machineId);
  const rows = history.data ?? [];
  if (history.isLoading) return <p className="pt-1 text-[11px] text-muted">Loading…</p>;
  if (rows.length === 0)
    return <p className="pt-1 text-[11px] text-muted">No price changes recorded yet.</p>;
  return (
    <div className="mt-1 flex flex-col gap-1">
      {rows.map((e) => (
        <div key={e.id} className="flex items-center gap-2 text-[11px]">
          {e.applied_to_vast ? (
            <Badge variant="success">applied</Badge>
          ) : (
            <Badge variant="danger">failed</Badge>
          )}
          <span className="tabular-nums text-muted">
            {dph(e.old_price_gpu)} → {dph(e.new_price_gpu)}
          </span>
          <span className="text-muted">· {e.reason}</span>
          <span className="text-muted">· {relativeTime(e.changed_at)}</span>
          {e.error_message ? (
            <span className="truncate text-red-400" title={e.error_message}>
              · {e.error_message}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

// ── Simulated sandbox (no real machines on the connected key yet) ───────────
// Same demand-adaptive recommendation engine as the real path, run against
// simulated rigs so a user can test the feature before hosting anything.
// "Apply" here is local-only — it updates the sim rig's price, never Vast.

function SimulatedPricingRecommendations({ hosts }: { hosts: SimulatedHost[] }) {
  return (
    <Widget title="Pricing recommendations — sandbox (simulated rigs)">
      <div className="flex flex-col gap-3 pt-1">
        <div className="rounded-md border border-accent/30 bg-accent/5 px-3 py-2 text-xs text-muted">
          No real machines connected — showing recommendations for your{' '}
          <span className="text-accent">simulated rigs</span> so you can test this feature
          before hosting. Applying here only updates the sandbox rig&rsquo;s price — nothing is
          written to Vast.
        </div>
        {hosts.map((h) => (
          <SimRecoCard key={h.id} host={h} />
        ))}
        <p className="text-[11px] text-muted">
          Recommendations target a market percentile that scales with demand and never dip below
          your estimated break-even. This switches to your real fleet automatically once your
          Vast account has hosted machines.
        </p>
      </div>
    </Widget>
  );
}

function SimRecoCard({ host }: { host: SimulatedHost }) {
  const recoQuery = useSimulatedPricingRecommendation(host.id);
  const [confirming, setConfirming] = useState(false);
  const [price, setPrice] = useState(0);
  const apply = useApplySimulatedPrice();
  const reco = recoQuery.data;

  // Unlike the real RecoCard (mounted only once its reco prop is already
  // resolved), this card fetches its own data and can render before `reco`
  // exists — so `price` can't be initialized from it at useState time. Seed it
  // once, the first time a recommendation arrives; startConfirm() below already
  // re-seeds it to the latest recommended price whenever the user opens Apply.
  const priceSeeded = useRef(false);
  useEffect(() => {
    if (!priceSeeded.current && reco?.recommended_price_gpu != null) {
      setPrice(reco.recommended_price_gpu);
      priceSeeded.current = true;
    }
  }, [reco?.recommended_price_gpu]);

  if (recoQuery.isLoading || !reco) {
    return (
      <div className="rounded-lg border border-border bg-bg/30 p-3 text-xs text-muted">
        {recoQuery.isLoading ? 'Loading…' : 'Could not load recommendation.'}
      </div>
    );
  }

  const belowFloor = reco.break_even_floor != null && price < reco.break_even_floor;
  const canApply =
    reco.has_market_data && reco.recommended_price_gpu != null && !belowFloor && price > 0;

  const startConfirm = () => {
    setPrice(reco.recommended_price_gpu ?? 0);
    setConfirming(true);
  };

  const submit = () => {
    apply.mutate(
      { hostId: host.id, newPriceGpu: price },
      {
        onSuccess: () => {
          toast.success(`Sandbox price set to ${dph(price)}`);
          setConfirming(false);
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : 'Sandbox price update failed'),
      },
    );
  };

  return (
    <div className="rounded-lg border border-border bg-bg/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-fg">
              {reco.gpu_name ?? host.name ?? 'Rig'} ×{reco.num_gpus ?? '?'}
            </span>
            <Badge variant="accent">SIMULATED</Badge>
            {host.autopilot_enabled ? <Badge variant="accent">AUTOPILOT</Badge> : null}
            {reco.demand_label ? (
              <span className={'text-[11px] font-medium ' + demandColor(reco.demand_label)}>
                {reco.demand_label}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 max-w-2xl text-[11px] text-muted">{reco.rationale}</p>
          {host.autopilot_enabled ? (
            <p className="mt-0.5 text-[11px] text-accent">
              Autopilot is managing this rig&rsquo;s price automatically (~every 15 min, bounded
              by its rails in Simulator). Manual apply below still works — the next automated
              step continues from wherever you leave it.
            </p>
          ) : null}
          {reco.is_rented ? (
            <p className="mt-0.5 text-[11px] text-accent">
              Simulated as renting now at {dph(reco.locked_price_gpu)} (locked) — applying a new
              price updates the asking price immediately, matching Vast, but only takes effect
              for the next rental. Manage this in Simulator.
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-[10px] uppercase text-muted">Current</div>
            <div className="tabular-nums text-fg">{dph(reco.current_price_gpu)}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase text-muted">Recommended</div>
            <div className="tabular-nums font-semibold text-accent">
              {dph(reco.recommended_price_gpu)}
              {reco.floored ? <span className="ml-1 text-[10px] text-amber-400">floor</span> : null}
            </div>
          </div>
          {!confirming ? (
            <Button size="sm" disabled={!canApply} onClick={startConfirm}>
              {canApply ? 'Apply' : reco.has_market_data ? '—' : 'No market'}
            </Button>
          ) : null}
        </div>
      </div>

      {reco.has_market_data ? (
        <PercentileBar current={reco.current_percentile} target={reco.target_percentile} />
      ) : null}

      {confirming ? (
        <div className="mt-3 flex flex-col gap-2 rounded-md border border-accent/30 bg-accent/5 p-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-muted">Set price/GPU·hr</span>
            <input
              type="number"
              step="0.001"
              min={0}
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
              className="h-8 w-28 rounded-md border border-border bg-bg px-2 text-sm text-fg tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
            <span className="text-muted">
              {dph(reco.current_price_gpu)} <span className="mx-1">→</span>
              <span className="font-semibold text-fg">{dph(price)}</span>
            </span>
            {reco.break_even_floor != null ? (
              <span className={belowFloor ? 'text-red-400' : 'text-emerald-400'}>
                {belowFloor
                  ? `✗ below break-even ${dph(reco.break_even_floor)}`
                  : `✓ above break-even ${dph(reco.break_even_floor)}`}
              </span>
            ) : (
              <span className="text-amber-400">no power cost set — no safety floor</span>
            )}
          </div>
          <p className="text-[11px] text-muted">
            Sandbox only — updates this simulated rig&rsquo;s asking price locally. Nothing is
            written to Vast.
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={belowFloor || price <= 0 || apply.isPending}
              onClick={submit}
            >
              {apply.isPending ? 'Applying…' : 'Confirm (sandbox)'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
