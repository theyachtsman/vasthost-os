'use client';

import type { UserProviderKey } from '@vasthost/shared-types';
import { Badge, Button, DataState, Input, Label, Stat } from '@vasthost/ui';
import { useState } from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/page-header';
import { Widget } from '@/components/widget';
import { relativeTime } from '@/lib/format';
import {
  useConnectProviderKey,
  useDisconnectProviderKey,
  useMe,
  useProviderKeys,
} from '@/lib/hooks';

export default function SettingsPage() {
  const me = useMe();
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Settings"
        description="Connect your provider keys. Your key is validated, encrypted at rest, and used only for your own fleet, earnings, and pricing — never the shared market."
      />
      {me.data ? (
        <div className="text-xs text-muted">
          Signed in as <span className="text-fg">{me.data.email}</span>
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <VastKeyCard />
        <RunPodKeyCard />
      </div>
    </div>
  );
}

function ScopeBadges({ scopes }: { scopes: Record<string, unknown> | null }) {
  if (!scopes) return null;
  const entries = Object.entries(scopes);
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {entries.map(([k, v]) => (
        <Badge key={k} variant={v ? 'success' : 'muted'}>
          {k.replace(/_/g, ' ')}
          {v ? '' : ' ✕'}
        </Badge>
      ))}
    </div>
  );
}

function PermissionGuidance() {
  return (
    <div className="rounded-md border border-border/70 bg-bg/40 p-3 text-xs text-muted">
      <p className="mb-2 text-fg">When creating a restricted Vast key, grant only:</p>
      <ul className="ml-4 list-disc space-y-1">
        <li>
          <span className="text-fg">Machine read</span> — sync your fleet & utilization
        </li>
        <li>
          <span className="text-fg">Machine write / pricing</span> — let GPUIQ adjust your prices
          (used later)
        </li>
        <li>
          <span className="text-fg">Billing read</span> — sync earnings & balance
        </li>
      </ul>
      <p className="mt-2 text-amber-400">
        Do NOT grant billing-write or key-management permissions. GPUIQ never needs them, and a key
        without them limits the blast radius if it ever leaks.
      </p>
      <a
        href="https://cloud.vast.ai/manage-keys/"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-block text-accent hover:underline"
      >
        Open Vast key management →
      </a>
    </div>
  );
}

function VastKeyCard() {
  const keys = useProviderKeys();
  const connect = useConnectProviderKey();
  const disconnect = useDisconnectProviderKey();
  const [key, setKey] = useState('');
  const [replacing, setReplacing] = useState(false);

  const submit = () => {
    if (key.trim().length < 8) {
      toast.error('Enter a valid Vast API key');
      return;
    }
    connect.mutate(
      { provider: 'vast', api_key: key.trim() },
      {
        onSuccess: () => {
          toast.success('Vast key connected — initial sync started');
          setKey('');
          setReplacing(false);
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Connection failed'),
      },
    );
  };

  const renderForm = () => (
    <div className="flex flex-col gap-3">
      <PermissionGuidance />
      <div className="flex flex-col gap-1">
        <Label htmlFor="vast-key">Vast API key</Label>
        <Input
          id="vast-key"
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="••••••••••••••••"
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
      </div>
      <div className="flex gap-2">
        <Button onClick={submit} disabled={connect.isPending}>
          {connect.isPending ? 'Validating…' : 'Connect key'}
        </Button>
        {replacing ? (
          <Button variant="ghost" onClick={() => setReplacing(false)}>
            Cancel
          </Button>
        ) : null}
      </div>
    </div>
  );

  return (
    <Widget title="Vast.ai" action={<Badge variant="success">active</Badge>}>
      <DataState
        isLoading={keys.isLoading}
        isError={keys.isError}
        error={keys.error}
        data={keys.data}
        onRetry={keys.refetch}
      >
        {(rows: UserProviderKey[]) => {
          const vast = rows.find((k) => k.provider === 'vast');
          if (!vast || replacing) return renderForm();
          return (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <Stat label="Vast user" value={vast.vast_user_id ?? '—'} />
                <Badge variant={vast.is_active ? 'success' : 'danger'}>
                  {vast.is_active ? 'connected' : 'needs reconnect'}
                </Badge>
              </div>
              {!vast.is_active ? (
                <p className="text-xs text-amber-400">
                  This key failed validation and was disabled — replace it to resume syncing.
                </p>
              ) : null}
              <div className="grid grid-cols-2 gap-4">
                <Stat label="Last validated" value={relativeTime(vast.last_validated_at)} />
                <Stat label="Last synced" value={relativeTime(vast.last_synced_at)} />
              </div>
              <ScopeBadges scopes={vast.detected_scopes} />
              <div className="text-xs text-muted">Key {vast.api_key_masked}</div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setReplacing(true)}>
                  Replace
                </Button>
                <Button
                  variant="danger"
                  onClick={() =>
                    disconnect.mutate(vast.id, {
                      onSuccess: () => toast.success('Disconnected — syncs halted'),
                    })
                  }
                >
                  Disconnect
                </Button>
              </div>
            </div>
          );
        }}
      </DataState>
    </Widget>
  );
}

function RunPodKeyCard() {
  return (
    <Widget title="RunPod" action={<Badge variant="muted">coming soon</Badge>}>
      <div className="flex flex-col gap-3 opacity-70">
        <p className="text-sm text-muted">
          RunPod support is on the way. The connection flow will mirror Vast — scoped, encrypted,
          and used only for your own fleet.
        </p>
        <div className="flex flex-col gap-1">
          <Label htmlFor="runpod-key">RunPod API key</Label>
          <Input id="runpod-key" type="password" placeholder="coming soon" disabled />
        </div>
        <Button disabled>Connect key</Button>
      </div>
    </Widget>
  );
}
