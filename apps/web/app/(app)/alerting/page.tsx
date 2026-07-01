'use client';

import type { RigAlert } from '@vasthost/shared-types';
import { Badge, Button, DataState, Input } from '@vasthost/ui';
import { AlertTriangle, Bell, Clock, Power, Timer } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/page-header';
import { Widget } from '@/components/widget';
import {
  useAlertSettings,
  useMachineAlerts,
  useMachines,
  useSimulatedAlerts,
  useSimulatedHosts,
  useUpdateAlertSettings,
} from '@/lib/hooks';

export default function AlertingPage() {
  const machines = useMachines();
  const simHosts = useSimulatedHosts();

  // No real machines but simulated rigs exist → show alerts for those, same
  // fallback pattern as Earnings/Fleet/Pricing/Offers.
  const noRealMachines = !machines.isLoading && (machines.data?.length ?? 0) === 0;
  const useSimulated = noRealMachines && (simHosts.data?.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Alerting"
        description="Configurable thresholds for offer expiry, idle time, long-running rentals, and unlisted machines — across your fleet and simulated rigs."
      />
      <AlertSettingsPanel />
      {useSimulated ? (
        <div className="rounded-md border border-accent/30 bg-accent/5 px-4 py-2 text-xs text-muted">
          No real machines connected — showing alerts for your{' '}
          <span className="text-accent">simulated rigs</span> so you can tune thresholds before
          hosting.
        </div>
      ) : null}
      {useSimulated ? <SimulatedAlertsList /> : <RealAlertsList />}
    </div>
  );
}

type SettingsDraft = {
  offer_expiry_enabled: boolean;
  offer_expiry_threshold_hours: string;
  idle_enabled: boolean;
  idle_threshold_hours: string;
  rented_enabled: boolean;
  rented_threshold_hours: string;
  offline_enabled: boolean;
};

const DEFAULT_DRAFT: SettingsDraft = {
  offer_expiry_enabled: true,
  offer_expiry_threshold_hours: '48',
  idle_enabled: false,
  idle_threshold_hours: '4',
  rented_enabled: false,
  rented_threshold_hours: '24',
  offline_enabled: false,
};

function AlertSettingsPanel() {
  const settings = useAlertSettings();
  const update = useUpdateAlertSettings();
  const [draft, setDraft] = useState<SettingsDraft>(DEFAULT_DRAFT);
  const loaded = useRef(false);

  useEffect(() => {
    if (settings.data && !loaded.current) {
      setDraft({
        offer_expiry_enabled: settings.data.offer_expiry_enabled,
        offer_expiry_threshold_hours: String(settings.data.offer_expiry_threshold_hours),
        idle_enabled: settings.data.idle_enabled,
        idle_threshold_hours: String(settings.data.idle_threshold_hours),
        rented_enabled: settings.data.rented_enabled,
        rented_threshold_hours: String(settings.data.rented_threshold_hours),
        offline_enabled: settings.data.offline_enabled,
      });
      loaded.current = true;
    }
  }, [settings.data]);

  const save = () => {
    update.mutate(
      {
        offer_expiry_enabled: draft.offer_expiry_enabled,
        offer_expiry_threshold_hours: Number(draft.offer_expiry_threshold_hours) || 48,
        idle_enabled: draft.idle_enabled,
        idle_threshold_hours: Number(draft.idle_threshold_hours) || 4,
        rented_enabled: draft.rented_enabled,
        rented_threshold_hours: Number(draft.rented_threshold_hours) || 24,
        offline_enabled: draft.offline_enabled,
      },
      {
        onSuccess: () => toast.success('Alert settings saved'),
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Save failed'),
      },
    );
  };

  return (
    <Widget
      title="Alert types"
      action={
        <Button size="sm" disabled={update.isPending || settings.isLoading} onClick={save}>
          {update.isPending ? 'Saving…' : 'Save'}
        </Button>
      }
    >
      <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2">
        <AlertToggleRow
          icon={Clock}
          label="Offer expiring"
          description="Alert when a machine/rig's offer end date is within the threshold."
          enabled={draft.offer_expiry_enabled}
          onEnabledChange={(v) => setDraft((d) => ({ ...d, offer_expiry_enabled: v }))}
          threshold={draft.offer_expiry_threshold_hours}
          onThresholdChange={(v) => setDraft((d) => ({ ...d, offer_expiry_threshold_hours: v }))}
        />
        <AlertToggleRow
          icon={Timer}
          label="Idle too long"
          description="Alert when a machine/rig has had no active rental for longer than the threshold."
          enabled={draft.idle_enabled}
          onEnabledChange={(v) => setDraft((d) => ({ ...d, idle_enabled: v }))}
          threshold={draft.idle_threshold_hours}
          onThresholdChange={(v) => setDraft((d) => ({ ...d, idle_threshold_hours: v }))}
        />
        <AlertToggleRow
          icon={Bell}
          label="Rented too long"
          description="Alert when a single rental has been running continuously past the threshold."
          enabled={draft.rented_enabled}
          onEnabledChange={(v) => setDraft((d) => ({ ...d, rented_enabled: v }))}
          threshold={draft.rented_threshold_hours}
          onThresholdChange={(v) => setDraft((d) => ({ ...d, rented_threshold_hours: v }))}
        />
        <AlertToggleRow
          icon={Power}
          label="Offline / unlisted"
          description="Alert when a machine is unlisted, or a simulated rig is deactivated."
          enabled={draft.offline_enabled}
          onEnabledChange={(v) => setDraft((d) => ({ ...d, offline_enabled: v }))}
        />
      </div>
    </Widget>
  );
}

