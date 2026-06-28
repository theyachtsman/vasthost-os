'use client';

import type { MarketOverviewRow } from '@vasthost/shared-types';
import { DataState } from '@vasthost/ui';
import {
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';

import { Widget } from '@/components/widget';
import { dph, num } from '@/lib/format';
import { useMarketOverview } from '@/lib/hooks';
import { useClassStore } from '@/lib/store';

const AXIS = { stroke: 'hsl(218 10% 58%)', fontSize: 11 };

function pointColor(util: number): string {
  if (util >= 70) return 'hsl(160 70% 45%)';
  if (util >= 45) return 'hsl(43 90% 55%)';
  if (util >= 20) return 'hsl(25 90% 55%)';
  return 'hsl(222 12% 40%)';
}

export function PriceDemandScatter() {
  const overview = useMarketOverview();
  const setSelected = useClassStore((s) => s.setSelected);

  return (
    <Widget title="Price vs Demand — every GPU">
      <DataState
        isLoading={overview.isLoading}
        isError={overview.isError}
        error={overview.error}
        data={overview.data}
        onRetry={overview.refetch}
        isEmpty={(d) => d.length === 0}
        emptyMessage="No market data yet."
      >
        {(rows) => {
          const data = rows
            .filter((r) => r.p50_price != null && r.utilization_pct != null)
            .map((r) => ({
              x: r.p50_price as number,
              y: r.utilization_pct as number,
              z: r.supply_count ?? 1,
              name: r.gpu_name,
            }));
          return (
            <div className="flex flex-col gap-2">
              <div className="h-72 pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 18 }}>
                    <CartesianGrid stroke="hsl(222 12% 20%)" strokeDasharray="2 4" />
                    <XAxis
                      type="number"
                      dataKey="x"
                      name="Median $/GPU·hr"
                      scale="log"
                      domain={['auto', 'auto']}
                      tickFormatter={(v) => `$${v}`}
                      {...AXIS}
                      tickLine={false}
                      label={{
                        value: 'Median $/GPU·hr (log)',
                        position: 'insideBottom',
                        offset: -8,
                        fill: 'hsl(218 10% 58%)',
                        fontSize: 11,
                      }}
                    />
                    <YAxis
                      type="number"
                      dataKey="y"
                      name="Utilization"
                      domain={[0, 100]}
                      tickFormatter={(v) => `${v}%`}
                      {...AXIS}
                      tickLine={false}
                      axisLine={false}
                      width={40}
                    />
                    <ZAxis type="number" dataKey="z" range={[40, 400]} />
                    <Tooltip
                      cursor={{ strokeDasharray: '3 3' }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const p = payload[0].payload as (typeof data)[number];
                        return (
                          <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs">
                            <div className="font-medium text-fg">{p.name}</div>
                            <div className="text-muted">Median {dph(p.x)}</div>
                            <div className="text-muted">{Math.round(p.y)}% utilized</div>
                            <div className="text-muted">{num(p.z)} offers</div>
                          </div>
                        );
                      }}
                    />
                    <Scatter
                      data={data}
                      onClick={(d: { name?: string }) =>
                        d?.name &&
                        setSelected({ gpu_name: d.name, num_gpus: 1, geolocation: null })
                      }
                    >
                      {data.map((d, i) => (
                        <Cell key={i} fill={pointColor(d.y)} fillOpacity={0.8} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[11px] text-muted">
                Each dot is a GPU (bubble size = supply). Higher = more rented (stronger demand),
                right = pricier. Cards in the top band are in demand; expensive ≠ always busy. Click
                a dot to drill in.
              </p>
            </div>
          );
        }}
      </DataState>
    </Widget>
  );
}
