'use client';

import { Badge, Button, DataState, Input, Label, Stat } from '@vasthost/ui';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/page-header';
import { Widget } from '@/components/widget';
import { relativeTime } from '@/lib/format';
import {
  useAccountStatus,
  useAddWatchedClass,
  useConnectAccount,
  useDisconnectAccount,
  useRemoveWatchedClass,
  useWatchedClasses,
} from '@/lib/hooks';

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Settings" description="Connect your Vast account and tune the Observer." />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ConnectionWidget />
        <WatchedClassesWidget />
      </div>
    </div>
  );
}

function ConnectionWidget() {
  const status = useAccountStatus();
  const connect = useConnectAccount();
  const disconnect = useDisconnectAccount();
  const [key, setKey] = useState('');

  const submit = () => {
    if (key.trim().length < 8) {
      toast.error('Enter a valid Vast API key');
      return;
    }
    connect.mutate(key.trim(), {
      onSuccess: () => {
        toast.success('Connected — initial sync started');
        setKey('');
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : 'Connection failed'),
    });
  };

  return (
    <Widget title="Vast Account">
      <DataState
        isLoading={status.isLoading}
        isError={status.isError}
        error={status.error}
        data={status.data}
        onRetry={status.refetch}
      >
        {(s) =>
          s.connected ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <Stat label="Account" value={s.email ?? s.display_name ?? 'Connected'} />
                <Badge variant="success">connected</Badge>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Stat label="User ID" value={s.vast_user_id ?? '—'} />
                <Stat label="Last sync" value={relativeTime(s.last_synced_at)} />
              </div>
              <div className="flex items-center justify-between text-xs text-muted">
                <span>Key {s.api_key_masked}</span>
              </div>
              <Button
                variant="danger"
                onClick={() =>
                  disconnect.mutate(undefined, {
                    onSuccess: () => toast.success('Disconnected'),
                  })
                }
              >
                Disconnect
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted">
                Paste your Vast.ai API key. It is validated against Vast, then stored encrypted at
                rest.
              </p>
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
              <Button onClick={submit} disabled={connect.isPending}>
                {connect.isPending ? 'Connecting…' : 'Connect account'}
              </Button>
            </div>
          )
        }
      </DataState>
    </Widget>
  );
}

function WatchedClassesWidget() {
  const classes = useWatchedClasses();
  const add = useAddWatchedClass();
  const remove = useRemoveWatchedClass();
  const [gpu, setGpu] = useState('RTX 4090');
  const [n, setN] = useState('1');
  const [region, setRegion] = useState('');

  const submit = () => {
    if (!gpu.trim()) {
      toast.error('Enter a GPU name');
      return;
    }
    add.mutate(
      { gpu_name: gpu.trim(), num_gpus: Number(n) || 1, geolocation: region.trim() || null },
      {
        onSuccess: () => toast.success('Watching class — Observer will poll it'),
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
      },
    );
  };

  return (
    <Widget title="Observer — Watched GPU Classes">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">
          These tuples drive the Market Observer poll (every 3 minutes). The dataset cannot be
          backfilled — add the classes you care about early.
        </p>
        <div className="grid grid-cols-[1fr_70px_80px_auto] items-end gap-2">
          <div className="flex flex-col gap-1">
            <Label>GPU name</Label>
            <Input value={gpu} onChange={(e) => setGpu(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label>#GPUs</Label>
            <Input type="number" value={n} onChange={(e) => setN(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Region</Label>
            <Input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="any" />
          </div>
          <Button onClick={submit} disabled={add.isPending}>
            Add
          </Button>
        </div>

        <DataState
          isLoading={classes.isLoading}
          isError={classes.isError}
          error={classes.error}
          data={classes.data}
          onRetry={classes.refetch}
          isEmpty={(d) => d.length === 0}
          emptyMessage="No watched classes — add one above to start the demand record."
        >
          {(rows) => (
            <div className="flex flex-col gap-1">
              {rows.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-md border border-border/70 bg-bg/40 px-3 py-2 text-sm"
                >
                  <span className="text-fg">
                    {c.gpu_name} ×{c.num_gpus}
                    {c.geolocation ? <span className="text-muted"> · {c.geolocation}</span> : null}
                  </span>
                  <button
                    aria-label="Remove watched class"
                    className="text-muted hover:text-red-400"
                    onClick={() =>
                      remove.mutate(c.id, { onSuccess: () => toast.success('Removed') })
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </DataState>
      </div>
    </Widget>
  );
}
