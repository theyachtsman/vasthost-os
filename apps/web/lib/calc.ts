// Mirror of services/calc.break_even_floor_per_gpu_hour for live UI feedback.
// serviceFeePct is required (no hidden default) — callers pass the rig's fee, which
// is itself seeded from the platform default (MARKET_FEE_PCT via /market/meta).
export function breakEvenFloor(
  gpuMaxPowerW: number | null | undefined,
  kwhRate: number | null | undefined,
  serviceFeePct: number,
): number | null {
  if (!gpuMaxPowerW || kwhRate == null) return null;
  const keep = 1 - serviceFeePct;
  if (keep <= 0) return null;
  const powerCostPerHr = (gpuMaxPowerW / 1000) * kwhRate;
  return Math.round((powerCostPerHr / keep) * 1e6) / 1e6;
}
