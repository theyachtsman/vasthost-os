import { ShieldCheck } from 'lucide-react';

// A structurally separate tree from the user app (Part 3). No user sidebar/
// topbar, its own cookie scope (enforced in middleware.ts). Unreachable from a
// regular user session.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface/40 px-5">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-red-500/80 text-white">
          <ShieldCheck className="h-4 w-4" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold text-fg">GPUIQ Admin</div>
          <div className="text-[10px] uppercase tracking-wide text-muted">Platform console</div>
        </div>
      </header>
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
