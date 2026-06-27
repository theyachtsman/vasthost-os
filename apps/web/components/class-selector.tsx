'use client';

import { useWatchedClasses } from '@/lib/hooks';
import { useClassStore } from '@/lib/store';

export function ClassSelector() {
  const { data } = useWatchedClasses();
  const selected = useClassStore((s) => s.selected);
  const setSelected = useClassStore((s) => s.setSelected);

  const options =
    data && data.length
      ? data
      : [{ id: 'default', gpu_name: selected.gpu_name, num_gpus: selected.num_gpus, geolocation: null }];

  const key = (o: { gpu_name: string; num_gpus: number; geolocation: string | null }) =>
    `${o.gpu_name}|${o.num_gpus}|${o.geolocation ?? ''}`;

  return (
    <select
      aria-label="GPU class"
      className="h-9 rounded-md border border-border bg-bg px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      value={key(selected)}
      onChange={(e) => {
        const found = options.find((o) => key(o) === e.target.value);
        if (found)
          setSelected({
            gpu_name: found.gpu_name,
            num_gpus: found.num_gpus,
            geolocation: found.geolocation,
          });
      }}
    >
      {options.map((o) => (
        <option key={key(o)} value={key(o)}>
          {o.gpu_name} ×{o.num_gpus}
          {o.geolocation ? ` · ${o.geolocation}` : ''}
        </option>
      ))}
    </select>
  );
}
