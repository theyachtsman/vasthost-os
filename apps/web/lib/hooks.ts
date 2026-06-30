import {
  type AdminObserverStatus,
  type AdminOut,
  type AvailableClass,
  type ClearingEvent,
  type DailyEarningPoint,
  type Distribution,
  type EarningsSummary,
  type MarketListingRow,
  type MarketMeta,
  type MarketOverviewRow,
  type HealthResponse,
  type Machine,
  type MachineDetail,
  type ObserverStatus,
  type PlatformKey,
  type SimulatedHost,
  type SimulatedHostMarketContext,
  type UserOut,
  type UserProviderKey,
  type WatchedClass,
} from '@vasthost/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError, api } from './api';

const q = (n: string) => encodeURIComponent(n);

// ── User auth ──────────────────────────────────────────────────
export const useMe = () =>
  useQuery({
    queryKey: ['me'],
    // 401 → not logged in; surface as null rather than an error state.
    queryFn: async () => {
      try {
        return await api.get<UserOut>('/auth/me');
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    retry: false,
    staleTime: 30_000,
  });

export const useLogin = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      api.post<UserOut>('/auth/login', body),
    onSuccess: () => qc.invalidateQueries(),
  });
};

export const useRegister = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; password: string; display_name?: string }) =>
      api.post<UserOut>('/auth/register', body),
    onSuccess: () => qc.invalidateQueries(),
  });
};

export const useLogout = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSuccess: () => qc.invalidateQueries(),
  });
};

// ── User provider keys ─────────────────────────────────────────
export const useProviderKeys = () =>
  useQuery({
    queryKey: ['provider-keys'],
    queryFn: () => api.get<UserProviderKey[]>('/me/provider-keys'),
    refetchInterval: 30_000,
  });

export const useConnectProviderKey = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { provider: string; api_key: string }) =>
      api.post<UserProviderKey>('/me/provider-keys', body),
    onSuccess: () => qc.invalidateQueries(),
  });
};

export const useDisconnectProviderKey = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/me/provider-keys/${id}`),
    onSuccess: () => qc.invalidateQueries(),
  });
};

// ── Admin ──────────────────────────────────────────────────────
export const useAdminMe = () =>
  useQuery({
    queryKey: ['admin-me'],
    queryFn: async () => {
      try {
        return await api.get<AdminOut>('/admin/auth/me');
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    retry: false,
    staleTime: 30_000,
  });

export const useAdminLogin = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      api.post<AdminOut>('/admin/auth/login', body),
    onSuccess: () => qc.invalidateQueries(),
  });
};

export const useAdminLogout = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/admin/auth/logout'),
    onSuccess: () => qc.invalidateQueries(),
  });
};

export const useAdminChangePassword = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { new_password: string }) =>
      api.post<AdminOut>('/admin/auth/change-password', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-me'] }),
  });
};

export const usePlatformKeys = () =>
  useQuery({
    queryKey: ['platform-keys'],
    queryFn: () => api.get<PlatformKey[]>('/admin/platform-keys'),
  });

export const useSetPlatformKey = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { provider: string; api_key: string }) =>
      api.post<PlatformKey>('/admin/platform-keys', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-keys'] }),
  });
};

export const useDeletePlatformKey = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/admin/platform-keys/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-keys'] }),
  });
};

export const useAdminObserverStatus = () =>
  useQuery({
    queryKey: ['admin-observer-status'],
    queryFn: () => api.get<AdminObserverStatus>('/admin/observer/status'),
    refetchInterval: 30_000,
  });

// ── Health & account ───────────────────────────────────────────
export const useHealth = () =>
  useQuery({
    queryKey: ['health'],
    queryFn: () => api.get<HealthResponse>('/health'),
    refetchInterval: 15_000,
  });

// ── Fleet ──────────────────────────────────────────────────────
export const useMachines = (enabled = true) =>
  useQuery({
    queryKey: ['machines'],
    queryFn: () => api.get<Machine[]>('/fleet/machines'),
    refetchInterval: 60_000,
    enabled,
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

export const useAvailableClasses = () =>
  useQuery({
    queryKey: ['available-classes'],
    queryFn: () => api.get<AvailableClass[]>('/market/available-classes'),
    refetchInterval: 60_000,
  });

export const useMarketOverview = () =>
  useQuery({
    queryKey: ['market-overview'],
    queryFn: () => api.get<MarketOverviewRow[]>('/market/overview'),
    refetchInterval: 60_000,
  });

export const useMarketSizes = (gpu_name: string) =>
  useQuery({
    queryKey: ['market-sizes', gpu_name],
    queryFn: () => api.get<Distribution[]>(`/market/sizes?gpu_name=${encodeURIComponent(gpu_name)}`),
    refetchInterval: 60_000,
  });

export const useMarketMeta = () =>
  useQuery({
    queryKey: ['market-meta'],
    queryFn: () => api.get<MarketMeta>('/market/meta'),
    refetchInterval: 30_000,
  });

export const useMarketListings = (
  gpu_name: string,
  opts: { num_gpus?: number; rented?: boolean | null } = {},
) =>
  useQuery({
    queryKey: ['market-listings', gpu_name, opts.num_gpus, opts.rented],
    queryFn: () => {
      const params = new URLSearchParams({ gpu_name });
      if (opts.num_gpus != null) params.set('num_gpus', String(opts.num_gpus));
      if (opts.rented != null) params.set('rented', String(opts.rented));
      return api.get<MarketListingRow[]>(`/market/listings?${params.toString()}`);
    },
    refetchInterval: 60_000,
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
export const useSimulatedHosts = (enabled = true) =>
  useQuery({
    queryKey: ['simulated-hosts'],
    queryFn: () => api.get<SimulatedHost[]>('/simulator/hosts'),
    enabled,
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

export const useSimulatedHostMarket = (id: string) =>
  useQuery({
    queryKey: ['sim-market', id],
    queryFn: () => api.get<SimulatedHostMarketContext>(`/simulator/hosts/${id}/market-context`),
    refetchInterval: 60_000,
  });
