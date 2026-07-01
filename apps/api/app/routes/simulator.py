import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from core.config import settings
from db.session import get_db
from models import MarketDistribution, PriceChangeEvent, SimulatedHost, User
from schemas.models import (
    AutopilotStepOut,
    BulkApplyResult,
    BulkApplyResultItem,
    PriceChangeEventOut,
    ProjectionPoint,
    SimulateRentalIn,
    SimulatedBulkApplyIn,
    SimulatedHostIn,
    SimulatedHostMarketContext,
    SimulatedHostOut,
    SimulatedPriceApplyIn,
    SimulatedPricingRecommendation,
)
from services import autopilot as autopilot_svc
from services import pricing as pricing_svc
from services.calc import break_even_floor_per_gpu_hour, percentile_position

from ..deps import require_user_session

router = APIRouter()
HOURS_PER_MONTH = 730.0


def _to_out(host: SimulatedHost) -> SimulatedHostOut:
    out = SimulatedHostOut.model_validate(host)
    out.break_even_floor = break_even_floor_per_gpu_hour(
        host.gpu_max_power_w,
        float(host.kwh_rate) if host.kwh_rate is not None else None,
        float(host.vast_service_fee_pct)
        if host.vast_service_fee_pct is not None
        else settings.MARKET_FEE_PCT,
    )
    out.is_rented = host.rented_until is not None and host.rented_until > datetime.now(UTC)
    return out


@router.get("/hosts", response_model=list[SimulatedHostOut])
def list_hosts(
    user: User = Depends(require_user_session), db: Session = Depends(get_db)
) -> list[SimulatedHostOut]:
    rows = db.scalars(select(SimulatedHost).order_by(SimulatedHost.created_at.desc()))
    return [_to_out(h) for h in rows]


@router.post("/hosts", response_model=SimulatedHostOut)
def create_host(
    payload: SimulatedHostIn,
    user: User = Depends(require_user_session),
    db: Session = Depends(get_db),
) -> SimulatedHostOut:
    # Sandbox rigs are always simulated — the marker is what keeps them visually
    # distinct from real per-user machines on Fleet surfaces.
    host = SimulatedHost(**payload.model_dump(), is_simulated=True)
    db.add(host)
    db.commit()
    db.refresh(host)
    return _to_out(host)


@router.put("/hosts/{host_id}", response_model=SimulatedHostOut)
def update_host(
    host_id: uuid.UUID,
    payload: SimulatedHostIn,
    user: User = Depends(require_user_session),
    db: Session = Depends(get_db),
) -> SimulatedHostOut:
    host = db.get(SimulatedHost, host_id)
    if host is None:
        raise HTTPException(status_code=404, detail="Simulated host not found")
    for key, value in payload.model_dump().items():
        setattr(host, key, value)
    db.commit()
    db.refresh(host)
    return _to_out(host)


@router.delete("/hosts/{host_id}")
def delete_host(
    host_id: uuid.UUID,
    user: User = Depends(require_user_session),
    db: Session = Depends(get_db),
) -> dict:
    host = db.get(SimulatedHost, host_id)
    if host is None:
        raise HTTPException(status_code=404, detail="Simulated host not found")
    db.delete(host)
    db.commit()
    return {"deleted": True}


