import { create } from 'zustand';

export interface GpuClass {
  gpu_name: string;
  num_gpus: number;
  geolocation: string | null;
}

interface ClassState {
  selected: GpuClass | null;
  setSelected: (c: GpuClass | null) => void;
}

// Drives the Market Intelligence panels and the dashboard's market cards. Starts
// with NOTHING selected — no default GPU. A signed-in user with a fleet (real or
// simulated) auto-selects their first rig; everyone else picks from the board.
export const useClassStore = create<ClassState>((set) => ({
  selected: null,
  setSelected: (selected) => set({ selected }),
}));
