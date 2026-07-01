'use client';

import { Button, Input, Label } from '@vasthost/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { useRegister } from '@/lib/hooks';

export default function SignupPage() {
  const router = useRouter();
  const register = useRegister();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    register.mutate(
      { email: email.trim(), password, display_name: displayName.trim() || undefined },
      {
        onSuccess: () => {
          toast.success('Account created');
          router.push('/dashboard');
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Sign up failed'),
      },
    );
  };

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 pt-12">
      <div>
        <h1 className="text-xl font-semibold text-fg">Create your account</h1>
        <p className="text-sm text-muted">
          Free. You can browse the market without one — sign up to connect your own rigs.
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
          <Label htmlFor="name">Display name (optional)</Label>
          <Input id="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <span className="text-[11px] text-muted">At least 8 characters.</span>
        </div>
        <Button type="submit" disabled={register.isPending}>
          {register.isPending ? 'Creating…' : 'Create account'}
        </Button>
      </form>
      <p className="text-sm text-muted">
        Already have an account?{' '}
        <Link href="/login" className="text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