@router.get("/hosts/{host_id}/market-context", response_model=SimulatedHostMarketContext)
def market_context(
    host_id: uuid.UUID,
    user: User = Depends(require_user_session),
    db: Session = Depends(get_db),
) -> SimulatedHostMarketContext:
    """Project a simulated host's economics against the live market.

    Vast prices per-GPU, so we use the host's GPU class distribution — preferring
    the matching num_gpus bucket, falling back to the (more liquid) per-GPU
    bucket. Informational only: no pricing actions are taken.
    """
    host = db.get(SimulatedHost, host_id)
    if host is None:
        raise HTTPException(status_code=404, detail="Simulated host not found")

    fee = (
        float(host.vast_service_fee_pct)
        if host.vast_service_fee_pct is not None
        else settings.MARKET_FEE_PCT
    )
    power = host.gpu_max_power_w
    kwh = float(host.kwh_rate) if host.kwh_rate is not None else None
    n = host.num_gpus or 1
    break_even = break_even_floor_per_gpu_hour(power, kwh, fee)

    def latest_dist(num_gpus: int) -> MarketDistribution | None:
        return db.scalar(
            select(MarketDistribution)
            .where(
                MarketDistribution.gpu_name == host.gpu_name,
                MarketDistribution.num_gpus == num_gpus,
            )
            .order_by(MarketDistribution.computed_at.desc())
        )

    # Vast prices per-GPU, and multi-GPU buckets are often too thin to be
    # meaningful. Choose the more liquid of {matching bucket, per-GPU bucket}
    # so a single outlier offer can't drive the projection.
    dist = latest_dist(n)
    bucket = n
    if n != 1:
        dist_one = latest_dist(1)
        supply_n = (dist.supply_count or 0) if dist is not None else 0
        supply_one = (dist_one.supply_count or 0) if dist_one is not None else 0
        if dist is None or supply_one > supply_n:
            dist = dist_one
            bucket = 1

    base = dict(
        host_id=host.id,
        gpu_name=host.gpu_name,
        num_gpus=n,
        break_even_floor=break_even,
    )

    if dist is None:
        return SimulatedHostMarketContext(
            market_bucket_num_gpus=None,
            market_computed_at=None,
            p25_price=None,
            p50_price=None,
            p75_price=None,
            supply_count=None,
            utilization_pct=None,
            break_even_percentile=None,
            has_market_data=False,
            projections=[],
            **base,
        )

    pcts = [
        float(p)
        for p in (
            dist.p10_price,
            dist.p25_price,
            dist.p50_price,
            dist.p75_price,
            dist.p90_price,
        )
        if p is not None
    ]
    be_pct = percentile_position(break_even, pcts) if break_even is not None and pcts else None

    power_per_hr = ((power or 0) * n / 1000.0) * kwh if (power and kwh is not None) else 0.0

    projections: list[ProjectionPoint] = []
    for label, price in (
        ("p25", dist.p25_price),
        ("p50", dist.p50_price),
        ("p75", dist.p75_price),
    ):
        if price is None:
            continue
        price = float(price)
        gross = price * n
        kept = gross * (1.0 - fee)
        net = kept - power_per_hr
        projections.append(
            ProjectionPoint(
                label=label,
                price_gpu=round(price, 6),
                gross_per_hr=round(gross, 4),
                kept_per_hr=round(kept, 4),
                power_per_hr=round(power_per_hr, 4),
                net_per_hr=round(net, 4),
                net_monthly_100=round(net * HOURS_PER_MONTH, 2),
                net_monthly_70=round(net * HOURS_PER_MONTH * 0.70, 2),
                net_monthly_50=round(net * HOURS_PER_MONTH * 0.50, 2),
            )
        )

    return SimulatedHostMarketContext(
        market_bucket_num_gpus=bucket,
        market_computed_at=dist.computed_at,
        p25_price=float(dist.p25_price) if dist.p25_price is not None else None,
        p50_price=float(dist.p50_price) if dist.p50_price is not None else None,
        p75_price=float(dist.p75_price) if dist.p75_price is not None else None,
        supply_count=dist.supply_count,
        utilization_pct=float(dist.utilization_pct) if dist.utilization_pct is not None else None,
        break_even_percentile=be_pct,
        has_market_data=True,
        projections=projections,
        **base,
    )


@router.get(
    "/hosts/{host_id}/pricing-recommendation", response_model=SimulatedPricingRecommendation
)
def pricing_recommendation(
    host_id: uuid.UUID,
    user: User = Depends(require_user_session),
    db: Session = Depends(get_db),
) -> SimulatedPricingRecommendation:
    """Pricing Control's sandbox: the same demand-adaptive recommendation math used
    for real machines (services.pricing), run against a simulated rig so a user can
    see how it behaves before they host anything for real."""
    host = db.get(SimulatedHost, host_id)
    if host is None:
        raise HTTPException(status_code=404, detail="Simulated host not found")
    return pricing_svc.recommend_for_simulated_host(db, host)


