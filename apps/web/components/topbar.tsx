'use client';

import { cn } from '@vasthost/ui';
import { usd } from '@/lib/format';
import { useAccountStatus, useHealth } from '@/lib/hooks';

export function Topbar() {
  const { data: account } = useAccountStatus();
  const { data: health } = useHealth();

  const connected = account?.connected;
  const healthy = health?.status === 'healthy';

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface/40 px-5">
      <div className="flex items-center gap-2 text-sm text-muted">
        <span
          className={cn(
            'h-2 w-2 rounded-full',
            healthy ? 'bg-emerald-400' : 'bg-red-400',
          )}
          title={`System ${health?.status ?? 'unknown'}`}
        />
        <span className="text-xs">
          {healthy ? 'All systems operational' : 'System degraded'}
        </span>
      </div>

      <div className="flex items-center gap-5">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'h-2 w-2 rounded-full',
              connected ? 'bg-emerald-400' : 'bg-red-400',
            )}
          />
          <span className="text-xs text-muted">
            {connected ? (account?.email ?? 'Connected') : 'Not connected'}
          </span>
        </div>
        {connected ? (
          <div className="flex flex-col items-end leading-tight">
            <span className="text-[10px] uppercase tracking-wide text-muted">Balance</span>
            <span className="text-sm font-semibold tabular-nums text-fg">
              {usd(account?.account_balance)}
            </span>
          </div>
        ) : null}
      </div>
    </header>
  );
}
