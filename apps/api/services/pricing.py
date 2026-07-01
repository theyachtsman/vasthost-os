"""Pricing Control Center — recommend-only (Phase 1).

For each of a user's machines, recommend a per-GPU on-demand asking price from the
live market distribution. The recommendation is **demand-adaptive** (hot markets
aim at a higher percentile, cold markets lower to clear) and **hard-floored at the
break-even estimate** so we never recommend a loss. Human-in-the-loop: nothing is
written to Vast without an explicit apply (see routes/pricing.py).

Pure logic — no Vast IO here; the write path lives in VastClient.set_machine_price.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from core.config import settings
from models import CostConfig, HostMachine, MarketDistribution, SimulatedHost
from schemas.models import PricingRecommendation, SimulatedPricingRecommendation

from .calc import break_even_floor_per_gpu_hour

# Demand tiers by liquidity-smoothed utilization → target market percentile.
# Utilization thresholds match the UI's Hot/Warm/Soft/Cold (utilization.tsx).
_TIERS: list[tuple[float, str, float]] = [
    (70.0, "Hot", 65.0),
    (45.0, "Warm", 50.0),
    (20.0, "Soft", 35.0),
    (0.0, "Cold", 25.0),
]
# Pseudo-offers pulling thin-supply utilization toward a neutral 50% prior, so a
# 7/7 doesn't read as fully hot (same idea as the leaderboard's demand_score).
_SMOOTH_K = 15
_NEUTRAL_UTIL = 0.5


def _smoothed_util_pct(dist: MarketDistribution) -> float | None:
    total = dist.supply_count or 0
    rented = dist.rented_count or 0
    if total <= 0:
        return float(dist.utilization_pct) if dist.utilization_pct is not None else None
    return 100.0 * (rented + _SMOOTH_K * _NEUTRAL_UTIL) / (total + _SMOOTH_K)


def _tier(util_pct: float | None) -> tuple[str, float]:
    if util_pct is None:
        return "Unknown", 50.0
    for threshold, label, target in _TIERS:
        if util_pct >= threshold:
            return label, target
    return "Cold", 25.0


def _anchors(dist: MarketDistribution) -> list[tuple[float, float]]:
    """Non-null (percentile, price) anchor points, ascending by percentile."""
    raw = [
        (10.0, dist.p10_price),
        (25.0, dist.p25_price),
        (50.0, dist.p50_price),
        (75.0, dist.p75_price),
        (90.0, dist.p90_price),
    ]
    return [(pct, float(price)) for pct, price in raw if price is not None]


def _price_at_percentile(anchors: list[tuple[float, float]], target: float) -> float | None:
    """Interpolate a price at ``target`` percentile from the anchor points."""
    if not anchors:
        return None
    if target <= anchors[0][0]:
        return anchors[0][1]
    if target >= anchors[-1][0]:
        return anchors[-1][1]
    for (p_lo, v_lo), (p_hi, v_hi) in zip(anchors, anchors[1:]):
        if p_lo <= target <= p_hi:
            span = p_hi - p_lo
            frac = (target - p_lo) / span if span else 0.0
            return v_lo + (v_hi - v_lo) * frac
    return anchors[-1][1]


def _percentile_of_price(anchors: list[tuple[float, float]], price: float) -> float | None:
    """Invert the anchors: where does ``price`` sit as a market percentile?"""
    if not anchors:
        return None
    if price <= anchors[0][1]:
        return anchors[0][0]
    if price >= anchors[-1][1]:
        return anchors[-1][0]
    for (p_lo, v_lo), (p_hi, v_hi) in zip(anchors, anchors[1:]):
        if v_lo <= price <= v_hi:
            span = v_hi - v_lo
            frac = (price - v_lo) / span if span else 0.0
            return p_lo + (p_hi - p_lo) * frac
    return anchors[-1][0]


def _latest_dist(db: Session, gpu_name: str, num_gpus: int) -> MarketDistribution | None:
    return db.scalar(
        select(MarketDistribution)
        .where(
            MarketDistribution.gpu_name == gpu_name,
            MarketDistribution.num_gpus == num_gpus,
        )
        .order_by(MarketDistribution.computed_at.desc())
    )


def _choose_bucket(db: Session, gpu_name: str, num_gpus: int) -> tuple[MarketDistribution | None, int]:
    """Prefer the machine's own config-size bucket, but fall back to the (usually
    more liquid) per-GPU bucket when the size bucket is thin/absent — same rule as
    simulator.market_context, so a single outlier can't drive the recommendation."""
    dist = _latest_dist(db, gpu_name, num_gpus)
    bucket = num_gpus
    if num_gpus != 1:
        dist_one = _latest_dist(db, gpu_name, 1)
        supply_n = (dist.supply_count or 0) if dist is not None else 0
        supply_one = (dist_one.supply_count or 0) if dist_one is not None else 0
        if dist is None or supply_one > supply_n:
            dist, bucket = dist_one, 1
    return dist, bucket


