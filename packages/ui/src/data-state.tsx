import { AlertTriangle, Inbox } from 'lucide-react';
import * as React from 'react';

import { cn } from './cn';

// ── Skeleton ───────────────────────────────────────────────────
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-border/50', className)}
      {...props}
    />
  );
}

export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-4 w-full" style={{ width: `${90 - i * 12}%` }} />
      ))}
    </div>
  );
}

// ── DataState — the house four-state wrapper ──────────────────
// Every data widget renders exactly one of: skeleton | error | empty | content.
type DataStateProps<T> = {
  isLoading: boolean;
  isError?: boolean;
  error?: unknown;
  data: T | undefined | null;
  isEmpty?: (data: T) => boolean;
  skeleton?: React.ReactNode;
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  onRetry?: () => void;
  children: (data: T) => React.ReactNode;
};

export function DataState<T>({
  isLoading,
  isError,
  error,
  data,
  isEmpty,
  skeleton,
  emptyMessage = 'No data yet.',
  emptyIcon,
  onRetry,
  children,
}: DataStateProps<T>) {
  if (isLoading) {
    return <>{skeleton ?? <SkeletonRows rows={3} />}</>;
  }
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
        <AlertTriangle className="h-5 w-5 text-red-400" />
        <p className="text-sm text-fg">Something went wrong</p>
        <p className="max-w-xs text-xs text-muted">
          {error instanceof Error ? error.message : 'Failed to load data.'}
        </p>
        {onRetry ? (
          <button
            onClick={onRetry}
            className="mt-1 rounded-md border border-border px-3 py-1 text-xs text-muted hover:text-fg"
          >
            Retry
          </button>
        ) : null}
      </div>
    );
  }
  if (data == null || (isEmpty && isEmpty(data))) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
        {emptyIcon ?? <Inbox className="h-5 w-5 text-muted" />}
        <p className="text-sm text-muted">{emptyMessage}</p>
      </div>
    );
  }
  return <>{children(data)}</>;
}
