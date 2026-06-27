'use client';

import { Badge, cn } from '@vasthost/ui';
import {
  Activity,
  BarChart3,
  Boxes,
  DollarSign,
  LayoutDashboard,
  LineChart,
  Server,
  Settings,
  Tag,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  comingSoon?: boolean;
};

const SURFACES: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/market', label: 'Market Intelligence', icon: LineChart },
  { href: '/earnings', label: 'Earnings & Financials', icon: DollarSign },
  { href: '/fleet', label: 'Fleet Health', icon: Server },
  { href: '/pricing', label: 'Pricing Control', icon: Tag, comingSoon: true },
  { href: '/offers', label: 'Offer Management', icon: Boxes, comingSoon: true },
  { href: '/analytics', label: 'Analytics & Insights', icon: BarChart3, comingSoon: true },
];

const TOOLS: NavItem[] = [
  { href: '/simulator', label: 'Simulator', icon: Activity },
  { href: '/settings', label: 'Settings', icon: Settings },
];

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  const content = (
    <span
      className={cn(
        'group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
        active
          ? 'bg-accent/15 font-medium text-fg'
          : item.comingSoon
            ? 'text-muted/60'
            : 'text-muted hover:bg-border/30 hover:text-fg',
      )}
    >
      <Icon className={cn('h-4 w-4 shrink-0', active && 'text-accent')} />
      <span className="flex-1 truncate">{item.label}</span>
      {item.comingSoon ? (
        <Badge variant="muted" className="shrink-0">
          soon
        </Badge>
      ) : null}
    </span>
  );

  if (item.comingSoon) {
    return <div aria-disabled className="cursor-not-allowed select-none">{content}</div>;
  }
  return (
    <Link href={item.href} aria-current={active ? 'page' : undefined}>
      {content}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-surface/40">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-accent-fg">
          <Server className="h-4 w-4" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold text-fg">VastHost OS</div>
          <div className="text-[10px] uppercase tracking-wide text-muted">GPU Host Intel</div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
        <div className="px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wider text-muted/70">
          Surfaces
        </div>
        {SURFACES.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}

        <div className="px-2 pb-1 pt-4 text-[10px] font-medium uppercase tracking-wider text-muted/70">
          Tools
        </div>
        {TOOLS.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}
      </nav>

      <div className="border-t border-border p-3 text-[10px] text-muted/70">
        Phase 0 · Observer live
      </div>
    </aside>
  );
}
