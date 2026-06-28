import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from db.session import get_db
from models import ClearingEvent, MarketDistribution, OfferSnapshot, WatchedClass
from schemas.models import (
    AvailableClass,
    ClearingEventOut,
    DistributionOut,
    MarketOverviewRow,
    ObserverStatus,
    WatchedClassIn,
    WatchedClassOut,
)
from services.observer import POLL_INTERVAL_SECONDS

router = APIRouter()


@router.get("/distribution", response_model=DistributionOut | None)
def distribution(
    gpu_name: str = Query(...),
    num_gpus: int = Query(1),
    geolocation: str | None = Query(None),
    db: Session = Depends(get_db),
) -> DistributionOut | None:
    stmt = (
        select(MarketDistribution)
        .where(
            MarketDistribution.gpu_name == gpu_name,
            MarketDistribution.num_gpus == num_gpus,
        )
        .order_by(MarketDistribution.computed_at.desc())
    )
    if geolocation:
        stmt = stmt.where(MarketDistribution.geolocation == geolocation)
    row = db.scalar(stmt)
    return DistributionOut.model_validate(row) if row else None


@router.get("/distribution/history", response_model=list[DistributionOut])
def distribution_history(
    gpu_name: str = Query(...),
    num_gpus: int = Query(1),
    limit: int = Query(96, ge=1, le=1000),
    db: Session = Depends(get_db),
) -> list[DistributionOut]:
    rows = db.scalars(
        select(MarketDistribution)
        .where(
            MarketDistribution.gpu_name == gpu_name,
            MarketDistribution.num_gpus == num_gpus,
        )
        .order_by(MarketDistribution.computed_at.desc())
        .limit(limit)
    )
    return [DistributionOut.model_validate(r) for r in reversed(list(rows))]


@router.get("/clearing-events", response_model=list[ClearingEventOut])
def clearing_events(
    gpu_name: str | None = Query(None),
    num_gpus: int | None = Query(None),
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
) -> list[ClearingEventOut]:
    stmt = select(ClearingEvent).order_by(ClearingEvent.detected_at.desc()).limit(limit)
    if gpu_name:
        stmt = stmt.where(ClearingEvent.gpu_name == gpu_name)
    if num_gpus is not None:
        stmt = stmt.where(ClearingEvent.num_gpus == num_gpus)
    rows = db.scalars(stmt)
    return [ClearingEventOut.model_validate(r) for r in rows]


@router.get("/observer/status", response_model=ObserverStatus)
def observer_status(db: Session = Depends(get_db)) -> ObserverStatus:
    last_poll = db.scalar(select(func.max(OfferSnapshot.observed_at)))
    total_snaps = db.scalar(select(func.count(OfferSnapshot.id))) or 0
    total_events = db.scalar(select(func.count(ClearingEvent.id))) or 0
    watched = db.scalar(
        select(func.count(WatchedClass.id)).where(WatchedClass.is_active.is_(True))
    ) or 0
    return ObserverStatus(
        last_poll_at=last_poll,
        total_offer_snapshots=total_snaps,
        total_clearing_events=total_events,
        watched_classes=watched,
        poll_interval_seconds=POLL_INTERVAL_SECONDS,
    )


@router.get("/available-classes", response_model=list[AvailableClass])
def available_classes(db: Session = Depends(get_db)) -> list[AvailableClass]:
    """Distinct (gpu_name, num_gpus) buckets that have a recent distribution —
    drives the Market page's GPU + config-size selectors."""
    since = datetime.now(UTC) - timedelta(minutes=90)
    rows = db.scalars(
        select(MarketDistribution)
        .where(MarketDistribution.computed_at >= since)
        .order_by(MarketDistribution.computed_at.desc())
    )
    seen: dict[tuple[str, int], int | None] = {}
    for r in rows:
        key = (r.gpu_name, r.num_gpus)
        if key not in seen:
            seen[key] = r.supply_count
    out = [
        AvailableClass(gpu_name=g, num_gpus=n, supply_count=s) for (g, n), s in seen.items()
    ]
    out.sort(key=lambda x: (x.gpu_name, x.num_gpus))
    return out