@router.post("/hosts/{host_id}/apply-price", response_model=SimulatedPricingRecommendation)
def apply_price(
    host_id: uuid.UUID,
    payload: SimulatedPriceApplyIn,
    user: User = Depends(require_user_session),
    db: Session = Depends(get_db),
) -> SimulatedPricingRecommendation:
    """Sandbox apply — updates the rig's local asking price only. No Vast write:
    simulated rigs have no live listing to change. Still enforces the break-even
    floor server-side, same safety net as the real apply route."""
    host = db.get(SimulatedHost, host_id)
    if host is None:
        raise HTTPException(status_code=404, detail="Simulated host not found")

    reco = pricing_svc.recommend_for_simulated_host(db, host)
    if reco.break_even_floor is not None and payload.new_price_gpu < reco.break_even_floor:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Price ${payload.new_price_gpu:.4f} is below your break-even floor "
                f"${reco.break_even_floor:.4f}/GPU·hr."
            ),
        )

    old_price = reco.current_price_gpu
    host.current_price_gpu = payload.new_price_gpu
    db.add(
        PriceChangeEvent(
            simulated_host_id=host.id,
            old_price_gpu=old_price,
            new_price_gpu=payload.new_price_gpu,
            reason="recommend_applied",
            market_dist_id=reco.market_dist_id,
            market_percentile=reco.current_percentile,
            applied_to_vast=False,
        )
    )
    db.commit()
    db.refresh(host)
    return pricing_svc.recommend_for_simulated_host(db, host)


@router.post("/hosts/{host_id}/simulate-rental", response_model=SimulatedHostOut)
def start_simulated_rental(
    host_id: uuid.UUID,
    payload: SimulateRentalIn,
    user: User = Depends(require_user_session),
    db: Session = Depends(get_db),
) -> SimulatedHostOut:
    """Mark this rig as currently rented, locking in its current asking price —
    the sandbox counterpart of a real RentalContract. Exists so a user can test
    Vast's real rule: a price change always updates the asking price
    immediately, but never retroactively changes an active rental's rate."""
    host = db.get(SimulatedHost, host_id)
    if host is None:
        raise HTTPException(status_code=404, detail="Simulated host not found")
    if host.current_price_gpu is None:
        raise HTTPException(
            status_code=400,
            detail="Set an asking price before simulating a rental — there's nothing to lock in.",
        )
    if payload.ends_at <= datetime.now(UTC):
        raise HTTPException(status_code=400, detail="ends_at must be in the future.")

    host.locked_price_gpu = host.current_price_gpu
    host.rented_until = payload.ends_at
    db.commit()
    db.refresh(host)
    return _to_out(host)


@router.post("/hosts/{host_id}/end-rental", response_model=SimulatedHostOut)
def end_simulated_rental(
    host_id: uuid.UUID,
    user: User = Depends(require_user_session),
    db: Session = Depends(get_db),
) -> SimulatedHostOut:
    """End the simulated rental early (or clear a stale one) — the rig goes
    back to idle, and price changes have nothing to wait on."""
    host = db.get(SimulatedHost, host_id)
    if host is None:
        raise HTTPException(status_code=404, detail="Simulated host not found")

    host.rented_until = None
    host.locked_price_gpu = None
    db.commit()
    db.refresh(host)
    return _to_out(host)


