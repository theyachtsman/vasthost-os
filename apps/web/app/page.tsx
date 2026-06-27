'use client';

import { Badge, Card, CardContent, CardHeader, CardTitle, DataState, Stat } from '@vasthost/ui';
import { Activity, Cpu, Database, DollarSign, Radio, Server } from 'lucide-react';

import { DistributionBar } from '@/components/distribution-bar';
import { PageHeader } from '@/components/page-header';
import { dph, num, pct, relativeTime, usd } from '@/lib/format';
import {
  useClearingEvents,
  useDistribution,
  useEarningsDaily,
  useEarningsSummary,
  useHealth,
  useMachines,
  useObserverStatus,
} from '@/lib/hooks';
import { useClassStore } from '@/lib/store';

export default function DashboardPage() {
  const cls = useClassStore((s) => s.selected);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Dashboard"
        description="Your fleet, the market, and the data engine — at a glance."
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <FleetOverviewCard />
        <EarningsTodayCard />
        <MarketPositionCard cls={cls} />
        <MarketActivityCard cls={cls} />
        <ObserverStatusCard />
        <SystemStatusCard />
      </div>
    </div>
  );
}

function CardShell({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2">
        <Icon className="h-4 w-4 text-muted" />
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function FleetOverviewCard() {
  const { data, isLoading, isError, error, refetch } = useMachines();
  return (
    <CardShell title="Fleet Overview" icon={Server}>
      <DataState
        isLoading={isLoading}
        isError={isError}
        error={error}
        data={data}
        onRetry={refetch}
        isEmpty={(d) => d.length === 0}
        emptyMessage="No machines yet — connect your Vast key in Settings."
      >
        {(machines) => {
          const total = machines.length;
          const online = machines.filter((m) => m.is_rentable).length;
          const busy = machines.filter((m) => m.is_listed && !m.is_rentable).length;
          const util = total ? (busy / total) * 100 : 0;
          const expiring = machines.filter((m) => {
            if (!m.offer_end_date) return false;
            const h = (new Date(m.offer_end_date).getTime() - Date.now()) / 3.6e6;
            return h >= 0 && h < 48;
          }).length;
          return (
            <div className="grid grid-cols-2 gap-4">
              <Stat label="Machines" value={num(total)} />
              <Stat label="GPUs online" value={num(online)} />
              <Stat label="Rented" value={num(busy)} sub={`${pct(util)} utilization`} />
              <Stat
                label="Expiring < 48h"
                value={num(expiring)}
                sub={expiring ? 'needs attention' : 'all healthy'}
              />
            </div>
          );
        }}
      </DataState>
    </CardShell>
  );
}

function EarningsTodayCard() {
  const summary = useEarningsSummary();
  const daily = useEarningsDaily(7);
  const isLoading = summary.isLoading || daily.isLoading;
  return (
    <CardShell title="Earnings" icon={DollarSign}>
      <DataState
        isLoading={isLoading}
        isError={summary.isError}
        error={summary.error}
        data={summary.data}
        onRetry={summary.refetch}
      >
        {(s) => {
          const today = new Date().toISOString().slice(0, 10);
          const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
          const todayRow = daily.data?.find((d) => d.earn_date === today);
          const yRow = daily.data?.find((d) => d.earn_date === y);
          return (
            <div className="grid grid-cols-2 gap-4">
              <Stat
                label="Today (est.)"
                value={usd(todayRow?.total_earn ?? 0)}
                sub="from rental state"
              />
              <Stat label="Yesterday" value={usd(yRow?.total_earn ?? 0)} />
              <Stat label="Month to date" value={usd(s.total_all)} />
              <Stat label="All-time" value={usd(s.all_time_total)} />
            </div>
          );
        }}
      </DataState>
    </CardShell>
  );
}

function MarketPositionCard({ cls }: { cls: { gpu_name: string; num_gpus: number } }) {
  const dist = useDistribution(cls.gpu_name, cls.num_gpus);
  const machines = useMachines();
  const yourMachine = machines.data?.find((m) => m.gpu_name === cls.gpu_name);
  const yourPrice = yourMachine?.current_price_gpu ?? null;

  return (
    <CardShell title="Market Position" icon={Activity}>
      <DataState
        isLoading={dist.isLoading}
        isError={dist.isError}
        error={dist.error}
        data={dist.data}
        onRetry={dist.refetch}
        emptyMessage={`No distribution for ${cls.gpu_name} yet — Observer is gathering data.`}
      >
        {(d) => {
          let percentile: number | null = null;
          if (yourPrice != null) {
            const points = [d.p10_price, d.p25_price, d.p50_price, d.p75_price, d.p90_price].filter(
              (v): v is number => v != null,
            );
            const below = points.filter((v) => v < yourPrice).length;
            percentile = points.length ? Math.round((below / points.length) * 100) : null;
          }
          return (
            <div className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between">
                <Stat label="Your price" value={dph(yourPrice)} />
                <Stat label="Market p50" value={dph(d.p50_price)} className="items-end" />
              </div>
              <DistributionBar dist={d} yourPrice={yourPrice} />
              <p className="text-xs text-muted">
                {percentile != null
                  ? `You are priced at the ${percentile}th percentile.`
                  : 'Set a price by connecting a machine on this GPU class.'}
              </p>
            </div>
          );
        }}
      </DataState>
    </CardShell>
  );
}

function MarketActivityCard({ cls }: { cls: { gpu_name: string; num_gpus: number } }) {
  const events = useClearingEvents(cls.gpu_name, cls.num_gpus, 200);
  const dist = useDistribution(cls.gpu_name, cls.num_gpus);
  return (
    <CardShell title="Market Activity" icon={Radio}>
      <DataState
        isLoading={events.isLoading}
        isError={events.isError}
        error={events.error}
        data={events.data}
        onRetry={events.refetch}
        emptyMessage="No clearing events detected yet for this class."
      >
        {(evts) => {
          const now = Date.now();
          const last1h = evts.filter((e) => now - new Date(e.detected_at).getTime() < 3.6e6).length;
          const last24h = evts.filter(
            (e) => now - new Date(e.detected_at).getTime() < 24 * 3.6e6,
          ).length;
          return (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-4">
                <Stat label="Cleared (1h)" value={num(last1h)} />
                <Stat label="Cleared (24h)" value={num(last24h)} />
              </div>
              <div className="flex items-center justify-between text-xs text-muted">
                <span>Clearing rate 1h: {dist.data?.clearing_rate_1h ?? '—'}</span>
                <span>24h: {dist.data?.clearing_rate_24h ?? '—'}</span>
              </div>
            </div>
          );
        }}
      </DataState>
    </CardShell>
  );
}

function ObserverStatusCard() {
  const { data, isLoading, isError, error, refetch } = useObserverStatus();
  return (
    <CardShell title="Observer Status" icon={Database}>
      <DataState
        isLoading={isLoading}
        isError={isError}
        error={error}
        data={data}
        onRetry={refetch}
      >
        {(s) => (
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Last poll" value={relativeTime(s.last_poll_at)} />
            <Stat
              label="Interval"
              value={`${Math.round(s.poll_interval_seconds / 60)}m`}
              sub={`${s.watched_classes} class${s.watched_classes === 1 ? '' : 'es'}`}
            />
            <Stat label="Snapshots" value={num(s.total_offer_snapshots)} />
            <Stat label="Clearing events" value={num(s.total_clearing_events)} />
          </div>
        )}
      </DataState>
    </CardShell>
  );
}

function SystemStatusCard() {
  const { data, isLoading, isError, error, refetch } = useHealth();
  return (
    <CardShell title="System Status" icon={Cpu}>
      <DataState
        isLoading={isLoading}
        isError={isError}
        error={error}
        data={data}
        onRetry={refetch}
      >
        {(h) => (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-fg">Overall</span>
              <Badge variant={h.status === 'healthy' ? 'success' : 'danger'}>{h.status}</Badge>
            </div>
            {Object.entries(h.components).map(([name, c]) => (
              <div key={name} className="flex items-center justify-between text-sm">
                <span className="capitalize text-muted">{name}</span>
                <Badge variant={c.status === 'ok' ? 'success' : 'danger'}>{c.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </DataState>
    </CardShell>
  );
}