@router.get("/overview", response_model=list[MarketOverviewRow])
def overview(db: Session = Depends(get_db)) -> list[MarketOverviewRow]:
    """Cross-GPU market leaderboard at the per-GPU (num_gpus=1) reference market:
    latest price distribution, real utilization, and 24h rental activity."""
    since = datetime.now(UTC) - timedelta(minutes=90)
    # Latest distribution per gpu_name at the per-GPU bucket.
    dist_rows = db.scalars(
        select(MarketDistribution)
        .where(
            MarketDistribution.num_gpus == 1,
            MarketDistribution.computed_at >= since,
        )
        .order_by(MarketDistribution.computed_at.desc())
    )
    latest: dict[str, MarketDistribution] = {}
    for d in dist_rows:
        if d.gpu_name not in latest:
            latest[d.gpu_name] = d
    if not latest:
        return []

    # 24h rental counts + median dwell per gpu_name (per-GPU bucket).
    day_ago = datetime.now(UTC) - timedelta(hours=24)
    counts = dict(
        db.execute(
            select(ClearingEvent.gpu_name, func.count(ClearingEvent.id))
            .where(
                ClearingEvent.detected_at >= day_ago,
                ClearingEvent.num_gpus == 1,
            )
            .group_by(ClearingEvent.gpu_name)
        ).all()
    )
    dwell = dict(
        db.execute(
            select(
                ClearingEvent.gpu_name,
                func.percentile_cont(0.5).within_group(ClearingEvent.dwell_minutes.asc()),
            )
            .where(
                ClearingEvent.detected_at >= day_ago,
                ClearingEvent.num_gpus == 1,
                ClearingEvent.dwell_minutes.is_not(None),
            )
            .group_by(ClearingEvent.gpu_name)
        ).all()
    )

    out: list[MarketOverviewRow] = []
    for name, d in latest.items():
        total = d.supply_count or 0
        rented = d.rented_count or 0
        out.append(
            MarketOverviewRow(
                gpu_name=name,
                num_gpus=1,
                p10_price=_f(d.p10_price),
                p25_price=_f(d.p25_price),
                p50_price=_f(d.p50_price),
                p75_price=_f(d.p75_price),
                p90_price=_f(d.p90_price),
                supply_count=total,
                available_count=max(0, total - rented),
                rented_count=rented,
                utilization_pct=_f(d.utilization_pct),
                rentals_24h=int(counts.get(name, 0)),
                median_dwell_minutes=_f(dwell.get(name)),
                dlperf=_f(d.dlperf),
                dlperf_per_dphtotal=_f(d.dlperf_per_dphtotal),
                computed_at=d.computed_at,
            )
        )
    out.sort(key=lambda r: (r.utilization_pct or 0), reverse=True)
    return out


@router.get("/sizes", response_model=list[DistributionOut])
def sizes(gpu_name: str = Query(...), db: Session = Depends(get_db)) -> list[DistributionOut]:
    """Latest distribution per config size (num_gpus) for one GPU — the size
    ladder (×1, ×2, ×4, ×8 …) on a comparable per-GPU price basis."""
    since = datetime.now(UTC) - timedelta(minutes=90)
    rows = db.scalars(
        select(MarketDistribution)
        .where(
            MarketDistribution.gpu_name == gpu_name,
            MarketDistribution.computed_at >= since,
        )
        .order_by(MarketDistribution.computed_at.desc())
    )
    latest: dict[int, MarketDistribution] = {}
    for d in rows:
        if d.num_gpus not in latest:
            latest[d.num_gpus] = d
    return [DistributionOut.model_validate(latest[k]) for k in sorted(latest)]


def _f(v) -> float | None:
    return float(v) if v is not None else None


# ── Watched classes (drive the Observer; managed from Settings) ──
@router.get("/watched-classes", response_model=list[WatchedClassOut])
def list_watched(db: Session = Depends(get_db)) -> list[WatchedClassOut]:
    rows = db.scalars(select(WatchedClass).order_by(WatchedClass.created_at))
    return [WatchedClassOut.model_validate(r) for r in rows]


@router.post("/watched-classes", response_model=WatchedClassOut)
def add_watched(payload: WatchedClassIn, db: Session = Depends(get_db)) -> WatchedClassOut:
    existing = db.scalar(
        select(WatchedClass).where(
            WatchedClass.gpu_name == payload.gpu_name,
            WatchedClass.num_gpus == payload.num_gpus,
            WatchedClass.geolocation.is_(payload.geolocation)
            if payload.geolocation is None
            else WatchedClass.geolocation == payload.geolocation,
        )
    )
    if existing:
        existing.is_active = True
        db.commit()
        db.refresh(existing)
        return WatchedClassOut.model_validate(existing)
    wc = WatchedClass(
        gpu_name=payload.gpu_name,
        num_gpus=payload.num_gpus,
        geolocation=payload.geolocation,
    )
    db.add(wc)
    db.commit()
    db.refresh(wc)
    return WatchedClassOut.model_validate(wc)


@router.delete("/watched-classes/{watched_id}")
def remove_watched(watched_id: uuid.UUID, db: Session = Depends(get_db)) -> dict:
    wc = db.get(WatchedClass, watched_id)
    if wc is None:
        raise HTTPException(status_code=404, detail="Watched class not found")
    db.delete(wc)
    db.commit()
    return {"deleted": True}
