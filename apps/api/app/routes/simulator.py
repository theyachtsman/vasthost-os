import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from core.config import settings
from db.session import get_db
from models import MarketDistribution, SimulatedHost, User
from schemas.models import (
    ProjectionPoint,
    SimulatedHostIn,
    SimulatedHostMarketContext,
    SimulatedHostOut,
)
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
