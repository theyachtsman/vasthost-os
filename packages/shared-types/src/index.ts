// TypeScript types mirroring the FastAPI response schemas
// (apps/api/schemas/*.py). Keep these in sync with the backend.

// ── Auth & two-key model ──────────────────────────────────────
export interface UserOut {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
}

export interface AdminOut {
  id: string;
  email: string;
  must_change_password: boolean;
  created_at: string;
}

export interface UserProviderKey {
  id: string;
  provider: string; // 'vast' | 'runpod'
  is_active: boolean;
  api_key_masked: string | null;
  vast_user_id: number | null;
  detected_scopes: Record<string, unknown> | null;
  last_validated_at: string | null;
  last_synced_at: string | null;
  created_at: string;
}

export interface PlatformKey {
  id: string;
  provider: string; // 'vast' | 'runpod'
  is_active: boolean;
  api_key_masked: string | null;
  last_validated_at: string | null;
  created_at: string;
}

export interface AdminObserverStatus {
  platform_key_connected: boolean;
  platform_key_provider: string | null;
  platform_key_last_validated_at: string | null;
  last_poll_at: string | null;
  total_offer_snapshots: number;
  total_clearing_events: number;
  watched_classes_count: number;
  poll_interval_seconds: number;
  watched_classes: { gpu_name: string; num_gpus: number }[];
}

export interface HealthComponent {
  status: 'ok' | 'error';
  detail?: string | null;
}

export interface HealthResponse {
  status: 'healthy' | 'degraded';
  components: Record<string, HealthComponent>;
  time: string;
}

export interface AccountStatus {
  connected: boolean;
  vast_user_id?: number | null;
  email?: string | null;
  display_name?: string | null;
  account_balance?: number | null;
  last_synced_at?: string | null;
  connected_at?: string | null;
  api_key_masked?: string | null;
}

export interface Machine {
  id: string;
  machine_id: number;
  gpu_name: string | null;
  num_gpus: number | null;
  gpu_ram_mb: number | null;
  gpu_max_power_w: number | null;
  cpu_name: string | null;
  cpu_cores: number | null;
  cpu_ram_mb: number | null;
  disk_space_gb: number | null;
  geolocation: string | null;
  verified: string | null;
  reliability: number | null;
  is_listed: boolean | null;
  is_rentable: boolean | null;
  current_price_gpu: number | null;
  min_bid_price: number | null;
  offer_end_date: string | null;
  last_seen_at: string | null;
  // Locked price of the active rental contract, if any. A price change
  // updates current_price_gpu (asking) immediately, same as Vast, but this
  // stays fixed until the active rental ends.
  active_locked_price_gpu: number | null;
}

export interface Contract {
  id: string;
  vast_contract_id: number | null;
  rented_at: string | null;
  ended_at: string | null;
  locked_price_gpu: number | null;
  rental_type: string | null;
  num_gpus_rented: number | null;
  status: string | null;
}

export interface ReliabilityPoint {
  recorded_at: string;
  reliability: number | null;
  is_listed: boolean | null;
  is_rentable: boolean | null;
}

export interface MachineDetail extends Machine {
  contracts: Contract[];
  reliability_history: ReliabilityPoint[];
}

export interface PerMachineEarning {
  machine_id: string | null;
  vast_machine_id: number | null;
  gpu_name: string | null;
  gpu_earn: number;
  storage_earn: number;
  bw_earn: number;
  total_earn: number;
  est_power_cost?: number | null;
  net_margin?: number | null;
}

export interface EarningsSummary {
  total_gpu: number;
  total_storage: number;
  total_bw: number;
  total_all: number;
  service_fee: number | null;
  balance: number | null;
  all_time_total: number;
  per_machine: PerMachineEarning[];
}

export interface DailyEarningPoint {
  earn_date: string;
  gpu_earn: number;
  storage_earn: number;
  bw_earn: number;
  total_earn: number;
}

export interface Distribution {
  id: number;
  computed_at: string;
  gpu_name: string;
  num_gpus: number;
  verified: string | null;
  geolocation: string | null;
  p10_price: number | null;
  p25_price: number | null;
  p50_price: number | null;
  p75_price: number | null;
  p90_price: number | null;
  supply_count: number | null;
  rented_count: number | null;
  utilization_pct: number | null;
  clearing_rate_1h: number | null;
  clearing_rate_24h: number | null;
  dlperf?: number | null;
  dlperf_per_dphtotal?: number | null;
  price_basis?: 'ask' | 'last-rented';
}

export interface ClearingEvent {
  id: number;
  detected_at: string;
  offer_id: number;
  gpu_name: string | null;
  num_gpus: number | null;
  verified: string | null;
  geolocation: string | null;
  last_price_gpu: number | null;
  dwell_minutes: number | null;
  is_partial_fill: boolean;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  confidence_reason?: string | null;
}

export interface ObserverStatus {
  last_poll_at: string | null;
  total_offer_snapshots: number;
  total_clearing_events: number;
  watched_classes: number;
  poll_interval_seconds: number;
}

export interface SimulatedHost {
  id: string;
  name: string | null;
  gpu_name: string | null;
  num_gpus: number | null;
  gpu_ram_mb: number | null;
  gpu_max_power_w: number | null;
  verified: string;
  reliability: number;
  geolocation: string | null;
  kwh_rate: number | null;
  vast_service_fee_pct: number;
  is_active: boolean;
  is_simulated: boolean;
  created_at: string;
  break_even_floor: number | null;
  current_price_gpu: number | null;
  autopilot_enabled: boolean;
  min_price_gpu: number | null;
  max_price_gpu: number | null;
  // Mirrors a real RentalContract — set together via POST .../simulate-rental,
  // cleared via .../end-rental. A price change updates current_price_gpu
  // immediately (same as Vast); locked_price_gpu stays fixed until rented_until.
  rented_until: string | null;
  locked_price_gpu: number | null;
  is_rented: boolean;
}