@router.post("/hosts/{host_id}/autopilot-step", response_model=AutopilotStepOut)
def autopilot_step_now(
    host_id: uuid.UUID,
    user: User = Depends(require_user_session),
    db: Session = Depends(get_db),
) -> AutopilotStepOut:
    """Phase 2 — manually trigger one autopilot evaluation now, so a user can see
    the controller work without waiting for the next scheduled tick (every 15
    min, see worker.tasks.autopilot_tick). Same eligibility and rails as the
    scheduled tick: the rig must have autopilot enabled."""
    host = db.get(SimulatedHost, host_id)
    if host is None:
        raise HTTPException(status_code=404, detail="Simulated host not found")
    if not host.autopilot_enabled:
        raise HTTPException(status_code=400, detail="Autopilot is not enabled for this rig.")

    event = autopilot_svc.autopilot_step(db, host)
    reco = pricing_svc.recommend_for_simulated_host(db, host)
    return AutopilotStepOut(
        moved=event is not None,
        reason=event.reason if event is not None else None,
        old_price_gpu=event.old_price_gpu if event is not None else reco.current_price_gpu,
        new_price_gpu=event.new_price_gpu if event is not None else reco.current_price_gpu,
        recommendation=reco,
    )


@router.get("/hosts/{host_id}/price-history", response_model=list[PriceChangeEventOut])
def price_history(
    host_id: uuid.UUID,
    limit: int = Query(20, ge=1, le=200),
    user: User = Depends(require_user_session),
    db: Session = Depends(get_db),
) -> list[PriceChangeEventOut]:
    """Manual applies and autopilot moves for one simulated rig — the sandbox
    counterpart of GET /pricing/history."""
    host = db.get(SimulatedHost, host_id)
    if host is None:
        raise HTTPException(status_code=404, detail="Simulated host not found")
    rows = db.scalars(
        select(PriceChangeEvent)
        .where(PriceChangeEvent.simulated_host_id == host.id)
        .order_by(PriceChangeEvent.changed_at.desc())
        .limit(limit)
    )
    return [PriceChangeEventOut.model_validate(r) for r in rows]


@router.post("/hosts/bulk-apply-recommended", response_model=BulkApplyResult)
def bulk_apply_recommended(
    payload: SimulatedBulkApplyIn,
    user: User = Depends(require_user_session),
    db: Session = Depends(get_db),
) -> BulkApplyResult:
    """Sandbox counterpart of POST /pricing/bulk-apply — applies each selected
    rig's own current recommended price. No Vast write, no break-even-floor
    failures possible (the recommendation already respects it), so this is
    mainly useful for testing the bulk-ops UI before it matters for real."""
    items: list[BulkApplyResultItem] = []
    applied = skipped = failed = 0

    for host_id in payload.host_ids:
        host = db.get(SimulatedHost, host_id)
        if host is None:
            items.append(
                BulkApplyResultItem(
                    id=host_id, label="unknown rig", status="failed",
                    old_price_gpu=None, new_price_gpu=None, detail="Simulated host not found",
                )
            )
            failed += 1
            continue

        label = f"{host.gpu_name or 'GPU'} ×{host.num_gpus or '?'} · {host.name or 'sim rig'}"
        reco = pricing_svc.recommend_for_simulated_host(db, host)
        if not reco.has_market_data or reco.recommended_price_gpu is None:
            items.append(
                BulkApplyResultItem(
                    id=host_id, label=label, status="skipped_no_market",
                    old_price_gpu=reco.current_price_gpu, new_price_gpu=None,
                    detail="No market data yet for this GPU class.",
                )
            )
            skipped += 1
            continue

        old_price = reco.current_price_gpu
        host.current_price_gpu = reco.recommended_price_gpu
        db.add(
            PriceChangeEvent(
                simulated_host_id=host.id,
                old_price_gpu=old_price,
                new_price_gpu=reco.recommended_price_gpu,
                reason="bulk_recommend_applied",
                market_dist_id=reco.market_dist_id,
                market_percentile=reco.current_percentile,
                applied_to_vast=False,
            )
        )
        db.commit()
        applied += 1
        items.append(
            BulkApplyResultItem(
                id=host_id, label=label, status="applied",
                old_price_gpu=old_price, new_price_gpu=reco.recommended_price_gpu, detail=None,
            )
        )

    return BulkApplyResult(applied=applied, skipped=skipped, failed=failed, items=items)
