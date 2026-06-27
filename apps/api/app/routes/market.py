import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from db.session import get_db
from models import ClearingEvent, MarketDistribution, OfferSnapshot, WatchedClass
from schemas.models import (
    ClearingEventOut,
    DistributionOut,
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
