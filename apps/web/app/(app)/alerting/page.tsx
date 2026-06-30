'use client';

import { Badge, DataState } from '@vasthost/ui';
import { Bell } from 'lucide-react';

import { PageHeader } from '@/components/page-header';
import { Widget } from '@/components/widget';
import { dph, relativeTime } from '@/lib/format';
import { useMachines } from '@/lib/hooks';

// Promotes the offer-expiry monitor into a real surface (Part 8). Today it
// surfaces offers expiring < 48h; the worker's offer_expiry_monitor feeds the
// same signal server-side.
export default function AlertingPage() {
  const machines = useMachines();

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Alerting"
        description="Things that need your attention across your fleet — starting with offers about to expire."
      />
      <Widget title="Offers expiring within 48 hours">
        <DataState
          isLoading={machines.isLoading}
          isError={machines.isError}
          error={machines.error}
          data={machines.data}
          onRetry={machines.refetch}
          isEmpty={(d) =>
            d.filter((m) => isExpiringSoon(m.offer_end_date)).length === 0
          }
          emptyMessage="No offers expiring soon. Connect your key in Settings if your fleet is empty."
        >
          {(rows) => {
            const expiring = rows
              .filter((m) => isExpiringSoon(m.offer_end_date))
              .sort(
                (a, b) =>
                  new Date(a.offer_end_date!).getTime() - new Date(b.offer_end_date!).getTime(),
              );
            return (
              <div className="flex flex-col gap-2">
                {expiring.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <Bell className="h-4 w-4 text-amber-400" />
                      <span className="text-fg">
                        {m.gpu_name} ×{m.num_gpus} · #{m.machine_id}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="tabular-nums text-muted">{dph(m.current_price_gpu)}</span>
                      <Badge variant="warning">expires {relativeTime(m.offer_end_date)}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            );
          }}
        </DataState>
      </Widget>
    </div>
  );
}

function isExpiringSoon(end: string | null): boolean {
  if (!end) return false;
  const h = (new Date(end).getTime() - Date.now()) / 3.6e6;
  return h >= 0 && h < 48;
}
