'use client';

import { Button } from '@vasthost/ui';
import { LineChart } from 'lucide-react';
import Link from 'next/link';

import { useMe } from '@/lib/hooks';

// Public chrome (guests). The only nav is the brand and Sign in / Sign up — no
// links to gated surfaces (Part 3). If a session already exists we offer a quick
// way into the app instead.
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const { data: me } = useMe();

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface/40 px-5">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-accent-fg">
            <LineChart className="h-4 w-4" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-fg">GPUIQ</div>
            <div className="text-[10px] uppercase tracking-wide text-muted">GPU Market Intel</div>
          </div>
        </Link>

        <div className="flex items-center gap-2">
          {me ? (
            <Link href="/dashboard">
              <Button>Open dashboard</Button>
            </Link>
          ) : (
            <>
              <Link href="/login">
                <Button variant="ghost">Sign in</Button>
              </Link>
              <Link href="/signup">
                <Button>Sign up free</Button>
              </Link>
            </>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