export interface WatchedClass {
  id: string;
  gpu_name: string;
  num_gpus: number;
  geolocation: string | null;
  is_active: boolean;
}

export interface AvailableClass {
  gpu_name: string;
  num_gpus: number;
  supply_count: number | null;
}

export interface MarketMeta {
  fee_pct: number;
  poll_interval_seconds: number;
  last_poll_at: string | null;
}

export interface MarketListingRow {
  offer_id: number;
  machine_id: number | null;
  host_id: number | null;
  market_source: string;
  gpu_name: string;
  num_gpus: number | null;
  gpu_ram_mb: number | null;
  gpu_max_power_w: number | null;
  price_gpu: number | null; // asking price (host's set dph_base) per GPU/hr
  dlperf: number | null;
  dlperf_per_dphtotal: number | null;
  reliability: number | null;
  verified: string | null;
  geolocation: string | null;
  rented: boolean | null;
  end_date: string | null;
  observed_at: string;
}

export interface MarketOverviewRow {
  gpu_name: string;
  num_gpus: number;
  p10_price: number | null;
  p25_price: number | null;
  p50_price: number | null;
  p75_price: number | null;
  p90_price: number | null;
  supply_count: number | null;
  available_count: number | null;
  rented_count: number | null;
  utilization_pct: number | null;
  demand_score: number | null;
  rentals_24h: number;
  median_dwell_minutes: number | null;
  dlperf: number | null;
  dlperf_per_dphtotal: number | null;
  price_basis?: 'ask' | 'last-rented';
  computed_at: string;
}

export interface PricingRecommendation {
  machine_id: string;
  vast_machine_id: number;
  gpu_name: string | null;
  num_gpus: number | null;
  current_price_gpu: number | null;
  recommended_price_gpu: number | null;
  target_percentile: number | null;
  current_percentile: number | null;
  break_even_floor: number | null;
  floored: boolean;
  demand_label: string | null;
  utilization_pct: number | null;
  market_bucket_num_gpus: number | null;
  market_computed_at: string | null;
  market_dist_id: number | null;
  supply_count: number | null;
  has_market_data: boolean;
  has_power_cost: boolean;
  rationale: string;
  // A price change updates current_price_gpu (asking) immediately, same as
  // Vast, but if is_rented, locked_price_gpu is what the active rental is
  // actually paying and won't change until it ends.
  is_rented: boolean;
  locked_price_gpu: number | null;
}

// Simulated-rig counterpart of PricingRecommendation — same demand-adaptive
// fields, swapping machine_id/vast_machine_id for a sim host_id.
export interface SimulatedPricingRecommendation {
  host_id: string;
  gpu_name: string | null;
  num_gpus: number | null;
  current_price_gpu: number | null;
  recommended_price_gpu: number | null;
  target_percentile: number | null;
  current_percentile: number | null;
  break_even_floor: number | null;
  floored: boolean;
  demand_label: string | null;
  utilization_pct: number | null;
  market_bucket_num_gpus: number | null;
  market_computed_at: string | null;
  market_dist_id: number | null;
  supply_count: number | null;
  has_market_data: boolean;
  has_power_cost: boolean;
  rationale: string;
  is_rented: boolean;
  locked_price_gpu: number | null;
}

// Offer Management — bulk price ops. Shared shape for real machines and
// simulated rigs (POST /pricing/bulk-apply, POST /simulator/hosts/bulk-apply-recommended).
export interface BulkApplyResultItem {
  id: string;
  label: string;
  status: 'applied' | 'skipped_floor' | 'skipped_no_market' | 'failed';
  old_price_gpu: number | null;
  new_price_gpu: number | null;
  detail: string | null;
}

export interface BulkApplyResult {
  applied: number;
  skipped: number;
  failed: number;
  items: BulkApplyResultItem[];
}

export interface PriceChangeEvent {
  id: string;
  changed_at: string;
  machine_id: string | null;
  simulated_host_id: string | null;
  old_price_gpu: number | null;
  new_price_gpu: number | null;
  reason: string | null;
  market_percentile: number | null;
  applied_to_vast: boolean;
  applied_at: string | null;
  error_message: string | null;
}

// Phase 2 — result of one autopilot evaluation (scheduled or manually triggered).
export interface AutopilotStepResult {
  moved: boolean;
  reason: string | null;
  old_price_gpu: number | null;
  new_price_gpu: number | null;
  recommendation: SimulatedPricingRecommendation;
}

export interface ProjectionPoint {
  label: 'p25' | 'p50' | 'p75';
  price_gpu: number;
  gross_per_hr: number;
  kept_per_hr: number;
  power_per_hr: number;
  net_per_hr: number;
  net_monthly_100: number;
  net_monthly_70: number;
  net_monthly_50: number;
}

export interface SimulatedHostMarketContext {
  host_id: string;
  gpu_name: string | null;
  num_gpus: number | null;
  market_bucket_num_gpus: number | null;
  market_computed_at: string | null;
  p25_price: number | null;
  p50_price: number | null;
  p75_price: number | null;
  supply_count: number | null;
  utilization_pct: number | null;
  break_even_floor: number | null;
  break_even_percentile: number | null;
  has_market_data: boolean;
  projections: ProjectionPoint[];
}
