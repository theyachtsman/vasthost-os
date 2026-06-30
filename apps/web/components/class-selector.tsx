'use client';

import { useMemo } from 'react';

import { useAvailableClasses, useWatchedClasses } from '@/lib/hooks';
import { useClassStore } from '@/lib/store';

// GPU name + config-size selectors. Sizes are populated from the buckets that
// actually have market data (×1, ×2, ×4, ×8, …) for the chosen GPU.
export function ClassSelector() {
  const available = useAvailableClasses();
  const watched = useWatchedClasses();
  const selected = useClassStore((s) => s.selected);
  const setSelected = useClassStore((s) => s.setSelected);

  // Map gpu_name -> sorted list of {num_gpus, supply}
  const byGpu = useMemo(() => {
    const m = new Map<string, { num_gpus: number; supply: number | null }[]>();
    (available.data ?? []).forEach((c) => {
      const arr = m.get(c.gpu_name) ?? [];
      arr.push({ num_gpus: c.num_gpus, supply: c.supply_count });
      m.set(c.gpu_name, arr);
    });
    // Ensure watched gpu names appear even before a distribution exists.
    (watched.data ?? []).forEach((w) => {
      if (!m.has(w.gpu_name)) m.set(w.gpu_name, [{ num_gpus: 1, supply: null }]);
    });
    m.forEach((arr) => arr.sort((a, b) => a.num_gpus - b.num_gpus));
    return m;
  }, [available.data, watched.data]);

  // Only rendered once a GPU is selected; bail safely if not.
  if (!selected) return null;

  const gpuNames = Array.from(byGpu.keys()).sort();
  const sizes = byGpu.get(selected.gpu_name) ?? [{ num_gpus: selected.num_gpus, supply: null }];

  const selectCls =
    'h-9 rounded-md border border-border bg-bg px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';

  return (
    <div className="flex items-center gap-2">
      <select
        aria-label="GPU model"
        className={selectCls}
        value={selected.gpu_name}
        onChange={(e) => {
          const gpu = e.target.value;
          const opts = byGpu.get(gpu) ?? [{ num_gpus: 1, supply: null }];
          // keep current size if available, else first
          const keep = opts.find((o) => o.num_gpus === selected.num_gpus) ?? opts[0];
          setSelected({ gpu_name: gpu, num_gpus: keep.num_gpus, geolocation: null });
        }}
      >
        {gpuNames.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </select>

      <select
        aria-label="Config size"
        className={selectCls}
        value={selected.num_gpus}
        onChange={(e) =>
          setSelected({
            gpu_name: selected.gpu_name,
            num_gpus: Number(e.target.value),
            geolocation: null,
          })
        }
      >
        {sizes.map((s) => (
          <option key={s.num_gpus} value={s.num_gpus}>
            ×{s.num_gpus}
            {s.supply != null ? ` (${s.supply})` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