function AlertToggleRow({
  icon: Icon,
  label,
  description,
  enabled,
  onEnabledChange,
  threshold,
  onThresholdChange,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  threshold?: string;
  onThresholdChange?: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-bg/30 p-3">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-fg">
          <input
            type="checkbox"
            className="accent-accent"
            checked={enabled}
            onChange={(e) => onEnabledChange(e.target.checked)}
          />
          <Icon className="h-4 w-4 text-muted" />
          {label}
        </label>
        {threshold != null && onThresholdChange ? (
          <div className="flex items-center gap-1 text-xs text-muted">
            <Input
              type="number"
              min={1}
              className="h-7 w-16"
              value={threshold}
              disabled={!enabled}
              onChange={(e) => onThresholdChange(e.target.value)}
            />
            hours
          </div>
        ) : null}
      </div>
      <p className="text-[11px] text-muted">{description}</p>
    </div>
  );
}

function RealAlertsList() {
  const alerts = useMachineAlerts();
  return (
    <Widget title="Active alerts">
      <DataState
        isLoading={alerts.isLoading}
        isError={alerts.isError}
        error={alerts.error}
        data={alerts.data}
        onRetry={alerts.refetch}
        isEmpty={(d) => d.length === 0}
        emptyMessage="No active alerts — nothing needs your attention right now."
      >
        {(rows) => <AlertList alerts={rows} />}
      </DataState>
    </Widget>
  );
}

function SimulatedAlertsList() {
  const alerts = useSimulatedAlerts();
  return (
    <Widget title="Active alerts — sandbox">
      <DataState
        isLoading={alerts.isLoading}
        isError={alerts.isError}
        error={alerts.error}
        data={alerts.data}
        onRetry={alerts.refetch}
        isEmpty={(d) => d.length === 0}
        emptyMessage="No active alerts for your simulated rigs — enable a threshold above, or simulate a rental / deactivate a rig in Simulator to see one fire."
      >
        {(rows) => <AlertList alerts={rows} />}
      </DataState>
    </Widget>
  );
}

const KIND_ICON: Record<RigAlert['kind'], React.ComponentType<{ className?: string }>> = {
  offer_expiry: Clock,
  idle: Timer,
  rented: Bell,
  offline: Power,
};

const KIND_LABEL: Record<RigAlert['kind'], string> = {
  offer_expiry: 'offer expiring',
  idle: 'idle',
  rented: 'long rental',
  offline: 'offline',
};

function AlertList({ alerts }: { alerts: RigAlert[] }) {
  return (
    <div className="flex flex-col gap-2 pt-1">
      {alerts.map((a, i) => {
        const Icon = KIND_ICON[a.kind] ?? AlertTriangle;
        const danger = a.severity === 'danger';
        return (
          <div
            key={`${a.kind}-${a.id}-${i}`}
            className={
              'flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm ' +
              (danger ? 'border-red-500/30 bg-red-500/5' : 'border-amber-500/30 bg-amber-500/5')
            }
          >
            <div className="flex items-center gap-2">
              <Icon className={'h-4 w-4 ' + (danger ? 'text-red-400' : 'text-amber-400')} />
              <span className="text-fg">{a.label}</span>
              {a.simulated ? (
                <Badge variant="accent" className="ml-1">
                  SIM
                </Badge>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="muted">{KIND_LABEL[a.kind]}</Badge>
              <Badge variant={danger ? 'danger' : 'warning'}>{a.detail}</Badge>
            </div>
          </div>
        );
      })}
    </div>
  );
}
