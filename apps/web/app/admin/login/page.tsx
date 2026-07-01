'use client';

import { Button, Input, Label } from '@vasthost/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { useAdminLogin } from '@/lib/hooks';

export default function AdminLoginPage() {
  const router = useRouter();
  const login = useAdminLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    login.mutate(
      { email: email.trim(), password },
      {
        onSuccess: () => {
          toast.success('Signed in to admin');
          router.push('/admin');
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Sign in failed'),
      },
    );
  };

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 pt-12">
      <div>
        <h1 className="text-xl font-semibold text-fg">Admin sign in</h1>
        <p className="text-sm text-muted">
          Platform operators only. This surface is separate from the user app.
        </p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={login.isPending}>
          {login.isPending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </div>
  );
}
