import { useEffect, useMemo } from 'react';

import { useMachines, useSimulatedHosts } from './hooks';
import { type GpuClass, useClassStore } from './store';

export interface OwnedFleet {
  /** GPU names the user hosts (real machines + simulated rigs), upper-cased-insensitive match via has(). */
  gpus: Set<string>;
  /** Regions the user hosts in. */
  regions: Set<string>;
  /** True if either real or simulated rigs exist. */
  hasAny: boolean;
  /** True if any of the owned rigs is simulated (drives "SIM" hinting). */
  hasSimulated: boolean;
  /** The user's first rig (real before simulated) as a selectable class — the default deep-dive when signed in. */
  firstClass: GpuClass | null;
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
    let firstClass: GpuClass | null = null;

    if (enabled) {
      (machines.data ?? []).forEach((m) => {
        if (m.gpu_name) {
          gpus.add(m.gpu_name);
          // First real machine wins as the default selection.
          if (firstClass == null) {
            firstClass = { gpu_name: m.gpu_name, num_gpus: m.num_gpus ?? 1, geolocation: null };
          }
        }
        if (m.geolocation) regions.add(m.geolocation);
      });
      (sims.data ?? []).forEach((s) => {
        if (s.gpu_name) {
          gpus.add(s.gpu_name);
          hasSimulated = true;
          // Fall back to a simulated rig only if there's no real machine.
          if (firstClass == null) {
            firstClass = { gpu_name: s.gpu_name, num_gpus: s.num_gpus ?? 1, geolocation: null };
          }
        }
        if (s.geolocation) regions.add(s.geolocation);
      });
    }

    return { gpus, regions, hasAny: gpus.size > 0, hasSimulated, firstClass };
  }, [enabled, machines.data, sims.data]);
}

// When signed in with a fleet, default the deep-dive to the user's first rig (so
// they land on their own market position). Guests — and signed-in users with no
// fleet — get no default; they pick a card from the board. Only sets when nothing
// is selected yet, so it never fights a user's manual choice.
export function useAutoSelectOwnedClass(enabled: boolean): void {
  const owned = useOwnedFleet(enabled);
  const selected = useClassStore((s) => s.selected);
  const setSelected = useClassStore((s) => s.setSelected);
  const first = owned.firstClass;

  useEffect(() => {
    if (!enabled || selected != null || first == null) return;
    setSelected(first);
  }, [enabled, selected, first, setSelected]);
}
