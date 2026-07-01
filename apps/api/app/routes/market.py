import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from core.config import settings
from db.session import get_db
from models import ClearingEvent, MarketDistribution, OfferSnapshot, WatchedClass
from schemas.models import (
    AvailableClass,
    ClearingEventOut,
    DistributionOut,
    MarketListingRow,
    MarketMeta,
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


@router.get("/meta", response_model=MarketMeta)
def meta(db: Session = Depends(get_db)) -> MarketMeta:
    """Cross-cutting context for the UI: the fee assumption used to derive
    host-receives from renter-pay, the poll cadence, and the last poll time (so
    the client can render a live/updating indicator)."""
    last_poll = db.scalar(select(func.max(OfferSnapshot.observed_at)))
    return MarketMeta(
        fee_pct=settings.MARKET_FEE_PCT,
        poll_interval_seconds=POLL_INTERVAL_SECONDS,
        last_poll_at=last_poll,
    )


@router.get("/listings", response_model=list[MarketListingRow])
def listings(
    gpu_name: str = Query(...),
    num_gpus: int | None = Query(None),
    rented: bool | None = Query(None),
    limit: int = Query(300, ge=1, le=2000),
    db: Session = Depends(get_db),
) -> list[MarketListingRow]:
    """Every live server for a GPU from the most recent poll — rented AND
    available — with full per-offer detail (dlperf, perf/$, reliability,
    verification, host/machine id, source, renter & host price). This is the
    surface for seeing unrented rigs and reasoning about *why* they didn't rent
    (price vs reliability vs verification). All snapshots in a poll share one
    observed_at, so the latest poll = the latest market state per offer."""
    latest_poll = db.scalar(
        select(func.max(OfferSnapshot.observed_at)).where(
            OfferSnapshot.gpu_name == gpu_name
        )
    )
    if latest_poll is None:
        return []
    stmt = select(OfferSnapshot).where(
        OfferSnapshot.gpu_name == gpu_name,
        OfferSnapshot.observed_at == latest_poll,
    )
    if num_gpus is not None:
        stmt = stmt.where(OfferSnapshot.num_gpus == num_gpus)
    if rented is not None:
        stmt = stmt.where(OfferSnapshot.rented.is_(rented))
    # ASC puts NULL prices last under Postgres — cheap offers surface first.
    stmt = stmt.order_by(OfferSnapshot.price_gpu.asc()).limit(limit)

    # Asking price only — the host's set dph_base per GPU. No fee/host-take math is
    # surfaced on market pages (that lives in the simulator's break-even estimate);
    # dph_total is still captured by the Observer but intentionally not serialised
    # here so nothing implies a renter-facing price.
    out: list[MarketListingRow] = []
    seen: set[int] = set()
    for s in db.scalars(stmt):
        if s.offer_id in seen:  # guard against an offer sampled in both queries
            continue
        seen.add(s.offer_id)
        out.append(
            MarketListingRow(
                offer_id=s.offer_id,
                machine_id=s.machine_id,
                host_id=s.host_id,
                market_source=s.market_source,
                gpu_name=s.gpu_name,
                num_gpus=s.num_gpus,
                gpu_ram_mb=s.gpu_ram_mb,
                gpu_max_power_w=s.gpu_max_power_w,
                price_gpu=_f(s.price_gpu),
                dlperf=_f(s.dlperf),
                dlperf_per_dphtotal=_f(s.dlperf_per_dphtotal),
                reliability=_f(s.reliability),
                verified=s.verified,
                geolocation=s.geolocation,
                rented=s.rented,
                end_date=s.end_date,
                observed_at=s.observed_at,
            )
        )
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

    # Liquidity-weighted demand (item: "actual top demand"). Raw utilization lets
    # a thin 7/7 (100%) outrank a genuinely hot 180/200. We instead rank by a
    # demand_score that (a) shrinks utilization toward the market average when
    # supply is thin (Bayesian smoothing with K pseudo-offers), and (b) blends in
    # 24h rental velocity. So a 7/7 needs sustained volume to read as "hot".
    market_total = sum((d.supply_count or 0) for d in latest.values())
    market_rented = sum((d.rented_count or 0) for d in latest.values())
    global_util = (market_rented / market_total) if market_total else 0.0
    max_rentals = max((int(counts.get(n, 0)) for n in latest), default=0)
    K = 15  # pseudo-offers pulling thin-supply classes toward the market average

    def _demand_score(total: int, rented: int, rentals: int) -> float:
        smoothed = (rented + K * global_util) / (total + K)  # 0..1
        velocity = (rentals / max_rentals) if max_rentals else 0.0  # 0..1
        return round(0.7 * smoothed + 0.3 * velocity, 4)

    out: list[MarketOverviewRow] = []
    for name, d in latest.items():
        total = d.supply_count or 0
        rented = d.rented_count or 0
        rentals = int(counts.get(name, 0))
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
                demand_score=_demand_score(total, rented, rentals),
                rentals_24h=rentals,
                median_dwell_minutes=_f(dwell.get(name)),
                dlperf=_f(d.dlperf),
                dlperf_per_dphtotal=_f(d.dlperf_per_dphtotal),
                price_basis=d.price_basis or "ask",
                computed_at=d.computed_at,
            )
        )
    out.sort(key=lambda r: (r.demand_score or 0), reverse=True)
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