def _round6(v: float | None) -> float | None:
    return round(v, 6) if v is not None else None


def _recommend_core(
    db: Session,
    *,
    gpu_name: str | None,
    num_gpus: int,
    current_price: float | None,
    gpu_max_power_w: int | None,
    kwh_rate: float | None,
    fee_pct: float,
) -> dict:
    """Demand-adaptive recommendation math, independent of whether the caller is a
    real HostMachine or a sandbox SimulatedHost — both wrap this in their own
    response schema (see recommend_for_machine / recommend_for_simulated_host)."""
    floor = break_even_floor_per_gpu_hour(gpu_max_power_w, kwh_rate, fee_pct)
    common = dict(break_even_floor=_round6(floor), has_power_cost=kwh_rate is not None)

    dist, bucket = (None, num_gpus)
    if gpu_name:
        dist, bucket = _choose_bucket(db, gpu_name, num_gpus)

    if dist is None:
        return dict(
            recommended_price_gpu=None,
            target_percentile=None,
            current_percentile=None,
            floored=False,
            demand_label=None,
            utilization_pct=None,
            market_bucket_num_gpus=None,
            market_computed_at=None,
            market_dist_id=None,
            supply_count=None,
            has_market_data=False,
            rationale=(
                f"No market distribution for {gpu_name or 'this GPU'} yet — "
                "the Observer aggregates every 15 minutes."
            ),
            **common,
        )

    anchors = _anchors(dist)
    smoothed = _smoothed_util_pct(dist)
    label, target_pct = _tier(smoothed)
    target_price = _price_at_percentile(anchors, target_pct)

    floored = False
    recommended = target_price
    if recommended is not None and floor is not None and recommended < floor:
        recommended, floored = floor, True

    current_pct = _percentile_of_price(anchors, current_price) if current_price is not None else None
    util = float(dist.utilization_pct) if dist.utilization_pct is not None else None

    rationale = _rationale(
        gpu=gpu_name,
        n=num_gpus,
        label=label,
        util=util,
        p50=float(dist.p50_price) if dist.p50_price is not None else None,
        target_pct=target_pct,
        recommended=recommended,
        current=current_price,
        current_pct=current_pct,
        floor=floor,
        floored=floored,
        has_power_cost=kwh_rate is not None,
    )

    return dict(
        recommended_price_gpu=_round6(recommended),
        target_percentile=round(target_pct, 1),
        current_percentile=round(current_pct, 1) if current_pct is not None else None,
        floored=floored,
        demand_label=label,
        utilization_pct=util,
        market_bucket_num_gpus=bucket,
        market_computed_at=dist.computed_at,
        market_dist_id=dist.id,
        supply_count=dist.supply_count,
        has_market_data=True,
        rationale=rationale,
        **common,
    )


