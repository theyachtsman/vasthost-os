'use client';

import type { MarketListingRow } from '@vasthost/shared-types';
import { Badge, DataState } from '@vasthost/ui';
import { useMemo, useState } from 'react';

import { SortHeader, useSort } from '@/components/sort-header';
import { Widget } from '@/components/widget';
import { dph, num, pct, untilTime } from '@/lib/format';
import { useMarketListings } from '@/lib/hooks';
import { MARKET_SOURCE_LABELS, marketSourceColor } from '@/lib/market-source';

type Cls = { gpu_name: string; num_gpus: number };
type Key =
  | 'machine'
  | 'source'
  | 'price'
  | 'fee'
  | 'renter'
  | 'dlperf'
  | 'value'
  | 'rel'
  | 'verified'
  | 'region'
  | 'status'
  | 'ends';

type Avail = 'ALL' | 'AVAILABLE' | 'RENTED';

// Fee amount (renter-pay minus the before-fee host price) for one offer.
const feeOf = (r: MarketListingRow): number | null =>
  r.price_gpu != null && r.price_gpu_host != null ? r.price_gpu - r.price_gpu_host : null;

// Per-server detail behind the aggregates: every live offer for the selected GPU
// AND config size, rented and available, with the full Vast signal set. The
// available-but-unrented rows are the point — sort them by price/reliability to
// see *why* a rig isn't renting (priced above market? low reliability?
// unverified?). Prices are shown as the host's set price (what you'd match), with
// the Vast fee broken out separately and the renter-pay total for context. Each
// row is tagged with its host provider so cross-host analysis "just works" when a
// second market source lands.
export function MarketListings({ cls, feePct }: { cls: Cls; feePct: number | null }) {
  const [avail, setAvail] = useState<Avail>('ALL');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [minRel, setMinRel] = useState(0);

  const rented = avail === 'ALL' ? null : avail === 'RENTED';
  // Scope to the config size selected in the size ladder above, so drilling into
  // an ×8 rig shows only the ×8 servers.
  const listings = useMarketListings(cls.gpu_name, { num_gpus: cls.num_gpus, rented });

  const { state, sort } = useSort<MarketListingRow, Key>('price', 'asc', {
    machine: (r) => r.machine_id,
    source: (r) => r.market_source,
    price: (r) => r.price_gpu_host,
    fee: (r) => feeOf(r),
    renter: (r) => r.price_gpu,
    dlperf: (r) => r.dlperf,
    value: (r) => r.dlperf_per_dphtotal,
    rel: (r) => r.reliability,
    verified: (r) => r.verified,
    region: (r) => r.geolocation,
    status: (r) => (r.rented ? 1 : 0),
    ends: (r) => (r.end_date ? new Date(r.end_date).getTime() : null),
  });

  const rows = useMemo(() => {
    let r = listings.data ?? [];
    if (verifiedOnly) r = r.filter((x) => (x.verified ?? '').toLowerCase() === 'verified');
    if (minRel > 0) r = r.filter((x) => (x.reliability ?? 0) * 100 >= minRel);
    return sort(r);
  }, [listings.data, verifiedOnly, minRel, sort]);

  const availCount = (listings.data ?? []).filter((r) => !r.rented).length;
  const rentedCount = (listings.data ?? []).filter((r) => r.rented).length;

  const selectCls =
    'h-8 rounded-md border border-border bg-bg px-2 text-xs text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';

  return (
    <Widget
      title={`Live listings — ${cls.gpu_name} ×${cls.num_gpus}`}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filter availability"
            className={selectCls}
            value={avail}
            onChange={(e) => setAvail(e.target.value as Avail)}
          >
            <option value="ALL">All servers</option>
            <option value="AVAILABLE">Available only</option>
            <option value="RENTED">Rented only</option>
          </select>
          <select
            aria-label="Minimum reliability"
            className={selectCls}
            value={minRel}
            onChange={(e) => setMinRel(Number(e.target.value))}
          >
            <option value={0}>Any reliability</option>
            <option value={90}>≥ 90%</option>
            <option value={95}>≥ 95%</option>
            <option value={99}>≥ 99%</option>
          </select>
          <label className="flex items-center gap-1 text-[11px] text-muted">
            <input
              type="checkbox"
              checked={verifiedOnly}
              onChange={(e) => setVerifiedOnly(e.target.checked)}
              className="accent-accent"
            />
            verified
          </label>
        </div>
      }
    >
      <DataState
        isLoading={listings.isLoading}
        isError={listings.isError}
        error={listings.error}
        data={rows}
        onRetry={listings.refetch}
        isEmpty={(d) => d.length === 0}
        emptyMessage={
          (listings.data?.length ?? 0) > 0
            ? 'No servers match these filters.'
            : `No live ×${cls.num_gpus} listings for this GPU yet — the Observer captures them each poll.`
        }
      >
        {(data) => (
          <div className="-mx-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase">
                  <SortHeader label="Server" sortKey="machine" state={state} />
                  <SortHeader label="Host" sortKey="source" state={state} />
                  <SortHeader label="Price/GPU" sortKey="price" state={state} align="right" />
                  <SortHeader label="Fee" sortKey="fee" state={state} align="right" />
                  <SortHeader label="Renter pays" sortKey="renter" state={state} align="right" />
                  <SortHeader label="dlperf" sortKey="dlperf" state={state} align="right" />
                  <SortHeader label="Perf/$" sortKey="value" state={state} align="right" />
                  <SortHeader label="Reliab." sortKey="rel" state={state} align="right" />
                  <SortHeader label="Verified" sortKey="verified" state={state} />
                  <SortHeader label="Region" sortKey="region" state={state} />
                  <SortHeader label="Status" sortKey="status" state={state} />
                  <SortHeader label="Ends" sortKey="ends" state={state} align="right" />
                </tr>
              </thead>
              <tbody>
                {data.map((r) => {
                  const ends = untilTime(r.end_date);
                  const isVerified = (r.verified ?? '').toLowerCase() === 'verified';
                  return (
                    <tr key={r.offer_id} className="border-b border-border/50 hover:bg-border/20">
                      <td className="px-4 py-2 tabular-nums text-fg">
                        {r.machine_id ?? '—'}
                        {r.host_id != null ? (
                          <span className="ml-1 text-[10px] text-muted">h{r.host_id}</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2">
                        <span className="inline-flex items-center gap-1 text-xs text-muted">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ background: marketSourceColor(r.market_source) }}
                          />
                          {MARKET_SOURCE_LABELS[
                            r.market_source as keyof typeof MARKET_SOURCE_LABELS
                          ] ?? r.market_source}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium text-fg">
                        {dph(r.price_gpu_host)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-amber-400/90">
                        {dph(feeOf(r))}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted">
                        {dph(r.price_gpu)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted">
                        {r.dlperf != null ? r.dlperf.toFixed(0) : '—'}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted">
                        {r.dlperf_per_dphtotal != null ? r.dlperf_per_dphtotal.toFixed(0) : '—'}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted">
                        {r.reliability != null ? pct(r.reliability * 100, 1) : '—'}
                      </td>
                      <td className="px-4 py-2">
                        {isVerified ? (
                          <Badge variant="success">verified</Badge>
                        ) : (
                          <span className="text-[11px] text-muted">{r.verified ?? '—'}</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-muted">{r.geolocation ?? '—'}</td>
                      <td className="px-4 py-2">
                        {r.rented ? (
                          <Badge variant="warning">rented</Badge>
                        ) : (
                          <Badge variant="muted">available</Badge>
                        )}
                      </td>
                      <td
                        className={
                          'px-4 py-2 text-right tabular-nums ' +
                          (ends.soon ? 'text-amber-400' : 'text-muted')
                        }
                      >
                        {ends.label}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-2 text-[11px] text-muted">
              <span>
                {data.length} shown · {availCount} available · {rentedCount} rented
              </span>
              <span>
                Price/GPU is the host&apos;s set price — what you&apos;d match.{' '}
                {feePct != null
                  ? `Fee is Vast's ${Math.round(feePct * 100)}% on top; `
                  : 'Fee is added on top; '}
                Renter pays = price + fee. Sort available rows by price or reliability to see why a
                rig is not renting.
              </span>
            </div>
          </div>
        )}
      </DataState>
    </Widget>
  );
}
