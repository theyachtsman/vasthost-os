'use client';

import { Button, cn } from '@vasthost/ui';
import { LogOut, Menu } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { useHealth, useLogout, useMe, useProviderKeys } from '@/lib/hooks';
import { useUiStore } from '@/lib/store';

export function Topbar() {
  const router = useRouter();
  const { data: me } = useMe();
  const { data: health } = useHealth();
  const { data: keys } = useProviderKeys();
  const logout = useLogout();
  const setMobileNavOpen = useUiStore((s) => s.setMobileNavOpen);

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
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-surface/40 px-3 sm:px-5">
      <div className="flex min-w-0 items-center gap-2 text-sm text-muted">
        <button
          type="button"
          aria-label="Open navigation"
          onClick={() => setMobileNavOpen(true)}
          className="-ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-fg hover:bg-border/30 lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span
          className={cn('h-2 w-2 shrink-0 rounded-full', healthy ? 'bg-emerald-400' : 'bg-red-400')}
          title={`System ${health?.status ?? 'unknown'}`}
        />
        <span className="hidden truncate text-xs sm:inline">
          {healthy ? 'All systems operational' : 'System degraded'}
        </span>
      </div>

      <div className="flex items-center gap-3 sm:gap-5">
        <div className="hidden items-center gap-2 md:flex">
          <span
            className={cn('h-2 w-2 shrink-0 rounded-full', vastKey ? 'bg-emerald-400' : 'bg-amber-400')}
            title={vastKey ? 'Vast key connected' : 'No Vast key connected'}
          />
          <span className="text-xs text-muted">
            {vastKey ? 'Vast key connected' : 'Connect your key in Settings'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden max-w-[10rem] truncate text-xs text-muted sm:inline">
            {me?.email ?? ''}
          </span>
          <Button variant="ghost" size="sm" onClick={doLogout} disabled={logout.isPending}>
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
