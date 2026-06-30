import { useMemo } from 'react';

import { useMachines, useSimulatedHosts } from './hooks';

export interface OwnedFleet {
  /** GPU names the user hosts (real machines + simulated rigs), upper-cased-insensitive match via has(). */
  gpus: Set<string>;
  /** Regions the user hosts in. */
  regions: Set<string>;
  /** True if either real or simulated rigs exist. */
  hasAny: boolean;
  /** True if any of the owned rigs is simulated (drives "SIM" hinting). */
  hasSimulated: boolean;
}

// The user's fleet footprint, merged across real machines and simulated rigs, so
// the Market hub can highlight the GPUs they host and let them drill into pricing
// insights for their own cards. Only queries when enabled (signed-in/app mode) —
// guests get empty sets and no highlighting.
export function useOwnedFleet(enabled = true): OwnedFleet {
  const machines = useMachines(enabled);
  const sims = useSimulatedHosts(enabled);

  return useMemo(() => {
    const gpus = new Set<string>();
    const regions = new Set<string>();
    let hasSimulated = false;

    if (enabled) {
      (machines.data ?? []).forEach((m) => {
        if (m.gpu_name) gpus.add(m.gpu_name);
        if (m.geolocation) regions.add(m.geolocation);
      });
      (sims.data ?? []).forEach((s) => {
        if (s.gpu_name) {
          gpus.add(s.gpu_name);
          hasSimulated = true;
        }
        if (s.geolocation) regions.add(s.geolocation);
      });
    }

    return { gpus, regions, hasAny: gpus.size > 0, hasSimulated };
  }, [enabled, machines.data, sims.data]);
}
