"""Market Observer — the most important data engine.

Operates on the PUBLIC market tables only (offer_snapshots, clearing_events,
market_distributions). It is fed by public Vast listings and never touches a
user's private account/fleet/earnings data.

Clearing detection: an offer that was present (rentable, not rented) in the
previous poll and is absent/rented in the current poll is treated as a probable
rental ("clearing event"). Dwell time is measured from the offer's first sighting.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from core.crypto import decrypt
from models import ClearingEvent, MarketDistribution, OfferSnapshot, VastAccount, WatchedClass

from .calc import percentile
from .vast_client import VastClient

logger = logging.getLogger("vasthost.observer")

POLL_INTERVAL_SECONDS = 180

# Auto-discovery: a GPU class needs at least this many live single-GPU offers
# to be auto-registered for watching (keeps the list bounded + low-noise).
DISCOVERY_MIN_SUPPLY = 5
DISCOVERY_SAMPLE_LIMIT = 5000


def _ts(value) -> datetime | None:
    if value in (None, 0):
        return None
    try:
        return datetime.fromtimestamp(float(value), tz=UTC)
    except (TypeError, ValueError, OSError):
        return None


def _observer_client(db: Session) -> VastClient | None:
    """Any active account's key is fine for reading PUBLIC offers."""
    account = db.scalar(select(VastAccount).where(VastAccount.is_active.is_(True)))
    if account is None:
        return None
    return VastClient(decrypt(account.vast_api_key))


def _watched(db: Session) -> list[WatchedClass]:
    rows = list(
        db.scalars(select(WatchedClass).where(WatchedClass.is_active.is_(True)))
    )
    return rows


def discover_classes(db: Session) -> int:
    """Auto-register GPU classes that currently have real supply on Vast.

    Runs a single broad sweep, tallies single-GPU offers per gpu_name, and
    upserts an active watched_class for each class above DISCOVERY_MIN_SUPPLY.
    New GPU models appear automatically; thin/noise classes are skipped. We
    never auto-delete — a host can prune in Settings — so manually-added
    classes are preserved. Returns the number of newly-added classes.
    """
    client = _observer_client(db)
    if client is None:
        logger.info("discover: no active account/key yet — skipping")
        return 0

    try:
        offers = client.search_offers(query="num_gpus=1", limit=DISCOVERY_SAMPLE_LIMIT)
    except Exception as exc:  # noqa: BLE001
        logger.error("discover: broad sweep failed: %s", exc)
        return 0

    counts: dict[str, int] = {}
    for o in offers:
        name = o.get("gpu_name")
        if name:
            counts[name] = counts.get(name, 0) + 1

    existing = {
        (wc.gpu_name, wc.num_gpus, wc.geolocation)
        for wc in db.scalars(select(WatchedClass))
    }
    added = 0
    for name, cnt in counts.items():
        if cnt < DISCOVERY_MIN_SUPPLY:
            continue
        key = (name, 1, None)
        if key in existing:
            continue
        db.add(WatchedClass(gpu_name=name, num_gpus=1, geolocation=None))
        added += 1

    if added:
        db.commit()
    logger.info(
        "discover: sampled %s offers, %s classes ≥%s supply, %s newly added",
        len(offers),
        sum(1 for c in counts.values() if c >= DISCOVERY_MIN_SUPPLY),
        DISCOVERY_MIN_SUPPLY,
        added,
    )
    return added


def market_observer_poll(db: Session) -> int:
    """Poll search offers for each watched class. Write snapshots + detect
    clearing events. Returns number of snapshots written."""
    client = _observer_client(db)
    if client is None:
        logger.info("observer: no active account/key yet — skipping poll")
        return 0

    watched = _watched(db)
    if not watched:
        logger.info("observer: no watched classes configured — skipping poll")
        return 0

    now = datetime.now(UTC)
    written = 0

    for wc in watched:
        query = f"gpu_name={wc.gpu_name.replace(' ', '_')} num_gpus={wc.num_gpus}"
        if wc.geolocation:
            query += f" geolocation={wc.geolocation}"
        try:
            offers = client.search_offers(query=query, limit=1000)
        except Exception as exc:  # noqa: BLE001
            logger.error("observer poll failed for %s: %s", query, exc)
            continue

        seen_offer_ids = set()
        for o in offers:
            offer_id = o.get("id")
            if offer_id is None:
                continue
            seen_offer_ids.add(int(offer_id))
            db.add(
                OfferSnapshot(
                    observed_at=now,
                    offer_id=int(offer_id),
                    machine_id=o.get("machine_id"),
                    gpu_name=o.get("gpu_name") or wc.gpu_name,
                    num_gpus=o.get("num_gpus"),
                    gpu_ram_mb=o.get("gpu_ram"),
                    gpu_max_power_w=o.get("gpu_max_power"),
                    reliability=o.get("reliability"),
                    verified=o.get("verified"),
                    geolocation=o.get("geolocation"),
                    price_gpu=o.get("dph_base"),
                    price_disk=o.get("storage_cost"),
                    price_inetu=o.get("inet_up_cost"),
                    price_inetd=o.get("inet_down_cost"),
                    dph_total=o.get("dph_total"),
                    dlperf=o.get("dlperf"),
                    dlperf_per_dphtotal=o.get("dlperf_per_dphtotal"),
                    rentable=o.get("rentable"),
                    rented=o.get("rented"),
                    num_gpus_available=o.get("num_gpus"),
                    end_date=_ts(o.get("end_date")),
                )
            )
            written += 1

        _detect_clearing(db, wc, seen_offer_ids, now)

    db.commit()
    logger.info("observer: wrote %s offer snapshots across %s classes", written, len(watched))
    return written


