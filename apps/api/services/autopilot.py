"""Phase 2 — bounded auto-repricing for simulated hosts.

Opt-in per rig (SimulatedHost.autopilot_enabled). Runs on the Observer's
cadence (worker.tasks.autopilot_tick, every 15 min — the same refresh rate as
market_distribution_aggregate, the signal this reads) plus an on-demand
manual-step route for immediate feedback while testing.

Reuses services.pricing's demand-adaptive recommendation (same Hot/Warm/Soft/
Cold tiering and break-even floor Pricing Control shows a human) so autopilot
never disagrees with what a user would see if they looked at the recommendation
themselves — it just acts on it automatically, one small step at a time, never
outside the rig's own rails.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from models import PriceChangeEvent, SimulatedHost

from . import pricing as pricing_svc

# Each automated move is a small step, not a jump straight to a target — a rig
# several tiers away from a good price takes several ticks to walk there, so a
# single noisy utilization reading can't swing the price on its own.
STEP_PCT = 0.05


def _clamp(price: float, host: SimulatedHost, floor: float | None) -> float:
    """Bound ``price`` to [effective_min, max_price_gpu]. The break-even floor
    and the user's min_price_gpu both act as lower bounds — the higher (safer)
    of the two wins. If max_price_gpu is misconfigured below that floor, the
    floor still wins (a safety invariant, not just a preference)."""
    lo = floor
    if host.min_price_gpu is not None:
        min_gpu = float(host.min_price_gpu)
        lo = max(lo, min_gpu) if lo is not None else min_gpu
    hi = float(host.max_price_gpu) if host.max_price_gpu is not None else None
    if hi is not None and lo is not None and hi < lo:
        hi = lo
    if lo is not None:
        price = max(price, lo)
    if hi is not None:
        price = min(price, hi)
    return price


def autopilot_step(db: Session, host: SimulatedHost) -> PriceChangeEvent | None:
    """Evaluate one simulated host and, if warranted, make one bounded step.
    Returns the recorded PriceChangeEvent, or None if no move was made (rig
    not eligible, no market data, already at a rail, or demand is Warm/hold —
    holding on ambiguous signal avoids churning the price every tick)."""
    if not host.autopilot_enabled or not host.is_active:
        return None

    reco = pricing_svc.recommend_for_simulated_host(db, host)
    if not reco.has_market_data:
        return None

    old_price = float(host.current_price_gpu) if host.current_price_gpu is not None else None

    if old_price is None:
        # No asking price yet — seed from the recommendation so there's
        # something to step from on later ticks.
        if reco.recommended_price_gpu is None:
            return None
        new_price = _clamp(reco.recommended_price_gpu, host, reco.break_even_floor)
        reason = "auto_seed"
    elif reco.demand_label == "Hot":
        new_price = _clamp(old_price * (1 + STEP_PCT), host, reco.break_even_floor)
        reason = "auto_probe_up"
    elif reco.demand_label in ("Soft", "Cold"):
        new_price = _clamp(old_price * (1 - STEP_PCT), host, reco.break_even_floor)
        reason = "auto_step_down"
    else:
        # Warm, or Unknown (no utilization signal) — hold.
        return None

    if old_price is not None and abs(new_price - old_price) < 1e-6:
        return None  # already sitting at a rail; nothing meaningful to record

    host.current_price_gpu = new_price
    event = PriceChangeEvent(
        simulated_host_id=host.id,
        old_price_gpu=old_price,
        new_price_gpu=new_price,
        reason=reason,
        market_dist_id=reco.market_dist_id,
        market_percentile=reco.current_percentile,  # where the OLD price sat
        applied_to_vast=False,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


def run_all(db: Session) -> int:
    """Evaluate every autopilot-enabled simulated host once. Returns the number
    of rigs that got a price move this tick."""
    hosts = list(
        db.scalars(select(SimulatedHost).where(SimulatedHost.autopilot_enabled.is_(True)))
    )
    return sum(1 for host in hosts if autopilot_step(db, host) is not None)
