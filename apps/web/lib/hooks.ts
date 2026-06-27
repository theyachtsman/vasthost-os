import {
  type AccountStatus,
  type ClearingEvent,
  type DailyEarningPoint,
  type Distribution,
  type EarningsSummary,
  type HealthResponse,
  type Machine,
  type MachineDetail,
  type ObserverStatus,
  type SimulatedHost,
  type WatchedClass,
} from '@vasthost/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from './api';

const q = (n: string) => encodeURIComponent(n);

// ── Health & account ───────────────────────────────────────────
export const useHealth = () =>
  useQuery({
    queryKey: ['health'],
    queryFn: () => api.get<HealthResponse>('/health'),
    refetchInterval: 15_000,
  });

export const useAccountStatus = () =>
  useQuery({
    queryKey: ['account-status'],
    queryFn: () => api.get<AccountStatus>('/account/status'),
    refetchInterval: 30_000,
  });

export const useConnectAccount = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (api_key: string) => api.post<AccountStatus>('/account/connect', { api_key }),
    onSuccess: () => qc.invalidateQueries(),
  });
};

export const useDisconnectAccount = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.del('/account/disconnect'),
    onSuccess: () => qc.invalidateQueries(),
  });
};

// ── Fleet ──────────────────────────────────────────────────────
export const useMachines = () =>
  useQuery({
    queryKey: ['machines'],
    queryFn: () => api.get<Machine[]>('/fleet/machines'),
    refetchInterval: 60_000,
  });

export const useMachine = (id: string | null) =>
  useQuery({
    queryKey: ['machine', id],
    queryFn: () => api.get<MachineDetail>(`/fleet/machines/${id}`),
    enabled: !!id,
  });

// ── Earnings ───────────────────────────────────────────────────
export const useEarningsSummary = () =>
  useQuery({
    queryKey: ['earnings-summary'],
    queryFn: () => api.get<EarningsSummary>('/earnings/summary'),
    refetchInterval: 60_000,
  });

export const useEarningsDaily = (days = 30) =>
  useQuery({
    queryKey: ['earnings-daily', days],
    queryFn: () => api.get<DailyEarningPoint[]>(`/earnings/daily?days=${days}`),
  });

export const useSetCostConfig = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { machine_id: string; kwh_rate: number; gpu_max_power_w?: number }) =>
      api.post('/earnings/cost-config', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['earnings-summary'] });
      qc.invalidateQueries({ queryKey: ['machines'] });
    },
  });
};

// ── Market ─────────────────────────────────────────────────────
export const useDistribution = (gpu_name: string, num_gpus: number, geolocation?: string | null) =>
  useQuery({
    queryKey: ['distribution', gpu_name, num_gpus, geolocation],
    queryFn: () =>
      api.get<Distribution | null>(
        `/market/distribution?gpu_name=${q(gpu_name)}&num_gpus=${num_gpus}` +
          (geolocation ? `&geolocation=${q(geolocation)}` : ''),
      ),
    refetchInterval: 60_000,
  });

export const useDistributionHistory = (gpu_name: string, num_gpus: number, limit = 96) =>
  useQuery({
    queryKey: ['distribution-history', gpu_name, num_gpus, limit],
    queryFn: () =>
      api.get<Distribution[]>(
        `/market/distribution/history?gpu_name=${q(gpu_name)}&num_gpus=${num_gpus}&limit=${limit}`,
      ),
    refetchInterval: 60_000,
  });

export const useClearingEvents = (gpu_name?: string, num_gpus?: number, limit = 50) =>
  useQuery({
    queryKey: ['clearing-events', gpu_name, num_gpus, limit],
    queryFn: () => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (gpu_name) params.set('gpu_name', gpu_name);
      if (num_gpus != null) params.set('num_gpus', String(num_gpus));
      return api.get<ClearingEvent[]>(`/market/clearing-events?${params.toString()}`);
    },
    refetchInterval: 30_000,
  });

export const useObserverStatus = () =>
  useQuery({
    queryKey: ['observer-status'],
    queryFn: () => api.get<ObserverStatus>('/market/observer/status'),
    refetchInterval: 30_000,
  });

// ── Watched classes ────────────────────────────────────────────
export const useWatchedClasses = () =>
  useQuery({
    queryKey: ['watched-classes'],
    queryFn: () => api.get<WatchedClass[]>('/market/watched-classes'),
  });

export const useAddWatchedClass = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { gpu_name: string; num_gpus: number; geolocation?: string | null }) =>
      api.post('/market/watched-classes', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['watched-classes'] }),
  });
};

export const useRemoveWatchedClass = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/market/watched-classes/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['watched-classes'] }),
  });
};

// ── Simulator ──────────────────────────────────────────────────
export const useSimulatedHosts = () =>
  useQuery({
    queryKey: ['simulated-hosts'],
    queryFn: () => api.get<SimulatedHost[]>('/simulator/hosts'),
  });

export const useSaveSimulatedHost = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<SimulatedHost> & { id?: string }) =>
      payload.id
        ? api.put<SimulatedHost>(`/simulator/hosts/${payload.id}`, payload)
        : api.post<SimulatedHost>('/simulator/hosts', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['simulated-hosts'] }),
  });
};

export const useDeleteSimulatedHost = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/simulator/hosts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['simulated-hosts'] }),
  });
};
