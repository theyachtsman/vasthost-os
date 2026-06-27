"""Pure financial calculations — no DB, no IO. Easy to unit test."""

from __future__ import annotations

HOURS_PER_MONTH = 730.0


def break_even_floor_per_gpu_hour(
    gpu_max_power_w: float | None,
    kwh_rate: float | None,
    service_fee_pct: float = 0.20,
) -> float | None:
    """Minimum on-demand $/GPU-hr where revenue (after Vast's cut) covers power.

    power_cost_per_hr = watts/1000 * kwh_rate
    The host keeps (1 - service_fee_pct) of the asking price, so:
        ask * (1 - fee) = power_cost  =>  ask = power_cost / (1 - fee)
    """
    if not gpu_max_power_w or kwh_rate is None:
        return None
    keep = 1.0 - service_fee_pct
    if keep <= 0:
        return None
    power_cost_per_hr = (gpu_max_power_w / 1000.0) * kwh_rate
    return round(power_cost_per_hr / keep, 6)


def est_power_cost_per_day(
    gpu_max_power_w: float | None,
    num_gpus: int | None,
    kwh_rate: float | None,
    utilization: float = 1.0,
) -> float | None:
    """Estimated daily power cost for a machine at a given utilization (0–1)."""
    if not gpu_max_power_w or kwh_rate is None:
        return None
    gpus = num_gpus or 1
    kwh_per_day = (gpu_max_power_w * gpus / 1000.0) * 24.0 * max(0.0, min(1.0, utilization))
    return round(kwh_per_day * kwh_rate, 6)


def percentile(sorted_values: list[float], pct: float) -> float | None:
    """Linear-interpolation percentile (pct in 0–100). Expects a sorted list."""
    if not sorted_values:
        return None
    if len(sorted_values) == 1:
        return sorted_values[0]
    rank = (pct / 100.0) * (len(sorted_values) - 1)
    lo = int(rank)
    hi = min(lo + 1, len(sorted_values) - 1)
    frac = rank - lo
    return sorted_values[lo] + (sorted_values[hi] - sorted_values[lo]) * frac


def percentile_position(value: float, sorted_values: list[float]) -> float | None:
    """Where ``value`` sits within ``sorted_values`` as a 0–100 percentile."""
    if not sorted_values:
        return None
    below = sum(1 for v in sorted_values if v < value)
    return round(100.0 * below / len(sorted_values), 1)