def recommend_for_machine(
    db: Session, machine: HostMachine, cost: CostConfig | None
) -> PricingRecommendation:
    """Build a recommendation for one machine (also used by the apply route to
    re-derive the floor + market bucket server-side)."""
    n = machine.num_gpus or 1
    current = float(machine.current_price_gpu) if machine.current_price_gpu is not None else None
    kwh = float(cost.kwh_rate) if cost and cost.kwh_rate is not None else None
    core = _recommend_core(
        db,
        gpu_name=machine.gpu_name,
        num_gpus=n,
        current_price=current,
        gpu_max_power_w=machine.gpu_max_power_w,
        kwh_rate=kwh,
        fee_pct=settings.MARKET_FEE_PCT,
    )
    return PricingRecommendation(
        machine_id=machine.id,
        vast_machine_id=machine.machine_id,
        gpu_name=machine.gpu_name,
        num_gpus=n,
        current_price_gpu=_round6(current),
        **core,
    )


def recommend_for_simulated_host(
    db: Session, host: SimulatedHost
) -> SimulatedPricingRecommendation:
    """Sandbox counterpart of recommend_for_machine — lets a user exercise Pricing
    Control's recommend+apply loop against a simulated rig before hosting a real
    one. Also used by the apply-price route to re-derive the floor server-side."""
    n = host.num_gpus or 1
    current = float(host.current_price_gpu) if host.current_price_gpu is not None else None
    kwh = float(host.kwh_rate) if host.kwh_rate is not None else None
    fee = (
        float(host.vast_service_fee_pct)
        if host.vast_service_fee_pct is not None
        else settings.MARKET_FEE_PCT
    )
    core = _recommend_core(
        db,
        gpu_name=host.gpu_name,
        num_gpus=n,
        current_price=current,
        gpu_max_power_w=host.gpu_max_power_w,
        kwh_rate=kwh,
        fee_pct=fee,
    )
    return SimulatedPricingRecommendation(
        host_id=host.id,
        gpu_name=host.gpu_name,
        num_gpus=n,
        current_price_gpu=_round6(current),
        **core,
    )


def _rationale(**k) -> str:
    gpu = k["gpu"] or "This GPU"
    parts = [f"{gpu} ×{k['n']} is {k['label']}"]
    if k["util"] is not None:
        parts[0] += f" ({k['util']:.0f}% utilized)"
    if k["p50"] is not None:
        parts.append(f"market median ${k['p50']:.4f}")
    if k["recommended"] is not None:
        aim = f"aim p{k['target_pct']:.0f} → ${k['recommended']:.4f}/GPU·hr"
        if k["floored"]:
            aim += " (raised to your break-even floor)"
        parts.append(aim)
    if k["current"] is not None and k["current_pct"] is not None:
        parts.append(f"you're at the {k['current_pct']:.0f}th pct (${k['current']:.4f})")
    if not k["has_power_cost"]:
        parts.append("set your $/kWh in Earnings for a break-even safety floor")
    elif k["floor"] is not None:
        parts.append(f"floor ${k['floor']:.4f}")
    return " · ".join(parts) + "."


def recommendations_for_keys(
    db: Session, key_ids: list[uuid.UUID]
) -> list[PricingRecommendation]:
    machines = list(
        db.scalars(select(HostMachine).where(HostMachine.user_provider_key_id.in_(key_ids)))
    )
    machine_ids = [m.id for m in machines]
    cost_by_machine: dict[uuid.UUID, CostConfig] = {}
    if machine_ids:
        cost_by_machine = {
            c.machine_id: c
            for c in db.scalars(select(CostConfig).where(CostConfig.machine_id.in_(machine_ids)))
        }
    out = [recommend_for_machine(db, m, cost_by_machine.get(m.id)) for m in machines]
    # Surface the biggest gaps first (current far from recommended), then by GPU.
    def _gap(r: PricingRecommendation) -> float:
        if r.recommended_price_gpu is None or r.current_price_gpu is None:
            return -1.0
        return abs(r.recommended_price_gpu - r.current_price_gpu)

    out.sort(key=lambda r: (_gap(r), r.gpu_name or ""), reverse=True)
    return out