def _detect_clearing(
    db: Session, wc: WatchedClass, current_offer_ids: set[int], now: datetime
) -> None:
    """Compare the previous poll's available offers against this poll's."""
    prev_poll_at = db.scalar(
        select(func.max(OfferSnapshot.observed_at)).where(
            OfferSnapshot.observed_at < now,
            OfferSnapshot.gpu_name == wc.gpu_name,
            OfferSnapshot.num_gpus == wc.num_gpus,
        )
    )
    if prev_poll_at is None:
        return

    prev_available = db.scalars(
        select(OfferSnapshot).where(
            OfferSnapshot.observed_at == prev_poll_at,
            OfferSnapshot.gpu_name == wc.gpu_name,
            OfferSnapshot.num_gpus == wc.num_gpus,
            OfferSnapshot.rentable.is_(True),
            OfferSnapshot.rented.is_(False),
        )
    )

    for prev in prev_available:
        if prev.offer_id in current_offer_ids:
            continue  # still present — no clearing
        # First sighting -> dwell time.
        first_seen = db.scalar(
            select(func.min(OfferSnapshot.observed_at)).where(
                OfferSnapshot.offer_id == prev.offer_id
            )
        )
        dwell_minutes = None
        if first_seen is not None:
            dwell_minutes = int((now - first_seen).total_seconds() // 60)

        # Confidence: a longer-lived listing that vanishes is a stronger signal.
        confidence = "MEDIUM"
        if dwell_minutes is not None:
            if dwell_minutes >= 15:
                confidence = "HIGH"
            elif dwell_minutes < 5:
                confidence = "LOW"

        db.add(
            ClearingEvent(
                detected_at=now,
                offer_id=prev.offer_id,
                gpu_name=prev.gpu_name,
                num_gpus=prev.num_gpus,
                verified=prev.verified,
                geolocation=prev.geolocation,
                last_price_gpu=prev.price_gpu,
                dwell_minutes=dwell_minutes,
                is_partial_fill=False,
                confidence=confidence,
            )
        )


def market_distribution_aggregate(db: Session) -> int:
    """Aggregate the latest snapshot per watched bucket into a distribution row."""
    watched = _watched(db)
    now = datetime.now(UTC)
    produced = 0

    for wc in watched:
        latest_poll = db.scalar(
            select(func.max(OfferSnapshot.observed_at)).where(
                OfferSnapshot.gpu_name == wc.gpu_name,
                OfferSnapshot.num_gpus == wc.num_gpus,
            )
        )
        if latest_poll is None:
            continue

        snaps = list(
            db.scalars(
                select(OfferSnapshot).where(
                    OfferSnapshot.observed_at == latest_poll,
                    OfferSnapshot.gpu_name == wc.gpu_name,
                    OfferSnapshot.num_gpus == wc.num_gpus,
                )
            )
        )
        if not snaps:
            continue

        prices = sorted(float(s.price_gpu) for s in snaps if s.price_gpu is not None)
        supply = len(snaps)
        rented = sum(1 for s in snaps if s.rented)
        util = round(100.0 * rented / supply, 2) if supply else None

        clearing_1h = _clearing_rate(db, wc, now, hours=1)
        clearing_24h = _clearing_rate(db, wc, now, hours=24)

        db.add(
            MarketDistribution(
                computed_at=now,
                gpu_name=wc.gpu_name,
                num_gpus=wc.num_gpus,
                verified=None,
                geolocation=wc.geolocation,
                p10_price=percentile(prices, 10),
                p25_price=percentile(prices, 25),
                p50_price=percentile(prices, 50),
                p75_price=percentile(prices, 75),
                p90_price=percentile(prices, 90),
                supply_count=supply,
                rented_count=rented,
                utilization_pct=util,
                clearing_rate_1h=clearing_1h,
                clearing_rate_24h=clearing_24h,
            )
        )
        produced += 1

    db.commit()
    logger.info("observer: produced %s distribution rows", produced)
    return produced


def _clearing_rate(db: Session, wc: WatchedClass, now: datetime, hours: int) -> float | None:
    """Clearing events per supply unit over the window (rough demand proxy)."""
    from datetime import timedelta

    window_start = now - timedelta(hours=hours)
    events = db.scalar(
        select(func.count(ClearingEvent.id)).where(
            ClearingEvent.detected_at >= window_start,
            ClearingEvent.gpu_name == wc.gpu_name,
            ClearingEvent.num_gpus == wc.num_gpus,
        )
    )
    avg_supply = db.scalar(
        select(func.avg(MarketDistribution.supply_count)).where(
            MarketDistribution.computed_at >= window_start,
            MarketDistribution.gpu_name == wc.gpu_name,
            MarketDistribution.num_gpus == wc.num_gpus,
        )
    )
    if not avg_supply:
        return None
    rate = float(events or 0) / float(avg_supply)
    return round(min(rate, 9.9999), 4)
