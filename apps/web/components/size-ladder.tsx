'use client';

import { DataState } from '@vasthost/ui';

import { UtilizationBar } from '@/components/utilization';
import { Widget } from '@/components/widget';
import { dph, hostTake, num } from '@/lib/format';
import { useMarketMeta, useMarketSizes } from '@/lib/hooks';
import { useClassStore } from '@/lib/store';

// Per-GPU price + utilization across config sizes (×1, ×2, ×4, ×8 …) for the
// selected GPU. Teaches whether whole-node configs command a per-GPU premium
// and whether they rent more or less often.
export function SizeLadder() {
  const { gpu_name, num_gpus } = useClassStore((s) => s.selected);
  const setSelected = useClassStore((s) => s.setSelected);
  const sizes = useMarketSizes(gpu_name);
  const feePct = useMarketMeta().data?.fee_pct ?? null;

  return (
    <Widget title={`Config sizes — ${gpu_name} (per-GPU)`}>
      <DataState
        isLoading={sizes.isLoading}
        isError={sizes.isError}
        error={sizes.error}
        data={sizes.data}
        onRetry={sizes.refetch}
        isEmpty={(d) => d.length === 0}
        emptyMessage="No size data yet for this GPU."
      >
        {(rows) => (
          <div className="-mx-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase text-muted">
                  <th className="px-4 py-2 font-medium">Size</th>
                  <th className="px-4 py-2 text-right font-medium">p25</th>
                  <th className="px-4 py-2 text-right font-medium">Median/GPU</th>
                  <th className="px-4 py-2 text-right font-medium">p75</th>
                  <th className="px-4 py-2 font-medium">Demand</th>
                  <th className="px-4 py-2 text-right font-medium">Rented/Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const active = r.num_gpus === num_gpus;
                  return (
                    <tr
                      key={r.num_gpus}
                      onClick={() =>
                        setSelected({ gpu_name, num_gpus: r.num_gpus, geolocation: null })
                      }
                      className={
                        'cursor-pointer border-b border-border/50 hover:bg-border/20 ' +
                        (active ? 'bg-accent/10' : '')
                      }
                    >
                      <td className="px-4 py-2 font-medium text-fg">×{r.num_gpus}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted">
                        {dph(r.p25_price)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium text-fg">
                        {dph(r.p50_price)}
                        <div className="text-[10px] font-normal text-emerald-400/80">
                          {dph(hostTake(r.p50_price, feePct))} net
                          {r.price_basis === 'last-rented' ? (
                            <span className="ml-1 text-muted">· last rented</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted">
                        {dph(r.p75_price)}
                      </td>
                      <td className="px-4 py-2">
                        <UtilizationBar pct={r.utilization_pct} className="w-24" />
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted">
                        {num(r.rented_count)}/{num(r.supply_count)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="px-4 pt-2 text-[11px] text-muted">
              Prices are normalized per-GPU, so you can compare a single card against a full node.
            </p>
          </div>
        )}
      </DataState>
    </Widget>
  );
}
