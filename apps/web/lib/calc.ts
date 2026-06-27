// Mirror of services/calc.break_even_floor_per_gpu_hour for live UI feedback.
export function breakEvenFloor(
  gpuMaxPowerW: number | null | undefined,
  kwhRate: number | null | undefined,
  serviceFeePct = 0.2,
): number | null {
  if (!gpuMaxPowerW || kwhRate == null) return null;
  const keep = 1 - serviceFeePct;
  if (keep <= 0) return null;
  const powerCostPerHr = (gpuMaxPowerW / 1000) * kwhRate;
  return Math.round((powerCostPerHr / keep) * 1e6) / 1e6;
}
