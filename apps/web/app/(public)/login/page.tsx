'use client';

import { Button, Input, Label } from '@vasthost/ui';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { toast } from 'sonner';

import { useLogin } from '@/lib/hooks';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    login.mutate(
      { email: email.trim(), password },
      {
        onSuccess: () => {
          toast.success('Signed in');
          router.push(params.get('next') || '/dashboard');
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Sign in failed'),
      },
    );
  };

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 pt-12">
      <div>
        <h1 className="text-xl font-semibold text-fg">Welcome back</h1>
        <p className="text-sm text-muted">Sign in to GPUIQ to manage your fleet.</p>
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
      <p className="text-sm text-muted">
        No account?{' '}
        <Link href="/signup" className="text-accent hover:underline">
          Sign up free
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
