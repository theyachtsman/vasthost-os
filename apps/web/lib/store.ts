import { create } from 'zustand';

export interface GpuClass {
  gpu_name: string;
  num_gpus: number;
  geolocation: string | null;
}

interface ClassState {
  selected: GpuClass;
  setSelected: (c: GpuClass) => void;
}

// Drives the Market Intelligence panels and the dashboard's market cards.
export const useClassStore = create<ClassState>((set) => ({
  selected: { gpu_name: 'RTX 4090', num_gpus: 1, geolocation: null },
  setSelected: (selected) => set({ selected }),
}));
