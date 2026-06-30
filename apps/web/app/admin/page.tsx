'use client';

import type { PlatformKey } from '@vasthost/shared-types';
import { Badge, Button, DataState, Input, Label, Stat } from '@vasthost/ui';
import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/page-header';
import { Widget } from '@/components/widget';
import { num, relativeTime } from '@/lib/format';
import {
  useAdminChangePassword,
  useAdminLogout,
  useAdminMe,
  useAdminObserverStatus,
  useDeletePlatformKey,
  usePlatformKeys,
  useSetPlatformKey,
} from '@/lib/hooks';

export default function AdminConsole() {
  const me = useAdminMe();
  const router = useRouter();
  const logout = useAdminLogout();

  // First login after seeding: force a password change before anything else, so
  // the real admin password never has to live in .env.
  if (me.data?.must_change_password) {
    return <ForcePasswordChange />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Platform Console"
          description="The platform keys here drive ONLY the public Market Observer — never any user's rigs."
        />
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted">{me.data?.email ?? ''}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              logout.mutate(undefined, {
                onSuccess: () => {
                  toast.success('Signed out');
                  router.push('/admin/login');
                },
              })
            }
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </div>

      <ObserverHealth />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PlatformKeyCard provider="vast" title="Platform Vast key" validates />
        <PlatformKeyCard provider="runpod" title="Platform RunPod key" validates={false} />
      </div>
    </div>
  );
}

function ForcePasswordChange() {
  const change = useAdminChangePassword();
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (pw !== confirm) {
      toast.error('Passwords do not match');
      return;
    }
    change.mutate(
      { new_password: pw },
      {
        onSuccess: () => toast.success('Password updated'),
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Update failed'),
      },
    );
  };

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 pt-12">
      <div>
        <h1 className="text-xl font-semibold text-fg">Set your admin password</h1>
        <p className="text-sm text-muted">
          You signed in with the temporary password. Choose a new one to continue — it is stored
          only as a hash, never in any config file.
        </p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="new-pw">New password</Label>
          <Input
            id="new-pw"
            type="password"
            autoComplete="new-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
          <span className="text-[11px] text-muted">At least 8 characters.</span>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="confirm-pw">Confirm password</Label>
          <Input
            id="confirm-pw"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={change.isPending}>
          {change.isPending ? 'Saving…' : 'Set password & continue'}
        </Button>
      </form>
    </div>
  );
}

function ObserverHealth() {
  const status = useAdminObserverStatus();
  return (
    <Widget title="Observer Health">
      <DataState
        isLoading={status.isLoading}
        isError={status.isError}
        error={status.error}
        data={status.data}
        onRetry={status.refetch}
      >
        {(s) => (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Stat
                label="Platform key"
                value={s.platform_key_connected ? 'connected' : 'missing'}
                sub={s.platform_key_provider ?? '—'}
              />
              <Stat label="Last poll" value={relativeTime(s.last_poll_at)} />
              <Stat label="Snapshots" value={num(s.total_offer_snapshots)} />
              <Stat label="Confirmed rentals" value={num(s.total_clearing_events)} />
              <Stat
                label="Interval"
                value={`${Math.round(s.poll_interval_seconds / 60)}m`}
              />
              <Stat label="Watched classes" value={num(s.watched_classes_count)} />
              <Stat
                label="Key validated"
                value={relativeTime(s.platform_key_last_validated_at)}
              />
            </div>
            <div>
              <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">
                Watched GPU classes
              </div>
              <div className="flex flex-wrap gap-1">
                {s.watched_classes.length === 0 ? (
                  <span className="text-xs text-muted">
                    None yet — auto-discovery populates these once a platform key is set.
                  </span>
                ) : (
                  s.watched_classes.map((w) => (
                    <Badge key={`${w.gpu_name}-${w.num_gpus}`} variant="muted">
                      {w.gpu_name} ×{w.num_gpus}
                    </Badge>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </DataState>
    </Widget>
  );
}

function PlatformKeyCard({
  provider,
  title,
  validates,
}: {
  provider: string;
  title: string;
  validates: boolean;
}) {
  const keys = usePlatformKeys();
  const setKey = useSetPlatformKey();
  const del = useDeletePlatformKey();
  const [value, setValue] = useState('');
  const [replacing, setReplacing] = useState(false);

  const submit = () => {
    if (value.trim().length < 8) {
      toast.error('Enter a valid API key');
      return;
    }
    setKey.mutate(
      { provider, api_key: value.trim() },
      {
        onSuccess: () => {
          toast.success(`${title} saved`);
          setValue('');
          setReplacing(false);
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Save failed'),
      },
    );
  };

  const form = (
    <div className="flex flex-col gap-3">
      {!validates ? (
        <p className="text-xs text-amber-400">
          Scaffolding only — the RunPod key is stored encrypted but not validated or polled yet.
        </p>
      ) : (
        <p className="text-xs text-muted">
          Validated against the provider before storing. Used read-only by the Observer.
        </p>
      )}
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${provider}-key`}>API key</Label>
        <Input
          id={`${provider}-key`}
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="••••••••••••••••"
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
      </div>
      <div className="flex gap-2">
        <Button onClick={submit} disabled={setKey.isPending}>
          {setKey.isPending ? 'Saving…' : 'Save key'}
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
    <Widget
      title={title}
      action={validates ? <Badge variant="success">active</Badge> : <Badge variant="muted">inactive</Badge>}
    >
      <DataState
        isLoading={keys.isLoading}
        isError={keys.isError}
        error={keys.error}
        data={keys.data}
        onRetry={keys.refetch}
      >
        {(rows: PlatformKey[]) => {
          const k = rows.find((r) => r.provider === provider);
          if (!k || replacing) return form;
          return (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <Stat label="Status" value={validates ? 'polling' : 'stored (inactive)'} />
                <Badge variant={validates ? 'success' : 'muted'}>{k.provider}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Stat label="Last validated" value={relativeTime(k.last_validated_at)} />
                <Stat label="Added" value={relativeTime(k.created_at)} />
              </div>
              <div className="text-xs text-muted">Key {k.api_key_masked}</div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setReplacing(true)}>
                  Replace
                </Button>
                <Button
                  variant="danger"
                  onClick={() =>
                    del.mutate(k.id, { onSuccess: () => toast.success('Key deleted') })
                  }
                >
                  Delete
                </Button>
              </div>
            </div>
          );
        }}
      </DataState>
    </Widget>
  );
}
