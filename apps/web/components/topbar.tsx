'use client';

import { Button, cn } from '@vasthost/ui';
import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { useHealth, useLogout, useMe, useProviderKeys } from '@/lib/hooks';

export function Topbar() {
  const router = useRouter();
  const { data: me } = useMe();
  const { data: health } = useHealth();
  const { data: keys } = useProviderKeys();
  const logout = useLogout();

  const healthy = health?.status === 'healthy';
  const vastKey = (keys ?? []).find((k) => k.provider === 'vast' && k.is_active);

  const doLogout = () =>
    logout.mutate(undefined, {
      onSuccess: () => {
        toast.success('Signed out');
        router.push('/');
      },
    });

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface/40 px-5">
      <div className="flex items-center gap-2 text-sm text-muted">
        <span
          className={cn('h-2 w-2 rounded-full', healthy ? 'bg-emerald-400' : 'bg-red-400')}
          title={`System ${health?.status ?? 'unknown'}`}
        />
        <span className="text-xs">
          {healthy ? 'All systems operational' : 'System degraded'}
        </span>
      </div>

      <div className="flex items-center gap-5">
        <div className="flex items-center gap-2">
          <span
            className={cn('h-2 w-2 rounded-full', vastKey ? 'bg-emerald-400' : 'bg-amber-400')}
            title={vastKey ? 'Vast key connected' : 'No Vast key connected'}
          />
          <span className="text-xs text-muted">
            {vastKey ? 'Vast key connected' : 'Connect your key in Settings'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted">{me?.email ?? ''}</span>
          <Button variant="ghost" size="sm" onClick={doLogout} disabled={logout.isPending}>
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
