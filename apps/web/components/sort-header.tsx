'use client';

import { cn } from '@vasthost/ui';
import { ChevronDown, ChevronsUpDown, ChevronUp } from 'lucide-react';
import { useMemo, useState } from 'react';

export type SortDir = 'asc' | 'desc';

export interface SortState<K extends string> {
  key: K;
  dir: SortDir;
  toggle: (key: K) => void;
}

/** Client-side sort state + a comparator-driven sorter. */
export function useSort<T, K extends string>(
  initialKey: K,
  initialDir: SortDir,
  accessors: Record<K, (row: T) => number | string | null | undefined>,
) {
  const [key, setKey] = useState<K>(initialKey);
  const [dir, setDir] = useState<SortDir>(initialDir);

  const toggle = (k: K) => {
    if (k === key) {
      setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setKey(k);
      setDir('desc');
    }
  };

  const sort = useMemo(
    () => (rows: T[]) => {
      const get = accessors[key];
      const sorted = [...rows].sort((a, b) => {
        const av = get(a);
        const bv = get(b);
        // nulls sort last regardless of direction
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === 'number' && typeof bv === 'number') return av - bv;
        return String(av).localeCompare(String(bv));
      });
      return dir === 'asc' ? sorted : sorted.reverse();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, dir],
  );

  const state: SortState<K> = { key, dir, toggle };
  return { state, sort };
}

export function SortHeader<K extends string>({
  label,
  sortKey,
  state,
  align = 'left',
  className,
}: {
  label: string;
  sortKey: K;
  state: SortState<K>;
  align?: 'left' | 'right';
  className?: string;
}) {
  const active = state.key === sortKey;
  const Icon = !active ? ChevronsUpDown : state.dir === 'asc' ? ChevronUp : ChevronDown;
  return (
    <th
      className={cn('px-4 py-2 font-medium', align === 'right' && 'text-right', className)}
      aria-sort={active ? (state.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => state.toggle(sortKey)}
        className={cn(
          'inline-flex items-center gap-1 transition-colors hover:text-fg',
          align === 'right' && 'flex-row-reverse',
          active ? 'text-fg' : 'text-muted',
        )}
      >
        {label}
        <Icon className={cn('h-3 w-3', active ? 'text-accent' : 'text-muted/60')} />
      </button>
    </th>
  );
}
